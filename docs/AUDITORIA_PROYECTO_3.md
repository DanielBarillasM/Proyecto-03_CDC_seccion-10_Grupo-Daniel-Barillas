# Auditoría técnica del Proyecto 3

**Fecha:** 1 de noviembre de 2026
**Versión revisada:** 3.0.0  
**Objetivo:** generación de ensamblador MIPS32 desde el TAC del Proyecto 2.

## Dictamen

La implementación cubre el pipeline obligatorio y el caso que originó la revisión quedó corregido: una entrada válida o un archivo propio ejecuta el modo `mips`; si frontend y TAC terminan correctamente, la UI genera ensamblador y habilita su descarga. Si existe un error previo, MIPS queda en `skipped` y no se produce artefacto.

La suite contiene **100 casos de ejecución MARS** para enteros, floats, cadenas, funciones, llamadas anidadas, recursión, arreglos y matrices, objetos, herencia, métodos, despacho dinámico, constructores heredados, closures, errores de ejecución y `try/catch`. La segunda auditoría automatizó los casos documentados de control de flujo y matrices. La tercera auditoría amplió la cobertura de registros y frames, aritmética con signo, cortocircuito con efectos laterales, `for(;;)`, `switch`, recursión ramificada, herencia de tres niveles, closures de método, handlers anidados, alias de arreglos de strings y floats. La cuarta auditoría añadió determinismo tras errores, validación independiente de etiquetas, capturas profundas de `this`, coherencia de métricas, llamadas de diez parámetros, despacho dinámico desde arreglos, constructores encadenados y desenrollado de excepciones a través de recursión. La quinta auditoría añadió contratos de CFG cerrado, layouts heredados, identidades de símbolos, frames de doce parámetros y temporales balanceados, además de doce ejecuciones que combinan división con signo, orden de evaluación, closures recursivos, matrices float, control dentro de `try`, despacho heredado y referencias de método. La sexta auditoría fijó el contrato de la interfaz para ejecutar MIPS aun cuando la pestaña solicitada sea TAC, confirmó el bloqueo de TAC/MIPS ante errores, probó frames alineados con dieciséis parámetros, validó padres de árboles de activación y añadió doce ejecuciones integrales de los criterios oficiales. En desarrollo local Vitest marca los casos MARS como omitidos si falta Java o el JAR; el workflow usa `REQUIRE_MARS=1`, por lo que esa misma ausencia se convierte en un fallo explícito y no en un falso positivo.

## Problemas corregidos

