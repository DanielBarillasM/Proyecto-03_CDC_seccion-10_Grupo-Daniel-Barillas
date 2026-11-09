import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { PEEPHOLE_RULE_IDS, peepholeOptimize, type PeepholeRuleId } from "../mips/generator";

describe("optimización de mirilla MIPS", () => {
  const cases: Array<{ rule: PeepholeRuleId; input: string[]; expected: string[] }> = [
    { rule: "delay-slot-nop", input: ["  jal fn_f", "  nop", "  li $v0, 10"], expected: ["  jal fn_f", "  li $v0, 10"] },
    { rule: "jump-to-next-label", input: ["  li $t0, 1", "  j done", "done:"], expected: ["  li $t0, 1", "done:"] },
    { rule: "unreachable-code", input: ["  jr $ra", "  li $t0, 1", "next:"], expected: ["  jr $ra", "next:"] },
    { rule: "jump-threading", input: ["  beq $t0, $zero, first", "  li $t1, 1", "first:", "  j second", "other:", "  li $t2, 2", "second:", "  li $v0, 10"], expected: ["  beq $t0, $zero, second", "  li $t1, 1", "first:", "  j second", "other:", "  li $t2, 2", "second:", "  li $v0, 10"] },
    { rule: "store-load-forwarding", input: ["  sw $t8, 0($fp)", "  lw $t0, 0($fp)"], expected: ["  sw $t8, 0($fp)", "  move $t0, $t8"] },
    { rule: "redundant-store", input: ["  lw $t0, 4($fp)", "  sw $t0, 4($fp)"], expected: ["  lw $t0, 4($fp)"] },
    { rule: "stack-adjust-merge", input: ["  addiu $sp, $sp, 4", "  addiu $sp, $sp, 8"], expected: ["  addiu $sp, $sp, 12"] },
    { rule: "algebraic-identity", input: ["  move $t0, $t0", "  addu $s0, $s0, $zero", "  sll $t1, $t1, 0"], expected: [] },
  ];

  it.each(cases)("aplica la regla $rule", ({ rule, input, expected }) => {
    const result = peepholeOptimize(input);

    expect(result.lines).toEqual(expected);
    expect(result.applied[rule]).toBeGreaterThan(0);
  });

  it("publica ocho transformaciones distintas", () => {
    expect(PEEPHOLE_RULE_IDS).toHaveLength(8);
  });

  it("elimina un ajuste de pila que se anula y un almacenamiento sobrescrito", () => {
    const result = peepholeOptimize(["  addiu $sp, $sp, -4", "  addiu $sp, $sp, 4", "  sw $t0, 0($fp)", "  sw $t1, 0($fp)"]);

    expect(result.lines).toEqual(["  sw $t1, 0($fp)"]);
    expect(result.applied["stack-adjust-merge"]).toBe(1);
    expect(result.applied["redundant-store"]).toBe(1);
  });

  it("no elimina instrucciones parecidas cuyo efecto sí es necesario", () => {
    const source = [
      "  move $t0, $t1",
      "  addiu $sp, $sp, 4",
      "  addu $s0, $s1, $s2",
      "  sll $t1, $t1, 1",
      "  sw $t0, 0($fp)",
      "  lw $t0, 4($fp)",
      "  j elsewhere",
      "next:",
      "  nop",
      "elsewhere:",
      "  li $v0, 10",
    ];

    expect(peepholeOptimize(source).lines).toEqual(source);
  });

  it("es idempotente y no vuelve a modificar una salida optimizada", () => {
    const source = cases.flatMap(({ input }, index) => [...input, `boundary_${index}:`]);
    const once = peepholeOptimize(source);
    const twice = peepholeOptimize(once.lines);

    expect(twice.lines).toEqual(once.lines);
    expect(twice.removed).toBe(0);
    expect(twice.transformations).toBe(0);
  });

  it("cuenta como eliminadas solo las instrucciones que desaparecen", () => {
    const result = peepholeOptimize(["  sw $t8, 0($fp)", "  lw $t0, 0($fp)", "  move $t1, $t1"]);

    expect(result.transformations).toBe(2);
    expect(result.removed).toBe(1);
  });

  it("no altera ciclos de saltos, cargas que cambian su base ni ajustes fuera de rango", () => {
    const cycle = ["  beq $t0, $zero, a", "  li $t1, 1", "a:", "  j b", "  li $t2, 2", "b:", "  j a"];
    const baseChange = ["  lw $t0, 0($t0)", "  sw $t0, 0($t0)"];
    const overflow = ["  addiu $sp, $sp, -32768", "  addiu $sp, $sp, -4"];

    expect(peepholeOptimize(cycle).applied["jump-threading"]).toBe(0);
    expect(peepholeOptimize(baseChange).lines).toEqual(baseChange);
    expect(peepholeOptimize(overflow).lines).toEqual(overflow);
  });

  it("convierte identidades con destino distinto en move", () => {
    const result = peepholeOptimize(["  addiu $t0, $t1, 0", "  sll $t2, $t3, 0", "  addu $t4, $zero, $t5", "  or $zero, $t6, $zero"]);

    expect(result.lines).toEqual(["  move $t0, $t1", "  move $t2, $t3", "  move $t4, $t5", "  or $zero, $t6, $zero"]);
    expect(result.applied["algebraic-identity"]).toBe(3);
    expect(result.removed).toBe(0);
  });

  it("elimina un store sobrescrito más adelante sin lecturas intermedias", () => {
    const result = peepholeOptimize(["  sw $t0, -8($fp)", "  addiu $t1, $t2, 3", "  sw $t3, -12($fp)", "  sw $t1, -8($fp)"]);

    expect(result.lines).toEqual(["  addiu $t1, $t2, 3", "  sw $t3, -12($fp)", "  sw $t1, -8($fp)"]);
    expect(result.applied["redundant-store"]).toBe(1);
  });

  it.each([
    ["una carga intermedia", "  lw $t2, 0($t4)"],
    ["una etiqueta", "after:"],
    ["una llamada", "  jal fn_f"],
    ["una syscall", "  syscall"],
    ["un cambio de base", "  addiu $fp, $sp, 8"],
  ])("conserva el store sobrescrito si hay %s", (_label, barrier) => {
    const source = ["  sw $t0, -8($fp)", barrier, "  sw $t1, -8($fp)"];

    expect(peepholeOptimize(source).applied["redundant-store"]).toBe(0);
  });

  it("no muta el arreglo de ensamblador recibido", () => {
    const source = ["  move $t0, $t0", "  li $v0, 10"];
    const snapshot = [...source];

    peepholeOptimize(source);

    expect(source).toEqual(snapshot);
  });

  it("aplica al menos seis transformaciones distintas sobre el ensamblador generado", () => {
    const programs = [
      "examples/tac/13_programa_integral.cps",
      "examples/semantic/valid_complete.cps",
      "examples/rubric/medium/valid.cps",
    ];
    const totals = Object.fromEntries(PEEPHOLE_RULE_IDS.map((rule) => [rule, 0])) as Record<PeepholeRuleId, number>;
    for (const program of programs) {
      const result = analyzeInput(readFileSync(resolve(program), "utf8"), "mips");
      expect(result.mips.status).toBe("completed");
      expect(result.mips.optimizedInstructionCount).toBeLessThan(result.mips.instructionCount);
      for (const rule of PEEPHOLE_RULE_IDS) totals[rule] += result.mips.peephole[rule];
    }

    expect(Object.values(totals).filter((count) => count > 0).length).toBeGreaterThanOrEqual(6);
  });
});
