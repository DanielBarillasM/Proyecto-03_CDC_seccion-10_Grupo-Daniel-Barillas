import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { tacReportToText, tacToCsv } from "../lib/downloads";
import { LabelFactory, TemporaryAllocator } from "../tac/allocators";

describe("TAC core", () => {
  it("generates deterministic TAC for valid input", () => {
    const source = "let a: integer = 2 + 3; print(a);";
    const first = analyzeInput(source, "tac");
    const second = analyzeInput(source, "tac");
    expect(first.mode).toBe("tac");
    expect(first.tac.status).toBe("completed");
    expect(first.tac.formattedCode).toBe(second.tac.formattedCode);
    expect(first.tac.instructions.length).toBeGreaterThanOrEqual(2);
  });

  it("skips TAC when semantic errors exist", () => {
    const result = analyzeInput("print(missing);", "tac");
    expect(result.tac.status).toBe("skipped");
    expect(result.tac.skipReason).toContain("errores semánticos");
    expect(result.semantic.errors.length).toBeGreaterThan(0);
  });

  it("exports TAC evidence with stable columns and frame metadata", () => {
    const result = analyzeInput("let a: integer = 2 + 3; print(a);", "tac");
    expect(tacToCsv(result.tac.instructions).split("\n")[0]).toBe("index,op,arg1,arg2,result,scopeId,frameId,line,column");
    expect(tacReportToText(result)).toContain("CÓDIGO DE TRES DIRECCIONES");
    expect(tacReportToText(result)).toContain("MARCOS");
  });

  it("represents switch and try-catch control flow", () => {
    const result = analyzeInput("let x: integer = 1; switch (x) { case 1: print(x); break; default: print(0); } try { print(x); } catch (error) { print(error); }", "tac");
    const opcodes = result.tac.instructions.map((instruction) => instruction.op);
    expect(opcodes).toContain("TRY_BEGIN");
    expect(opcodes).toContain("CATCH_BEGIN");
    expect(opcodes).toContain("IF_TRUE");
  });

  it("attaches resolved symbols and non-global scopes to TAC", () => {
    const result = analyzeInput("function f(value: integer): integer { let local: integer = value; return local; }", "tac");
    const symbols = result.tac.instructions.flatMap((instruction) => [instruction.arg1, instruction.arg2, instruction.result]).filter((operand) => operand?.symbolId);
    expect(symbols.length).toBeGreaterThan(0);
    expect(new Set(result.tac.instructions.map((instruction) => instruction.scopeId)).size).toBeGreaterThan(1);
  });

  it("keeps branch targets aligned with basic blocks", () => {
    const result = analyzeInput("if (true) { print(1); } else { print(2); }", "tac");
    const labels = new Set(result.tac.instructions.filter((instruction) => instruction.op === "LABEL").map((instruction) => String(instruction.result?.value)));
    result.tac.instructions.filter((instruction) => instruction.op === "IF_FALSE" || instruction.op === "GOTO").forEach((instruction) => expect(labels.has(String(instruction.result?.value ?? instruction.arg1?.value))).toBe(true));
    expect(result.tac.basicBlocks.length).toBeGreaterThan(1);
    const blockIds = new Set(result.tac.basicBlocks.map((block) => block.id));
    expect(result.tac.controlFlowEdges.every((edge) => blockIds.has(edge.from) && blockIds.has(edge.to))).toBe(true);
  });

  it("treats return as a terminal instruction in the control-flow graph", () => {
    const result = analyzeInput("function value(): integer { return 1; } print(value());", "tac");
    const returnInstruction = result.tac.instructions.find((instruction) => instruction.op === "RETURN");
    const returnBlock = result.tac.basicBlocks.find((block) =>
      returnInstruction ? block.instructionIndices.includes(returnInstruction.index) : false
    );
    expect(returnBlock).toBeDefined();
    expect(result.tac.controlFlowEdges.some((edge) => edge.from === returnBlock?.id)).toBe(false);
  });

  it("keeps TAC source locations and monotonic indices", () => {
    const result = analyzeInput("let value: integer = 7; print(value);", "tac");
    expect(result.tac.instructions.every((instruction, index) => instruction.index === index)).toBe(true);
    expect(result.tac.instructions.some((instruction) => instruction.source?.line === 1)).toBe(true);
  });

  it("resets labels and reuses released temporaries", () => {
    const labels = new LabelFactory();
    expect(labels.next("if")).toBe("L_if_0");
    labels.reset();
    expect(labels.next("if")).toBe("L_if_0");
    const allocator = new TemporaryAllocator();
    const first = allocator.acquire({ kind: "primitive", name: "integer" });
    allocator.release(first);
    expect(allocator.acquire({ kind: "primitive", name: "integer" }).name).toBe(first.name);
  });

  it("preserves precedence and emits real declaration and print operands", () => {
    const result = analyzeInput("let x: integer = 1 + 2 * 3; print(x);", "tac");
    expect(result.tac.formattedCode).toContain("t0 = 2 * 3");
    expect(result.tac.formattedCode).toContain("t1 = 1 + t0");
    expect(result.tac.formattedCode).toContain("x = t1");
    expect(result.tac.formattedCode).toContain("print x");
    expect(result.tac.formattedCode).not.toContain('print "("');
  });

  it("translates do-while and for with their real conditions and updates", () => {
    const doWhile = analyzeInput("let x: integer = 0; do { x = x + 1; } while (x < 2);", "tac");
    expect(doWhile.tac.formattedCode).toContain("t0 = x < 2");
    expect(doWhile.tac.formattedCode).not.toContain("ifTrue {");

    const forLoop = analyzeInput("for (let i: integer = 0; i < 3; i = i + 1) { print(i); }", "tac");
    expect(forLoop.tac.formattedCode).toContain("i = 0");
    expect(forLoop.tac.formattedCode).toContain("t0 = i < 3");
    expect(forLoop.tac.formattedCode).toContain("t0 = i + 1");
    expect(forLoop.tac.formattedCode).not.toContain('ifFalse ";"');
  });

  it("translates functions, parameters, calls and returns", () => {
    const result = analyzeInput(
      "function sum(a: integer, b: integer): integer { return a + b; } let x: integer = sum(2, 3);",
      "tac"
    );
    expect(result.tac.formattedCode).toContain("beginfunc");
    expect(result.tac.formattedCode).toContain("t0 = a + b");
    expect(result.tac.formattedCode).toContain("return t0");
    expect(result.tac.formattedCode).toContain("param 2");
    expect(result.tac.formattedCode).toContain("param 3");
    expect(result.tac.formattedCode).toContain("call");
    expect(result.tac.formattedCode).not.toContain('return ";"');
  });

  it("translates arrays, ternary expressions and foreach", () => {
    const array = analyzeInput("let a: integer[] = [1, 2]; a[0] = a[1] + 3;", "tac");
    expect(array.tac.instructions.map((item) => item.op)).toEqual(expect.arrayContaining(["NEW_ARRAY", "ARRAY_GET", "ARRAY_SET", "ADD"]));

    const ternary = analyzeInput("let x: integer = true ? 1 : 2;", "tac");
    expect(ternary.tac.formattedCode).toContain("L_ternary_false_0");
    expect(ternary.tac.formattedCode).toContain("x = t0");

    const foreach = analyzeInput("let a: integer[] = [1, 2]; foreach (item in a) { print(item); }", "tac");
    expect(foreach.tac.instructions.map((item) => item.op)).toEqual(expect.arrayContaining(["ARRAY_LENGTH", "ARRAY_GET", "LT"]));
    expect(foreach.tac.formattedCode).toContain("print item");
  });

  it("assigns storage before emission and leaves no live temporaries", () => {
    const result = analyzeInput(
      "function f(value: integer): integer { let local: integer = value + 1; return local; }",
      "tac"
    );
    const symbolOperands = result.tac.instructions
      .flatMap((instruction) => [instruction.arg1, instruction.arg2, instruction.result])
      .filter((operand) => operand?.kind === "symbol" && operand.symbolId);
    expect(symbolOperands.some((operand) => operand?.frameId && operand.offset !== undefined)).toBe(true);
    expect(result.tac.metrics.activeTemporaryCount).toBe(0);
    expect(result.tac.activationRecords.some((frame) => frame.slots.some((slot) => slot.kind === "temporary"))).toBe(true);
  });

  it("skips TAC after lexical or syntactic failures", () => {
    expect(analyzeInput("let x: integer = 1; @", "tac").tac.status).toBe("skipped");
    expect(analyzeInput("let x: integer = ;", "tac").tac.status).toBe("skipped");
  });

  it("emits an implicit constructor and initializes class fields", () => {
    const result = analyzeInput(
      "class A { let x: integer = 1; } let a: A = new A(); print(a.x);",
      "tac"
    );
    const constructorLabel = result.tac.classLayouts.find((layout) => layout.name === "A")!.methods!.find((method) => method.name === "constructor")!.label;
    const definedFunctions = new Set(
      result.tac.instructions
        .filter((instruction) => instruction.op === "FUNC_BEGIN")
        .map((instruction) => String(instruction.result?.value))
    );
    const constructorCall = result.tac.instructions.find(
      (instruction) => instruction.op === "CALL" && instruction.arg1?.value === constructorLabel
    );
    const fieldInitialization = result.tac.instructions.find(
      (instruction) => instruction.op === "SET_FIELD" && instruction.arg2?.value === "x"
    );

    expect(result.tac.status).toBe("completed");
    expect(definedFunctions).toContain(constructorLabel);
    expect(constructorCall).toBeDefined();
    expect(fieldInitialization?.arg1?.value).toBe("this");
    expect(result.tac.activationRecords.some((frame) => frame.name === "A.constructor")).toBe(true);
  });

  it("chains an inherited constructor and initializes subclass fields", () => {
    const result = analyzeInput(
      `
        class Base {
          let x: integer = 1;
          function constructor() {}
        }
        class Child: Base {
          let y: integer = 2;
        }
        let child: Child = new Child();
        print(child.y);
      `,
      "tac"
    );
    const definedFunctions = new Set(
      result.tac.instructions
        .filter((instruction) => instruction.op === "FUNC_BEGIN")
        .map((instruction) => String(instruction.result?.value))
    );
    const calls = result.tac.instructions
      .filter((instruction) => instruction.op === "CALL")
      .map((instruction) => String(instruction.arg1?.value));
    const childFieldInitialization = result.tac.instructions.find(
      (instruction) => instruction.op === "SET_FIELD" && instruction.arg2?.value === "y"
    );

    expect(result.tac.status).toBe("completed");
    const constructorLabels = result.tac.classLayouts.map((layout) => layout.methods!.find((method) => method.name === "constructor")!.label);
    constructorLabels.forEach((label) => expect(definedFunctions).toContain(label));
    expect(calls).toEqual(expect.arrayContaining(constructorLabels));
    expect(childFieldInitialization?.arg1?.value).toBe("this");
  });
});
