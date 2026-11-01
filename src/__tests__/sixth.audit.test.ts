import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { exampleCase } from "../lib/examples";
import { resolveIdeAnalyzerMode, resolveIdeResultTab } from "../lib/idePipeline";
import type { AnalysisMode } from "../lib/types";
import { PEEPHOLE_RULE_IDS } from "../mips/generator";

const jar = resolve(process.env.MARS_JAR ?? "tools/Mars4_5.jar");
const javaProbe = spawnSync("java", ["-version"], { encoding: "utf8", timeout: 5000 });
const javaAvailable = !javaProbe.error && javaProbe.status === 0;

if (process.env.REQUIRE_MARS === "1" && (!existsSync(jar) || !javaAvailable)) {
  throw new Error(`MARS obligatorio no disponible: jar=${jar}, java=${javaAvailable}`);
}

function executeInMars(source: string): { output: string; maxConcurrent: number; spills: number } {
  const result = analyzeInput(source, "mips");
  const diagnostics = [
    ...result.lexicalErrors.map((error) => `LEX: ${error.message}`),
    ...result.syntaxErrors.map((error) => `SYN: ${error.message}`),
    ...result.semantic.errors.map((error) => `${error.code}: ${error.message}`),
    ...result.tac.diagnostics.map((error) => `${error.code}: ${error.message}`),
    ...result.mips.diagnostics.map((error) => `${error.code}: ${error.message}`)
  ].join("\n");

  expect(result.accepted, diagnostics).toBe(true);
  expect(result.tac.status).toBe("completed");
  expect(result.mips.status).toBe("completed");
  expect(result.mips.diagnostics).toEqual([]);

  const directory = mkdtempSync(resolve(".mars-sixth-audit-"));
  try {
    const assembly = resolve(directory, "program.asm");
    writeFileSync(assembly, result.mips.assembly);
    const execution = spawnSync(
      "java",
      ["-jar", jar, "nc", "ae1", "se1", "2500000", assembly],
      { encoding: "utf8", timeout: 25000 }
    );
    expect(execution.error).toBeUndefined();
    expect(execution.status, execution.stdout + execution.stderr).toBe(0);
    return {
      output: execution.stdout.replace(/\r/g, "").trim(),
      maxConcurrent: result.mips.registerStats.maxConcurrent,
      spills: result.mips.registerStats.spills
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("sexta auditoría: flujo completo del IDE y contratos de rúbrica", () => {
  it("todas las selecciones de la GUI solicitan el pipeline MIPS y TAC conserva su panel", () => {
    const selections: AnalysisMode[] = ["valid", "lexical", "syntax", "semantic-error", "tac", "mips", "custom"];
    for (const selection of selections) expect(resolveIdeAnalyzerMode(selection)).toBe("mips");

    const result = analyzeInput(exampleCase.validInput, resolveIdeAnalyzerMode("tac"));
    expect(result.mode).toBe("mips");
    expect(result.tac.status).toBe("completed");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toContain(".globl main");
    expect(resolveIdeResultTab("tac", result)).toBe("tac");
    expect(resolveIdeResultTab("mips", result)).toBe("mips");
  });

  it("los ejemplos inválidos bloquean TAC y MIPS en vez de dejarlos no solicitados", () => {
    const sources = [
      exampleCase.lexicalErrorInput,
      exampleCase.syntaxErrorInput,
      exampleCase.semanticErrorInput
    ];

    for (const source of sources) {
      const result = analyzeInput(source, resolveIdeAnalyzerMode("tac"));
      expect(result.accepted).toBe(false);
      expect(result.summary.totalErrorCount).toBeGreaterThan(0);
      expect(result.tac.status).toBe("skipped");
      expect(result.tac.instructions).toEqual([]);
      expect(result.mips.status).toBe("skipped");
      expect(result.mips.assembly).toBe("");
      expect(resolveIdeResultTab("tac", result)).toBe("resultado");
    }
  });

  it("mantiene un frame alineado y registros acotados con dieciséis parámetros", () => {
    const parameters = Array.from({ length: 16 }, (_, index) => `p${index + 1}: integer`).join(", ");
    const argumentsList = Array.from({ length: 16 }, (_, index) => String(index + 1)).join(", ");
    const result = analyzeInput(`
      function wide(${parameters}): integer {
        return p1 + p4 + p8 + p12 + p16;
      }
      print(wide(${argumentsList}));
    `, "mips");
    const frame = result.tac.activationRecords.find((candidate) => candidate.name === "wide");
    const slots = frame?.slots.filter((slot) => slot.kind === "parameter") ?? [];

    expect(result.mips.status).toBe("completed");
    expect(frame?.parameterCount).toBe(16);
    expect(slots).toHaveLength(16);
    expect(new Set(slots.map((slot) => slot.offset)).size).toBe(16);
    expect(frame!.totalBytes % 8).toBe(0);
    expect(result.mips.registerStats.maxConcurrent).toBeLessThanOrEqual(8);
    expect(result.mips.registerStats.spills).toBe(0);
  });

  it("conserva un árbol de activación válido para método, función anidada y closure", () => {
    const result = analyzeInput(`
      class Factory {
        let base: integer = 4;
        function build(step: integer) {
          let current: integer = this.base;
          function next(): integer { current = current + step; return current; }
          return next;
        }
      }
      let next = new Factory().build(3);
      print(next());
    `, "mips");
    const frames = result.tac.activationRecords;
    const ids = new Set(frames.map((frame) => frame.id));

    expect(result.mips.status).toBe("completed");
    expect(frames.length).toBeGreaterThanOrEqual(4);
    for (const frame of frames) {
      expect(frame.totalBytes % 8).toBe(0);
      if (frame.parentFrameId !== null) expect(ids.has(frame.parentFrameId)).toBe(true);
      if (frame.lexicalParentFrameId !== null) expect(ids.has(frame.lexicalParentFrameId)).toBe(true);
      expect(new Set(frame.slots.map((slot) => slot.offset)).size).toBe(frame.slots.length);
    }
  });

  it("atraviesa en una sola compilación las familias principales exigidas por la rúbrica", () => {
    const result = analyzeInput(`
      class Box {
        let value: integer;
        function constructor(seed: integer) { this.value = seed; }
        function add(step: integer): integer { this.value = this.value + step; return this.value; }
      }
      function sum(values: integer[]): integer {
        let total: integer = 0;
        foreach (value in values) { total = total + value; }
        return total;
      }
      const base: integer = 2;
      let values: integer[] = [base, 3, 4];
      let box = new Box(sum(values));
      if (box.add(1) > 0 && sum(values) == 9) { print(box.value); }
      try { print(values[10]); } catch (err) { print("caught"); }
    `, "mips");
    const operations = new Set(result.tac.instructions.map((instruction) => instruction.op));

    expect(result.mips.status).toBe("completed");
    for (const operation of ["MOV", "ADD", "GT", "NEW_ARRAY", "ARRAY_GET", "NEW_OBJECT", "GET_FIELD", "CALL", "TRY_BEGIN"]) {
      expect(operations.has(operation as never), `Falta ${operation}`).toBe(true);
    }
    expect(result.mips.assembly).toContain("syscall");
    expect(result.mips.assembly).toContain("__rt_throw:");
  });

  it("mantiene resueltas las etiquetas, ocho reglas de mirilla y métricas coherentes", () => {
    const result = analyzeInput(`
      function factorial(n: integer): integer {
        if (n <= 1) { return 1; }
        return n * factorial(n - 1);
      }
      print(factorial(6));
    `, "mips");
    const lines = result.mips.assembly.split(/\r?\n/).map((line) => line.trim());
    const labels = new Set(lines.filter((line) => /^[A-Za-z_.$][\w.$]*:$/.test(line)).map((line) => line.slice(0, -1)));
    const targets = lines.flatMap((line) => {
      const match = line.match(/^(?:j|jal|beq|bne|bltz|bgez|blez|bgtz)\s+(?:\$[\w]+\s*,\s*)?(?:\$[\w]+\s*,\s*)?([A-Za-z_.$][\w.$]*)$/);
      return match ? [match[1]] : [];
    });

    expect(result.mips.status).toBe("completed");
    expect(PEEPHOLE_RULE_IDS).toHaveLength(8);
    expect(result.mips.instructionCount - result.mips.optimizedInstructionCount).toBe(result.mips.optimizationCount);
    expect(targets.filter((target) => !labels.has(target))).toEqual([]);
  });
});

const runtimeCases: Array<[string, string, string]> = [
  [
    "variables, constantes y asignación encadenada conservan valores",
    `
      const base: integer = 5;
      let first: integer = 0;
      let second: integer = 0;
      first = second = base + 2;
      print(first); print(second); print(base);
    `,
    "7\n7\n5"
  ],
  [
    "aritmética entera con signo y promoción float produce resultados exactos",
    `
      print(7 + 3 * 2);
      print(-7 / 2);
      print(7 % 3);
      print(5 / 2.0);
    `,
    "13\n-3\n1\n2.5"
  ],
  [
    "cortocircuito lógico evita ambos efectos laterales",
    `
      let calls: integer = 0;
      function touch(): boolean { calls = calls + 1; return true; }
      print(false && touch());
      print(true || touch());
      print(calls);
    `,
    "false\ntrue\n0"
  ],
  [
    "matrices, alias, foreach y límites capturables cooperan",
    `
      let matrix: integer[][] = [[1, 2], [3, 4]];
      let row: integer[] = matrix[0];
      row[1] = 9;
      let total: integer = 0;
      foreach (value in matrix[0]) { total = total + value; }
      print(total);
      try { print(matrix[3][0]); } catch (err) { print("bounds"); }
      print(matrix[0][1]);
    `,
    "10\nbounds\n9"
  ],
  [
    "if, while, do, for, foreach y switch conservan break y continue",
    `
      let total: integer = 0;
      for (let i: integer = 0; i < 5; i = i + 1) {
        if (i == 1) { continue; }
        if (i == 4) { break; }
        total = total + i;
      }
      let count: integer = 0;
      while (count < 2) { count = count + 1; }
      do { total = total + 1; } while (false);
      foreach (value in [2, 3]) { total = total + value; }
      switch (total) { case 11: print("control"); break; default: print("bad"); }
      print(count);
    `,
    "control\n2"
  ],
  [
    "dieciséis parámetros mantienen orden y frame independiente",
    `
      function pick(a: integer, b: integer, c: integer, d: integer,
                    e: integer, f: integer, g: integer, h: integer,
                    i: integer, j: integer, k: integer, l: integer,
                    m: integer, n: integer, o: integer, p: integer): integer {
        return a + d + h + l + p;
      }
      print(pick(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16));
    `,
    "41"
  ],
  [
    "recursión mutua preserva registros de activación",
    `
      function even(n: integer): boolean { if (n == 0) { return true; } return odd(n - 1); }
      function odd(n: integer): boolean { if (n == 0) { return false; } return even(n - 1); }
      print(even(12));
      print(odd(9));
    `,
    "true\ntrue"
  ],
  [
    "referencias de método de dos objetos retienen receptores independientes",
    `
      class Counter {
        let value: integer;
        function constructor(seed: integer) { this.value = seed; }
        function next(): integer { this.value = this.value + 1; return this.value; }
      }
      let first = new Counter(0);
      let second = new Counter(10);
      let a = first.next;
      let b = second.next;
      first = null; second = null;
      print(a()); print(b()); print(a());
    `,
    "1\n11\n2"
  ],
  [
    "herencia y despacho dinámico funcionan desde un arreglo base",
    `
      class Animal { function speak(): string { return "animal"; } }
      class Dog: Animal { function speak(): string { return "dog"; } }
      class Cat: Animal { function speak(): string { return "cat"; } }
      let animals: Animal[] = [new Animal(), new Animal()];
      animals[0] = new Dog();
      animals[1] = new Cat();
      foreach (animal in animals) { print(animal.speak()); }
    `,
    "dog\ncat"
  ],
  [
    "try/catch anidado restaura handlers y continúa",
    `
      try {
        try { print(10 / 0); } catch (inner) { print("inner"); }
        let values: integer[] = [1];
        print(values[5]);
      } catch (outer) { print("outer"); }
      print("done");
    `,
    "inner\nouter\ndone"
  ],
  [
    "closures independientes conservan capturas string y contador",
    `
      function make(prefix: string) {
        let count: integer = 0;
        function next(): integer { count = count + 1; print(prefix); return count; }
        return next;
      }
      let a = make("A"); let b = make("B");
      print(a()); print(b()); print(a());
    `,
    "A\n1\nB\n1\nA\n2"
  ],
  [
    "programa integral de rúbrica conserva su salida observable",
    `
      class Accumulator {
        let total: integer;
        function constructor(seed: integer) { this.total = seed; }
        function add(value: integer): integer { this.total = this.total + value; return this.total; }
      }
      function factorial(n: integer): integer {
        if (n <= 1) { return 1; }
        return n * factorial(n - 1);
      }
      let accumulator = new Accumulator(0);
      foreach (value in [1, 2, 3]) { accumulator.add(value); }
      print(accumulator.total);
      print(factorial(5));
      let one: integer[] = [1];
      try { print(one[4]); } catch (err) { print("safe"); }
    `,
    "6\n120\nsafe"
  ]
];

describe("sexta auditoría: salidas reales en MARS", () => {
  it.skipIf(!existsSync(jar) || !javaAvailable).each(runtimeCases)("%s", (_name, source, expected) => {
    const execution = executeInMars(source);
    expect(execution.output).toBe(expected);
    expect(execution.maxConcurrent).toBeLessThanOrEqual(8);
    expect(execution.spills).toBe(0);
  });
});
