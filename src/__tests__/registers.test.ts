import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";

function compile(source: string) {
  const result = analyzeInput(source, "mips");
  expect(result.mips.status).toBe("completed");
  return result.mips;
}

describe("asignación de registros con descriptores", () => {
  it("reutiliza el registro que ya contiene una variable en vez de recargarla", () => {
    const mips = compile("let a: integer = 5;\nlet b: integer = a + a;\nprint(b);");

    expect(mips.text).toContain("  addu $t1, $t0, $t0");
    expect(mips.text.some((line) => /^\s*lw .*mem_frame_scope_0_sym_0$/.test(line))).toBe(false);
    expect(mips.registerStats.reuses).toBeGreaterThan(0);
  });

  it("desaloja el registro usado hace más tiempo cuando se agotan $t0-$t7", () => {
    const mips = compile([
      "let a: integer = 1; let b: integer = 2; let c: integer = 3; let d: integer = 4; let e: integer = 5;",
      "let f: integer = 6; let g: integer = 7; let h: integer = 8; let k: integer = 9;",
      "print(a + b + c + d + e + f + g + h + k + a * b * c * d);",
    ].join("\n"));

    expect(mips.registerStats.maxConcurrent).toBe(8);
    expect(mips.registerStats.evictions).toBeGreaterThan(0);
    expect(mips.registerStats.spills).toBe(0);
  });

  it("invalida los descriptores en etiquetas y después de llamadas", () => {
    const mips = compile("function f(): integer { return 1; }\nlet a: integer = 2;\nlet b: integer = f();\nprint(a + b);");
    const unoptimized = mips.unoptimizedAssembly.split("\n").map((line) => line.trim());
    const afterCall = unoptimized.slice(unoptimized.lastIndexOf("jal fn_fn_scope_0_f"));

    expect(afterCall).toContain("lw $t1, mem_frame_scope_0_sym_1");
  });

  it("reutiliza registros en los programas de ejemplo sin desbordar el banco", () => {
    for (const program of ["examples/tac/13_programa_integral.cps", "examples/semantic/valid_complete.cps"]) {
      const mips = compile(readFileSync(resolve(program), "utf8"));

      expect(mips.registerStats.reuses).toBeGreaterThan(0);
      expect(mips.registerStats.maxConcurrent).toBeLessThanOrEqual(8);
      expect(mips.registerStats.spills).toBe(0);
    }
  });
});
