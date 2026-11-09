import type { SemanticType } from "../semantic/semanticTypes";
import type { ActivationRecord, ClassLayout, FrameSlot, TacGenerationResult, TacInstruction, TacOperand } from "./types";

export type TacExecutionStatus = "not-run" | "completed" | "uncaught-error" | "step-limit" | "depth-limit" | "resource-limit" | "fault";

export interface ActivationTreeNode {
  id: number;
  parentId: number | null;
  frameId: string;
  name: string;
  kind: ActivationRecord["kind"];
  depth: number;
  callTacIndex?: number;
  callLine?: number;
  arguments: string[];
  returnValue?: string;
  status: "active" | "returned" | "unwound";
  enterStep: number;
  exitStep?: number;
  children: number[];
}

export interface TacExecutionLimits {
  maxSteps: number;
  maxDepth: number;
  maxNodes: number;
  maxHeapBytes: number;
  maxOutputChars: number;
}

export interface TacExecutionResult {
  status: TacExecutionStatus;
  message?: string;
  output: string;
  steps: number;
  nodes: ActivationTreeNode[];
  nodeCount: number;
  maxDepth: number;
  truncated: boolean;
  limits: TacExecutionLimits;
}

export const DEFAULT_EXECUTION_LIMITS: TacExecutionLimits = { maxSteps: 500_000, maxDepth: 1_000, maxNodes: 2_000, maxHeapBytes: 16 * 1024 * 1024, maxOutputChars: 1_000_000 };

export const emptyExecutionResult = (message = "El programa no se ejecutó porque no hay TAC válido."): TacExecutionResult => ({
  status: "not-run", message, output: "", steps: 0, nodes: [], nodeCount: 0, maxDepth: 0, truncated: false, limits: DEFAULT_EXECUTION_LIMITS
});

const HEAP_BASE = 0x10040000;

interface Cell { kind: "cell"; address: number; value: Value }
interface ArrayRef { kind: "array"; address: number; items: Value[] }
interface ObjectRef { kind: "object"; address: number; layout: ClassLayout; fields: Map<number, Value> }
interface Callable { kind: "callable"; address: number; label: string; receiver?: Value; captures: Value[] }
type Ref = Cell | ArrayRef | ObjectRef | Callable;
type Value = number | string | Ref;

interface Activation {
  frame: ActivationRecord;
  locals: Map<string, Value>;
  closure?: Callable;
  pendingClosure?: TacOperand;
  returnPc: number;
  result?: TacOperand;
  node?: ActivationTreeNode;
}

interface Handler { catchLabel: string; depth: number; pending: number }

class RuntimeThrow { constructor(readonly message: string) {} }
class ExecutionFault { constructor(readonly status: TacExecutionStatus, readonly message: string) {} }

function primitive(type: SemanticType | undefined, name: string): boolean {
  return type?.kind === "primitive" && type.name === name;
}

function isRef(value: Value | undefined): value is Ref {
  return typeof value === "object" && value !== null;
}

function isNull(value: Value): boolean {
  return value === 0;
}

export function formatMarsFloat(value: number): string {
  const float = Math.fround(value);
  if (Number.isNaN(float)) return "NaN";
  if (!Number.isFinite(float)) return float > 0 ? "Infinity" : "-Infinity";
  if (float === 0) return Object.is(float, -0) ? "-0.0" : "0.0";
  let exponential = float.toExponential(8);
  for (let precision = 1; precision <= 9; precision += 1) {
    const candidate = float.toExponential(precision - 1);
    if (Math.fround(Number(candidate)) === float) { exponential = candidate; break; }
  }
  const [mantissa, exponentText] = exponential.split("e");
  const sign = mantissa.startsWith("-") ? "-" : "";
  const digits = mantissa.replace("-", "").replace(".", "").replace(/0+$/, "") || "0";
  const exponent = Number(exponentText);
  if (exponent >= -3 && exponent < 7) {
    if (exponent >= 0) {
      const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, "0");
      return `${sign}${whole}.${digits.slice(exponent + 1) || "0"}`;
    }
    return `${sign}0.${"0".repeat(-exponent - 1)}${digits}`;
  }
  return `${sign}${digits[0]}.${digits.slice(1) || "0"}E${exponent}`;
}

