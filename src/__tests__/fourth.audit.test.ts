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

  const directory = mkdtempSync(resolve(".mars-fourth-audit-"));
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

describe("cuarta auditoría: invariantes cruzados del compilador", () => {
  it("mantiene resultados deterministas después de una compilación inválida", () => {
    const source = `
      class Counter {
        let value: integer = 3;
        function next(): integer { this.value = this.value + 1; return this.value; }
      }
      let counter = new Counter();
      print(counter.next());
    `;
    const first = analyzeInput(source, "mips");
    analyzeInput("let broken: integer = false; print(missing);", "mips");
    const second = analyzeInput(source, "mips");

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(second.tac.instructions).toEqual(first.tac.instructions);
    expect(second.tac.activationRecords).toEqual(first.tac.activationRecords);
    expect(second.mips.assembly).toBe(first.mips.assembly);
    expect(second.mips.registerStats).toEqual(first.mips.registerStats);
  });

  it("no deja referencias directas a etiquetas MIPS sin definición", () => {
    const result = analyzeInput(`
      function choose(value: integer): string {
        if (value > 0) { return "positive"; }
        return "other";
      }
      try { print(choose(1) + "!"); }
      catch (err) { print(err); }
    `, "mips");
    const lines = result.mips.assembly.split(/\r?\n/).map((line) => line.trim());
    const defined = new Set(
      lines
        .map((line) => /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line)?.[1])
        .filter((label): label is string => Boolean(label))
    );
    const references = new Set<string>();

    for (const line of lines) {
      const direct = /^(?:j|jal|bc1t|bc1f)\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(line);
      const branch = /^(?:beq|bne)\s+[^,]+,\s*[^,]+,\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(line);
      const address = /^la\s+\$[^,]+,\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(line);
      if (direct) references.add(direct[1]);
      if (branch) references.add(branch[1]);
      if (address) references.add(address[1]);
    }

    expect(result.mips.status).toBe("completed");
    expect([...references].filter((label) => !defined.has(label))).toEqual([]);
  });

  it("captura this y locales a través de dos niveles de funciones anidadas", () => {
    const result = analyzeInput(`
      class Box {
        let value: integer = 5;
        function maker(step: integer) {
          let bonus: integer = 1;
          function middle() {
            function read(): integer { return this.value + step + bonus; }
            return read;
          }
          return middle;
        }
      }
      let middle = new Box().maker(2);
      let read = middle();
      print(read());
    `, "mips");
    const capturedNames = new Set(
      result.semantic.symbols.filter((symbol) => symbol.captured).map((symbol) => symbol.name)
    );

    expect(result.accepted).toBe(true);
    expect(capturedNames.has("this")).toBe(true);
    expect(capturedNames.has("step")).toBe(true);
    expect(capturedNames.has("bonus")).toBe(true);
    expect(result.tac.status).toBe("completed");
    expect(result.mips.status).toBe("completed");
  });

  it("acumula contratos semánticos independientes y bloquea TAC y MIPS", () => {
    const result = analyzeInput(`
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
      print(unknownName);
    `, "mips");

    expect(result.semantic.errors.length).toBeGreaterThanOrEqual(4);
    expect(new Set(result.semantic.errors.map((error) => error.code)).size).toBeGreaterThanOrEqual(3);
    expect(result.tac.status).toBe("skipped");
    expect(result.tac.instructions).toEqual([]);
    expect(result.mips.status).toBe("skipped");
    expect(result.mips.assembly).toBe("");
  });

  it("recupera varios errores de entrada sin duplicados ni artefactos parciales", () => {
    const result = analyzeInput(`
      let first: integer = ;
      @@@
      print("unterminated);
      let second: integer = ;
    `, "mips");
    const diagnostics = [...result.lexicalErrors, ...result.syntaxErrors];
    const unique = new Set(diagnostics.map((error) => `${error.source}:${error.line}:${error.column}:${error.message}`));

    expect(result.accepted).toBe(false);
    expect(result.lexicalErrors.length).toBeGreaterThanOrEqual(2);
    expect(result.syntaxErrors.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics.length).toBeLessThanOrEqual(8);
    expect(unique.size).toBe(diagnostics.length);
    expect(result.semantic.status).toBe("skipped");
    expect(result.tac.status).toBe("skipped");
    expect(result.mips.status).toBe("skipped");
  });

  it("mantiene coherentes mirilla, conteo de instrucciones y registros", () => {
    const result = analyzeInput(`
      function mix(a: integer, b: integer, c: integer): integer {
        let value: integer = (a + b) * c;
        if (value > 10) { value = value - 1; }
        return value;
      }
      print(mix(2, 3, 4));
    `, "mips");

    expect(result.mips.status).toBe("completed");
    expect(result.mips.instructionCount - result.mips.optimizedInstructionCount)
      .toBe(result.mips.optimizationCount);
    expect(result.mips.optimizedInstructionCount).toBeGreaterThan(0);
    expect(result.mips.registerStats.maxConcurrent).toBeLessThanOrEqual(8);
    expect(result.mips.registerStats.spills).toBe(0);
  });
});

