import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";

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

  const directory = mkdtempSync(resolve(".mars-fifth-audit-"));
  try {
    const assembly = resolve(directory, "program.asm");
    writeFileSync(assembly, result.mips.assembly);
    const execution = spawnSync(
      "java",
      ["-jar", jar, "nc", "ae1", "se1", "2000000", assembly],
      { encoding: "utf8", timeout: 20000 }
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

describe("quinta auditoría: invariantes entre semántica, TAC y backend", () => {
  it("resuelve todos los destinos TAC y mantiene un CFG cerrado", () => {
    const result = analyzeInput(`
      function classify(limit: integer): integer {
        let total: integer = 0;
        for (let i: integer = 0; i < limit; i = i + 1) {
          if (i == 1) { continue; }
          switch (i) {
            case 2: total = total + 10; break;
            default: total = total + i;
          }
        }
        return total;
      }
      print(classify(5));
    `, "tac");
    const labels = new Set(
      result.tac.instructions
        .filter((instruction) => instruction.op === "LABEL")
        .map((instruction) => String(instruction.result?.value))
    );
    const targets = result.tac.instructions.flatMap((instruction) => {
      if (instruction.op === "GOTO") return [String(instruction.arg1?.value)];
      if (instruction.op === "IF_TRUE" || instruction.op === "IF_FALSE") {
        return [String(instruction.result?.value)];
      }
      return [];
    });
    const blockIds = new Set(result.tac.basicBlocks.map((block) => block.id));

    expect(result.tac.status).toBe("completed");
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => !labels.has(target))).toEqual([]);
    for (const edge of result.tac.controlFlowEdges) {
      expect(blockIds.has(edge.from)).toBe(true);
      expect(blockIds.has(edge.to)).toBe(true);
    }
  });

  it("conserva slots virtuales y offsets de campos a través de tres layouts", () => {
    const result = analyzeInput(`
      class Base {
        let base: integer = 1;
        function value(): integer { return this.base; }
      }
      class Middle: Base {
        let middle: integer = 2;
        function value(): integer { return this.middle; }
      }
      class Child: Middle {
        let child: integer = 3;
        function value(): integer { return this.child; }
      }
      print(new Child().value());
    `, "tac");
    const layouts = ["Base", "Middle", "Child"].map((name) =>
      result.tac.classLayouts.find((layout) => layout.name === name)!
    );
    const valueSlots = layouts.map((layout) =>
      layout.methods?.find((method) => method.name === "value")?.slot
    );

    expect(result.tac.status).toBe("completed");
    expect(layouts.every(Boolean)).toBe(true);
    expect(new Set(valueSlots).size).toBe(1);
    for (const layout of layouts) {
      const offsets = layout.fields.map((field) => field.offset);
      expect(new Set(offsets).size).toBe(offsets.length);
      expect(layout.instanceSize).toBeGreaterThan(Math.max(...offsets));
    }
  });

  it("propaga identidades distintas para símbolos homónimos hasta TAC", () => {
    const result = analyzeInput(`
      let value: integer = 1;
      print(value);
      {
        let value: integer = 2;
        print(value);
      }
      print(value);
    `, "tac");
    const symbols = result.semantic.symbols.filter(
      (symbol) => symbol.name === "value" && symbol.kind === "variable"
    );
    const tacSymbolIds = new Set(
      result.tac.instructions.flatMap((instruction) =>
        [instruction.arg1, instruction.arg2, instruction.result]
          .map((operand) => operand?.symbolId)
          .filter((id): id is string => Boolean(id))
      )
    );

    expect(symbols).toHaveLength(2);
    expect(new Set(symbols.map((symbol) => symbol.id)).size).toBe(2);
    expect(symbols.map((symbol) => symbol.references.length).sort()).toEqual([1, 2]);
    for (const symbol of symbols) expect(tacSymbolIds.has(symbol.id)).toBe(true);
  });

  it("asigna doce parámetros a slots únicos dentro de un frame alineado", () => {
    const result = analyzeInput(`
      function wide(a: integer, b: integer, c: integer, d: integer,
                    e: integer, f: integer, g: integer, h: integer,
                    i: integer, j: integer, k: integer, l: integer): integer {
        return a + f + l;
      }
      print(wide(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
    `, "tac");
    const frame = result.tac.activationRecords.find((candidate) => candidate.name === "wide");
    const parameters = frame?.slots.filter((slot) => slot.kind === "parameter") ?? [];

    expect(result.tac.status).toBe("completed");
    expect(frame).toBeDefined();
    expect(frame?.parameterCount).toBe(12);
    expect(parameters).toHaveLength(12);
    expect(new Set(parameters.map((slot) => slot.offset)).size).toBe(12);
    expect(frame!.totalBytes % 8).toBe(0);
    expect(parameters.every((slot) => slot.offset % slot.alignment === 0)).toBe(true);
  });

  it("produce diagnósticos deterministas, únicos y bloquea artefactos", () => {
    const source = `
      class Base {
        function constructor(seed: integer) { }
        function value(x: integer): integer { return x; }
      }
      class Child: Base {
        function constructor(seed: string) { }
        function value(): float { return 2.5; }
      }
      const fixed: integer = 1;
      fixed = 2;
      let numbers: integer[] = ["bad"];
      print(missing);
    `;
    const first = analyzeInput(source, "mips");
    const second = analyzeInput(source, "mips");
    const keys = first.semantic.errors.map((error) =>
      `${error.code}:${error.line}:${error.column}:${error.message}`
    );

    expect(first.semantic.errors.length).toBeGreaterThanOrEqual(5);
    expect(new Set(keys).size).toBe(keys.length);
    expect(second.semantic.errors).toEqual(first.semantic.errors);
    expect(first.tac.status).toBe("skipped");
    expect(first.tac.instructions).toEqual([]);
    expect(first.mips.status).toBe("skipped");
    expect(first.mips.assembly).toBe("");
  });

  it("termina cada función y no deja temporales activos", () => {
    const result = analyzeInput(`
      function outer(seed: integer) {
        function first(value: integer): integer { return seed + value; }
        function second(value: integer): integer { return first(value) * 2; }
        return second;
      }
      let calculate = outer(4);
      print(calculate(3));
    `, "tac");
    const begins = result.tac.instructions
      .filter((instruction) => instruction.op === "FUNC_BEGIN")
      .map((instruction) => String(instruction.result?.value));
    const ends = result.tac.instructions
      .filter((instruction) => instruction.op === "FUNC_END")
      .map((instruction) => String(instruction.result?.value));

    expect(result.tac.status).toBe("completed");
    expect(begins.length).toBeGreaterThanOrEqual(3);
    expect([...ends].sort()).toEqual([...begins].sort());
    expect(result.tac.metrics.activeTemporaryCount).toBe(0);
    expect(result.tac.metrics.activationRecordCount).toBe(result.tac.activationRecords.length);
  });
});

