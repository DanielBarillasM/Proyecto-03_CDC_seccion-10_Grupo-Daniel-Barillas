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
            ├─ asignación local de registros
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

`RegisterAllocator.getReg()` administra `$t0` a `$t7`. Como TAC limita cada instrucción a pocos operandos, los registros se liberan al cambiar de cuádruplo y los valores persistentes viven en slots. `$t8` y `$t9` se reservan para soporte de llamadas, comparaciones y punteros de función.

El resultado informa:

- asignaciones totales;
- máximo simultáneo;
- spills.

La estrategia actual no requiere spills en el conjunto TAC implementado; si se agota el pool, el backend falla de forma explícita en lugar de emitir ensamblador silenciosamente incorrecto.

## Selección de instrucciones

| TAC | MIPS32 |
| --- | --- |
| `MOV` | `li`/`la`/`lw` seguido de `sw` |
| `ADD`, `SUB`, `MUL` | `addu`, `subu`, `mul` |
| `DIV`, `MOD` | `div` con `mflo` o `mfhi` |
| comparaciones | `seq`, `sne`, `slt`, `sle`, `sgt`, `sge` |
| saltos | `j`, `beq`, `bne` con delay slot explícito |
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

No existe una fase independiente de optimización. `peepholeOptimize` procesa una ventana local y aplica ocho transformaciones conservadoras:

1. `move $r, $r`;
2. `addiu $r, $r, 0`;
3. `addu $r, $r, $zero`;
4. `subu $r, $r, $zero`;
5. `or $r, $r, $zero`;
6. `sll $r, $r, 0`;
7. saltos incondicionales a la etiqueta inmediatamente siguiente;
8. `nop` consecutivos redundantes.

El resultado conserva ensamblador previo y posterior, el contador total de eliminaciones y el desglose por regla. Ningún patrón reordena memoria, llamadas o ramas condicionales.

## Validación

Antes de marcar el resultado como completo se verifica que las etiquetas referidas por `j`, `jal`, ramas y `la` estén definidas. La suite dedicada de mirilla ejercita las ocho reglas, falsos positivos, idempotencia, inmutabilidad y métricas; las 88 regresiones de salida ejecutadas en MARS 4.5 comprueban que el ensamblador optimizado conserva el comportamiento. `npm run mars:setup` descarga el JAR oficial y verifica su SHA-256. CI usa `REQUIRE_MARS=1` para impedir que se omitan estas pruebas por falta del simulador.

```powershell
npm.cmd run cli -- examples/mips/07_recursion.cps --mode mips --out factorial.asm
java -jar Mars4_5.jar nc ae1 factorial.asm
# salida: 120
```

## Límites conscientes

`try/catch` instala un registro dinámico de manejo con el handler anterior, `$sp`, `$fp`, `$s7` y la etiqueta de captura. Los errores de arreglo nulo o fuera de límites, objeto nulo y división entre cero restauran ese contexto antes de saltar al `catch`, incluso si se originan dentro de una llamada anidada. El identificador de captura recibe el mensaje de error como `string`. Compiscript todavía no incluye una sentencia `throw`, por lo que el runtime solo eleva las excepciones definidas por el backend.