const runtimeCases = [
  [
    "do-while combina continue y break sin corromper el control",
    `
      let i: integer = 0;
      let total: integer = 0;
      do {
        i = i + 1;
        if (i == 2) { continue; }
        total = total + i;
        if (i == 4) { break; }
      } while (i < 6);
      print(total);
      print(i);
    `,
    "8\n4"
  ],
  [
    "switch numérico conserva fall-through y break dentro de for",
    `
      let score: integer = 0;
      for (let i: integer = 0; i < 4; i = i + 1) {
        switch (i) {
          case 0: score = score + 100; break;
          case 1: score = score + 10;
          case 2: score = score + 1; break;
          default: score = score + 4;
        }
      }
      print(score);
    `,
    "116"
  ],
  [
    "un cierre de método comparte this y un local capturado",
    `
      class Accumulator {
        let value: integer;
        function constructor(value: integer) { this.value = value; }
        function maker(step: integer) {
          let bonus: integer = 1;
          function next(): integer {
            this.value = this.value + step;
            return this.value + bonus;
          }
          return next;
        }
      }
      let item = new Accumulator(10);
      let next = item.maker(2);
      print(next());
      print(next());
      print(item.value);
    `,
    "13\n15\n14"
  ],
  [
    "una referencia a método conserva receptor y despacho dinámico",
    `
      class Base { function value(): integer { return 1; } }
      class Child: Base { function value(): integer { return 2; } }
      let item: Base = new Child();
      let read = item.value;
      print(read());
    `,
    "2"
  ],
  [
    "un arreglo de clase base despacha cada objeto por su vtable",
    `
      class Base { function value(): integer { return 1; } }
      class Child: Base { function value(): integer { return 2; } }
      let values: Base[] = [new Base(), new Base()];
      values[1] = new Child();
      foreach (value in values) { print(value.value()); }
    `,
    "1\n2"
  ],
  [
    "tres constructores explícitos encadenan el mismo argumento",
    `
      class Base {
        let x: integer;
        function constructor(seed: integer) { this.x = seed; }
      }
      class Middle: Base {
        let y: integer;
        function constructor(seed: integer) { this.y = seed + 1; }
      }
      class Child: Middle {
        let z: integer;
        function constructor(seed: integer) { this.z = seed + 2; }
      }
      let item = new Child(5);
      print(item.x);
      print(item.y);
      print(item.z);
    `,
    "5\n6\n7"
  ],
  [
    "un error recursivo desenrolla marcos hasta el catch exterior",
    `
      function dive(level: integer) {
        if (level == 0) { print(1 / 0); return; }
        dive(level - 1);
      }
      try { dive(6); }
      catch (err) { print(err); }
      print("done");
    `,
    "Runtime error: division by zero\ndone"
  ],
  [
    "return desde catch restaura el manejador para errores posteriores",
    `
      function safe(): integer {
        try { print(1 / 0); }
        catch (err) { return 7; }
        return 0;
      }
      print(safe());
      try { let values = [1]; print(values[3]); }
      catch (err) { print("again"); }
    `,
    "7\nagain"
  ],
  [
    "diez parámetros atraviesan registros y pila en llamadas anidadas",
    `
      function sum(a: integer, b: integer, c: integer, d: integer, e: integer,
                   f: integer, g: integer, h: integer, i: integer, j: integer): integer {
        return a + b + c + d + e + f + g + h + i + j;
      }
      print(sum(1, 2, 3, 4, 5, 6, 7, 8, 9, 10));
      print(sum(sum(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 1, 2, 3, 4, 5, 6, 7, 8, 9));
    `,
    "55\n100"
  ],
  [
    "el ternario evalúa únicamente la rama seleccionada",
    `
      let calls: integer = 0;
      function choose(value: string): string { calls = calls + 1; return value; }
      print(true ? choose("A") : choose("X"));
      print(false ? choose("Y") : choose("B"));
      print(calls);
    `,
    "A\nB\n2"
  ],
  [
    "concatenación e igualdad de cadenas funcionan con alias de arreglo",
    `
      let prefix: string = "compi";
      let value: string = prefix + "script";
      let values: string[] = [value];
      let alias: string[] = values;
      alias[0] = alias[0] + "!";
      print(value);
      print(value == "compiscript");
      print(values[0]);
    `,
    "compiscript\ntrue\ncompiscript!"
  ],
  [
    "arreglos anidados preservan alias y un fallo capturado permite continuar",
    `
      let row: integer[] = [1, 2];
      let matrix: integer[][] = [row, row];
      matrix[0][1] = 9;
      print(matrix[1][1]);
      try { print(matrix[-1][0]); }
      catch (err) { print(err); }
      print("done");
    `,
    "9\nRuntime error: array index out of bounds\ndone"
  ]
] as const;

describe.skipIf(!existsSync(jar) || !javaAvailable)("cuarta auditoría: ejecución MIPS adicional por rúbrica", () => {
  it.each(runtimeCases)("%s", (_name, source, expected) => {
    const execution = executeInMars(source);
    expect(execution.output).toBe(expected);
    expect(execution.maxConcurrent).toBeLessThanOrEqual(8);
    expect(execution.spills).toBe(0);
  }, 25000);
});