class TacInterpreter {
  private readonly instructions: TacInstruction[];
  private readonly frames = new Map<string, ActivationRecord>();
  private readonly functions = new Map<string, ActivationRecord>();
  private readonly functionStart = new Map<string, number>();
  private readonly labels = new Map<string, number>();
  private readonly labelTryDepth = new Map<string, number>();
  private readonly tryDepthAt: number[] = [];
  private readonly layoutsById = new Map<string, ClassLayout>();
  private readonly layoutsByName = new Map<string, ClassLayout>();
  private readonly globals = new Map<string, Value>();
  private readonly synthetic = new Map<string, Value>();
  private readonly staticCallables = new Map<string, Callable>();
  private readonly stack: Activation[] = [];
  private readonly handlers: Handler[] = [];
  private readonly pending: { value: Value; type?: SemanticType }[] = [];
  private readonly nodes: ActivationTreeNode[] = [];
  private output = "";
  private heap = HEAP_BASE;
  private steps = 0;
  private deepest = 0;
  private nodeCount = 0;
  private truncated = false;
  private thrown: Value = 0;

  constructor(tac: TacGenerationResult, private readonly limits: TacExecutionLimits) {
    this.instructions = tac.instructions;
    tac.activationRecords.forEach((frame) => this.frames.set(frame.id, frame));
    tac.classLayouts.forEach((layout) => { this.layoutsById.set(layout.classId, layout); this.layoutsByName.set(layout.name, layout); });
    let tryDepth = 0;
    let active = 0;
    const saved: number[] = [];
    this.instructions.forEach((instruction, index) => {
      this.tryDepthAt[index] = active;
      if (instruction.op === "FUNC_BEGIN" && instruction.frameId && instruction.result) {
        const frame = this.frames.get(instruction.frameId);
        const label = String(instruction.result.value);
        if (frame) { this.functions.set(label, frame); this.functionStart.set(label, index); }
        saved.push(active); active = 0;
      }
      if (instruction.op === "FUNC_END") active = saved.pop() ?? 0;
      if (instruction.op === "TRY_BEGIN") active += 1;
      if (instruction.op === "TRY_END") active = Math.max(0, active - 1);
      if (instruction.op === "TRY_END") tryDepth = Math.max(0, tryDepth - 1);
      if (instruction.op === "LABEL" && instruction.result) {
        this.labels.set(String(instruction.result.value), index);
        this.labelTryDepth.set(String(instruction.result.value), tryDepth);
      }
      if (instruction.op === "TRY_BEGIN") tryDepth += 1;
    });
  }

  run(): TacExecutionResult {
    const global = [...this.frames.values()].find((frame) => frame.kind === "global");
    let status: TacExecutionStatus = "completed";
    let message: string | undefined;
    if (!global) return this.finish("fault", "No existe registro de activación global.");
    this.enter(global, 0, undefined, undefined, [], undefined);
    let pc = this.instructions.findIndex((instruction) => instruction.op === "PROGRAM_BEGIN") + 1;
    try {
      while (pc < this.instructions.length) {
        if (++this.steps > this.limits.maxSteps) throw new ExecutionFault("step-limit", `Se alcanzó el límite de ${this.limits.maxSteps} instrucciones TAC ejecutadas.`);
        const instruction = this.instructions[pc];
        if (instruction.op === "PROGRAM_END") break;
        try {
          pc = this.execute(instruction, pc);
        } catch (error) {
          if (!(error instanceof RuntimeThrow)) throw error;
          const handler = this.handlers.pop();
          if (!handler) {
            this.output += `${error.message}\n`;
            status = "uncaught-error"; message = error.message;
            break;
          }
          while (this.stack.length > handler.depth) this.leave("unwound");
          this.pending.length = Math.min(this.pending.length, handler.pending);
          this.thrown = error.message;
          pc = this.jumpTarget(handler.catchLabel);
        }
      }
    } catch (error) {
      if (!(error instanceof ExecutionFault)) throw error;
      status = error.status; message = error.message;
    }
    if (status === "completed" || status === "uncaught-error") {
      while (this.stack.length > 1) this.leave("unwound");
      if (status === "completed") this.leave("returned"); else this.leave("unwound");
    }
    return this.finish(status, message);
  }

