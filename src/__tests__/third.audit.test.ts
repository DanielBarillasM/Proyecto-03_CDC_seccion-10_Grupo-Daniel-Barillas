import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
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
  expect(result.semantic.errors).toEqual([]);
  expect(result.tac.diagnostics).toEqual([]);
  expect(result.mips.diagnostics).toEqual([]);
  expect(result.mips.status).toBe("completed");

  const directory = mkdtempSync(resolve(".mars-third-audit-"));
  try {
    const assembly = resolve(directory, "program.asm");
    writeFileSync(assembly, result.mips.assembly);
    const execution = spawnSync(
      "java",
      ["-jar", jar, "nc", "ae1", "se1", "2000000", assembly],
      { encoding: "utf8", timeout: 15000 }
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

describe("tercera auditoría: invariantes exigidos por la rúbrica", () => {
  it("mantiene un árbol de activación acíclico con slots válidos", () => {
    const source = `
      function root(seed: integer) {
        let state: integer = seed;
        function middle(step: integer) {
          function leaf(): integer { state = state + step; return state; }
          return leaf;
        }
        return middle;
      }
      let make = root(10);
      let next = make(2);
      print(next());
    `;
    const result = analyzeInput(source, "tac");
    const frames = new Map(result.tac.activationRecords.map((frame) => [frame.id, frame]));

    expect(result.tac.status).toBe("completed");
    expect(frames.size).toBeGreaterThanOrEqual(4);
    for (const frame of frames.values()) {
      const visited = new Set<string>();
      let current = frame;
      while (current.parentFrameId !== null) {
        expect(visited.has(current.id)).toBe(false);
        visited.add(current.id);
        const parent = frames.get(current.parentFrameId);
        expect(parent).toBeDefined();
        current = parent!;
      }

      const occupied = new Set<number>();
      for (const slot of frame.slots) {
        expect(slot.offset).toBeGreaterThanOrEqual(0);
        expect(slot.offset % slot.alignment).toBe(0);
        expect(slot.offset + slot.size).toBeLessThanOrEqual(frame.totalBytes);
        expect(occupied.has(slot.offset)).toBe(false);
        occupied.add(slot.offset);
      }
    }
  });

  it("limita getReg al pool temporal y no reporta spills en la matriz de rúbrica", () => {
    const source = `
      function mix(a: integer, b: integer, c: integer, d: integer): integer {
        return ((a + b) * (c - d)) + ((a * c) % (b + d));
      }
      print(mix(8, 3, 7, 2));
    `;
    const result = analyzeInput(source, "mips");

    expect(result.mips.status).toBe("completed");
    expect(result.mips.registerStats.allocations).toBeGreaterThan(0);
    expect(result.mips.registerStats.maxConcurrent).toBeGreaterThan(0);
    expect(result.mips.registerStats.maxConcurrent).toBeLessThanOrEqual(8);
    expect(result.mips.registerStats.spills).toBe(0);
  });

  it("conserva las ocho transformaciones de mirilla exigibles", () => {
    expect(new Set(PEEPHOLE_RULE_IDS).size).toBe(8);
    expect(PEEPHOLE_RULE_IDS.length).toBeGreaterThanOrEqual(6);
  });

  it("marca this como captura cuando una función anidada lo conserva", () => {
    const result = analyzeInput(`
      class Box {
        let value: integer = 4;
        function reader() {
          function read(): integer { return this.value; }
          return read;
        }
      }
      let read = new Box().reader();
      print(read());
    `, "mips");
    const thisSymbol = result.semantic.symbols.find((symbol) => symbol.name === "this" && symbol.captured);

    expect(result.semantic.errors).toEqual([]);
    expect(thisSymbol).toBeDefined();
    expect(result.tac.status).toBe("completed");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.diagnostics).toEqual([]);
  });

  it("bloquea representación intermedia y ensamblador ante errores acumulados", () => {
    const result = analyzeInput(`
      let a: integer = "texto";
      let b: boolean = 4;
      print(noExiste);
    `, "mips");

    expect(result.semantic.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.tac.status).toBe("skipped");
    expect(result.tac.instructions).toEqual([]);
    expect(result.mips.status).toBe("skipped");
    expect(result.mips.assembly).toBe("");
  });
});

const rubricRuntimeCases = [
  [
    "declarations constants and chained assignments",
    `
      const base: integer = 2;
      let left: integer = 0;
      let right: integer = 0;
      print(left = right = base + 5);
      print(left);
      print(right);
    `,
    "7\n7\n7"
  ],
  [
    "signed arithmetic division modulo and precedence",
    `
      print(17 / 5);
      print(17 % 5);
      print(-3 * 4 + 2);
      print((2 + 3) * (4 - 1));
    `,
    "3\n2\n-10\n15"
  ],
  [
    "logical short circuit preserves side effects",
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
    "optional for clauses and string switch fall through",
    `
      let count: integer = 0;
      for (;;) {
        count = count + 1;
        if (count == 2) { break; }
      }
      switch ("ok") {
        case "ok": print(count);
        default: print("fin");
      }
    `,
    "2\nfin"
  ],
  [
    "continue leaves try handlers balanced",
    `
      let total: integer = 0;
      for (let i: integer = 0; i < 4; i = i + 1) {
        try {
          if (i == 1) { continue; }
          total = total + i;
        } catch (err) { print("unexpected"); }
      }
      print(total);
      try { print(1 / 0); } catch (err) { print(err); }
    `,
    "5\nRuntime error: division by zero"
  ],
  [
    "branching recursion builds independent activation paths",
    `
      function fib(n: integer): integer {
        if (n <= 1) { return n; }
        return fib(n - 1) + fib(n - 2);
      }
      print(fib(8));
    `,
    "21"
  ],
  [
    "recursive method preserves this and local frames",
    `
      class Multiplier {
        let factor: integer = 2;
        function power(n: integer): integer {
          if (n == 0) { return 1; }
          return this.factor * this.power(n - 1);
        }
      }
      let value = new Multiplier();
      print(value.power(5));
    `,
    "32"
  ],
  [
    "three-level inheritance keeps constructor state and dynamic dispatch",
    `
      class Base {
        let value: integer;
        function constructor(value: integer) { this.value = value; }
        function label(): string { return "base"; }
      }
      class Middle: Base { }
      class Child: Middle {
        function label(): string { return "child"; }
      }
      let item: Base = new Child(9);
      print(item.label());
      print(item.value);
    `,
    "child\n9"
  ],
  [
    "method closure keeps this after the method returns",
    `
      class Counter {
        let value: integer;
        function constructor(value: integer) { this.value = value; }
        function reader() {
          function read(): integer { return this.value; }
          return read;
        }
      }
      let counter = new Counter(12);
      let read = counter.reader();
      print(read());
    `,
    "12"
  ],
  [
    "nested handlers choose the nearest catch and restore the outer one",
    `
      try {
        try { let values = [1]; print(values[4]); }
        catch (inner) { print("inner"); }
        print(1 / 0);
      } catch (outer) { print("outer"); }
      print("done");
    `,
    "inner\nouter\ndone"
  ],
  [
    "arrays preserve aliases for string elements",
    `
      let values: string[] = ["a", "b"];
      let alias: string[] = values;
      alias[1] = alias[0] + "!";
      print(values[1]);
      foreach (value in values) { print(value); }
    `,
    "a!\na\na!"
  ],
  [
    "float parameters returns and comparisons use the coprocessor path",
    `
      function average(a: float, b: float): float { return (a + b) / 2.0; }
      let result: float = average(2, 5.0);
      print(result);
      print(result > 3.0 && result < 4.0);
    `,
    "3.5\ntrue"
  ]
] as const;

describe.skipIf(!existsSync(jar) || !javaAvailable)("tercera auditoría: salidas por criterio de rúbrica", () => {
  it.each(rubricRuntimeCases)("%s", (_name, source, expected) => {
    const execution = executeInMars(source);
    expect(execution.output).toBe(expected);
    expect(execution.maxConcurrent).toBeLessThanOrEqual(8);
    expect(execution.spills).toBe(0);
  }, 20000);
});
