import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import recursionSource from "../../examples/mips/07_recursion.cps?raw";
import integralSource from "../../examples/tac/13_programa_integral.cps?raw";

const jar = resolve(process.env.MARS_JAR ?? "tools/Mars4_5.jar");
const javaProbe = spawnSync("java", ["-version"], { encoding: "utf8", timeout: 5000 });
const javaAvailable = !javaProbe.error && javaProbe.status === 0;

it("requires MARS when execution validation is requested", () => {
  if (process.env.REQUIRE_MARS === "1") {
    expect(existsSync(jar)).toBe(true);
    expect(javaAvailable).toBe(true);
  }
});

const cases = [
  ["existing recursive example", recursionSource, "120"],
  ["existing integral example", integralSource, "2\n6\n12"],
  ["plain functions stored in arrays", "function a(x: integer): integer { return x; } let fs = [a]; print(fs[0](8));", "8"],
  ["plain and captured function values", "function a(x: integer): integer { return x; } function outer() { let n: integer = 2; function b(x: integer): integer { return n + x; } return false ? a : b; } let f = outer(); print(f(3));", "5"],
  ["boolean fields", "class A { let x: boolean = true; let y: boolean = false; } let a = new A(); print(a.x); print(a.y);", "true\nfalse"],
  ["nested numeric arguments", "function f(a: float, b: float): float { return a + b; } let n: integer = 2; print(f(n, f(n, n)));", "6.0"],
  ["promoted method arguments", "class A { function f(a: float): float { return a + 0.5; } } let a = new A(); let n: integer = 2; print(a.f(n));", "2.5"],
  ["inherited constructor", "class Base { let x: float = 1.5; function constructor(n: float) { this.x = n; } } class Child: Base { let y: boolean = true; } let c = new Child(3); print(c.x); print(c.y);", "3.0\ntrue"],
  ["shared sibling captures", "function outer() { let n: integer = 1; function a(): integer { n = n + 1; return n; } function b(): integer { a(); return n; } return b; } let f = outer(); print(f()); print(f());", "2\n3"],
  ["recursive closure", "function outer() { let n: integer = 7; function f(x: integer): integer { if (x == 0) { return n; } f(x - 1); return n; } return f; } let f = outer(); print(f(3));", "7"],
  ["hoisted nested function", "function outer(): integer { let n: integer = 5; return inner(); function inner(): integer { return n; } } print(outer());", "5"],
  ["adjacent booleans", "function f() { let a: boolean = true; let b: boolean = false; print(a); print(b); } f();", "true\nfalse"],
  ["string ternary", 'print(true ? "yes" : "no");', "yes"],
  ["mixed ternary", "print(true ? 2 : 3.5);", "2.0"],
  ["float parameters and returns", "function f(x: float): float { return x; } function g(): float { return 3; } let n: integer = 2; print(f(n)); print(g());", "2.0\n3.0"],
  ["typed array literals", "let a = [1, 2]; let b = [1, 2.5]; print(a[1]); print(b[0]);", "2\n1.0"],
  ["float foreach", "foreach (x in [1.5, 2.5]) { print(x); }", "1.5\n2.5"],
  ["typed fields and methods", "class A { let x: float = 1.5; function value(): float { return this.x; } } let a = new A(); print(a.x + 1); print(a.value() + 1);", "2.5\n2.5"],
  ["promoted fields and arrays", "class A { let x: float = 2; } let a = new A(); let xs: float[] = [1.5]; xs[0] = 3; print(a.x); print(xs[0]);", "2.0\n3.0"],
  ["nested calls preserve environments", "function helper(): integer { return 1; } function outer() { let n: integer = 7; function inner(): integer { helper(); return n; } return inner; } let f = outer(); print(f());", "7"],
  ["owner and closure share cells", "function outer() { let n: integer = 1; function inner(): integer { n = n + 1; return n; } n = 5; print(inner()); print(n); return inner; } let f = outer(); print(f()); print(f());", "6\n6\n7\n8"],
  ["transitive capture", "function outer() { let n: integer = 4; function middle() { function inner(): integer { n = n + 1; return n; } return inner; } return middle; } let m = outer(); let f = m(); print(f()); print(f());", "5\n6"],
  ["float capture", "function outer() { let n: float = 1.5; function inner(): float { n = n + 1; return n; } return inner; } let f = outer(); print(f()); print(f());", "2.5\n3.5"],
  ["returned plain function", "function identity(x: integer): integer { return x; } function get() { return identity; } let f = get(); print(f(9));", "9"],
  ["independent closure instances", "function outer(n: integer) { function inner(): integer { n = n + 1; return n; } return inner; } let a = outer(0); let b = outer(10); print(a()); print(b()); print(a());", "1\n11\n2"],
  ["homonymous classes", "{ class Node { let x: integer = 1; } let a = new Node(); print(a.x); } { class Node { let x: float = 2.5; } let a = new Node(); print(a.x); }", "1\n2.5"],
  ["negative array read", "let a = [1]; print(a[-1]); print(99);", "Runtime error: array index out of bounds"],
  ["array write past end", "let a = [1]; a[1] = 2; print(99);", "Runtime error: array index out of bounds"],
  ["null array read", "let a: integer[] = null; print(a[0]);", "Runtime error: null array"],
  ["null array length", "let a: integer[] = null; foreach (x in a) { print(x); }", "Runtime error: null array"],
  ["negative array write", "let a = [1]; a[-1] = 99; print(99);", "Runtime error: array index out of bounds"],
  ["array read past end", "let a = [1]; print(a[1]);", "Runtime error: array index out of bounds"],
  ["null array write", "let a: integer[] = null; a[0] = 1;", "Runtime error: null array"],
  ["caught array error", "try { let a = [1]; print(a[2]); } catch (err) { print(err); }", "Runtime error: array index out of bounds"],
  ["caught error across a call", "function fail() { let a: integer[] = null; print(a[0]); } try { fail(); } catch (err) { print(err); }", "Runtime error: null array"],
  ["caught null object", "class A { let x: integer = 7; } let a: A = null; try { print(a.x); } catch (err) { print(err); }", "Runtime error: null object"],
  ["caught integer division by zero", "try { print(1 / 0); } catch (err) { print(err); }", "Runtime error: division by zero"],
  ["caught float division by zero", "try { print(1.0 / 0.0); } catch (err) { print(err); }", "Runtime error: division by zero"],
  ["explicit child constructor initializes parent", "class Base { let x: integer = 41; } class Child: Base { let y: integer = 1; function constructor() { this.y = 2; } } let c = new Child(); print(c.x); print(c.y);", "41\n2"],
  ["dynamic method dispatch", "class Base { function value(): integer { return 1; } } class Child: Base { function value(): integer { return 2; } } let item: Base = new Child(); print(item.value());", "2"],
  ["hidden child field keeps a distinct offset", "class Base { let x: integer = 1; function baseValue(): integer { return this.x; } } class Child: Base { let x: float = 2.5; function childValue(): float { return this.x; } } let item = new Child(); print(item.baseValue()); print(item.childValue()); print(item.x);", "1\n2.5\n2.5"],
  ["uninitialized locals and block shadowing are deterministic", "function value(): integer { let x: integer; return x; } print(value()); let x: integer = 1; { let x: integer = 2; print(x); } print(x);", "0\n2\n1"],
] as const;

describe.skipIf(!existsSync(jar) || !javaAvailable)("MARS output regressions", () => {
  it.each(cases)("%s", (_name, source, output) => {
    const result = analyzeInput(source, "mips");
    expect(result.semantic.errors).toEqual([]);
    expect(result.mips.diagnostics).toEqual([]);
    expect(result.mips.status).toBe("completed");
    const directory = mkdtempSync(resolve(".mars-test-"));
    try {
      const assembly = resolve(directory, "program.asm");
      writeFileSync(assembly, result.mips.assembly);
      const execution = spawnSync("java", ["-jar", jar, "nc", "ae1", "se1", "1000000", assembly], { encoding: "utf8", timeout: 10000 });
      expect(execution.error).toBeUndefined();
      expect(execution.status, execution.stdout + execution.stderr).toBe(0);
      expect(execution.stdout.replace(/\r/g, "").trim()).toBe(output);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15000);
});