  private finish(status: TacExecutionStatus, message?: string): TacExecutionResult {
    return { status, message, output: this.output, steps: Math.min(this.steps, this.limits.maxSteps), nodes: this.nodes, nodeCount: this.nodeCount, maxDepth: this.deepest, truncated: this.truncated, limits: this.limits };
  }

  private execute(i: TacInstruction, pc: number): number {
    switch (i.op) {
      case "PROGRAM_BEGIN": case "LABEL": return pc + 1;
      case "MOV": {
        const result = this.need(i.result, i);
        if (primitive(result.type, "float")) this.store(this.float(this.need(i.arg1, i)), result);
        else this.store(this.word(this.need(i.arg1, i)), result);
        return pc + 1;
      }
      case "ADD": case "SUB": case "MUL": case "DIV": case "MOD": this.arithmetic(i); return pc + 1;
      case "NEG": {
        const result = this.need(i.result, i);
        if (primitive(result.type, "float")) this.store(Math.fround(-this.float(this.need(i.arg1, i))), result);
        else this.store((-this.integer(this.need(i.arg1, i))) | 0, result);
        return pc + 1;
      }
      case "NOT": this.store(this.integer(this.need(i.arg1, i)) === 0 ? 1 : 0, this.need(i.result, i)); return pc + 1;
      case "EQ": case "NE": case "LT": case "LE": case "GT": case "GE": this.comparison(i); return pc + 1;
      case "AND": case "OR": {
        const left = this.integer(this.need(i.arg1, i)), right = this.integer(this.need(i.arg2, i));
        this.store((i.op === "AND" ? left & right : left | right) !== 0 ? 1 : 0, this.need(i.result, i));
        return pc + 1;
      }
      case "IF_TRUE": case "IF_FALSE": {
        const truthy = this.integer(this.need(i.arg1, i)) !== 0;
        return truthy === (i.op === "IF_TRUE") ? this.jumpTarget(String(this.need(i.result, i).value)) : pc + 1;
      }
      case "GOTO": {
        const target = String(this.need(i.arg1, i).value);
        const depth = this.tryDepthAt[pc] ?? 0;
        this.cleanupHandlers(Math.max(0, depth - (this.labelTryDepth.get(target) ?? depth)));
        return this.jumpTarget(target);
      }
      case "FUNC_BEGIN": throw new ExecutionFault("fault", `El flujo entró sin llamada al cuerpo de ${String(i.result?.value)}.`);
      case "PARAM": {
        const value = this.need(i.arg1, i);
        this.pending.push({ value: primitive(value.type, "float") ? this.float(value) : this.word(value), type: value.type });
        return pc + 1;
      }
      case "CALL": return this.call(i, pc);
      case "RETURN": {
        const current = this.current();
        const value = i.arg1 ? (primitive(current.frame.returnType ?? i.arg1.type, "float") ? this.float(i.arg1) : this.word(i.arg1)) : undefined;
        this.cleanupHandlers(this.tryDepthAt[pc] ?? 0);
        return this.returnFrom(value);
      }
      case "FUNC_END": return this.returnFrom(undefined);
      case "PRINT": this.print(this.need(i.arg1, i)); return pc + 1;
      case "NEW_ARRAY": {
        const length = this.integer(this.need(i.arg1, i));
        if (length < 0) throw new ExecutionFault("fault", "MARS no puede reservar un arreglo de longitud negativa.");
        const address = this.allocate((length + 1) * 4);
        this.store({ kind: "array", address, items: new Array<Value>(length).fill(0) }, this.need(i.result, i));
        return pc + 1;
      }
      case "ARRAY_LENGTH": this.store(this.array(this.need(i.arg1, i)).items.length, this.need(i.result, i)); return pc + 1;
      case "ARRAY_GET": {
        const array = this.array(this.need(i.arg1, i));
        this.store(array.items[this.index(array, this.need(i.arg2, i))], this.need(i.result, i));
        return pc + 1;
      }
      case "ARRAY_SET": {
        const base = this.need(i.arg1, i), result = this.need(i.result, i);
        const array = this.array(base), index = this.index(array, this.need(i.arg2, i));
        array.items[index] = primitive(base.type?.kind === "array" ? base.type.element : result.type, "float") ? this.float(result) : this.word(result);
        return pc + 1;
      }
      case "NEW_OBJECT": {
        const result = this.need(i.result, i);
        const layout = this.layout(result.type) ?? this.layoutsByName.get(String(i.arg1?.value ?? ""));
        if (!layout) throw new ExecutionFault("fault", `No existe layout para ${String(i.arg1?.value ?? "objeto")}.`);
        this.store({ kind: "object", address: this.allocate(Math.max(4, Math.ceil(layout.instanceSize / 4) * 4)), layout, fields: new Map() }, result);
        return pc + 1;
      }
      case "GET_FIELD": this.getField(i); return pc + 1;
      case "SET_FIELD": {
        const base = this.need(i.arg1, i), name = String(this.need(i.arg2, i).value), result = this.need(i.result, i);
        const field = [...(this.layout(base.type)?.fields ?? [])].reverse().find((candidate) => candidate.name === name);
        if (!field) throw new ExecutionFault("fault", `Campo desconocido: ${name}.`);
        this.object(base).fields.set(field.offset, primitive(field.type, "float") ? this.float(result) : this.word(result));
        return pc + 1;
      }
      case "MAKE_CLOSURE": {
        let captures = 0;
        while (this.instructions[pc + captures + 1]?.op === "CAPTURE") captures += 1;
        const result = this.need(i.result, i);
        this.store({ kind: "callable", address: this.allocate((captures + 1) * 4), label: String(this.need(i.arg1, i).value), captures: [] }, result);
        this.current().pendingClosure = result;
        return pc + 1;
      }
      case "CAPTURE": {
        const pendingClosure = this.current().pendingClosure;
        if (!pendingClosure) throw new ExecutionFault("fault", "CAPTURE sin cierre activo.");
        const closure = this.word(pendingClosure);
        if (!isRef(closure) || closure.kind !== "callable") throw new ExecutionFault("fault", "CAPTURE sobre un valor que no es cierre.");
        closure.captures[Number(this.need(i.result, i).value ?? 0)] = this.cellOf(this.need(i.arg1, i));
        return pc + 1;
      }
      case "LOAD_CAPTURE": {
        const index = Number(i.arg2?.value ?? i.arg1?.captureIndex ?? 0);
        this.store(this.cell(this.current().closure?.captures[index]).value, this.need(i.result, i));
        return pc + 1;
      }
      case "STORE_CAPTURE": {
        const index = Number(i.arg2?.value ?? i.arg1?.captureIndex ?? 0), result = this.need(i.result, i);
        this.cell(this.current().closure?.captures[index]).value = primitive(i.arg1?.type, "float") ? this.float(result) : this.word(result);
        return pc + 1;
      }
      case "TRY_BEGIN": this.handlers.push({ catchLabel: String(this.need(i.result, i).value), depth: this.stack.length, pending: this.pending.length }); return pc + 1;
      case "TRY_END": this.cleanupHandlers(1); return pc + 1;
      case "CATCH_BEGIN": if (i.result) this.store(this.thrown, i.result); return pc + 1;
      default: throw new ExecutionFault("fault", `Opcode TAC no soportado: ${String(i.op)}.`);
    }
  }

