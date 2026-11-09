# Arquitectura MIPS32 del Proyecto 3

## Objetivo

La quinta fase del compilador transforma el código de tres direcciones del Proyecto 2 en ensamblador MIPS32 aceptado por MARS 4.5. No vuelve a recorrer el CST ni repite decisiones semánticas: su única entrada es `TacGenerationResult` y sus metadatos de tipos, frames y layouts.

```text
AnalyzeResult
  └─ tac: TacGenerationResult (completed)
       ├─ instructions[]
       ├─ activationRecords[]
       └─ classLayouts[]
            ↓
       MipsGenerator
            ├─ selección de instrucciones
            ├─ getReg con descriptores de registro y dirección
            ├─ resolución de almacenamiento
            ├─ runtime auxiliar
            ├─ mirilla
            └─ validación de etiquetas
                 ↓
       MipsGenerationResult
```

## Contrato de fase

`MipsGenerationResult.status` puede ser:

- `not-requested`: el usuario solicitó una fase anterior;
- `skipped`: TAC no existe porque hubo errores léxicos, sintácticos o semánticos;
- `completed`: el ensamblador se generó sin errores del backend;
- `failed`: TAC era válido, pero la traducción encontró una referencia, layout, opcode o etiqueta inválida.

La UI solo habilita **Descargar .asm** en `completed`. De este modo, tener texto parcial no se confunde con tener ensamblador ejecutable.

## Modelo de almacenamiento

### Global

Los slots del frame global se convierten en etiquetas `.word` del segmento `.data`. Las constantes de cadena se internan como `.asciiz` y las flotantes como `.float` alineado.

Cada valor no vacío ocupa una palabra alineada de cuatro bytes, incluidos booleanos, referencias y punteros a celdas capturadas.

### Funciones

Cada invocación crea un registro de activación real sobre la pila:

```text
direcciones altas
├─ argumentos del llamador
├─ $s7 del llamador guardado antes de cambiar de entorno
├─ $ra guardado
├─ $fp anterior
├─ $s7 anterior (entorno del closure)
├─ parámetros y variables locales
└─ temporales TAC          ← $fp, $sp
direcciones bajas
```

El prólogo alinea el tamaño del frame, mueve `$fp` y copia los argumentos hacia los offsets definidos en `ActivationRecord`. El epílogo restaura `$s7`, `$ra`, `$fp`, libera la pila y retorna con `jr $ra`.

Los parámetros se apilan de izquierda a derecha. Una llamada consume solo la cantidad declarada por su `CALL`; esto preserva argumentos externos durante llamadas anidadas como `obj.método(f(x))`.

El llamador convierte argumentos `integer` a `float` según la firma y restaura su propio `$s7` después de cada llamada. El retorno usa el tipo declarado o inferido de la función, no solo el del operando.

## Asignación de registros

`RegisterAllocator` administra `$t0` a `$t7` con dos descriptores:

- **descriptor de registro**: para cada registro, el conjunto de valores que contiene. Un valor puede ser una dirección de memoria (`offset($fp)` o una etiqueta global), una constante o la dirección de una etiqueta;
- **descriptor de dirección**: se obtiene del anterior; indica en qué registro está ya cargado un valor.

`getReg()` sigue este orden:

1. si el operando ya está en un registro, lo reutiliza sin emitir `lw`, `li` ni `la`;
2. si no, elige un registro vacío;
3. si no hay vacíos, desaloja el registro usado hace más tiempo, sin tocar los registros que usa la instrucción actual.

Cada asignación escribe en memoria de inmediato, es decir, la política es *write-through*. Por eso un desalojo nunca necesita guardar el valor: la copia en memoria ya está al día. El contador `spills` solo crecería si una instrucción necesitara más de ocho registros a la vez, lo que no ocurre con TAC de tres direcciones; en ese caso el backend reporta un error en lugar de emitir código incorrecto.

Los descriptores se vacían en los puntos donde el contenido de los registros deja de ser seguro: antes de cada etiqueta, de `FUNC_BEGIN`, `FUNC_END` y `CATCH_BEGIN`, y después de `CALL`, `GOTO`, `RETURN` y de las rutinas de runtime de cadenas. Las celdas compartidas de closures nunca se guardan en el caché porque otra activación puede modificarlas. Las escrituras flotantes invalidan la entrada de su dirección.

`$t8` y `$t9` se reservan para soporte de llamadas, comparaciones y punteros de función.

El resultado informa asignaciones totales, máximo simultáneo, reusos, desalojos y spills. En `13_programa_integral.cps` hay 21 reusos; en `valid_complete.cps` hay 56 reusos y 6 desalojos, siempre con cero spills.
## Selección de instrucciones

