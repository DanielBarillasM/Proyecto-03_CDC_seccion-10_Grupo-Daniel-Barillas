import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";

function compile(source: string) {
  const result = analyzeInput(source, "mips");
  expect(result.mips.status).toBe("completed");
  return result.mips;
}

function functionBody(lines: string[], name: string): string[] {
  const start = lines.indexOf(`fn_fn_scope_0_${name}:`);
  const end = lines.indexOf(`fn_fn_scope_0_${name}_epilogue:`);
  return lines.slice(start, end);
}

describe("asignación de registros con descriptores y write-back", () => {
  it("reutiliza el registro que ya contiene una variable en vez de recargarla", () => {
    const mips = compile("let a: integer = 5;\nlet b: integer = a + a;\nprint(b);");

    expect(mips.text).toContain("  addu $t1, $t0, $t0");
    expect(mips.text.some((line) => /^\s*lw .*mem_frame_scope_0_sym_0$/.test(line))).toBe(false);
    expect(mips.registerStats.reuses).toBeGreaterThan(0);
  });

  it("guarda en memoria solo los valores modificados que se desalojan y siguen vivos", () => {
    const mips = compile([
      "let a: integer = 1; let b: integer = 2; let c: integer = 3; let d: integer = 4; let e: integer = 5;",
      "let f: integer = 6; let g: integer = 7; let h: integer = 8; let k: integer = 9;",
      "print(a + b + c + d + e + f + g + h + k + a * b * c * d);",
    ].join("\n"));

    expect(mips.registerStats.maxConcurrent).toBe(8);
    expect(mips.registerStats.evictions).toBeGreaterThan(0);
    expect(mips.registerStats.spills).toBeGreaterThan(0);
    expect(mips.registerStats.spills).toBeLessThanOrEqual(mips.registerStats.evictions);
  });

  it("no escribe en memoria locales y temporales que mueren dentro del bloque", () => {
    const mips = compile("function f(x: integer): integer { let y: integer = x * 2; return y + 1; }\nprint(f(3));");
    const body = functionBody(mips.unoptimizedAssembly.split("\n").map((line) => line.trim()), "f");
    const stores = body.filter((line) => /^sw \$t[0-7], \d+\(\$fp\)$/.test(line));

    expect(stores).toEqual([]);
    expect(mips.registerStats.storesAvoided).toBeGreaterThan(0);
  });

  it("guarda las variables vivas al final del bloque antes de saltar", () => {
    const mips = compile("function sum(n: integer): integer { let s: integer = 0; let i: integer = 0; while (i < n) { s = s + i; i = i + 1; } return s; }\nprint(sum(5));");
    const body = functionBody(mips.unoptimizedAssembly.split("\n").map((line) => line.trim()), "sum");
    const jump = body.findIndex((line, index) => index > 0 && line.startsWith("j L_"));

    expect(body.slice(0, jump).some((line) => /^sw \$t[0-7], \d+\(\$fp\)$/.test(line))).toBe(true);
  });

  it("escribe las globales modificadas antes de una llamada", () => {
    const mips = compile("let g: integer = 1;\nfunction f(): integer { return g; }\ng = 5;\nprint(f());");
    const lines = mips.unoptimizedAssembly.split("\n").map((line) => line.trim());
    const call = lines.lastIndexOf("jal fn_fn_scope_0_f");
    const store = lines.findIndex((line) => /^sw \$t[0-7], mem_frame_scope_0_sym_1$/.test(line));
    const initial = lines.findIndex((line) => line === "li $t0, 1");

    expect(lines.slice(initial, store).some((line) => line.startsWith("sw $t0"))).toBe(false);

    expect(store).toBeGreaterThan(-1);
    expect(store).toBeLessThan(call);
  });

  it("invalida los descriptores después de llamadas", () => {
    const mips = compile("function f(): integer { return 1; }\nlet a: integer = 2;\nlet b: integer = f();\nprint(a + b);");
    const unoptimized = mips.unoptimizedAssembly.split("\n").map((line) => line.trim());
    const afterCall = unoptimized.slice(unoptimized.lastIndexOf("jal fn_fn_scope_0_f"));

    expect(afterCall.some((line) => /^lw \$t[0-7], mem_frame_scope_0_sym_1$/.test(line))).toBe(true);
  });

  it("usa instrucciones inmediatas solo cuando la constante cabe en 16 bits", () => {
    const mips = compile("function k(x: integer): integer { return (x + 32767) + (x - 32768) + (x + 40000) + x * 8 + x * 3 + (5 + x); }\nprint(k(2));");
    const body = functionBody(mips.unoptimizedAssembly.split("\n").map((line) => line.trim()), "k");

    expect(body.some((line) => /^addiu \$t[0-7], \$t[0-7], 32767$/.test(line))).toBe(true);
    expect(body.some((line) => /^addiu \$t[0-7], \$t[0-7], -32768$/.test(line))).toBe(true);
    expect(body.some((line) => /^addiu \$t[0-7], \$t[0-7], 5$/.test(line))).toBe(true);
    expect(body.some((line) => /^sll \$t[0-7], \$t[0-7], 3$/.test(line))).toBe(true);
    expect(body.some((line) => /^li \$t[0-7], 40000$/.test(line))).toBe(true);
    expect(body.some((line) => /^li \$t[0-7], 3$/.test(line))).toBe(true);
  });

  it("convierte x + 0 y x * 1 en move mediante la identidad algebraica", () => {
    const mips = compile("function z(x: integer): integer { let a: integer = x + 0; let b: integer = x * 1; return a + b; }\nprint(z(4));");

    expect(mips.peephole["algebraic-identity"]).toBeGreaterThanOrEqual(2);
  });

  it("mantiene métricas coherentes en los programas de ejemplo", () => {
    for (const program of ["examples/tac/13_programa_integral.cps", "examples/semantic/valid_complete.cps"]) {
      const mips = compile(readFileSync(resolve(program), "utf8"));

      expect(mips.registerStats.reuses).toBeGreaterThan(0);
      expect(mips.registerStats.storesAvoided).toBeGreaterThan(0);
      expect(mips.registerStats.maxConcurrent).toBeLessThanOrEqual(8);
      expect(mips.registerStats.spills).toBeLessThanOrEqual(mips.registerStats.evictions);
    }
  });
});