  private arithmetic(i: TacInstruction): void {
    const left = this.need(i.arg1, i), right = this.need(i.arg2, i), result = this.need(i.result, i);
    if (i.op === "ADD" && (primitive(left.type, "string") || primitive(result.type, "string"))) {
      const a = this.word(left), b = this.word(right);
      if (typeof a !== "string" || typeof b !== "string") throw new ExecutionFault("fault", "La concatenación recibió un operando que no es una cadena.");
      this.allocate(a.length + b.length + 1);
      this.store(a + b, result);
      return;
    }
    if ((primitive(left.type, "float") || primitive(right.type, "float") || primitive(result.type, "float")) && i.op !== "MOD") {
      const a = this.float(left), b = this.float(right);
      if (i.op === "DIV" && b === 0) throw new RuntimeThrow("Runtime error: division by zero");
      const value = i.op === "ADD" ? a + b : i.op === "SUB" ? a - b : i.op === "MUL" ? a * b : a / b;
      this.store(Math.fround(value), result);
      return;
    }
    const a = this.integer(left), b = this.integer(right);
    if ((i.op === "DIV" || i.op === "MOD") && b === 0) throw new RuntimeThrow("Runtime error: division by zero");
    const value = i.op === "ADD" ? a + b : i.op === "SUB" ? a - b : i.op === "MUL" ? Math.imul(a, b) : i.op === "DIV" ? Math.trunc(a / b) : a % b;
    this.store(value | 0, result);
  }

