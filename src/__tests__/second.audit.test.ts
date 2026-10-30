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

function executeInMars(source: string): string {
  const result = analyzeInput(source, "mips");
  expect(result.accepted).toBe(true);
  expect(result.semantic.errors).toEqual([]);
  expect(result.tac.diagnostics).toEqual([]);
  expect(result.mips.diagnostics).toEqual([]);
  expect(result.mips.status).toBe("completed");

  const directory = mkdtempSync(resolve(".mars-second-audit-"));
  try {
    const assembly = resolve(directory, "program.asm");
    writeFileSync(assembly, result.mips.assembly);
    const execution = spawnSync(
      "java",
      ["-jar", jar, "nc", "ae1", "se1", "1000000", assembly],
      { encoding: "utf8", timeout: 10000 }
    );
    expect(execution.error).toBeUndefined();
    expect(execution.status, execution.stdout + execution.stderr).toBe(0);
    return execution.stdout.replace(/\r/g, "").trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("segunda auditoría: contratos del pipeline", () => {
  it("bloquea TAC y MIPS ante errores de cada fase sin dejar artefactos parciales", () => {
    const cases = [
      "let x: integer = 1; @",
      "let x: integer = ;",
      'let x: integer = "texto";'
    ];

    for (const source of cases) {
      const result = analyzeInput(source, "mips");
      expect(result.accepted).toBe(false);
      expect(result.summary.totalErrorCount).toBeGreaterThan(0);
      expect(result.tac.status).toBe("skipped");
      expect(result.tac.instructions).toEqual([]);
      expect(result.mips.status).toBe("skipped");
      expect(result.mips.assembly).toBe("");
    }
  });

  it("genera resultados deterministas sin filtrar estado entre compilaciones", () => {
    const source = `
      function sum(a: integer, b: integer): integer { return a + b; }
      print(sum(20, 22));
    `;
    const first = analyzeInput(source, "mips");
    analyzeInput("let invalid: integer = true;", "mips");
    const second = analyzeInput(source, "mips");

    expect(first.tac.instructions).toEqual(second.tac.instructions);
    expect(first.tac.activationRecords).toEqual(second.tac.activationRecords);
    expect(first.mips.assembly).toBe(second.mips.assembly);
    expect(first.mips.registerStats).toEqual(second.mips.registerStats);
  });

  it("mantiene frames alineados, acotados y enlazados a padres existentes", () => {
    const source = `
      function outer(seed: integer) {
        let value: integer = seed;
        function inner(step: integer): integer {
          value = value + step;
          return value;
        }
        return inner;
      }
      let counter = outer(10);
      print(counter(2));
    `;
    const result = analyzeInput(source, "tac");
    const frames = result.tac.activationRecords;
    const frameIds = new Set(frames.map((frame) => frame.id));

    expect(result.tac.status).toBe("completed");
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const frame of frames) {
      expect(frame.totalBytes % 8).toBe(0);
      if (frame.parentFrameId !== null) expect(frameIds.has(frame.parentFrameId)).toBe(true);
      if (frame.lexicalParentFrameId !== null) expect(frameIds.has(frame.lexicalParentFrameId)).toBe(true);

      const occupiedOffsets = new Set<number>();
      for (const slot of frame.slots) {
        expect(slot.offset % slot.alignment).toBe(0);
        expect(slot.offset + slot.size).toBeLessThanOrEqual(frame.totalBytes);
        expect(occupiedOffsets.has(slot.offset)).toBe(false);
        occupiedOffsets.add(slot.offset);
      }
    }
    expect(result.tac.metrics.activeTemporaryCount).toBe(0);
  });
});

const runtimeCases = [
  [
    "short-circuit AND avoids the right operand",
    "print(false && (1 / 0 > 0));",
    "false"
  ],
  [
    "short-circuit OR avoids the right operand",
    "print(true || (1 / 0 > 0));",
    "true"
  ],
  [
    "mutual recursion keeps independent activation records",
    `
      function even(n: integer): boolean { if (n == 0) { return true; } return odd(n - 1); }
      function odd(n: integer): boolean { if (n == 0) { return false; } return even(n - 1); }
      print(even(10));
      print(odd(7));
    `,
    "true\ntrue"
  ],
  [
    "six parameters and nested calls preserve argument order",
    `
      function add(a: integer, b: integer): integer { return a + b; }
      function pack(a: integer, b: integer, c: integer, d: integer, e: integer, f: integer): integer {
        return a + b * 10 + c * 100 + d * 1000 + e * 10000 + f * 100000;
      }
      print(pack(1, add(1, 1), 3, add(2, 2), 5, add(3, 3)));
    `,
    "654321"
  ],
  [
    "recursive locals remain isolated between invocations",
    `
      function triangular(n: integer): integer {
        let own: integer = n;
        if (n == 0) { return own; }
        return own + triangular(n - 1);
      }
      print(triangular(8));
    `,
    "36"
  ],
  [
    "documented control-flow example keeps its exact output",
    `
      let total: integer = 0;
      for (let i: integer = 0; i < 5; i = i + 1) {
        if (i == 1) { continue; }
        if (i == 4) { break; }
        total = total + i;
      }
      let vueltas: integer = 0;
      while (vueltas < 2) { vueltas = vueltas + 1; }
      do { total = total + 1; } while (false);
      foreach (valor in [1, 2]) { total = total + valor; }
      switch (total) {
        case 9: print("nueve"); break;
        default: print("incorrecto");
      }
      print(vueltas);
    `,
    "nueve\n2"
  ],
  [
    "documented matrix example preserves nested-array aliasing",
    `
      let matriz: integer[][] = [[1, 2], [3, 4]];
      let primera: integer[] = matriz[0];
      primera[1] = 9;
      print(matriz[0][1]);
      print(matriz[1][0]);
    `,
    "9\n3"
  ],
  [
    "caught runtime error resumes after the catch block",
    `
      let numeros: integer[] = [10, 20];
      try { print(numeros[5]); } catch (err) { print(err); }
      print("continua");
    `,
    "Runtime error: array index out of bounds\ncontinua"
  ],
  [
    "return from try removes its handler before the next call",
    `
      function value(): integer {
        try { return 7; } catch (err) { return 0; }
      }
      print(value());
      try { print(1 / 0); } catch (err) { print(err); }
    `,
    "7\nRuntime error: division by zero"
  ],
  [
    "complex TAC expression completes without register spills",
    `
      let a: integer = 2;
      let b: integer = 3;
      let c: integer = 4;
      let d: integer = 5;
      print(((a + b) * (c + d) - (a * c + b * d)) / 2);
    `,
    "11"
  ]
] as const;

describe.skipIf(!existsSync(jar) || !javaAvailable)("segunda auditoría: salidas reales de MARS", () => {
  it.each(runtimeCases)("%s", (_name, source, expected) => {
    expect(executeInMars(source)).toBe(expected);
  }, 15000);
});