| TAC | MIPS32 |
| --- | --- |
| `MOV` | `li`/`la`/`lw` seguido de `sw` |
| `ADD`, `SUB`, `MUL` | `addu`, `subu`, `mul` |
| `DIV`, `MOD` | `div` con `mflo` o `mfhi` |
| comparaciones | `seq`, `sne`, `slt`, `sle`, `sgt`, `sge` |
| saltos | `j`, `beq`, `bne`; el `nop` posterior se elimina en mirilla |
| `PARAM`, `CALL` | push en `$sp`, `jal`/`jalr`, limpieza de argumentos |
| `RETURN` | `$v0` o `$f0` y salto al epílogo |
| `NEW_ARRAY`, `NEW_OBJECT` | syscall 9 (`sbrk`) |
| `PRINT` | syscalls 1, 2 y 4 |

Las operaciones flotantes usan registros `$f2`, `$f4`, `$f6`, `$f12` y `$f0`. La promoción `integer → float` usa `mtc1` y `cvt.s.w`.

## Arreglos, objetos y closures

Un arreglo reserva `(longitud + 1) * 4` bytes. El primer word conserva la longitud; el elemento `i` se encuentra en `4 * (i + 1)`.

Las lecturas y escrituras verifican referencia no nula y `0 <= i < longitud` antes de calcular la dirección. La lectura de longitud también verifica nulos. Un fallo imprime un diagnóstico y termina antes de acceder a memoria.

Un objeto reserva al menos `ClassLayout.instanceSize`. El primer word apunta a la vtable de su clase real y los campos comienzan después de ese encabezado. `GET_FIELD` y `SET_FIELD` usan el offset resuelto durante TAC y validan que el receptor no sea `null`. Los layouts y las etiquetas distinguen la identidad de cada declaración, incluso entre clases homónimas. Si padre e hija declaran un campo con el mismo nombre, ambos conservan almacenamiento independiente: el tipo hijo selecciona el campo más derivado y el método heredado conserva el layout de su clase declaradora.

Cada método tiene un slot estable heredable. Una sobrescritura conserva el slot del método base y la vtable de la clase hija guarda el descriptor nuevo; por ello una llamada mediante una referencia de tipo base despacha según la clase real del objeto. El descriptor se carga desde la vtable y se invoca con `jalr`; el receptor se pasa como primer parámetro. Como ambas implementaciones comparten ABI, la semántica exige la misma aridad, tipos de parámetros y retorno. También valida que el constructor hijo pueda reenviar al padre un prefijo de argumentos con tipos idénticos antes de permitir TAC/MIPS.

Todo valor de función usa un descriptor cuyo word 0 es la dirección de código. Las funciones sin capturas usan descriptores estáticos; los closures reservan descriptores en heap. Desde el word 1 se guardan punteros a celdas compartidas, no copias de los valores. El propietario reserva estas celdas al entrar en la función y tanto el propietario como sus closures acceden al mismo contenido. Las capturas transitivas conservan los punteros originales.

Al invocar un descriptor, `$s7` apunta al entorno; `LOAD_CAPTURE` y `STORE_CAPTURE` desreferencian la celda correspondiente. Las declaraciones de funciones se emiten antes de las demás instrucciones de su ámbito para mantener hoisting y recursión.

## Runtime de cadenas

El generador incluye rutinas solo cuando se usan:

- `__rt_concat`: calcula longitudes, solicita heap y copia ambas cadenas;
- `__rt_streq`: compara bytes hasta encontrar una diferencia o el terminador cero.

Los booleanos se imprimen como `true`/`false` y `null` como texto, no como enteros opacos.

## Optimización de mirilla

`peepholeOptimize` recorre el ensamblador generado con una ventana local y repite el recorrido hasta que ninguna regla cambia nada, con un máximo de 20 pasadas. Aplica ocho transformaciones:

1. `delay-slot-nop`: elimina el `nop` que sigue a un salto o rama;
2. `jump-to-next-label`: elimina un `j` cuya etiqueta destino aparece inmediatamente después;
3. `unreachable-code`: elimina instrucciones entre un salto incondicional y la siguiente etiqueta;
4. `jump-threading`: si el destino de un salto es otro `j`, redirige el salto al destino final; no actúa en ciclos de saltos;
5. `store-load-forwarding`: un `lw` justo después de un `sw` a la misma dirección se reemplaza por `move`, o se elimina si el registro es el mismo; también para `s.s`/`l.s`;
6. `redundant-store`: elimina un `sw` que guarda el valor recién cargado desde esa dirección, o el primero de dos `sw` seguidos a la misma dirección;
7. `stack-adjust-merge`: une dos `addiu` consecutivos sobre el mismo registro si la suma cabe en 16 bits, y los elimina si suman cero;
8. `algebraic-identity`: elimina `move $r, $r`, `addiu $r, $r, 0`, `addu/subu/or $r, $r, $zero` y `sll $r, $r, 0`.