| Severidad | Hallazgo inicial | Corrección |
| --- | --- | --- |
| Crítica | Algunos ejemplos válidos podían detenerse antes del backend por asociar el enfoque visual con la profundidad de ejecución | `App.tsx` usa siempre el pipeline `mips`; “Generación TAC” conserva su énfasis, pero también produce ensamblador cuando la entrada es válida |
| Crítica | Backend omitía llamadas, arreglos, objetos, fields, closures y más opcodes | Backend completo en `src/mips/generator.ts` |
| Crítica | Variables se emitían como etiquetas inexistentes y no había stack frames | Resolución por `ActivationRecord`, `.data` y frames en `$sp/$fp` |
| Alta | UI declaraba MIPS listo si existía cualquier instrucción aunque hubiera diagnósticos | Estados `not-requested/skipped/completed/failed` y exportación solo en `completed` |
| Alta | Llamadas anidadas limpiaban argumentos de llamadas exteriores | Cada `CALL` consume solo sus N argumentos superiores |
| Alta | Al terminar una función anidada se perdía el contexto de la función exterior | Pila de contextos de generación para frames y epílogos |
| Alta | Valores función y closures se confundían | Seguimiento diferenciado de puntero crudo y objeto closure |
| Alta | CLI rechazaba `--mode mips` | Modo MIPS, `--out` y códigos de salida integrados |
| Media | No existía optimización de mirilla y la primera versión solo documentaba cuatro transformaciones | `peepholeOptimize` con ocho reglas conservadoras, métricas por regla y suite de efectos colaterales |
| Media | Los ejemplos documentados de matrices y control de flujo no formaban parte de la ejecución automatizada en MARS | `second.audit.test.ts` fija sus salidas exactas y añade contratos de determinismo, bloqueo y estructura de frames |
| Media | Paquetes y metadatos seguían identificando Proyecto 2 | Versión 3.0.0, repositorio, producto y UI actualizados |
| Media | Dependencias V0/Next y dos lockfiles incompatibles | Eliminación de restos V0 y lockfile npm único |
| Media | Vite dependía de `__dirname` en ESM | Resolución con `fileURLToPath(import.meta.url)` |
| Media | No existían pruebas o ejemplos MIPS | Suite MIPS y carpeta `examples/mips` |
| Alta | `try/catch` llegaba al TAC, pero el backend ignoraba sus marcadores | Registro dinámico de manejadores, restauración de pila/frame/closure y captura del mensaje de runtime |
| Alta | Dependencias directas y transitivas tenían avisos de seguridad de producción | Electron 43.8.3, Vite 6.4.5, Vitest 5.0.5 y lockfile con auditoría de producción limpia; el empaquetador de desarrollo conserva avisos upstream documentados |
| Media | La interfaz conservaba distribución y estética heredadas | Workbench futurista reconstruido con Motion, barras compactas, inspector vertical, paneles de vidrio y jerarquía responsive sin cambiar el flujo |
| Media | El repositorio solo versionaba tres archivos | Fuentes, pruebas, ejemplos, documentación y workflows incorporados al control de versiones |
| Alta | Un constructor explícito de una clase hija omitía la inicialización del padre | TAC invoca primero el constructor heredado y reenvía el receptor y sus parámetros compatibles |
| Alta | El acceso a miembros de un objeto `null` terminaba con una excepción fatal de MARS | Comprobación de referencia y excepción de runtime capturable antes de cada acceso |
| Alta | División o módulo entre cero producía un resultado silencioso | Validación entera y flotante con excepción de runtime capturable |
| Alta | Una llamada mediante una referencia base ignoraba la sobrescritura de la clase real | Vtables con slots estables y despacho dinámico mediante `jalr` |
| Alta | Arreglos de instancias se trataban como covariantes pese a ser mutables | Asignabilidad invariante para impedir escrituras incompatibles |
| Alta | El backend resolvía símbolos homónimos por nombre y el `shadowing` podía sobrescribir el slot exterior | Resolución de slots exclusivamente por `symbolId` y regresión MARS que comprueba las salidas `2`, `1` |
| Media | Anidamiento sintáctico extremo podía agotar la pila de JavaScript | Límite estructural previo al parser con diagnóstico único y bloqueo de fases posteriores |
| Media | Variables locales sin inicializador dependían del contenido residual de la pila | Inicialización determinista a cero en el prólogo de cada función |
| Alta | Una sobrescritura podía cambiar parámetros o retorno pese a compartir el slot heredado de la vtable | Validación final de firmas con `SEM007`, incluso con clases declaradas fuera de orden |
| Alta | Un constructor hijo podía reenviar al padre una cantidad o tipos incompatibles | Validación semántica previa con `SEM006`/`SEM007`; TAC y MIPS quedan bloqueados |
| Alta | Un campo homónimo de una clase hija se traducía usando el offset del campo padre | Resolución del miembro más derivado en TAC y MIPS, con regresión ejecutada en MARS |
| Alta | Una función anidada dentro de un método podía usar `this` sin que el analizador lo registrara como captura; el backend terminaba con `MIPS040` | La resolución semántica marca `this` como captura cuando cruza el límite de función y una regresión MARS comprueba que el closure conserva el receptor tras retornar el método |
| Media | Los mensajes internos de runtime incluían un salto de línea y `print(err)` agregaba otro; al continuar después de `catch` aparecía una línea vacía espuria | Los mensajes capturables ya no contienen terminador visual; solo la ruta de error no capturado imprime el salto antes de terminar, y dos regresiones MARS fijan la salida continua |
| Alta | Una referencia `let f = objeto.metodo` conservaba el código, pero no el receptor; al reasignar `objeto = null`, `f()` fallaba al acceder a `this` | El acceso crea un descriptor enlazado de dos words (código dinámico y receptor), y el ABI de métodos recupera `this` desde el descriptor antes de copiar los parámetros del usuario |

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
- 332 pruebas aprobadas en 21 archivos, incluidos 100 casos ejecutados en MARS 4.5;
- build Vite aprobado;
- auditoría de dependencias de producción: 0 vulnerabilidades; la cadena opcional de empaquetado Electron reporta 15 avisos moderados upstream de `minimatch`, sin una corrección no disruptiva publicada;
- CLI TAC y MIPS ejecutadas correctamente;
- workflow preparado para exigir los 100 casos MARS con Java 17.

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
| Fibonacci ramificado | `21` |
| método recursivo que conserva `this` | `32` |
| herencia de tres niveles y despacho dinámico | `child`, `9` |
| closure de método que captura `this` | `12` |
| referencia de método que retiene su receptor | `6`, `7` |

## Restricciones del enunciado

| Restricción | Estado | Evidencia |
| --- | --- | --- |
| Lenguaje fuente Compiscript | Cumple | gramática y ejemplos `.cps` |
| Generador obligatorio de lexer/parser | Cumple | ANTLR4TS y `src/generated` |
| Ensamblador desde TAC | Cumple | `generateMips(tac)` sin dependencia del CST |
| GUI amigable | Cumple | IDE React/Monaco y panel MIPS |
| Selector de archivo en GUI | Cumple | menú Archivo, input `.cps` |
| Resultados en GUI | Cumple | diagnósticos, TAC, frames y MIPS |
| Casos de prueba propios | Cumple | `examples/mips`, `mips.test.ts`, `peephole.test.ts`, `second.audit.test.ts`, `third.audit.test.ts`, `fourth.audit.test.ts`, `fifth.audit.test.ts`, `sixth.audit.test.ts` y ejecuciones MARS |
| Recuperación y múltiples errores | Cumple | listeners, estrategia ANTLR y visitors acumulativos |
| No TAC/MIPS con errores previos | Cumple | estados `skipped` y pruebas negativas |
| Mirilla | Cumple | ocho transformaciones locales, métricas por regla y pruebas de falsos positivos/idempotencia |
| Ensamblador válido/ejecutable externamente | Cumple | ejecución real en MARS 4.5 |
| No ejecución interna obligatoria | Cumple | runner externo opcional; la UI no simula MIPS |

## Aspectos manuales

El grupo individual **Daniel-Barillas** está conformado por **Pablo Daniel Barillas Moreno, carné 22193**, bajo autorización docente. El workflow de release requiere runners por sistema operativo; su definición está actualizada, pero la firma de binarios y la publicación de un tag son acciones externas.
