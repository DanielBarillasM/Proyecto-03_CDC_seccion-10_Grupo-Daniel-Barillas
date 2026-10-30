import { describe, expect, it } from "vitest";
import { PEEPHOLE_RULE_IDS, peepholeOptimize, type PeepholeRuleId } from "../mips/generator";

describe("optimización de mirilla MIPS", () => {
  const cases: Array<{ rule: PeepholeRuleId; input: string[]; expected: string[] }> = [
    { rule: "self-move", input: ["  move $t0, $t0"], expected: [] },
    { rule: "zero-addiu", input: ["  addiu $sp, $sp, 0"], expected: [] },
    { rule: "zero-addu", input: ["  addu $s0, $s0, $zero"], expected: [] },
    { rule: "zero-subu", input: ["  subu $a0, $a0, $zero"], expected: [] },
    { rule: "zero-or", input: ["  or $v0, $v0, $zero"], expected: [] },
    { rule: "zero-shift", input: ["  sll $t1, $t1, 0"], expected: [] },
    { rule: "jump-next-label", input: ["  j done", "done:"], expected: ["done:"] },
    { rule: "duplicate-nop", input: ["  nop", "  nop"], expected: ["  nop"] },
  ];

  it.each(cases)("aplica la regla $rule", ({ rule, input, expected }) => {
    const result = peepholeOptimize(input);

    expect(result.lines).toEqual(expected);
    expect(result.removed).toBe(1);
    expect(result.applied[rule]).toBe(1);
  });

  it("publica y ejercita al menos seis transformaciones distintas", () => {
    const source = cases.flatMap(({ input }, index) => [...input, `separator_${index}:`]);
    const result = peepholeOptimize(source);

    expect(PEEPHOLE_RULE_IDS).toHaveLength(8);
    expect(Object.values(result.applied).filter((count) => count > 0)).toHaveLength(8);
  });

  it("no elimina instrucciones parecidas cuyo efecto sí es necesario", () => {
    const source = [
      "  move $t0, $t1",
      "  addiu $sp, $sp, 4",
      "  addu $s0, $s1, $zero",
      "  subu $a0, $a1, $zero",
      "  or $v0, $v1, $zero",
      "  sll $t1, $t1, 1",
      "  j elsewhere",
      "next:",
      "  nop",
      "between:",
      "  nop",
    ];

    expect(peepholeOptimize(source)).toEqual({
      lines: source,
      removed: 0,
      applied: Object.fromEntries(PEEPHOLE_RULE_IDS.map((rule) => [rule, 0])),
    });
  });

  it("es idempotente y no vuelve a modificar una salida optimizada", () => {
    const source = cases.flatMap(({ input }, index) => [...input, `boundary_${index}:`]);
    const once = peepholeOptimize(source);
    const twice = peepholeOptimize(once.lines);

    expect(twice.lines).toEqual(once.lines);
    expect(twice.removed).toBe(0);
  });

  it("no muta el arreglo de ensamblador recibido", () => {
    const source = ["  move $t0, $t0", "  li $v0, 10"];
    const snapshot = [...source];

    peepholeOptimize(source);

    expect(source).toEqual(snapshot);
  });

  it("acumula las métricas por regla sin perder el orden del código restante", () => {
    const source = ["start:", "  move $t0, $t0", "  li $a0, 7", "  nop", "  nop", "  syscall"];
    const result = peepholeOptimize(source);

    expect(result.lines).toEqual(["start:", "  li $a0, 7", "  nop", "  syscall"]);
    expect(result.removed).toBe(2);
    expect(result.applied["self-move"]).toBe(1);
    expect(result.applied["duplicate-nop"]).toBe(1);
  });
});
