# Auditoría técnica del Proyecto 3

**Fecha:** 27 de octubre de 2026
**Versión revisada:** 3.0.0  
**Objetivo:** generación de ensamblador MIPS32 desde el TAC del Proyecto 2.

## Dictamen

La implementación cubre el pipeline obligatorio y el caso que originó la revisión quedó corregido: una entrada válida o un archivo propio ejecuta el modo `mips`; si frontend y TAC terminan correctamente, la UI genera ensamblador y habilita su descarga. Si existe un error previo, MIPS queda en `skipped` y no se produce artefacto.

La suite contiene **41 casos de ejecución MARS** para enteros, floats, cadenas, funciones, llamadas anidadas, recursión, arreglos, matrices, objetos, herencia, métodos, despacho dinámico, constructores heredados, closures, errores de ejecución y `try/catch`. El workflow instala Java y exige la ejecución MARS; en una máquina sin Java o sin el JAR, Vitest los omite explícitamente en vez de reportar un falso positivo.

## Problemas corregidos

| Severidad | Hallazgo inicial | Corrección |
| --- | --- | --- |
| Crítica | Entrada válida, archivo propio y casos normales se analizaban solo hasta semántica | `App.tsx` usa el pipeline `mips` salvo en la demostración TAC explícita |
| Crítica | Backend omitía llamadas, arreglos, objetos, fields, closures y más opcodes | Backend completo en `src/mips/generator.ts` |
| Crítica | Variables se emitían como etiquetas inexistentes y no había stack frames | Resolución por `ActivationRecord`, `.data` y frames en `$sp/$fp` |
| Alta | UI declaraba MIPS listo si existía cualquier instrucción aunque hubiera diagnósticos | Estados `not-requested/skipped/completed/failed` y exportación solo en `completed` |
| Alta | Llamadas anidadas limpiaban argumentos de llamadas exteriores | Cada `CALL` consume solo sus N argumentos superiores |
| Alta | Al terminar una función anidada se perdía el contexto de la función exterior | Pila de contextos de generación para frames y epílogos |
| Alta | Valores función y closures se confundían | Seguimiento diferenciado de puntero crudo y objeto closure |
| Alta | CLI rechazaba `--mode mips` | Modo MIPS, `--out` y códigos de salida integrados |
| Media | No existía optimización de mirilla | `peepholeOptimize` conservador con métricas |
| Media | Paquetes y metadatos seguían identificando Proyecto 2 | Versión 3.0.0, repositorio, producto y UI actualizados |
| Media | Dependencias V0/Next y dos lockfiles incompatibles | Eliminación de restos V0 y lockfile npm único |
| Media | Vite dependía de `__dirname` en ESM | Resolución con `fileURLToPath(import.meta.url)` |
| Media | No existían pruebas o ejemplos MIPS | Suite MIPS y carpeta `examples/mips` |
| Alta | `try/catch` llegaba al TAC, pero el backend ignoraba sus marcadores | Registro dinámico de manejadores, restauración de pila/frame/closure y captura del mensaje de runtime |
| Alta | Dependencias directas y transitivas tenían avisos de seguridad | Electron 43.8.3, Vite 6.4.5, Vitest 5.0.5 y lockfile auditado sin vulnerabilidades |
| Media | La interfaz conservaba distribución y estética heredadas | Workbench futurista reconstruido con Motion, barras compactas, inspector vertical, paneles de vidrio y jerarquía responsive sin cambiar el flujo |
| Media | El repositorio solo versionaba tres archivos | Fuentes, pruebas, ejemplos, documentación y workflows incorporados al control de versiones |
| Alta | Un constructor explícito de una clase hija omitía la inicialización del padre | TAC invoca primero el constructor heredado y reenvía el receptor y sus parámetros compatibles |
| Alta | El acceso a miembros de un objeto `null` terminaba con una excepción fatal de MARS | Comprobación de referencia y excepción de runtime capturable antes de cada acceso |
| Alta | División o módulo entre cero producía un resultado silencioso | Validación entera y flotante con excepción de runtime capturable |
| Alta | Una llamada mediante una referencia base ignoraba la sobrescritura de la clase real | Vtables con slots estables y despacho dinámico mediante `jalr` |
| Alta | Arreglos de instancias se trataban como covariantes pese a ser mutables | Asignabilidad invariante para impedir escrituras incompatibles |
| Media | Anidamiento sintáctico extremo podía agotar la pila de JavaScript | Límite estructural previo al parser con diagnóstico único y bloqueo de fases posteriores |
| Media | Variables locales sin inicializador dependían del contenido residual de la pila | Inicialización determinista a cero en el prólogo de cada función |

## Evidencia reproducible

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run cli:mips
```

Resultado verificado:

- TypeScript aprobado;
- 232 pruebas aprobadas en 15 archivos, incluidos 41 casos ejecutados en MARS 4.5;
- build Vite aprobado;
- auditoría npm completa: 0 vulnerabilidades;
- CLI TAC y MIPS ejecutadas correctamente;
- workflow preparado para exigir los 41 casos MARS con Java 17.

## Salidas observadas en MARS

| Caso | Salida |
| --- | --- |
| aritmética | `14` |
| funciones y pila | `42` |
| arreglos/foreach | `6` |
| cadenas/booleanos | `Hola MIPS`, `true` |
| floats | `4.0` |
| factorial recursivo | `120` |
| closure | `1` |
| programa integral de clase/método | `2`, `6`, `12` |

## Restricciones del enunciado

| Restricción | Estado | Evidencia |
| --- | --- | --- |
| Lenguaje fuente Compiscript | Cumple | gramática y ejemplos `.cps` |
| Generador obligatorio de lexer/parser | Cumple | ANTLR4TS y `src/generated` |
| Ensamblador desde TAC | Cumple | `generateMips(tac)` sin dependencia del CST |
| GUI amigable | Cumple | IDE React/Monaco y panel MIPS |
| Selector de archivo en GUI | Cumple | menú Archivo, input `.cps` |
| Resultados en GUI | Cumple | diagnósticos, TAC, frames y MIPS |
| Casos de prueba propios | Cumple | `examples/mips` y `src/__tests__/mips.test.ts` |
| Recuperación y múltiples errores | Cumple | listeners, estrategia ANTLR y visitors acumulativos |
| No TAC/MIPS con errores previos | Cumple | estados `skipped` y pruebas negativas |
| Mirilla | Cumple | optimizador local y métricas |
| Ensamblador válido/ejecutable externamente | Cumple | ejecución real en MARS 4.5 |
| No ejecución interna obligatoria | Cumple | runner externo opcional; la UI no simula MIPS |

## Aspectos manuales

El grupo individual **Daniel-Barillas** está conformado por **Pablo Daniel Barillas Moreno, carné 22193**, bajo autorización docente. El workflow de release requiere runners por sistema operativo; su definición está actualizada, pero la firma de binarios y la publicación de un tag son acciones externas.
