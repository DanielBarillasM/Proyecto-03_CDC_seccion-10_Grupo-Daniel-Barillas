import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { peepholeOptimize } from "../mips/generator";

describe("backend MIPS32 / MARS", () => {
  it("genera un programa MARS completo desde TAC válido", () => {
    const result = analyzeInput("let a: integer = 2; let b: integer = 3; print(a + b * 4);", "mips");
    expect(result.accepted).toBe(true);
    expect(result.tac.status).toBe("completed");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toContain(".data");
    expect(result.mips.assembly).toContain(".globl main");
    expect(result.mips.assembly).toContain("syscall");
    expect(result.mips.diagnostics.filter((item) => item.severity === "error")).toHaveLength(0);
  });

  it("usa pila, frame pointer y jal para funciones", () => {
    const result = analyzeInput("function sum(a: integer, b: integer): integer { return a + b; } print(sum(20, 22));", "mips");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toMatch(/addiu \$sp, \$sp, -\d+/);
    expect(result.mips.assembly).toContain("move $fp, $sp");
    expect(result.mips.assembly).toMatch(/jal fn_/);
    expect(result.mips.assembly).toContain("jr $ra");
  });

  it("traduce arreglos y memoria dinámica", () => {
    const result = analyzeInput("let values: integer[] = [1, 2]; values[0] = values[1] + 3; print(values[0]);", "mips");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toContain("li $v0, 9");
    expect(result.mips.assembly).toContain("sll");
  });

  it("incluye runtime para concatenación y comparación de cadenas", () => {
    const result = analyzeInput('let a: string = "Hola "; let b: string = "MIPS"; print(a + b); print(b == "MIPS");', "mips");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toContain("__rt_concat:");
    expect(result.mips.assembly).toContain("__rt_streq:");
  });

  it("implementa try/catch con restauración del contexto MIPS", () => {
    const result = analyzeInput("try { let a = [1]; print(a[2]); } catch (err) { print(err); }", "mips");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toContain("__rt_handler: .word 0");
    expect(result.mips.assembly).toContain("__rt_throw:");
    expect(result.mips.assembly).toContain("lw $fp, 8($t9)");
    expect(result.mips.assembly).toContain("lw $s7, 12($t9)");
    expect(result.mips.assembly).toMatch(/la \$t8, L_(?:L_)?catch_/);
  });

  it("protege división por cero y objetos nulos mediante el runtime", () => {
    const source = "class A { let x: integer = 1; } let a: A = null; try { print(1 / 0); print(a.x); } catch (err) { print(err); }";
    const result = analyzeInput(source, "mips");

    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toContain("__rt_throw_div_zero:");
    expect(result.mips.assembly).toContain("__rt_throw_null_object:");
    expect(result.mips.assembly).toMatch(/beq \$t\d, \$zero, __rt_throw_div_zero/);
    expect(result.mips.assembly).toMatch(/beq \$t\d, \$zero, __rt_throw_null_object/);
  });

  it("emite tablas virtuales para despacho dinámico", () => {
    const source = "class Base { function value(): integer { return 1; } } class Child: Base { function value(): integer { return 2; } } let item: Base = new Child(); print(item.value());";
    const result = analyzeInput(source, "mips");

    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toMatch(/vtable_class_\d+:[\s\S]*\.word closure_.*Child_value/);
    expect(result.mips.assembly).toMatch(/lw \$t\d, 0\(\$t\d\)[\s\S]*lw \$t\d, \d+\(\$t\d\)/);
  });

  it("desmonta el manejador al salir de un try mediante break", () => {
    const result = analyzeInput("while (true) { try { break; } catch (err) { print(err); } } print(7);", "mips");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toMatch(/lw \$t8, __rt_handler[\s\S]*lw \$sp, 4\(\$t8\)[\s\S]*j L_(?:L_)?while_end_/);
  });

  it("preserva argumentos de llamadas externas mientras resuelve llamadas anidadas", () => {
    const result = analyzeInput("function sum(a: integer, b: integer): integer { return a + b; } print(sum(1, sum(2, 3)));", "mips");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "MIPS101" })]));
  });

  it("genera cierres con puntero de función y entorno capturado", () => {
    const source = "function outer(initial: integer) { let current: integer = initial; function next(): integer { current = current + 1; return current; } return next; } let counter = outer(0); print(counter());";
    const result = analyzeInput(source, "mips");
    expect(result.mips.status).toBe("completed");
    expect(result.mips.assembly).toContain("move $s7");
    expect(result.mips.assembly).toContain("jalr $t9");
  });

  it("bloquea TAC y MIPS si existe cualquier error previo", () => {
    for (const source of ["let x: integer = 1; @", "let x: integer = ;", "print(noDeclarada);"]) {
      const result = analyzeInput(source, "mips");
      expect(result.accepted).toBe(false);
      expect(result.tac.status).toBe("skipped");
      expect(result.mips.status).toBe("skipped");
      expect(result.mips.assembly).toBe("");
    }
  });

  it("aplica mirilla sin alterar saltos necesarios", () => {
    const optimized = peepholeOptimize(["  move $t0, $t0", "  addiu $sp, $sp, 0", "  j next", "next:", "  li $v0, 10"]);
    expect(optimized.removed).toBe(3);
    expect(optimized.lines).toEqual(["next:", "  li $v0, 10"]);
  });
});
