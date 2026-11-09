import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { executeTac, formatActivationTree, formatMarsFloat, type ActivationTreeNode, type TacExecutionResult } from "../tac/interpreter";

function run(source: string): TacExecutionResult {
  const result = analyzeInput(source, "mips");
  expect(result.semantic.errors).toEqual([]);
  expect(result.tac.status).toBe("completed");
  return result.execution;
}

function byName(execution: TacExecutionResult, name: string): ActivationTreeNode[] {
  return execution.nodes.filter((node) => node.name === name);
}

describe("intérprete TAC y árbol de activación", () => {
  it("registra cada llamada recursiva con su llamador real", () => {
    const execution = run("function fib(n: integer): integer { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }\nprint(fib(3));");

    expect(execution.status).toBe("completed");
    expect(execution.output).toBe("2\n");
    expect(formatActivationTree(execution)).toBe([
      "global()",
      "└─ fib(3) → 2",
      "   ├─ fib(2) → 1",
      "   │  ├─ fib(1) → 1",
      "   │  └─ fib(0) → 0",
      "   └─ fib(1) → 1",
    ].join("\n"));
    expect(execution.nodeCount).toBe(6);
    expect(execution.maxDepth).toBe(3);
  });

  it("cuenta las 177 activaciones de fib(10)", () => {
    const execution = run("function fib(n: integer): integer { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }\nprint(fib(10));");

    expect(execution.output).toBe("55\n");
    expect(byName(execution, "fib")).toHaveLength(177);
    expect(execution.nodes.every((node) => node.status === "returned")).toBe(true);
  });

  it("usa el llamador dinámico como padre y no el ámbito léxico", () => {
    const execution = run([
      "function crear(base: integer) { let total: integer = base; function sumar(n: integer): integer { total = total + n; return total; } return sumar; }",
      "let a = crear(10);",
      "print(a(1));",
      "print(a(2));",
    ].join("\n"));
    const root = execution.nodes.find((node) => node.parentId === null)!;
    const sumar = byName(execution, "sumar");

    expect(execution.output).toBe("11\n13\n");
    expect(sumar).toHaveLength(2);
    expect(sumar.every((node) => node.parentId === root.id)).toBe(true);
    expect(sumar.map((node) => node.returnValue)).toEqual(["11", "13"]);
  });

  it("anida llamadas internas bajo la activación que las invoca", () => {
    const execution = run([
      "function externo(): integer {",
      "  let x: integer = 1;",
      "  function medio(): integer { function interno(): integer { x = x * 3; return x; } let r: integer = interno(); return r + interno(); }",
      "  let y: integer = medio();",
      "  return y + x;",
      "}",
      "print(externo());",
    ].join("\n"));
    const medio = byName(execution, "medio")[0];

    expect(execution.output).toBe("21\n");
    expect(byName(execution, "interno").map((node) => node.parentId)).toEqual([medio.id, medio.id]);
    expect(byName(execution, "interno").map((node) => node.returnValue)).toEqual(["3", "9"]);
  });

  it("muestra el receptor de los métodos y respeta el despacho dinámico", () => {
    const execution = run([
      "class Animal { function sonido(): string { return \"...\"; } function hablar(): string { return this.sonido(); } }",
      "class Perro : Animal { function sonido(): string { return \"guau\"; } }",
      "let p: Animal = new Perro();",
      "print(p.hablar());",
    ].join("\n"));
    const hablar = byName(execution, "hablar")[0];
    const sonido = byName(execution, "sonido")[0];

    expect(execution.output).toBe("guau\n");
    expect(hablar.arguments[0]).toMatch(/^Perro@0x/);
    expect(sonido.parentId).toBe(hablar.id);
    expect(sonido.returnValue).toBe("\"guau\"");
  });

  it("marca como desenrolladas las activaciones abandonadas por una excepción capturada", () => {
    const execution = run([
      "function g(xs: integer[], i: integer): integer { return xs[i]; }",
      "function h(xs: integer[]): integer { return g(xs, 3) + 1; }",
      "let uno: integer[] = [1];",
      "let cuatro: integer[] = [1, 2, 3, 4];",
      "try { print(h(uno)); } catch (e) { print(e); }",
      "print(h(cuatro));",
    ].join("\n"));
    const [failed, completed] = byName(execution, "h");

    expect(execution.status).toBe("completed");
    expect(execution.output).toBe("Runtime error: array index out of bounds\n5\n");
    expect(failed.status).toBe("unwound");
    expect(execution.nodes[failed.children[0]].status).toBe("unwound");
    expect(completed.status).toBe("returned");
    expect(completed.returnValue).toBe("5");
  });

  it("detiene el programa ante un error no capturado igual que MARS", () => {
    const execution = run("function d(x: integer): integer { return 10 / x; }\nprint(1);\nprint(d(0));\nprint(2);");

    expect(execution.status).toBe("uncaught-error");
    expect(execution.output).toBe("1\nRuntime error: division by zero\n");
    expect(byName(execution, "d")[0].status).toBe("unwound");
  });

  it("corta ciclos infinitos y recursión sin fin con límites explícitos", () => {
    const loop = run("let i: integer = 0;\nwhile (true) { i = i + 1; }");
    const endless = analyzeInput("function f(n: integer): integer { return f(n + 1); }\nprint(f(0));", "mips");
    const recursion = executeTac(endless.tac, { maxDepth: 1_000 });

    expect(loop.status).toBe("step-limit");
    expect(loop.message).toContain("límite");
    expect(["step-limit", "depth-limit"]).toContain(endless.execution.status);
    expect(recursion.status).toBe("depth-limit");
    expect(recursion.maxDepth).toBe(recursion.limits.maxDepth - 1);
  });

  it("completa recursiones profundas que MARS sí ejecuta", () => {
    const execution = run("function suma(n: integer): integer { if (n == 0) { return 0; } return n + suma(n - 1); }\nprint(suma(3000));");

    expect(execution.status).toBe("completed");
    expect(execution.output).toBe("4501500\n");
    expect(execution.maxDepth).toBe(3001);
    expect(execution.nodeCount).toBe(3002);
    expect(execution.truncated).toBe(true);
    expect(formatActivationTree(execution).split("\n").length).toBe(execution.limits.maxNodes);
  });

  it("corta reservas de heap y salidas sin límite", () => {
    const allocation = analyzeInput("let a: integer[] = [0];\nwhile (true) { a = [1, 2, 3, 4, 5, 6, 7, 8]; }", "mips");
    const heap = executeTac(allocation.tac, { maxHeapBytes: 4096 });
    const output = executeTac(analyzeInput("while (true) { print(1); }", "mips").tac, { maxOutputChars: 100 });

    expect(heap.status).toBe("resource-limit");
    expect(output.status).toBe("resource-limit");
    expect(output.output.length).toBeLessThanOrEqual(output.limits.maxOutputChars + 2);
  });

  it("indica cuando el árbol se recorta por cantidad de nodos", () => {
    const result = analyzeInput("function fib(n: integer): integer { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }\nprint(fib(10));", "mips");
    const execution = executeTac(result.tac, { maxNodes: 10 });

    expect(execution.output).toBe("55\n");
    expect(execution.truncated).toBe(true);
    expect(execution.nodes).toHaveLength(10);
    expect(execution.nodeCount).toBe(178);
  });

  it("no ejecuta programas con errores del frontend", () => {
    const result = analyzeInput("let x: integer = \"texto\";\nprint(x);", "mips");

    expect(result.tac.status).toBe("skipped");
    expect(result.execution.status).toBe("not-run");
    expect(result.execution.nodes).toEqual([]);
  });

  it("formatea flotantes como el syscall 2 de MARS", () => {
    expect([4, 91, 1 / 3, 1e8, 0.0001, -10, 3.75, 0.001, 1234567].map(formatMarsFloat))
      .toEqual(["4.0", "91.0", "0.33333334", "1.0E8", "1.0E-4", "-10.0", "3.75", "0.001", "1234567.0"]);
  });
});