const runtimeCases = [
  [
    "división y módulo conservan el signo de MIPS",
    `
      print(-17 / 5);
      print(-17 % 5);
      print(17 / -5);
      print(17 % -5);
    `,
    "-3\n-2\n-3\n2"
  ],
  [
    "los argumentos se evalúan de izquierda a derecha una sola vez",
    `
      let current: integer = 0;
      function next(): integer { current = current + 1; return current; }
      function show(a: integer, b: integer, c: integer) { print(a); print(b); print(c); }
      show(next(), next(), next());
      print(current);
    `,
    "1\n2\n3\n3"
  ],
  [
    "un arreglo conserva closures independientes",
    `
      function make(seed: integer) {
        function next(): integer { seed = seed + 1; return seed; }
        return next;
      }
      let counters = [make(0), make(10)];
      print(counters[0]());
      print(counters[1]());
      print(counters[0]());
    `,
    "1\n11\n2"
  ],
  [
    "un método ligado conserva el receptor aunque la variable se vuelva null",
    `
      class Counter {
        let value: integer;
        function constructor(value: integer) { this.value = value; }
        function next(): integer { this.value = this.value + 1; return this.value; }
      }
      let counter: Counter = new Counter(5);
      let next = counter.next;
      counter = null;
      print(next());
      print(next());
    `,
    "6\n7"
  ],
  [
    "un método heredado realiza despacho virtual hacia la clase real",
    `
      class Base {
        function value(): integer { return 1; }
        function twice(): integer { return this.value() + this.value(); }
      }
      class Child: Base { function value(): integer { return 3; } }
      let item: Base = new Child();
      print(item.twice());
    `,
    "6"
  ],
  [
    "continue dentro de switch continúa el for correcto",
    `
      let total: integer = 0;
      for (let i: integer = 0; i < 5; i = i + 1) {
        switch (i) {
          case 1: continue;
          case 3: continue;
          default: total = total + i;
        }
      }
      print(total);
    `,
    "6"
  ],
  [
    "break desde try desmonta el handler antes del siguiente error",
    `
      let value: integer = 0;
      while (true) {
        try { value = 7; break; }
        catch (err) { print("unexpected"); }
      }
      print(value);
      try { print(1 / 0); }
      catch (err) { print("caught"); }
      print("done");
    `,
    "7\ncaught\ndone"
  ],
  [
    "el identificador de catch sombrea sin alterar la variable exterior",
    `
      let err: string = "outer";
      try { let values = [1]; print(values[3]); }
      catch (err) { print(err); }
      print(err);
    `,
    "Runtime error: array index out of bounds\nouter"
  ],
  [
    "una closure recursiva conserva y modifica su captura",
    `
      function make() {
        let visits: integer = 0;
        function walk(level: integer): integer {
          visits = visits + 1;
          if (level == 0) { return visits; }
          return walk(level - 1);
        }
        return walk;
      }
      let walk = make();
      print(walk(4));
      print(walk(2));
    `,
    "5\n8"
  ],
  [
    "una matriz float conserva alias y promoción de integer",
    `
      let row: float[] = [1.0, 2.5];
      let matrix: float[][] = [row];
      let alias: float[] = matrix[0];
      alias[0] = 3;
      print(matrix[0][0]);
      print(alias[0] + matrix[0][1]);
    `,
    "3.0\n5.5"
  ],
  [
    "una closure concatena y persiste cadenas capturadas",
    `
      function make(prefix: string) {
        let value: string = prefix;
        function append(suffix: string): string { value = value + suffix; return value; }
        return append;
      }
      let append = make("A");
      print(append("B"));
      print(append("C"));
      print(append("") == "ABC");
    `,
    "AB\nABC\ntrue"
  ],
  [
    "el cortocircuito evita desreferenciar un objeto null",
    `
      class Box { let value: integer = 4; }
      let box: Box = null;
      print(box == null);
      print(box != null && box.value == 4);
      box = new Box();
      print(box != null && box.value == 4);
    `,
    "true\nfalse\ntrue"
  ]
] as const;

describe.skipIf(!existsSync(jar) || !javaAvailable)("quinta auditoría: salidas reales adicionales por rúbrica", () => {
  it.each(runtimeCases)("%s", (_name, source, expected) => {
    const execution = executeInMars(source);
    expect(execution.output).toBe(expected);
    expect(execution.maxConcurrent).toBeLessThanOrEqual(8);
    expect(execution.spills).toBe(0);
  }, 25000);
});
