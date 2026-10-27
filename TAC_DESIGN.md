# Diseño del TAC de Compiscript

## Objetivo

El módulo `src/tac/generator.ts` transforma el CST tipado por ANTLR y el resultado semántico validado en código de tres direcciones determinista. La generación se bloquea cuando existen errores léxicos, sintácticos o semánticos para evitar producir código engañoso.

## Pipeline

1. `App` solicita el pipeline completo sobre la fuente visible mediante `analyzeInput(..., "tac")`.
2. El visitante semántico construye símbolos, ámbitos y diagnósticos.
3. `generateTac()` recibe únicamente un árbol aceptado y emite instrucciones tipadas.
4. El resultado expone código formateado, instrucciones, métricas y marcos de activación.
5. La interfaz permite inspeccionar, filtrar y exportar TAC tanto para ejemplos como para código editado o cargado desde un archivo `.cps`.

## Modelo de instrucciones

Cada instrucción contiene `index`, `op`, operandos opcionales, ámbito y posición de origen. Los operandos distinguen literales, símbolos, temporales y etiquetas. Las operaciones de control usan `LABEL`, `GOTO`, `IF_FALSE` e `IF_TRUE`; las operaciones de datos usan `MOV`, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, comparaciones y operaciones unarias. El generador también representa arrays, objetos, propiedades, `switch`, `try/catch`, llamadas y cortocircuito lógico.

Las llamadas siguen la convención `PARAM` → `CALL` → `RETURN`. Las funciones se delimitan con `FUNC_BEGIN` y `FUNC_END`. Los arreglos y accesos indexados conservan operandos separados para que una etapa posterior pueda seleccionar la representación final.

## Temporales y etiquetas

`TemporaryAllocator` asigna nombres estables (`t0`, `t1`, ...), permite liberar temporales y registra reutilización. `LabelFactory` produce etiquetas deterministas por categoría y se reinicia por generación para que dos ejecuciones sobre el mismo programa sean comparables.

## Marcos de activación

Cada función tiene un `ActivationRecord` con identificador, ámbito, slots, offsets y tamaño total. Los símbolos locales y parámetros pueden asociarse a un slot con `frameId` y `offset`; esta información queda disponible para backend y exportaciones.

## Inspección y exportación

La pestaña TAC muestra métricas, búsqueda textual y filtro por opcode. Las acciones de exportación producen:

- `.tac`: código formateado legible.
- `.csv`: instrucciones con operandos, ámbito, frame y ubicación fuente.
- reporte `.txt`: métricas, código y resumen de marcos.

`buildTacControlFlow()` deriva bloques a partir de etiquetas, destinos de salto y la instrucción posterior a cada terminador. `TacGenerationResult` expone `basicBlocks` y `controlFlowEdges`; la pestaña visual consume ese mismo resultado sin reconstruirlo en React. `RETURN`, `FUNC_END` y `PROGRAM_END` terminan el flujo y no producen aristas de caída.

## Garantías

- Determinismo entre ejecuciones.
- Ningún TAC si la fase semántica fue omitida.
- Tipos estrictos para instrucciones, operandos y frames.
- Pruebas de generación, bloqueo, reutilización y exportación.

## Alcance actual y límites

El resultado TAC incluye metadatos de almacenamiento abstracto para símbolos (`frameId`, `offset`, tamaño y alineación), slots capturados para funciones anidadas y layouts iniciales de clases con offsets deterministas. La representación permanece independiente de máquina: no asigna direcciones físicas ni ejecuta el programa.

Las operaciones complejas se conservan como instrucciones intermedias (`ARRAY_GET`, `ARRAY_SET`, `GET_FIELD`, `SET_FIELD`, `NEW_OBJECT`, `TRY_BEGIN`, `CATCH_BEGIN`) para que el backend pueda aplicar posteriormente reglas específicas del runtime sin modificar el frontend del compilador.

## Traducción de expresiones

La traducción sigue directamente los niveles de precedencia de la gramática:

