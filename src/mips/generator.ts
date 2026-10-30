import type { ActivationRecord, ClassLayout, FrameSlot, TacGenerationResult, TacInstruction, TacOperand } from "../tac/types";
import type { SemanticType } from "../semantic/semanticTypes";

export type MipsStatus = "not-requested" | "skipped" | "completed" | "failed";
export interface MipsDiagnostic { code: string; severity: "error" | "warning"; message: string; tacIndex?: number }
export interface MipsGenerationResult {
  status: MipsStatus; skipReason?: string; target: "MIPS32 / MARS 4.5";
  assembly: string; unoptimizedAssembly: string; data: string[]; text: string[];
  diagnostics: MipsDiagnostic[]; instructionCount: number; optimizedInstructionCount: number; optimizationCount: number;
  registerStats: { allocations: number; maxConcurrent: number; spills: number };
}

export function emptyMipsResult(status: MipsStatus = "not-requested", skipReason?: string): MipsGenerationResult {
  return { status, skipReason, target: "MIPS32 / MARS 4.5", assembly: "", unoptimizedAssembly: "", data: [], text: [], diagnostics: [], instructionCount: 0, optimizedInstructionCount: 0, optimizationCount: 0, registerStats: { allocations: 0, maxConcurrent: 0, spills: 0 } };
}

/** Asignador getReg local a cada cuádruplo TAC. */
class RegisterAllocator {
  private readonly pool = ["$t0", "$t1", "$t2", "$t3", "$t4", "$t5", "$t6", "$t7"];
  private readonly used = new Set<string>();
  allocations = 0; maxConcurrent = 0; spills = 0;
  beginInstruction(): void { this.used.clear(); }
  getReg(): string {
    const register = this.pool.find((candidate) => !this.used.has(candidate));
    if (!register) { this.spills += 1; throw new Error("No hay un registro temporal libre."); }
    this.used.add(register); this.allocations += 1; this.maxConcurrent = Math.max(this.maxConcurrent, this.used.size);
    return register;
  }
}