  private comparison(i: TacInstruction): void {
    const left = this.need(i.arg1, i), right = this.need(i.arg2, i), result = this.need(i.result, i);
    let outcome: boolean;
    if ((i.op === "EQ" || i.op === "NE") && (primitive(left.type, "string") || primitive(right.type, "string"))) {
      const a = this.word(left), b = this.word(right);
      if (typeof a !== "string" || typeof b !== "string") throw new ExecutionFault("fault", "La comparación de cadenas recibió una referencia nula.");
      outcome = (a === b) === (i.op === "EQ");
    } else if (primitive(left.type, "float") || primitive(right.type, "float")) {
      outcome = this.relate(i.op, this.float(left), this.float(right));
    } else {
      const a = this.word(left), b = this.word(right);
      if (typeof a === "string" || typeof b === "string") {
        if (i.op !== "EQ" && i.op !== "NE") throw new ExecutionFault("fault", "La dirección de una cadena estática no está modelada.");
        outcome = (a === b) === (i.op === "EQ");
      } else outcome = this.relate(i.op, isRef(a) ? a.address | 0 : a | 0, isRef(b) ? b.address | 0 : b | 0);
    }
    this.store(outcome ? 1 : 0, result);
  }

  private relate(op: TacInstruction["op"], a: number, b: number): boolean {
    return op === "EQ" ? a === b : op === "NE" ? a !== b : op === "LT" ? a < b : op === "LE" ? a <= b : op === "GT" ? a > b : a >= b;
  }

  private call(i: TacInstruction, pc: number): number {
    const target = this.need(i.arg1, i);
    const declared = Number(i.arg2?.value ?? this.pending.length);
    const expected = Number.isFinite(declared) ? Math.max(0, Math.trunc(declared)) : this.pending.length;
    if (expected > this.pending.length) throw new ExecutionFault("fault", `CALL requiere ${expected} parámetros, pero solo hay ${this.pending.length} apilados.`);
    const raw = String(target.value);
    let closure: Callable | undefined;
    let label = raw;
    if (!(this.functions.has(raw) && !this.findSlot(target))) {
      const value = this.word(target);
      if (!isRef(value) || value.kind !== "callable") throw new ExecutionFault("fault", `${raw} no contiene una función invocable.`);
      closure = value; label = value.label;
    }
    const frame = this.functions.get(label);
    const start = this.functionStart.get(label);
    if (!frame || start === undefined) throw new ExecutionFault("fault", `No existe el cuerpo de la función ${label}.`);
    const actual = this.pending.splice(this.pending.length - expected, expected);
    const formalTypes = target.type?.kind === "function" ? target.type.params : frame.slots.filter((slot) => slot.kind === "parameter").map((slot) => slot.type);
    const args = actual.map((entry, index) => primitive(formalTypes[index], "float") && !primitive(entry.type, "float") && typeof entry.value === "number" ? Math.fround(entry.value) : entry.value);
    this.enter(frame, pc + 1, i.result, closure, args, i);
    return start + 1;
  }

