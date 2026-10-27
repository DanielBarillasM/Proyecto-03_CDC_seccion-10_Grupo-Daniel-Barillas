import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEMANTIC_CODE_CATALOG } from "../../semantic/diagnostics";

export function DocumentationPanel() {
  return (
    <div className="p-3 [&>details]:border-b-2 [&>details:last-child]:border-b-0 [&_summary]:cursor-pointer [&_summary]:py-3 [&_summary]:font-head [&_summary]:text-sm [&_summary]:focus-visible:outline-2 [&_summary]:focus-visible:outline-primary">
      <details open>
        <summary>Flujo de ejecución</summary>
        <div className="pb-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              Abre <strong>Compiscript MIPS Compiler IDE</strong> y selecciona un caso o carga un archivo <code>.cps</code>.
            </li>
            <li>El lexer generado por ANTLR tokeniza toda la entrada y recolecta diagnósticos léxicos.</li>
            <li>
              Si la tokenización permite continuar, el parser construye el CST desde <code>program()</code>.
            </li>
            <li>Si no hay errores léxicos ni sintácticos, el visitor semántico valida tipos y nombres.</li>
            <li>Si las tres fases anteriores son válidas, el generador emite TAC determinista.</li>
            <li>Solo si TAC queda completo, el backend traduce a MIPS32, aplica mirilla y valida las etiquetas.</li>
            <li>La aplicación muestra diagnósticos, símbolos, ámbitos, TAC, CFG, frames y ensamblador listo para MARS.</li>
          </ol>
        </div>
      </details>

      <details open>
        <summary>Backend MIPS32 y MARS</summary>
        <div className="pb-3">
          <p className="text-sm">
            <code>src/mips/generator.ts</code> consume exclusivamente el TAC. Usa <code>$sp</code>, <code>$fp</code> y
            <code>$ra</code> para llamadas y recursión; asigna registros temporales con <code>getReg</code>; reserva heap
            para arreglos, objetos, cadenas y closures; y emite syscalls compatibles con MARS 4.5. La optimización de
            mirilla elimina movimientos, ajustes y saltos redundantes sin crear una fase de optimización independiente.
          </p>
        </div>
      </details>

      <details open>
        <summary>Generación de código intermedio</summary>
        <div className="pb-3">
          <p className="text-sm">
            <code>generator.ts</code> recorre los contextos tipados de ANTLR y descompone expresiones en
            instrucciones de tres direcciones. Conserva cortocircuito, temporales reutilizables, etiquetas,
            llamadas, arreglos, objetos, clases, closures y flujo de control. Amplía la tabla de símbolos con
            almacenamiento abstracto y asigna un registro de activación a cada función o método.
          </p>
        </div>
      </details>

      <details open>
        <summary>Arquitectura de la fase semántica</summary>
        <div className="pb-3">
          <p className="text-sm">
            <code>declarationVisitor.ts</code> realiza la recolección inicial de clases, herencia, campos y firmas de
            métodos. <code>semanticVisitor.ts</code> recorre el CST válido, consulta <code>ScopeManager</code>, aplica{" "}
            <code>typeSystem.ts</code>. Produce diagnósticos estables y construye el árbol semántico anotado.{" "}
            <code>flowAnalysis.ts</code> detecta retornos faltantes y código inalcanzable.
          </p>
        </div>
      </details>

      <details open>
        <summary>Tabla de símbolos y ámbitos</summary>
        <div className="pb-3">
          <p className="text-sm">
            La tabla registra variables, constantes, parámetros, funciones, clases, campos, métodos y variables de{" "}
            <code>catch</code>. Cada símbolo conserva tipo, mutabilidad, inicialización, ámbito, ubicación de
            declaración, referencias y si fue capturado por un closure. Los ámbitos forman un árbol global con nodos
            de función, clase, bloque, ciclo, switch y catch.
          </p>
        </div>
      </details>

      <details open>
        <summary>Catálogo de diagnósticos semánticos</summary>
        <div className="pb-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Regla</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(SEMANTIC_CODE_CATALOG).map(([code, description]) => (
                <TableRow key={code}>
                  <TableCell>
                    <code className="text-xs">{code}</code>
                  </TableCell>
                  <TableCell>{description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>

      <details open>
        <summary>Cobertura principal</summary>
        <div className="pb-3">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Operadores aritméticos, lógicos, relacionales, igualdad y ternarios.</li>
            <li>Compatibilidad de asignaciones, constantes e inferencia básica de variables/arreglos.</li>
            <li>Resolución de identificadores, shadowing entre ámbitos y redeclaración local.</li>
            <li>Firmas de funciones, cantidad/tipo de argumentos, retornos, recursión y closures.</li>
            <li>
              <code>break</code>, <code>continue</code>, <code>return</code> y detección de código inalcanzable.
            </li>
            <li>Clases, herencia, constructores, <code>this</code>, campos y métodos heredados.</li>
            <li>
              Arreglos homogéneos, acceso por índice y <code>foreach</code>.
            </li>
          </ul>
        </div>
      </details>

      <details open>
        <summary>Comandos</summary>
        <div className="pb-3">
          <pre className="overflow-auto rounded border-2 bg-card p-2 text-xs">{`npm ci
npm run generate
npm run check
npm test
npm run build
npm run dev

# CLI semántica (modo por defecto)
npm run cli -- examples/semantic/valid_complete.cps --mode semantic
npm run cli -- examples/semantic/semantic_errors.cps --mode semantic

# Código intermedio
npm run cli -- examples/tac/13_programa_integral.cps --mode tac

# Ensamblador MIPS y ejecución externa en MARS
npm run cli -- examples/mips/01_aritmetica.cps --mode mips --out programa.asm
npm run mars -- programa.asm ruta/Mars4_5.jar

# Solo fases anteriores
npm run cli -- examples/compiscript/valid.cps --mode parser
npm run cli -- examples/compiscript/valid.cps --mode lexer`}</pre>
        </div>
      </details>

      <details open>
        <summary>Decisiones de diseño</summary>
        <div className="pb-3">
          <p className="text-sm">
            Consulta <code>docs/DECISIONES_SEMANTICAS.md</code> para las diferencias entre la gramática base y los
            requerimientos semánticos, incluida la incorporación de <code>float</code> y la política de{" "}
            <code>switch</code>.
          </p>
        </div>
      </details>
    </div>
  );
}
