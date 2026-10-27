import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { runTestCase, type TestPhase } from "../lib/testCases";
import { mipsReport } from "../mips/generator";
import { buildTacControlFlow } from "../tac/controlFlow";
import type { TacInstruction } from "../tac/types";

describe("audit regressions", () => {
  it.each(["lexer", "parser", "semantic"] as TestPhase[])("runs only the selected %s phase", (phase) => {
    const outcome = runTestCase({ id: "phase", name: "phase", phase, description: "", source: "print(missing);", expectation: { accepted: phase !== "semantic" }, isDefault: false });
    expect(outcome.result.mode).toBe(phase);
    expect(outcome.passed).toBe(true);
  });

  it.each(["5.5 % 2", "5 % 2.5"])("rejects unsupported float remainder %s", (expression) => {
    const result = analyzeInput(`print(${expression});`, "mips");
    expect(result.semantic.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SEM004" })]));
    expect(result.tac.status).toBe("skipped");
    expect(result.mips.status).toBe("skipped");
    expect(analyzeInput("print(5 % 2);", "mips").accepted).toBe(true);
  });

  it("formats the existing MIPS result without regenerating it", () => {
    const result = analyzeInput("print(1);", "mips").mips;
    result.assembly = "existing assembly";
    result.instructionCount = 12345;
    expect(mipsReport(result)).toContain("existing assembly");
    expect(mipsReport(result)).toContain("12345");
  });

  it("builds many blocks with a linear number of instruction accesses", () => {
    let accesses = 0;
    const instructions: TacInstruction[] = Array.from({ length: 2000 }, (_, index) => ({
      get index() { accesses += 1; return index * 2 + 10; },
      op: "LABEL",
      result: { kind: "label", value: `L${index}` },
      scopeId: "global"
    }));
    const graph = buildTacControlFlow(instructions);
    expect(graph.blocks).toHaveLength(2000);
    expect(graph.edges).toHaveLength(1999);
    expect(graph.blocks[graph.blocks.length - 1]?.instructionIndices).toEqual([4008]);
    expect(accesses).toBeLessThan(40000);
  });
});