  private enter(frame: ActivationRecord, returnPc: number, result: TacOperand | undefined, closure: Callable | undefined, args: Value[], call: TacInstruction | undefined): void {
    if (this.stack.length >= this.limits.maxDepth) throw new ExecutionFault("depth-limit", `Se alcanzó la profundidad máxima de ${this.limits.maxDepth} activaciones.`);
    const activation: Activation = { frame, locals: new Map(), closure, returnPc, result };
    const params = frame.slots.filter((slot) => slot.kind === "parameter");
    const stackParams = frame.kind === "method" ? params.slice(1) : params;
    if (frame.kind === "method" && params[0]) activation.locals.set(this.slotKey(frame, params[0]), closure?.receiver ?? 0);
    if (call && stackParams.length !== args.length) throw new ExecutionFault("fault", `${frame.name} esperaba ${stackParams.length} argumentos y recibió ${args.length}.`);
    stackParams.forEach((slot, index) => activation.locals.set(this.slotKey(frame, slot), args[index]));
    if (frame.kind !== "global") {
      for (const slot of frame.slots.filter((candidate) => candidate.sharedCell)) {
        const initial = slot.kind === "parameter" ? activation.locals.get(this.slotKey(frame, slot)) ?? 0 : 0;
        activation.locals.set(this.slotKey(frame, slot), { kind: "cell", address: this.allocate(4), value: initial });
      }
    }
    const parent = this.stack[this.stack.length - 1]?.node;
    if (this.nodeCount < this.limits.maxNodes) {
      const visibleArgs = frame.kind === "method" && params[0] ? [closure?.receiver ?? 0, ...args] : args;
      const node: ActivationTreeNode = {
        id: this.nodes.length, parentId: parent?.id ?? null, frameId: frame.id, name: frame.name, kind: frame.kind, depth: this.stack.length,
        callTacIndex: call?.index, callLine: call?.source?.line,
        arguments: visibleArgs.map((value, index) => this.describe(value, params[index]?.type)),
        status: "active", enterStep: this.steps, children: []
      };
      this.nodes.push(node);
      parent?.children.push(node.id);
      activation.node = node;
    } else this.truncated = true;
    this.nodeCount += 1;
    this.stack.push(activation);
    this.deepest = Math.max(this.deepest, this.stack.length - 1);
  }

  private returnFrom(value: Value | undefined): number {
    const activation = this.current();
    if (this.stack.length === 1) throw new ExecutionFault("fault", "RETURN fuera de una función.");
    if (activation.node && value !== undefined) activation.node.returnValue = this.describe(value, activation.frame.returnType);
    this.leave("returned");
    if (activation.result) this.store(value ?? 0, activation.result);
    return activation.returnPc;
  }

  private leave(status: ActivationTreeNode["status"]): void {
    const activation = this.stack.pop();
    if (activation?.node) { activation.node.status = status; activation.node.exitStep = this.steps; }
  }