> [!IMPORTANT]
> La regla `delay-slot-nop` asume la configuración por defecto de MARS 4.5, que tiene el *delayed branching* desactivado. El `.asm` optimizado no debe ejecutarse con la opción `db` de MARS. El campo `unoptimizedAssembly` conserva la versión con `nop` explícitos.

Sobre los 20 ejemplos válidos y las sondas adicionales, seis reglas se activan en código real: `delay-slot-nop`, `jump-to-next-label`, `unreachable-code`, `jump-threading`, `store-load-forwarding` y `stack-adjust-merge`. `13_programa_integral.cps` baja de 262 a 217 instrucciones y `valid_complete.cps` de 866 a 731. `redundant-store` y `algebraic-identity` están cubiertas por pruebas aisladas, pero el generador actual no produce esos patrones.

`optimizationCount` cuenta instrucciones eliminadas, es decir, `instructionCount - optimizedInstructionCount`. El campo `peephole` guarda cuántas veces se aplicó cada regla; una sustitución de `lw` por `move` cuenta como transformación aunque no reduzca instrucciones.

## Árbol de activación en tiempo de ejecución

Los registros de activación de `activationRecords` describen la forma de cada frame y su padre léxico. El árbol de activación es otra cosa: el árbol de llamadas que ocurren en una ejecución concreta. Para obtenerlo, [`src/tac/interpreter.ts`](../src/tac/interpreter.ts) interpreta el TAC una vez con la misma semántica que el backend: enteros de 32 bits, flotantes de precisión simple, celdas compartidas de closures, despacho dinámico por vtable, métodos ligados y manejadores `try/catch`.

Cada nodo guarda el frame, los argumentos, el valor de retorno, el padre dinámico y su estado: `returned`, `unwound` si una excepción abandonó la activación, o `active` si la ejecución se detuvo antes. La interpretación tiene límites de 500 000 instrucciones TAC, profundidad 1 000, 16 MiB de heap y 1 000 000 de caracteres de salida. Si alguno se alcanza, el estado pasa a `step-limit`, `depth-limit` o `resource-limit` y las activaciones abiertas quedan como `active`, por lo que el árbol no se presenta como completo. El límite de 2 000 nodos es distinto: solo recorta el árbol guardado, la ejecución continúa, `nodeCount` conserva el total real de llamadas y `truncated` avisa del recorte. Programas con errores del frontend no se ejecutan, y un límite del intérprete no cambia el estado de compilación ni bloquea la exportación del `.asm`.

La salida del intérprete coincide con la de MARS en los 20 ejemplos válidos, en las 51 regresiones de `mips.execution.test.ts` y en las sondas usadas durante la auditoría. La GUI muestra el árbol en la pestaña TAC, la CLI lo imprime en los modos `tac` y `mips`, y el reporte TAC descargable lo incluye.

## Validación

Antes de marcar el resultado como completo se verifica que las etiquetas referidas por `j`, `jal`, ramas y `la` estén definidas. La suite dedicada de mirilla ejercita las ocho reglas, falsos positivos, ciclos de saltos, límites de inmediatos, idempotencia, inmutabilidad, métricas y exige al menos seis reglas activas sobre ejemplos reales; las 109 regresiones de salida ejecutadas en MARS 4.5 comprueban que el ensamblador optimizado conserva el comportamiento. `npm run mars:setup` descarga el JAR oficial y verifica su SHA-256. CI usa `REQUIRE_MARS=1` para impedir que se omitan estas pruebas por falta del simulador.

```powershell
npm.cmd run cli -- examples/mips/07_recursion.cps --mode mips --out factorial.asm
java -jar Mars4_5.jar nc ae1 factorial.asm
# salida: 120
```

## Límites conscientes

`try/catch` instala un registro dinámico de manejo con el handler anterior, `$sp`, `$fp`, `$s7` y la etiqueta de captura. Los errores de arreglo nulo o fuera de límites, objeto nulo y división entre cero restauran ese contexto antes de saltar al `catch`, incluso si se originan dentro de una llamada anidada. El identificador de captura recibe el mensaje de error como `string`. Compiscript todavía no incluye una sentencia `throw`, por lo que el runtime solo eleva las excepciones definidas por el backend.
