# Matriz de trazabilidad — Proyecto 3

Esta matriz relaciona las instrucciones de generación de código ensamblador con implementación, evidencia automatizada y demostración externa.

## Observaciones y restricciones

| Requisito | Implementación | Evidencia | Estado |
| --- | --- | --- | --- |
| Fuente Compiscript | Gramática activa y extensión `.cps` | `src/grammars/Compiscript.g4`, `examples` | Cubierto |
| Lexer/parser generados | ANTLR4TS genera lexer, parser y Visitor | `npm run generate`, `src/generated` | Cubierto |
| Ensamblador generado desde TAC | `generateMips` solo acepta `TacGenerationResult` | `src/mips/generator.ts`, prueba MIPS | Cubierto |
| Arquitectura destino definida | MIPS32 compatible con MARS 4.5 | arquitectura y campo `target` | Cubierto |
| GUI amigable | Workbench React, Monaco, tema, paneles y estados | revisión de UI | Cubierto |
| Archivo desde GUI | input restringido a `.cps` en menú Archivo | `MenuBar.tsx` | Cubierto |
| Resultados dentro de GUI | lexer, parser, semántica, TAC, frames y MIPS | `RightDock`, `ProblemsPanel`, pipeline | Cubierto |
| Casos propios | positivos, negativos y combinados | `examples/mips`, `examples/tac`, `examples/rubric` | Cubierto |
| Continuar tras errores | acumulación por fase y recuperación ANTLR | suite léxica/sintáctica/semántica | Cubierto |
| Evitar duplicados/ciclos/cascadas | normalización, deduplicación y fases bloqueadas | `analyze.ts`, tests | Cubierto |
| No TAC/MIPS con errores previos | `skipped` y ensamblador vacío | prueba "bloquea TAC y MIPS" | Cubierto |
| Optimización de mirilla | ocho reglas locales conservadoras; seis se activan en el ensamblador de los ejemplos reales y `redundant-store` en sondas adicionales | `peepholeOptimize`, suite dedicada con prueba de efectividad real y 117 regresiones MARS | Cubierto |
| Ensamblador válido | segmentos, etiquetas y opcodes MIPS32 | 117 ejecuciones MARS | Cubierto |
| Árbol de activación | árbol dinámico de llamadas de una ejecución concreta | `executeTac`, `ActivationTreePanel`, CLI e `interpreter.test.ts` | Cubierto |
| Ejecución con herramienta externa | runner Java configurable | `scripts/run-mars.mjs` | Cubierto |
| No ejecución interna requerida | UI genera/exporta; MARS es externo | diseño y documentación | Cubierto |

## Requisitos técnicos de generación

| Capacidad | TAC / metadato | Traducción MIPS | Prueba |
| --- | --- | --- | --- |
| Declaraciones/asignaciones | `MOV`, slots | `li/lw/la` + `sw` | aritmética |
| Aritmética entera | `ADD/SUB/MUL/DIV/MOD` | ALU, `div`, `mflo/mfhi` | MIPS unitario y MARS |
| Aritmética float | tipos en operandos | coprocesador 1 | `06_flotantes.cps` |
| Lógica/comparación | `NOT/AND/OR/EQ...` | pseudo-opcodes y branches | suite MIPS |
| Control | labels, `GOTO`, `IF_*` | `j`, `beq`, `bne` | ciclos y condicionales |
| Funciones | `FUNC_BEGIN/END`, `PARAM/CALL/RETURN` | frame, pila, `jal/jalr`, `$v0/$f0` | `02_funciones_y_pila.cps` |
| Llamadas anidadas | cantidad en `CALL` | consumo parcial de argumentos | programa integral |
| Recursión | label estable y frame | frame por invocación | factorial `120` |
| Arreglos | `NEW_ARRAY`, acceso, longitud | syscall 9 y offsets | `03_control_y_arreglos.cps` |
| Clases/objetos | `ClassLayout`, fields, methods | heap, offsets, vtables, despacho dinámico y descriptor de método con receptor | clases, integral y referencia enlazada |
| Closures | `MAKE_CLOSURE`, `CAPTURE`, load/store | entorno heap y `$s7` | `07_closure.cps` |
| Strings | `ADD`, `EQ/NE`, constantes | `.asciiz`, concat y comparación | `04_cadenas_y_booleanos.cps` |
| Impresión | `PRINT` tipado | syscalls 1, 2 y 4 | ejemplos MARS |
| Registros | operandos TAC | `getReg` con descriptores, análisis de vida, *write-back* y desalojo por próximo uso en `$t0`–`$t7` | `registers.test.ts` y estadísticas |
| Mirilla | ensamblador preliminar | elimina redundancias locales con ocho reglas y desglose por regla | `peephole.test.ts` |