  private cleanupHandlers(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const handler = this.handlers.pop();
      if (!handler) return;
      this.pending.length = Math.min(this.pending.length, handler.pending);
    }
  }

  private getField(i: TacInstruction): void {
    const base = this.need(i.arg1, i), name = String(this.need(i.arg2, i).value), result = this.need(i.result, i);
    const layout = this.layout(base.type);
    const method = layout?.methods?.find((candidate) => candidate.name === name);
    if (method) {
      const object = this.object(base);
      const dynamic = object.layout.methods?.find((candidate) => candidate.slot === method.slot);
      if (!dynamic) throw new ExecutionFault("fault", `La tabla virtual de ${object.layout.name} no tiene el slot ${method.slot}.`);
      this.store({ kind: "callable", address: this.allocate(8), label: dynamic.label, receiver: object, captures: [] }, result);
      return;
    }
    const field = [...(layout?.fields ?? [])].reverse().find((candidate) => candidate.name === name);
    if (!field) throw new ExecutionFault("fault", `Campo o método desconocido: ${name}.`);
    this.store(this.object(base).fields.get(field.offset) ?? 0, result);
  }

  private print(value: TacOperand): void {
    let text: string;
    if (primitive(value.type, "string")) {
      const word = this.word(value);
      if (typeof word !== "string") throw new ExecutionFault("fault", "PRINT recibió una cadena nula.");
      text = word;
    } else if (primitive(value.type, "float")) text = formatMarsFloat(this.float(value));
    else if (primitive(value.type, "boolean")) text = this.integer(value) !== 0 ? "true" : "false";
    else if (primitive(value.type, "null")) text = "null";
    else {
      const word = this.word(value);
      if (typeof word === "string") throw new ExecutionFault("fault", "La dirección de una cadena estática no está modelada.");
      text = String(isRef(word) ? word.address | 0 : word | 0);
    }
    this.output += `${text}\n`;
    if (this.output.length > this.limits.maxOutputChars) throw new ExecutionFault("resource-limit", `La salida superó el límite de ${this.limits.maxOutputChars} caracteres.`);
  }

  private array(operand: TacOperand): ArrayRef {
    const value = this.word(operand);
    if (isNull(value)) throw new RuntimeThrow("Runtime error: null array");
    if (!isRef(value) || value.kind !== "array") throw new ExecutionFault("fault", "Se esperaba un arreglo.");
    return value;
  }

  private index(array: ArrayRef, operand: TacOperand): number {
    const index = this.integer(operand);
    if (index < 0 || index >= array.items.length) throw new RuntimeThrow("Runtime error: array index out of bounds");
    return index;
  }

  private object(operand: TacOperand): ObjectRef {
    const value = this.word(operand);
    if (isNull(value)) throw new RuntimeThrow("Runtime error: null object");
    if (!isRef(value) || value.kind !== "object") throw new ExecutionFault("fault", "Se esperaba un objeto.");
    return value;
  }

  private cell(value: Value | undefined): Cell {
    if (!isRef(value) || value.kind !== "cell") throw new ExecutionFault("fault", "Se intentó usar una celda compartida inexistente.");
    return value;
  }

  private integer(operand: TacOperand): number {
    const value = this.word(operand);
    if (typeof value === "number") return value | 0;
    if (isRef(value)) return value.address | 0;
    throw new ExecutionFault("fault", "Se usó una cadena como entero.");
  }

  private float(operand: TacOperand): number {
    if (operand.kind === "constant" && typeof operand.value === "number") return Math.fround(operand.value);
    const value = this.word(operand);
    if (typeof value !== "number") throw new ExecutionFault("fault", "Se usó una referencia como número flotante.");
    const isFloatStorage = primitive(operand.type, "float") && (this.isCell(operand) || this.hasStorage(operand));
    return Math.fround(isFloatStorage ? value : value | 0);
  }

  private word(operand: TacOperand): Value {
    if (operand.kind === "constant") {
      if (operand.value === null) return 0;
      if (typeof operand.value === "boolean") return operand.value ? 1 : 0;
      if (typeof operand.value === "number") return Math.trunc(operand.value) | 0;
      return String(operand.value);
    }
    if (operand.kind === "label") throw new ExecutionFault("fault", `La dirección de la etiqueta ${String(operand.value)} no está modelada.`);
    if (this.isCell(operand)) return this.cell(this.cellOf(operand)).value;
    const location = this.location(operand, false);
    if (location) return location.map.get(location.key) ?? 0;
    if (operand.type?.kind === "function" && this.functions.has(String(operand.value))) return this.staticCallable(String(operand.value));
    throw new ExecutionFault("fault", `No se resolvió almacenamiento para ${String(operand.value)}.`);
  }

  private store(value: Value, operand: TacOperand): void {
    if (this.isCell(operand)) { this.cell(this.cellOf(operand)).value = value; return; }
    const location = this.location(operand, true);
    if (!location) throw new ExecutionFault("fault", `No se asignó almacenamiento para ${String(operand.value)}.`);
    location.map.set(location.key, value);
  }

  private staticCallable(label: string): Callable {
    let callable = this.staticCallables.get(label);
    if (!callable) { callable = { kind: "callable", address: 0, label, captures: [] }; this.staticCallables.set(label, callable); }
    return callable;
  }

  private cellOf(operand: TacOperand): Value {
    const activation = this.current();
    const captures = activation.frame.slots.filter((slot) => slot.kind === "captured");
    const index = captures.findIndex((slot) => slot.symbolId === operand.symbolId);
    if (index >= 0) return activation.closure?.captures[index] ?? 0;
    const location = this.location(operand, false);
    if (!location) throw new ExecutionFault("fault", `No se resolvió la celda de ${String(operand.value)}.`);
    return location.map.get(location.key) ?? 0;
  }

  private isCell(operand: TacOperand): boolean {
    return Boolean(this.findSlot(operand)?.slot.sharedCell || (operand.symbolId && this.current().frame.slots.some((slot) => slot.kind === "captured" && slot.symbolId === operand.symbolId)));
  }

  private hasStorage(operand: TacOperand): boolean {
    return this.location(operand, false) !== undefined;
  }

  private location(operand: TacOperand, create: boolean): { map: Map<string, Value>; key: string } | undefined {
    const found = this.findSlot(operand);
    const activation = this.current();
    if (found?.frame.kind === "global") return { map: this.globals, key: this.slotKey(found.frame, found.slot) };
    if (found && found.frame.id === activation.frame.id) return { map: activation.locals, key: this.slotKey(found.frame, found.slot) };
    const key = [operand.frameId ?? "", operand.symbolId ?? "", operand.kind, String(operand.value)].join("|");
    if (this.synthetic.has(key) || create) return { map: this.synthetic, key };
    return undefined;
  }

  private findSlot(operand: TacOperand): { frame: ActivationRecord; slot: FrameSlot } | undefined {
    const frame = operand.frameId ? this.frames.get(operand.frameId) : this.current().frame;
    if (!frame) return undefined;
    const slot = frame.slots.find((candidate) => operand.symbolId
      ? candidate.symbolId === operand.symbolId
      : operand.kind === "temporary"
        ? candidate.temporary === String(operand.value)
        : candidate.name === String(operand.value) && candidate.kind !== "temporary");
    return slot ? { frame, slot } : undefined;
  }

  private slotKey(frame: ActivationRecord, slot: FrameSlot): string {
    return `${frame.id}|${slot.symbolId ?? ""}|${slot.temporary ?? ""}|${slot.name}`;
  }

  private layout(type?: SemanticType): ClassLayout | undefined {
    if (type?.kind === "instance") return this.layoutsById.get(type.classId) ?? this.layoutsByName.get(type.className);
    if (type?.kind === "class") return this.layoutsById.get(type.classId) ?? this.layoutsByName.get(type.name);
    return undefined;
  }

  private allocate(bytes: number): number {
    const address = this.heap;
    this.heap += Math.ceil(Math.max(0, bytes) / 4) * 4;
    if (this.heap - HEAP_BASE > this.limits.maxHeapBytes) throw new ExecutionFault("resource-limit", `El heap superó el límite de ${this.limits.maxHeapBytes} bytes.`);
    return address;
  }

  private jumpTarget(label: string): number {
    const target = this.labels.get(label);
    if (target === undefined) throw new ExecutionFault("fault", `Etiqueta no definida: ${label}.`);
    return target;
  }

  private current(): Activation {
    return this.stack[this.stack.length - 1];
  }

  private need(operand: TacOperand | undefined, i: TacInstruction): TacOperand {
    if (!operand) throw new ExecutionFault("fault", `${i.op} incompleto en la instrucción ${i.index}.`);
    return operand;
  }

  private describe(value: Value, type?: SemanticType): string {
    if (typeof value === "string") return JSON.stringify(value);
    if (isRef(value)) {
      if (value.kind === "array") return `arreglo[${value.items.length}]`;
      if (value.kind === "object") return `${value.layout.name}@0x${value.address.toString(16)}`;
      if (value.kind === "callable") return `función ${value.label}`;
      return `celda@0x${value.address.toString(16)}`;
    }
    if (primitive(type, "float")) return formatMarsFloat(value);
    if (primitive(type, "boolean")) return value !== 0 ? "true" : "false";
    if (value === 0 && (type?.kind === "instance" || type?.kind === "array" || primitive(type, "string"))) return "null";
    return String(value | 0);
  }
}