function safeLabel(value: unknown, prefix = "L"): string {
  const body = String(value ?? "unknown").replace(/[^A-Za-z0-9_]/g, "_");
  return `${prefix}_${/^\d/.test(body) ? `_${body}` : body}`;
}
function opKey(value?: TacOperand): string { return value ? [value.frameId ?? "", value.symbolId ?? "", value.kind, String(value.value)].join("|") : ""; }
function primitive(type: SemanticType | undefined, name: string): boolean { return type?.kind === "primitive" && type.name === name; }
function align(value: number, boundary = 8): number { return Math.ceil(Math.max(0, value) / boundary) * boundary; }
function countInstructions(lines: string[]): number { return lines.filter((line) => { const text = line.trim(); return text && !text.startsWith("#") && !text.startsWith(".") && !text.endsWith(":"); }).length; }
function quote(value: string): string { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`; }

class Generator {
  private readonly data = [".data", `${safeLabel("newline", "rt")}: .asciiz "\\n"`, `${safeLabel("true", "rt")}: .asciiz "true"`, `${safeLabel("false", "rt")}: .asciiz "false"`, `${safeLabel("null", "rt")}: .asciiz "null"`, "__rt_handler: .word 0"];
  private readonly text = [".text", ".globl main", "main:"];
  private readonly diagnostics: MipsDiagnostic[] = [];
  private readonly registers = new RegisterAllocator();
  private readonly frames = new Map<string, ActivationRecord>();
  private readonly functions = new Map<string, ActivationRecord>();
  private readonly layoutsById = new Map<string, ClassLayout>();
  private readonly layoutsByName = new Map<string, ClassLayout>();
  private readonly labelTryDepth = new Map<string, number>();
  private readonly globals = new Map<string, string>();
  private readonly synthetic = new Map<string, string>();
  private readonly strings = new Map<string, string>();
  private readonly floats = new Map<number, string>();
  private currentFrame?: ActivationRecord;
  private currentEpilogue?: string;
  private readonly functionContextStack: { frame?: ActivationRecord; epilogue?: string; handlers: string[] }[] = [];
  private readonly activeTryHandlers: string[] = [];
  private activeClosure?: TacOperand;
  /** Cantidad de argumentos ya apilados pero aún no consumidos. Permite
   * llamadas anidadas: una CALL consume solo sus N argumentos superiores. */
  private parameters = 0;
  private readonly parameterTypes: (SemanticType | undefined)[] = [];
  private serial = 0;
  private needsConcat = false;
  private needsStringEquality = false;
  private needsArrayChecks = false;
  private needsObjectChecks = false;
  private needsDivisionChecks = false;

  constructor(private readonly tac: TacGenerationResult) {
    tac.activationRecords.forEach((frame) => this.frames.set(frame.id, frame));
    tac.classLayouts.forEach((layout) => { this.layoutsById.set(layout.classId, layout); this.layoutsByName.set(layout.name, layout); });
    tac.instructions.forEach((instruction) => {
      if (instruction.op === "FUNC_BEGIN" && instruction.frameId && instruction.result) {
        const frame = this.frames.get(instruction.frameId);
        if (frame) this.functions.set(String(instruction.result.value), frame);
      }
    });
    let tryDepth = 0;
    for (const instruction of tac.instructions) {
      if (instruction.op === "TRY_END") tryDepth = Math.max(0, tryDepth - 1);
      if (instruction.op === "LABEL" && instruction.result) {
        this.labelTryDepth.set(String(instruction.result.value), tryDepth);
      }
      if (instruction.op === "TRY_BEGIN") tryDepth += 1;
    }
    for (const name of this.functions.keys()) this.data.push(`${safeLabel(name, "closure")}: .word ${safeLabel(name, "fn")}`);
    for (const layout of tac.classLayouts) {
      const methods = [...(layout.methods ?? [])].sort((left, right) => left.slot - right.slot);
      this.data.push(
        ".align 2",
        `${this.vtableLabel(layout)}:`,
        ...methods.map((method) => `  .word ${safeLabel(method.label, "closure")}`)
      );
    }
    for (const frame of tac.activationRecords.filter((candidate) => candidate.kind === "global")) {
      for (const slot of frame.slots) {
        const label = safeLabel(`${frame.id}_${slot.symbolId ?? slot.temporary ?? slot.name}`, "mem");
        this.globals.set(this.slotKey(frame, slot), label); this.data.push(`${label}: .word 0`);
      }
    }
  }

  generate(): MipsGenerationResult {
    for (const instruction of this.tac.instructions) {
      this.registers.beginInstruction();
      try { this.translate(instruction); }
      catch (error) { this.error("MIPS900", error instanceof Error ? error.message : String(error), instruction); }
    }
    if (this.parameters) this.error("MIPS015", `Quedaron ${this.parameters} parámetros sin llamada asociada.`);
    this.emit("  li $v0, 10", "  syscall");
    this.runtime();
    this.validateLabels();
    const before = [...this.text];
    const optimized = peepholeOptimize(before);
    const failed = this.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    return {
      status: failed ? "failed" : "completed",
      skipReason: failed ? "El backend produjo errores; el ensamblador no es exportable." : undefined,
      target: "MIPS32 / MARS 4.5",
      assembly: [...this.data, "", ...optimized.lines, ""].join("\n"),
      unoptimizedAssembly: [...this.data, "", ...before, ""].join("\n"),
      data: [...this.data], text: optimized.lines, diagnostics: this.diagnostics,
      instructionCount: countInstructions(before), optimizedInstructionCount: countInstructions(optimized.lines), optimizationCount: optimized.removed,
      registerStats: { allocations: this.registers.allocations, maxConcurrent: this.registers.maxConcurrent, spills: this.registers.spills }
    };
  }

  private slotKey(frame: ActivationRecord, slot: FrameSlot): string { return `${frame.id}|${slot.symbolId ?? ""}|${slot.temporary ?? ""}|${slot.name}`; }
  private findSlot(value: TacOperand): { frame: ActivationRecord; slot: FrameSlot } | undefined {
    const frame = value.frameId ? this.frames.get(value.frameId) : this.currentFrame;
    if (!frame) return undefined;
    // Un identificador resuelto debe buscarse exclusivamente por su identidad.
    // Caer al nombre después de no encontrar el ID confunde símbolos homónimos
    // de ámbitos anidados y hace que el shadowing sobrescriba el slot exterior.
    const slot = frame.slots.find((candidate) => value.symbolId
      ? candidate.symbolId === value.symbolId
      : value.kind === "temporary"
        ? candidate.temporary === String(value.value)
        : candidate.name === String(value.value) && candidate.kind !== "temporary");
    return slot ? { frame, slot } : undefined;
  }
  private storage(value: TacOperand, create = false): string | undefined {
    const found = this.findSlot(value);
    if (found) {
      if (found.frame.kind === "global") return this.globals.get(this.slotKey(found.frame, found.slot));
      if (found.frame.id === this.currentFrame?.id) return `${found.slot.offset}($fp)`;
    }
    const key = opKey(value);
    if (this.synthetic.has(key)) return this.synthetic.get(key);
    if (!create) return undefined;
    const label = safeLabel(`${value.symbolId ?? value.value}_${this.synthetic.size}`, "mem");
    this.synthetic.set(key, label); this.data.push(`${label}: .word 0`); return label;
  }

  private translate(i: TacInstruction): void {
    switch (i.op) {
      case "PROGRAM_BEGIN": case "PROGRAM_END": return;
      case "TRY_BEGIN": this.beginTry(i); return;
      case "TRY_END": this.endTry(i); return;
      case "LABEL": this.emit(`${safeLabel(i.result?.value)}:`); return;
      case "GOTO": this.jump(i); return;
      case "MOV": this.move(i); return;
      case "ADD": case "SUB": case "MUL": case "DIV": case "MOD": this.arithmetic(i); return;
      case "NEG": case "NOT": this.unary(i); return;
      case "EQ": case "NE": case "LT": case "LE": case "GT": case "GE": this.comparison(i); return;
      case "AND": case "OR": this.logic(i); return;
      case "IF_FALSE": case "IF_TRUE": this.branch(i); return;
      case "FUNC_BEGIN": this.beginFunction(i); return;
      case "FUNC_END": this.endFunction(); return;
      case "PARAM": this.parameter(i); return;
      case "CALL": this.call(i); return;
      case "RETURN": this.returnValue(i); return;
      case "PRINT": this.print(i); return;
      case "NEW_ARRAY": this.newArray(i); return;
      case "ARRAY_LENGTH": this.arrayLength(i); return;
      case "ARRAY_GET": this.arrayGet(i); return;
      case "ARRAY_SET": this.arraySet(i); return;
      case "NEW_OBJECT": this.newObject(i); return;
      case "GET_FIELD": this.getField(i); return;
      case "SET_FIELD": this.setField(i); return;
      case "MAKE_CLOSURE": this.makeClosure(i); return;
      case "CAPTURE": this.capture(i); return;
      case "LOAD_CAPTURE": this.loadCapture(i); return;
      case "STORE_CAPTURE": this.storeCapture(i); return;
      case "CATCH_BEGIN": if (i.result) this.storeWord("$v1", i.result, i); return;
      default: this.error("MIPS001", `Opcode TAC no soportado: ${String(i.op)}.`, i);
    }
  }

  private move(i: TacInstruction): void {
    if (!i.arg1 || !i.result) return this.error("MIPS002", "MOV incompleto.", i);
    if (primitive(i.result.type, "float")) { this.loadFloat(i.arg1, "$f2", i); this.storeFloat("$f2", i.result, i); return; }
    const r = this.registers.getReg(); this.loadWord(i.arg1, r, i); this.storeWord(r, i.result, i);
  }
  private arithmetic(i: TacInstruction): void {
    if (!i.arg1 || !i.arg2 || !i.result) return this.error("MIPS003", `${i.op} incompleto.`, i);
    if (i.op === "ADD" && (primitive(i.arg1.type, "string") || primitive(i.result.type, "string"))) {
      this.needsConcat = true; this.loadWord(i.arg1, "$a0", i); this.loadWord(i.arg2, "$a1", i); this.emit("  jal __rt_concat", "  nop"); this.storeWord("$v0", i.result, i); return;
    }
    const floatOperation = primitive(i.arg1.type, "float") || primitive(i.arg2.type, "float") || primitive(i.result.type, "float");
    if (floatOperation && i.op !== "MOD") {
      this.loadFloat(i.arg1, "$f2", i); this.loadFloat(i.arg2, "$f4", i);
      if (i.op === "DIV") {
        this.needsDivisionChecks = true;
        this.emit("  mtc1 $zero, $f8", "  c.eq.s $f4, $f8", "  bc1t __rt_throw_div_zero", "  nop");
      }
      const opcode = ({ ADD: "add.s", SUB: "sub.s", MUL: "mul.s", DIV: "div.s" } as Record<string, string>)[i.op];
      this.emit(`  ${opcode} $f6, $f2, $f4`); this.storeFloat("$f6", i.result, i); return;
    }
    const a = this.registers.getReg(), b = this.registers.getReg(), r = this.registers.getReg();
    this.loadWord(i.arg1, a, i); this.loadWord(i.arg2, b, i);
    if (i.op === "DIV" || i.op === "MOD") {
      this.needsDivisionChecks = true;
      this.emit(`  beq ${b}, $zero, __rt_throw_div_zero`, "  nop", `  div ${a}, ${b}`, `  ${i.op === "DIV" ? "mflo" : "mfhi"} ${r}`);
    }
    else this.emit(`  ${i.op === "ADD" ? "addu" : i.op === "SUB" ? "subu" : "mul"} ${r}, ${a}, ${b}`);
    this.storeWord(r, i.result, i);
  }
  private unary(i: TacInstruction): void {
    if (!i.arg1 || !i.result) return this.error("MIPS004", `${i.op} incompleto.`, i);
    if (i.op === "NEG" && primitive(i.result.type, "float")) { this.loadFloat(i.arg1, "$f2", i); this.emit("  neg.s $f4, $f2"); this.storeFloat("$f4", i.result, i); return; }
    const a = this.registers.getReg(), r = this.registers.getReg(); this.loadWord(i.arg1, a, i);
    this.emit(i.op === "NEG" ? `  subu ${r}, $zero, ${a}` : `  sltiu ${r}, ${a}, 1`); this.storeWord(r, i.result, i);
  }
  private comparison(i: TacInstruction): void {
    if (!i.arg1 || !i.arg2 || !i.result) return this.error("MIPS005", `${i.op} incompleto.`, i);
    if ((i.op === "EQ" || i.op === "NE") && (primitive(i.arg1.type, "string") || primitive(i.arg2.type, "string"))) {
      this.needsStringEquality = true; this.loadWord(i.arg1, "$a0", i); this.loadWord(i.arg2, "$a1", i); this.emit("  jal __rt_streq", "  nop");
      if (i.op === "NE") this.emit("  xori $v0, $v0, 1"); this.storeWord("$v0", i.result, i); return;
    }
    if (primitive(i.arg1.type, "float") || primitive(i.arg2.type, "float")) {
      this.loadFloat(i.arg1, "$f2", i); this.loadFloat(i.arg2, "$f4", i);
      const yes = this.next("fcmp_true"), end = this.next("fcmp_end");
      const rel = ({ EQ: "c.eq.s", NE: "c.eq.s", LT: "c.lt.s", LE: "c.le.s", GT: "c.lt.s", GE: "c.le.s" } as Record<string, string>)[i.op];
      const left = i.op === "GT" || i.op === "GE" ? "$f4" : "$f2", right = i.op === "GT" || i.op === "GE" ? "$f2" : "$f4";
      this.emit(`  ${rel} ${left}, ${right}`, `  ${i.op === "NE" ? "bc1f" : "bc1t"} ${yes}`, "  nop", "  li $t8, 0", `  j ${end}`, "  nop", `${yes}:`, "  li $t8, 1", `${end}:`);
      this.storeWord("$t8", i.result, i); return;
    }
    const a = this.registers.getReg(), b = this.registers.getReg(), r = this.registers.getReg(); this.loadWord(i.arg1, a, i); this.loadWord(i.arg2, b, i);
    const operation = ({ EQ: "seq", NE: "sne", LT: "slt", LE: "sle", GT: "sgt", GE: "sge" } as Record<string, string>)[i.op];
    this.emit(`  ${operation} ${r}, ${a}, ${b}`); this.storeWord(r, i.result, i);
  }
  private logic(i: TacInstruction): void {
    if (!i.arg1 || !i.arg2 || !i.result) return this.error("MIPS006", `${i.op} incompleto.`, i);
    const a = this.registers.getReg(), b = this.registers.getReg(), r = this.registers.getReg(); this.loadWord(i.arg1, a, i); this.loadWord(i.arg2, b, i);
    this.emit(`  ${i.op === "AND" ? "and" : "or"} ${r}, ${a}, ${b}`, `  sne ${r}, ${r}, $zero`); this.storeWord(r, i.result, i);
  }
  private branch(i: TacInstruction): void {
    if (!i.arg1 || !i.result) return this.error("MIPS007", `${i.op} incompleto.`, i);
    const r = this.registers.getReg(); this.loadWord(i.arg1, r, i); this.emit(`  ${i.op === "IF_TRUE" ? "bne" : "beq"} ${r}, $zero, ${safeLabel(i.result.value)}`, "  nop");
  }

  private jump(i: TacInstruction): void {
    if (!i.arg1) return this.error("MIPS062", "GOTO sin etiqueta de destino.", i);
    const target = String(i.arg1.value);
    const targetDepth = this.labelTryDepth.get(target) ?? this.activeTryHandlers.length;
    this.emitHandlerCleanup(Math.max(0, this.activeTryHandlers.length - targetDepth));
    this.emit(`  j ${safeLabel(target)}`, "  nop");
  }

  private beginFunction(i: TacInstruction): void {
    const raw = String(i.result?.value ?? "anonymous"), frame = i.frameId ? this.frames.get(i.frameId) : this.functions.get(raw);
    if (!frame) return this.error("MIPS008", `No existe registro de activación para ${raw}.`, i);
    this.functionContextStack.push({ frame: this.currentFrame, epilogue: this.currentEpilogue, handlers: [...this.activeTryHandlers] });
    this.activeTryHandlers.length = 0;
    this.currentFrame = frame; this.currentEpilogue = safeLabel(`${raw}_epilogue`, "fn");
    const bytes = align(frame.totalBytes), allocation = bytes + 12;
    this.emit(`${safeLabel(raw, "fn")}:`, `  addiu $sp, $sp, -${allocation}`, `  sw $s7, ${bytes}($sp)`, `  sw $fp, ${bytes + 4}($sp)`, `  sw $ra, ${bytes + 8}($sp)`, "  move $fp, $sp");
    const params = frame.slots.filter((slot) => slot.kind === "parameter");
    params.forEach((slot, index) => this.emit(`  lw $t8, ${allocation + 4 + (params.length - index - 1) * 4}($fp)`, `  sw $t8, ${slot.offset}($fp)`));
    for (const slot of frame.slots.filter((candidate) => candidate.sharedCell)) {
      this.emit(slot.kind === "parameter" ? `  lw $t8, ${slot.offset}($fp)` : "  move $t8, $zero",
        "  li $a0, 4", "  li $v0, 9", "  syscall", "  sw $t8, 0($v0)", `  sw $v0, ${slot.offset}($fp)`);
    }
    for (const slot of frame.slots.filter((candidate) => candidate.kind === "local" && !candidate.sharedCell)) {
      this.emit(`  sw $zero, ${slot.offset}($fp)`);
    }
  }
  private endFunction(): void {
    if (!this.currentFrame || !this.currentEpilogue) return;
    const bytes = align(this.currentFrame.totalBytes), allocation = bytes + 12;
    this.emit(`${this.currentEpilogue}:`, `  lw $s7, ${bytes}($fp)`, `  lw $ra, ${bytes + 8}($fp)`, `  lw $t8, ${bytes + 4}($fp)`, "  move $sp, $fp", `  addiu $sp, $sp, ${allocation}`, "  move $fp, $t8", "  jr $ra", "  nop");
    const previous = this.functionContextStack.pop();
    this.currentFrame = previous?.frame; this.currentEpilogue = previous?.epilogue;
    this.activeTryHandlers.splice(0, this.activeTryHandlers.length, ...(previous?.handlers ?? []));
  }
  private parameter(i: TacInstruction): void {
    if (!i.arg1) return this.error("MIPS009", "PARAM sin valor.", i);
    const r = this.registers.getReg();
    if (primitive(i.arg1.type, "float")) { this.loadFloat(i.arg1, "$f2", i); this.emit(`  mfc1 ${r}, $f2`); } else this.loadWord(i.arg1, r, i);
    this.emit("  addiu $sp, $sp, -4", `  sw ${r}, 0($sp)`); this.parameters += 1;
    this.parameterTypes.push(i.arg1.type);
  }
  private call(i: TacInstruction): void {
    if (!i.arg1) return this.error("MIPS010", "CALL sin destino.", i);
    const declared = Number(i.arg2?.value ?? this.parameters);
    const expected = Number.isFinite(declared) ? Math.max(0, Math.trunc(declared)) : this.parameters;
    if (expected > this.parameters) this.error("MIPS101", `CALL requiere ${expected} parámetros, pero solo hay ${this.parameters} apilados.`, i);
    const raw = String(i.arg1.value);
    const formalTypes = i.arg1.type?.kind === "function" ? i.arg1.type.params : this.functions.get(raw)?.slots.filter((slot) => slot.kind === "parameter").map((slot) => slot.type) ?? [];
    const actualTypes = this.parameterTypes.slice(-expected);
    formalTypes.forEach((type, index) => {
      if (primitive(type, "float") && !primitive(actualTypes[index], "float")) {
        const offset = (expected - index - 1) * 4;
        this.emit(`  lw $t8, ${offset}($sp)`, "  mtc1 $t8, $f2", "  cvt.s.w $f2, $f2", `  s.s $f2, ${offset}($sp)`);
      }
    });
    this.emit("  addiu $sp, $sp, -4", "  sw $s7, 0($sp)");
    if (this.functions.has(raw) && !this.findSlot(i.arg1)) this.emit("  move $s7, $zero", `  jal ${safeLabel(raw, "fn")}`, "  nop");
    else {
      const target = this.registers.getReg(); this.loadWord(i.arg1, target, i);
      this.emit(`  move $s7, ${target}`, `  lw $t9, 0(${target})`, "  jalr $t9", "  nop");
    }
    this.emit("  lw $s7, 0($sp)", "  addiu $sp, $sp, 4");
    const consumed = Math.min(expected, this.parameters);
    if (consumed) this.emit(`  addiu $sp, $sp, ${consumed * 4}`);
    this.parameters -= consumed;
    if (consumed) this.parameterTypes.splice(-consumed);
    if (i.result) {
      primitive(i.result.type, "float") ? this.storeFloat("$f0", i.result, i) : this.storeWord("$v0", i.result, i);
    }
  }
  private returnValue(i: TacInstruction): void {
    if (i.arg1) primitive(this.currentFrame?.returnType ?? i.arg1.type, "float") ? this.loadFloat(i.arg1, "$f0", i) : this.loadWord(i.arg1, "$v0", i);
    this.emitHandlerCleanup(this.activeTryHandlers.length);
    if (this.currentEpilogue) this.emit(`  j ${this.currentEpilogue}`, "  nop"); else this.error("MIPS011", "RETURN fuera de una función.", i);
  }

  private beginTry(i: TacInstruction): void {
    if (!i.result) return this.error("MIPS060", "TRY_BEGIN sin etiqueta de captura.", i);
    const handler = safeLabel(i.result.value);
    this.activeTryHandlers.push(handler);
    this.emit(
      "  addiu $sp, $sp, -20",
      "  lw $t8, __rt_handler",
      "  sw $t8, 0($sp)",
      "  addiu $t9, $sp, 20",
      "  sw $t9, 4($sp)",
      "  sw $fp, 8($sp)",
      "  sw $s7, 12($sp)",
      `  la $t8, ${handler}`,
      "  sw $t8, 16($sp)",
      "  sw $sp, __rt_handler"
    );
  }

  private endTry(i: TacInstruction): void {
    if (!this.activeTryHandlers.pop()) return this.error("MIPS061", "TRY_END sin TRY_BEGIN asociado.", i);
    this.emitHandlerCleanup(1);
  }

  private emitHandlerCleanup(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const done = this.next("handler_cleanup_done");
      this.emit(
        "  lw $t8, __rt_handler",
        `  beq $t8, $zero, ${done}`,
        "  nop",
        "  lw $t9, 0($t8)",
        "  lw $sp, 4($t8)",
        "  sw $t9, __rt_handler",
        `${done}:`
      );
    }
  }

  private print(i: TacInstruction): void {
    if (!i.arg1) return this.error("MIPS012", "PRINT sin operando.", i);
    if (primitive(i.arg1.type, "string")) { this.loadWord(i.arg1, "$a0", i); this.emit("  li $v0, 4", "  syscall"); }
    else if (primitive(i.arg1.type, "float")) { this.loadFloat(i.arg1, "$f12", i); this.emit("  li $v0, 2", "  syscall"); }
    else if (primitive(i.arg1.type, "boolean")) {
      const no = this.next("print_false"), end = this.next("print_end"), r = this.registers.getReg(); this.loadWord(i.arg1, r, i);
      this.emit(`  beq ${r}, $zero, ${no}`, "  nop", `  la $a0, ${safeLabel("true", "rt")}`, `  j ${end}`, "  nop", `${no}:`, `  la $a0, ${safeLabel("false", "rt")}`, `${end}:`, "  li $v0, 4", "  syscall");
    } else if (primitive(i.arg1.type, "null")) this.emit(`  la $a0, ${safeLabel("null", "rt")}`, "  li $v0, 4", "  syscall");
    else { this.loadWord(i.arg1, "$a0", i); this.emit("  li $v0, 1", "  syscall"); }
    this.emit(`  la $a0, ${safeLabel("newline", "rt")}`, "  li $v0, 4", "  syscall");
  }
  private newArray(i: TacInstruction): void {
    if (!i.arg1 || !i.result) return this.error("MIPS020", "NEW_ARRAY incompleto.", i);
    const n = this.registers.getReg(); this.loadWord(i.arg1, n, i); this.emit(`  addiu $a0, ${n}, 1`, "  sll $a0, $a0, 2", "  li $v0, 9", "  syscall", `  sw ${n}, 0($v0)`); this.storeWord("$v0", i.result, i);
  }
  private arrayLength(i: TacInstruction): void {
    if (!i.arg1 || !i.result) return this.error("MIPS021", "ARRAY_LENGTH incompleto.", i);
    const a = this.registers.getReg(), r = this.registers.getReg(); this.loadWord(i.arg1, a, i); this.checkArray(a); this.emit(`  lw ${r}, 0(${a})`); this.storeWord(r, i.result, i);
  }
  private arrayGet(i: TacInstruction): void {
    if (!i.arg1 || !i.arg2 || !i.result) return this.error("MIPS022", "ARRAY_GET incompleto.", i);
    const a = this.registers.getReg(), n = this.registers.getReg(); this.loadWord(i.arg1, a, i); this.loadWord(i.arg2, n, i); this.checkArray(a, n); this.emit(`  addiu ${n}, ${n}, 1`, `  sll ${n}, ${n}, 2`, `  addu ${a}, ${a}, ${n}`);
    if (primitive(i.result.type, "float")) { this.emit(`  l.s $f2, 0(${a})`); this.storeFloat("$f2", i.result, i); }
    else { const r = this.registers.getReg(); this.emit(`  lw ${r}, 0(${a})`); this.storeWord(r, i.result, i); }
  }
  private arraySet(i: TacInstruction): void {
    if (!i.arg1 || !i.arg2 || !i.result) return this.error("MIPS023", "ARRAY_SET incompleto.", i);
    const a = this.registers.getReg(), n = this.registers.getReg(); this.loadWord(i.arg1, a, i); this.loadWord(i.arg2, n, i); this.checkArray(a, n); this.emit(`  addiu ${n}, ${n}, 1`, `  sll ${n}, ${n}, 2`, `  addu ${a}, ${a}, ${n}`);
    if (primitive(i.arg1.type?.kind === "array" ? i.arg1.type.element : i.result.type, "float")) { this.loadFloat(i.result, "$f2", i); this.emit(`  s.s $f2, 0(${a})`); }
    else { const r = this.registers.getReg(); this.loadWord(i.result, r, i); this.emit(`  sw ${r}, 0(${a})`); }
  }
  private checkArray(base: string, index?: string): void {
    this.needsArrayChecks = true;
    this.emit(`  beq ${base}, $zero, __rt_throw_null_array`, "  nop");
    if (index) this.emit(`  bltz ${index}, __rt_throw_array_bounds`, "  nop", `  lw $t8, 0(${base})`, `  bge ${index}, $t8, __rt_throw_array_bounds`, "  nop");
  }
  private newObject(i: TacInstruction): void {
    if (!i.result) return this.error("MIPS024", "NEW_OBJECT sin resultado.", i);
    const layout = this.layout(i.result.type) ?? this.layoutsByName.get(String(i.arg1?.value ?? ""));
    if (!layout) return this.error("MIPS025", `No existe layout para ${String(i.arg1?.value ?? "objeto")}.`, i);
    this.emit(
      `  li $a0, ${Math.max(4, align(layout.instanceSize, 4))}`,
      "  li $v0, 9",
      "  syscall",
      `  la $t8, ${this.vtableLabel(layout)}`,
      "  sw $t8, 0($v0)"
    );
    this.storeWord("$v0", i.result, i);
  }
  private getField(i: TacInstruction): void {
    if (!i.arg1 || !i.arg2 || !i.result) return this.error("MIPS026", "GET_FIELD incompleto.", i);
    const layout = this.layout(i.arg1.type), name = String(i.arg2.value), method = layout?.methods?.find((candidate) => candidate.name === name);
    if (method) {
      const a = this.registers.getReg(), r = this.registers.getReg();
      this.loadWord(i.arg1, a, i); this.checkObject(a);
      this.emit(`  lw ${r}, 0(${a})`, `  lw ${r}, ${method.slot * 4}(${r})`);
      this.storeWord(r, i.result, i); return;
    }
    const field = [...(layout?.fields ?? [])].reverse().find((candidate) => candidate.name === name);
    if (!field) return this.error("MIPS027", `Campo o método desconocido: ${name}.`, i);
    const a = this.registers.getReg(); this.loadWord(i.arg1, a, i); this.checkObject(a);
    if (primitive(i.result.type, "float")) { this.emit(`  l.s $f2, ${field.offset}(${a})`); this.storeFloat("$f2", i.result, i); }
    else { const r = this.registers.getReg(); this.emit(`  lw ${r}, ${field.offset}(${a})`); this.storeWord(r, i.result, i); }
  }
  private setField(i: TacInstruction): void {
    if (!i.arg1 || !i.arg2 || !i.result) return this.error("MIPS028", "SET_FIELD incompleto.", i);
    const field = [...(this.layout(i.arg1.type)?.fields ?? [])].reverse().find((candidate) => candidate.name === String(i.arg2?.value));
    if (!field) return this.error("MIPS029", `Campo desconocido: ${String(i.arg2.value)}.`, i);
    const a = this.registers.getReg(); this.loadWord(i.arg1, a, i); this.checkObject(a);
    if (primitive(field.type, "float")) { this.loadFloat(i.result, "$f2", i); this.emit(`  s.s $f2, ${field.offset}(${a})`); }
    else { const r = this.registers.getReg(); this.loadWord(i.result, r, i); this.emit(`  sw ${r}, ${field.offset}(${a})`); }
  }

  private makeClosure(i: TacInstruction): void {
    if (!i.arg1 || !i.result) return this.error("MIPS030", "MAKE_CLOSURE incompleto.", i);
    let captures = 0;
    while (this.tac.instructions[i.index + captures + 1]?.op === "CAPTURE") captures += 1;
    this.emit(`  li $a0, ${(captures + 1) * 4}`, "  li $v0, 9", "  syscall", `  la $t8, ${safeLabel(i.arg1.value, "fn")}`, "  sw $t8, 0($v0)"); this.storeWord("$v0", i.result, i);
    this.activeClosure = i.result;
  }
  private capture(i: TacInstruction): void {
    if (!this.activeClosure || !i.arg1 || !i.result) return this.error("MIPS031", "CAPTURE sin cierre activo.", i);
    const c = this.registers.getReg(), v = this.registers.getReg(); this.loadWord(this.activeClosure, c, i); this.loadCell(i.arg1, v, i); this.emit(`  sw ${v}, ${(Number(i.result.value ?? 0) + 1) * 4}(${c})`);
  }
  private loadCapture(i: TacInstruction): void {
    if (!i.result) return this.error("MIPS032", "LOAD_CAPTURE sin resultado.", i);
    const r = this.registers.getReg(), index = Number(i.arg2?.value ?? i.arg1?.captureIndex ?? 0); this.emit(`  lw ${r}, ${(index + 1) * 4}($s7)`, `  lw ${r}, 0(${r})`); this.storeWord(r, i.result, i);
  }
  private storeCapture(i: TacInstruction): void {
    if (!i.result) return this.error("MIPS033", "STORE_CAPTURE sin valor.", i);
    const r = this.registers.getReg(), index = Number(i.arg2?.value ?? i.arg1?.captureIndex ?? 0);
    if (primitive(i.arg1?.type, "float")) { this.loadFloat(i.result, "$f2", i); this.emit(`  mfc1 ${r}, $f2`); }
    else this.loadWord(i.result, r, i);
    this.emit(`  lw $t9, ${(index + 1) * 4}($s7)`, `  sw ${r}, 0($t9)`);
  }

  private isCell(value: TacOperand): boolean {
    return Boolean(this.findSlot(value)?.slot.sharedCell || this.currentFrame?.slots.some((slot) => slot.kind === "captured" && slot.symbolId === value.symbolId && value.symbolId));
  }
  private loadCell(value: TacOperand, register: string, i?: TacInstruction): void {
    const captures = this.currentFrame?.slots.filter((slot) => slot.kind === "captured") ?? [];
    const index = captures.findIndex((slot) => slot.symbolId === value.symbolId);
    if (index >= 0) { this.emit(`  lw ${register}, ${(index + 1) * 4}($s7)`); return; }
    const target = this.storage(value);
    if (target) this.emit(`  lw ${register}, ${target}`);
    else this.error("MIPS043", `No se resolvió la celda de ${String(value.value)}.`, i);
  }

  private loadWord(value: TacOperand, register: string, i?: TacInstruction): void {
    if (value.kind === "constant") {
      if (value.value === null) this.emit(`  move ${register}, $zero`);
      else if (typeof value.value === "boolean") this.emit(`  li ${register}, ${value.value ? 1 : 0}`);
      else if (typeof value.value === "number") this.emit(`  li ${register}, ${Math.trunc(value.value)}`);
      else this.emit(`  la ${register}, ${this.stringLabel(String(value.value))}`);
      return;
    }
    if (value.kind === "label") { this.emit(`  la ${register}, ${safeLabel(value.value)}`); return; }
    if (this.isCell(value)) { this.loadCell(value, register, i); this.emit(`  lw ${register}, 0(${register})`); return; }
    const target = this.storage(value);
    if (target) { this.emit(`  lw ${register}, ${target}`); return; }
    if (value.type?.kind === "function" && this.functions.has(String(value.value))) { this.emit(`  la ${register}, ${safeLabel(value.value, "closure")}`); return; }
    this.error("MIPS040", `No se resolvió almacenamiento para ${String(value.value)}.`, i); this.emit(`  move ${register}, $zero`);
  }
  private storeWord(register: string, value: TacOperand, i?: TacInstruction): void {
    if (this.isCell(value)) { this.loadCell(value, "$t9", i); this.emit(`  sw ${register}, 0($t9)`); return; }
    const target = this.storage(value, true); if (!target) return this.error("MIPS041", `No se asignó almacenamiento para ${String(value.value)}.`, i); this.emit(`  sw ${register}, ${target}`);
  }
  private loadFloat(value: TacOperand, register: string, i?: TacInstruction): void {
    if (value.kind === "constant" && typeof value.value === "number") { this.emit(`  l.s ${register}, ${this.floatLabel(value.value)}`); return; }
    if (this.isCell(value) && primitive(value.type, "float")) { this.loadWord(value, "$t8", i); this.emit(`  mtc1 $t8, ${register}`); return; }
    const target = this.storage(value);
    if (target && primitive(value.type, "float")) { this.emit(`  l.s ${register}, ${target}`); return; }
    const r = this.registers.getReg(); this.loadWord(value, r, i); this.emit(`  mtc1 ${r}, ${register}`, `  cvt.s.w ${register}, ${register}`);
  }
  private storeFloat(register: string, value: TacOperand, i?: TacInstruction): void {
    if (this.isCell(value)) { this.loadCell(value, "$t9", i); this.emit(`  s.s ${register}, 0($t9)`); return; }
    const target = this.storage(value, true); if (!target) return this.error("MIPS042", `No se asignó almacenamiento flotante para ${String(value.value)}.`, i); this.emit(`  s.s ${register}, ${target}`);
  }
  private layout(type?: SemanticType): ClassLayout | undefined {
    if (type?.kind === "instance") return this.layoutsById.get(type.classId) ?? this.layoutsByName.get(type.className);
    if (type?.kind === "class") return this.layoutsById.get(type.classId) ?? this.layoutsByName.get(type.name);
    return undefined;
  }
  private vtableLabel(layout: ClassLayout): string { return safeLabel(layout.classId, "vtable"); }
  private checkObject(base: string): void {
    this.needsObjectChecks = true;
    this.emit(`  beq ${base}, $zero, __rt_throw_null_object`, "  nop");
  }
  private stringLabel(value: string): string {
    const known = this.strings.get(value); if (known) return known;
    const label = safeLabel(`string_${this.strings.size}`, "const"); this.strings.set(value, label); this.data.push(`${label}: .asciiz ${quote(value)}`); return label;
  }
  private floatLabel(value: number): string {
    const known = this.floats.get(value); if (known) return known;
    const label = safeLabel(`float_${this.floats.size}`, "const"); this.floats.set(value, label); this.data.push(".align 2", `${label}: .float ${Number.isFinite(value) ? value : 0}`); return label;
  }

  private runtime(): void {
    if (this.needsArrayChecks) {
      const nullMessage = this.stringLabel("Runtime error: null array\n");
      const boundsMessage = this.stringLabel("Runtime error: array index out of bounds\n");
      this.emit(
        "__rt_throw_null_array:", `  la $v1, ${nullMessage}`, "  j __rt_throw", "  nop",
        "__rt_throw_array_bounds:", `  la $v1, ${boundsMessage}`, "  j __rt_throw", "  nop"
      );
    }
    if (this.needsObjectChecks) {
      const nullObjectMessage = this.stringLabel("Runtime error: null object\n");
      this.emit("__rt_throw_null_object:", `  la $v1, ${nullObjectMessage}`, "  j __rt_throw", "  nop");
    }
    if (this.needsDivisionChecks) {
      const divisionMessage = this.stringLabel("Runtime error: division by zero\n");
      this.emit("__rt_throw_div_zero:", `  la $v1, ${divisionMessage}`, "  j __rt_throw", "  nop");
    }
    if (this.needsArrayChecks || this.needsObjectChecks || this.needsDivisionChecks) {
      this.emit(
        "__rt_throw:",
        "  lw $t9, __rt_handler",
        "  beq $t9, $zero, __rt_uncaught",
        "  nop",
        "  lw $t8, 16($t9)",
        "  lw $sp, 4($t9)",
        "  lw $fp, 8($t9)",
        "  lw $s7, 12($t9)",
        "  lw $t7, 0($t9)",
        "  sw $t7, __rt_handler",
        "  jr $t8",
        "  nop",
        "__rt_uncaught:",
        "  move $a0, $v1",
        "  li $v0, 4",
        "  syscall",
        "  li $v0, 10",
        "  syscall"
      );
    }
    if (this.needsStringEquality) this.emit(
      "__rt_streq:", "  lbu $t8, 0($a0)", "  lbu $t9, 0($a1)", "  bne $t8, $t9, __rt_streq_false", "  nop", "  beq $t8, $zero, __rt_streq_true", "  nop", "  addiu $a0, $a0, 1", "  addiu $a1, $a1, 1", "  j __rt_streq", "  nop",
      "__rt_streq_false:", "  move $v0, $zero", "  jr $ra", "  nop", "__rt_streq_true:", "  li $v0, 1", "  jr $ra", "  nop");
    if (this.needsConcat) this.emit(
      "__rt_concat:", "  move $t0, $a0", "  move $t1, $a1", "  move $t2, $zero", "__rt_concat_len_a:", "  lbu $t4, 0($t0)", "  beq $t4, $zero, __rt_concat_len_b_start", "  nop", "  addiu $t0, $t0, 1", "  addiu $t2, $t2, 1", "  j __rt_concat_len_a", "  nop",
      "__rt_concat_len_b_start:", "  move $t3, $zero", "__rt_concat_len_b:", "  lbu $t4, 0($t1)", "  beq $t4, $zero, __rt_concat_alloc", "  nop", "  addiu $t1, $t1, 1", "  addiu $t3, $t3, 1", "  j __rt_concat_len_b", "  nop",
      "__rt_concat_alloc:", "  addu $a0, $t2, $t3", "  addiu $a0, $a0, 1", "  li $v0, 9", "  syscall", "  move $t4, $v0", "  subu $t0, $t0, $t2", "  subu $t1, $t1, $t3",
      "__rt_concat_copy_a:", "  lbu $t5, 0($t0)", "  beq $t5, $zero, __rt_concat_copy_b", "  nop", "  sb $t5, 0($t4)", "  addiu $t0, $t0, 1", "  addiu $t4, $t4, 1", "  j __rt_concat_copy_a", "  nop",
      "__rt_concat_copy_b:", "  lbu $t5, 0($t1)", "  sb $t5, 0($t4)", "  beq $t5, $zero, __rt_concat_done", "  nop", "  addiu $t1, $t1, 1", "  addiu $t4, $t4, 1", "  j __rt_concat_copy_b", "  nop", "__rt_concat_done:", "  jr $ra", "  nop");
  }
  private validateLabels(): void {
    const defined = new Set([...this.data, ...this.text].map((line) => /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line.trim())?.[1]).filter((value): value is string => Boolean(value)));
    const refs = new Set<string>();
    for (const line of this.text) {
      const direct = /^(?:j|jal|bc1t|bc1f)\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(line.trim()); if (direct) refs.add(direct[1]);
      const branch = /^(?:beq|bne)\s+[^,]+,\s*[^,]+,\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(line.trim()); if (branch) refs.add(branch[1]);
      const address = /^la\s+\$[^,]+,\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(line.trim()); if (address) refs.add(address[1]);
    }
    refs.forEach((reference) => { if (!defined.has(reference)) this.error("MIPS050", `Etiqueta no definida: ${reference}.`); });
  }
  private next(prefix: string): string { this.serial += 1; return safeLabel(`${prefix}_${this.serial}`, "rt"); }
  private emit(...lines: string[]): void { this.text.push(...lines); }
  private error(code: string, message: string, i?: TacInstruction): void { this.diagnostics.push({ code, severity: "error", message, tacIndex: i?.index }); }
  private warn(code: string, message: string, i?: TacInstruction): void { this.diagnostics.push({ code, severity: "warning", message, tacIndex: i?.index }); }
}

export const PEEPHOLE_RULE_IDS = [
  "self-move",
  "zero-addiu",
  "zero-addu",
  "zero-subu",
  "zero-or",
  "zero-shift",
  "jump-next-label",
  "duplicate-nop",
] as const;

export type PeepholeRuleId = (typeof PEEPHOLE_RULE_IDS)[number];

export interface PeepholeOptimizationResult {
  lines: string[];
  removed: number;
  applied: Record<PeepholeRuleId, number>;
}

function matchPeepholeRule(text: string, previous: string | undefined, next: string | undefined): PeepholeRuleId | undefined {
  if (/^move\s+(\$[A-Za-z0-9]+),\s*\1$/.test(text)) return "self-move";
  if (/^addiu\s+(\$[A-Za-z0-9]+),\s*\1,\s*0$/.test(text)) return "zero-addiu";
  if (/^addu\s+(\$[A-Za-z0-9]+),\s*\1,\s*\$zero$/.test(text)) return "zero-addu";
  if (/^subu\s+(\$[A-Za-z0-9]+),\s*\1,\s*\$zero$/.test(text)) return "zero-subu";
  if (/^or\s+(\$[A-Za-z0-9]+),\s*\1,\s*\$zero$/.test(text)) return "zero-or";
  if (/^sll\s+(\$[A-Za-z0-9]+),\s*\1,\s*0$/.test(text)) return "zero-shift";

  const target = /^j\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(text)?.[1];
  const nextLabel = next?.trim().replace(/:$/, "");
  if (target && target === nextLabel) return "jump-next-label";
  if (text === "nop" && previous?.trim() === "nop") return "duplicate-nop";
  return undefined;
}

/** Optimización de mirilla conservadora sobre ensamblador ya generado. */
export function peepholeOptimize(lines: string[]): PeepholeOptimizationResult {
  const output: string[] = [];
  const applied = Object.fromEntries(PEEPHOLE_RULE_IDS.map((rule) => [rule, 0])) as Record<PeepholeRuleId, number>;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index], text = line.trim();
    const rule = matchPeepholeRule(text, output[output.length - 1], lines[index + 1]);
    if (rule) { applied[rule] += 1; continue; }
    output.push(line);
  }
  const removed = Object.values(applied).reduce((total, count) => total + count, 0);
  return { lines: output, removed, applied };
}

export function generateMips(tac: TacGenerationResult): MipsGenerationResult {
  if (tac.status === "not-requested") return emptyMipsResult("not-requested", "La fase MIPS no fue solicitada.");
  if (tac.status !== "completed") return emptyMipsResult("skipped", tac.skipReason ?? "No hay TAC válido para traducir a MIPS.");
  if (tac.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return emptyMipsResult("skipped", "El TAC contiene errores.");
  return new Generator(tac).generate();
}

export function mipsReport(result: MipsGenerationResult): string {
  return ["Reporte MIPS32 / MARS 4.5", `Estado: ${result.status}`, `Instrucciones antes de mirilla: ${result.instructionCount}`, `Instrucciones finales: ${result.optimizedInstructionCount}`, `Optimizaciones: ${result.optimizationCount}`, `Asignaciones getReg: ${result.registerStats.allocations}`, `Máximo simultáneo: ${result.registerStats.maxConcurrent}`, `Spills: ${result.registerStats.spills}`, `Diagnósticos: ${result.diagnostics.length}`, ...result.diagnostics.map((d) => `${d.severity.toUpperCase()} ${d.code}: ${d.message}`), "", result.assembly].join("\n");
}