## Tabla de símbolos y fases heredadas

| Área | Evidencia | Estado |
| --- | --- | --- |
| Insertar símbolos | `ScopeManager.declare` | Cubierto |
| Recuperar información | `resolveCurrent`, `resolve` | Cubierto |
| Actualizar información | `updateSymbol`, marcas de inicialización/captura | Cubierto |
| Manejar alcances | árbol de scopes, enter/exit, shadowing | Cubierto |
| Tipos y asignabilidad | `semanticTypes.ts`, `typeSystem.ts` | Cubierto |
| Funciones, clases y arreglos | visitors y diagnósticos `SEM*` | Cubierto |
| TAC tipado | `src/tac/types.ts`, `generator.ts` | Cubierto |
| CFG y frames | `controlFlow.ts`, `ActivationRecord` | Cubierto |

## Rúbrica oficial de 30 puntos

La tabla usa los criterios y ponderaciones de la rúbrica oficial. "Cubierto" significa que existe implementación y evidencia reproducible; la asignación final de puntos corresponde al docente.

| Criterio | Puntos | Implementación y evidencia | Estado |
| --- | ---: | --- | --- |
| Selección de registros | 4 | `getReg` mantiene descriptores de registros y direcciones, reutiliza valores ya cargados dentro del bloque básico, difiere los stores con *write-back* y desaloja según el próximo uso; `registers.test.ts` comprueba reutilización, spills reales bajo presión, stores evitados, guardado antes de saltos y llamadas e instrucciones inmediatas | Cubierto |
| Registros y árboles de activación | 5 | `ActivationRecord` describe cada frame y su padre léxico; el intérprete TAC registra el árbol dinámico de llamadas con argumentos, retornos y desenrollado por excepciones, visible en GUI, CLI y reporte | Cubierto |
| Variables y constantes | 1 | declaraciones, `const`, asignaciones encadenadas y almacenamiento por `symbolId`; salida `7`, `7`, `7` | Cubierto |
| Operaciones aritméticas | 1 | suma, resta, multiplicación, división y módulo con signo; salida `3`, `2`, `-10`, `15` | Cubierto |
| Operaciones lógicas | 1 | comparaciones, negación y cortocircuito con efectos laterales; salida `false`, `true`, `0` | Cubierto |
| Arreglos | 1 | creación, longitud, índices, matrices, límites y alias; regresión de strings produce `a!`, `a`, `a!` | Cubierto |
| Estructuras de control | 3 | `if`, ciclos, `break`, `continue`, `switch`, `for(;;)` y flujo dentro de `try`; salidas exactas en MARS | Cubierto |
| Funciones y parámetros | 2 | frames, múltiples parámetros, llamadas anidadas, retornos enteros y float | Cubierto |
| Recursividad | 2 | factorial, Fibonacci ramificado (`21`) y método recursivo que conserva `this` (`32`) | Cubierto |
| Clases y objetos | 2 | layouts, constructores, fields, métodos, receptor implícito y referencias enlazadas que retienen el receptor tras reasignar la variable original | Cubierto |
| Herencia | 2 | layouts heredados, constructores y vtables; herencia de tres niveles y despacho dinámico producen `child`, `9` | Cubierto |
| Manejo de errores con `try/catch` | 2 | handlers dinámicos, restauración de pila/frame/closure y captura anidada; salidas `inner`, `outer`, `done` | Cubierto |
| Optimización de mirilla | 3 | ocho reglas conservadoras, seis activas en código real, con falsos positivos e idempotencia | Cubierto |
| Ensamblador/simulador/emulador | 1 | 117 programas ensamblados y ejecutados mediante MARS 4.5 oficial en modo CLI | Cubierto |
| **Total trazado** | **30** | La suite reproduce la evidencia funcional de todos los criterios | **Cubierto** |

## Evidencia de calidad

| Control | Resultado verificado |
| --- | --- |
| `npm run check` | aprobado |
| `npm test` | 440 aprobadas en 23 archivos, incluidas 117 ejecuciones MARS |
| `npm run build` | aprobado |
| dependencias de producción | 0 vulnerabilidades en `npm audit --omit=dev`; 15 avisos moderados upstream aislados en el empaquetador de desarrollo |
| MARS 4.5 | 117 casos aprobados; CI los exige con Java 17 |
| errores previos | TAC/MIPS omitidos |
| backend inconsistente | estado `failed`, descarga deshabilitada |

## Comprobaciones manuales externas

- autorización docente para la modalidad individual del grupo Daniel-Barillas;
- distribución de contribuciones en el historial Git;
- publicación de release y firma de binarios;
- evaluación estética subjetiva de la interfaz.

Estas condiciones no pueden probarse únicamente desde el código, pero el repositorio deja la evidencia necesaria para revisarlas.