export function executeTac(tac: TacGenerationResult, limits: Partial<TacExecutionLimits> = {}): TacExecutionResult {
  if (tac.status !== "completed" || tac.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return emptyExecutionResult(tac.skipReason);
  return new TacInterpreter(tac, { ...DEFAULT_EXECUTION_LIMITS, ...limits }).run();
}

export function formatActivationTree(execution: TacExecutionResult): string {
  const byId = new Map(execution.nodes.map((node) => [node.id, node]));
  const lines: string[] = [];
  const visit = (node: ActivationTreeNode, prefix: string, last: boolean, root: boolean) => {
    const returned = node.returnValue !== undefined ? ` → ${node.returnValue}` : "";
    const status = node.status === "returned" ? "" : ` [${node.status === "unwound" ? "desenrollada" : "activa"}]`;
    lines.push(`${root ? "" : `${prefix}${last ? "└─ " : "├─ "}`}${node.name}(${node.arguments.join(", ")})${returned}${status}`);
    node.children.forEach((childId, index) => {
      const child = byId.get(childId);
      if (child) visit(child, root ? "" : `${prefix}${last ? "   " : "│  "}`, index === node.children.length - 1, false);
    });
  };
  const root = execution.nodes.find((node) => node.parentId === null);
  if (root) visit(root, "", true, true);
  return lines.join("\n");
}
