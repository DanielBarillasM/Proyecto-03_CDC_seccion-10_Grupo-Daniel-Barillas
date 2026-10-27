import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [, , assemblyArgument, jarArgument] = process.argv;
const assembly = resolve(assemblyArgument ?? "compiscript.asm");
const marsJar = resolve(jarArgument ?? process.env.MARS_JAR ?? "tools/Mars4_5.jar");

if (!existsSync(assembly)) {
  console.error(`No se encontró el ensamblador: ${assembly}`);
  console.error("Uso: npm run mars -- ruta/programa.asm [ruta/Mars4_5.jar]");
  process.exit(1);
}
if (!existsSync(marsJar)) {
  console.error(`No se encontró MARS: ${marsJar}`);
  console.error("Define MARS_JAR o pasa la ruta del archivo Mars4_5.jar como segundo argumento.");
  process.exit(1);
}

const execution = spawnSync("java", ["-jar", marsJar, "nc", "ae1", assembly], { stdio: "inherit" });
if (execution.error) {
  console.error(`No se pudo iniciar Java/MARS: ${execution.error.message}`);
  process.exit(2);
}
process.exit(execution.status ?? 2);