```text
assignment
  → conditional
  → logicalOr
  → logicalAnd
  → equality
  → relational
  → additive
  → multiplicative
  → unary
  → primary
```

Por ejemplo, `x = 1 + 2 * 3` produce:

```text
t0 = 2 * 3
t1 = 1 + t0
x = t1
```

Los destinos se distinguen de los valores. Una asignación puede escribir en un símbolo, una posición de arreglo, un campo o una captura de closure mediante `MOV`, `ARRAY_SET`, `SET_FIELD` o `STORE_CAPTURE`.

## Cortocircuito y flujo

`&&` y `||` utilizan saltos condicionales; el segundo operando aparece después del salto que puede omitirlo. Los ciclos mantienen pilas independientes para `break` y `continue`, de modo que los ciclos anidados conservan sus destinos. En `do-while`, `continue` apunta a la condición; en `for`, apunta a la actualización.

El ternario asigna ambas ramas a un mismo temporal:

```text
ifFalse condición goto L_ternary_false_0
t0 = valorVerdadero
goto L_ternary_end_0
L_ternary_false_0:
t0 = valorFalso
L_ternary_end_0:
```

## Temporales

`TemporaryAllocator` mantiene un pool independiente por frame. `acquire` nunca devuelve un temporal vivo; `release` lo devuelve al pool cuando la instrucción consumidora ya fue emitida. El resultado registra creados, reutilizados, pico simultáneo y temporales activos. Una generación correcta finaliza con cero temporales activos.

## Almacenamiento abstracto

Los tamaños utilizados son:

| Tipo | Tamaño |
|---|---:|
| boolean | 1 byte |
| integer | 4 bytes |
| float | 8 bytes |
| string, arreglo, objeto, clase o función | 8 bytes |

Cada slot se alinea según su tamaño hasta un máximo de 8 bytes. Las direcciones son offsets abstractos, no direcciones físicas.

## Funciones y frames

Cada función se delimita con `FUNC_BEGIN` y `FUNC_END`. Las llamadas emiten parámetros de izquierda a derecha, seguidos por `CALL`. Los frames contienen parámetros, locales de ámbitos descendientes, capturas y temporales. Los métodos reciben `this` como parámetro implícito y los constructores inicializan los campos declarados antes de ejecutar su cuerpo.

## Closures

Cuando una función anidada referencia un símbolo de un frame exterior, el frame interno agrega un slot `captured`. Las lecturas utilizan `LOAD_CAPTURE`; las escrituras, `STORE_CAPTURE`. `MAKE_CLOSURE` y `CAPTURE` describen la construcción del entorno y el frame marca que requiere enlace estático.

## Clases

Cada layout conserva campos heredados, offsets, tamaño de instancia y etiquetas de métodos. Los overrides sustituyen la etiqueta heredada sin cambiar los offsets de los campos. `NEW_OBJECT` reserva la instancia de forma abstracta y la llamada al constructor recibe el objeto como primer parámetro.

Toda clase dispone de una etiqueta de constructor propia. Cuando no existe un constructor explícito, el generador emite uno implícito con su `FUNC_BEGIN`/`FUNC_END` y su registro de activación. En una subclase, ese constructor reenvía `this` y los argumentos al constructor padre antes de inicializar los campos propios. Esta regla evita llamadas a etiquetas inexistentes y conserva la inicialización de ambos niveles de la jerarquía.

## Evidencia

La suite `src/__tests__/tac.test.ts` verifica contenido concreto del TAC, precedencia, ciclos, llamadas, arreglos, ternario, foreach, constructores implícitos/heredados, determinismo, almacenamiento, frames, liberación de temporales y bloqueo por errores. Sus casos de éxito y rechazo usan `analyzeInput(..., "tac")`, la misma llamada usada por la interfaz. Los archivos de `examples/tac` pueden cargarse como `.cps` en el IDE o ejecutarse desde la CLI; una fuente válida genera TAC y una fuente inválida muestra la causa del bloqueo.
