# Guía completa de pruebas de Compiscript Studio

Esta guía reúne casos reproducibles para comprobar los requisitos del Proyecto 3 y las características definidas para Compiscript. Todos los programas válidos deben recorrer el pipeline:

```text
Compiscript → Lexer ANTLR → Parser ANTLR → Semántica → TAC → MIPS32
```

## 1. Preparación

Desde la raíz del proyecto:

```powershell
npm.cmd ci
npm.cmd run dev
```

En la interfaz se puede pegar cada programa en el editor o utilizar **Archivo → Cargar .cps**. Después se debe ejecutar la compilación y revisar los paneles de diagnósticos, TAC y MIPS.

Para ejecutar un ensamblador descargado desde la interfaz:

```powershell
npm.cmd run mars -- programa.asm tools/Mars4_5.jar
```

También se puede compilar un archivo desde la CLI:

```powershell
npm.cmd run cli -- ruta/programa.cps --mode mips --out programa.asm
npm.cmd run mars -- programa.asm tools/Mars4_5.jar
```

En todos los casos válidos se espera:

- cero errores léxicos, sintácticos y semánticos;
- estado TAC `completed`;
- estado MIPS `completed`;
- botón **Descargar .asm** habilitado;
- ensamblador no vacío y ejecutable en MARS 4.5.

Si existe al menos un error léxico, sintáctico o semántico se espera:

- estado TAC `skipped`;
- estado MIPS `skipped`;
- TAC y ensamblador vacíos;
- descarga de `.asm` deshabilitada.

## 2. Matriz de cobertura

| Caso | Funcionalidad principal | Resultado esperado |
| --- | --- | --- |
| V01 | enteros, constantes, precedencia y asignación | `14` |
| V02 | booleanos, comparaciones, lógica y ternario | `true`, `si` |
| V03 | funciones, parámetros, llamadas anidadas y retornos | `10` |
| V04 | recursión y frames independientes | `120` |
| V05 | `if`, `for`, `while`, `do-while`, `foreach`, `break`, `continue` y `switch` | `nueve`, `2` |
| V06 | arreglos, matrices, indexación y escritura | `9`, `3` |
| V07 | strings, igualdad, concatenación, booleanos y floats | `Hola MIPS`, `true`, `4.0` |
| V08 | clase, constructor, `this`, campo y método | `6` |
| V09 | herencia, constructor heredado y despacho dinámico | `Toby ladra` |
| V10 | closure y estado capturado persistente | `1`, `2` |
| V11 | ámbitos y shadowing | `2`, `1` |
| V12 | `try/catch` y error de arreglo capturado | mensaje de límites |
| V13 | división por cero y objeto nulo capturables | dos mensajes de runtime |
| V14 | programa integral TAC/MIPS | `2`, `6`, `12` |
| E01 | recuperación de varios errores léxicos | 3 errores; TAC/MIPS omitidos |
| E02 | recuperación de varios errores sintácticos | 3 errores; TAC/MIPS omitidos |
| E03 | errores léxicos y sintácticos combinados | 2 + 2 errores; TAC/MIPS omitidos |
| E04 | múltiples errores semánticos | códigos `SEM*`; TAC/MIPS omitidos |
| E05 | arreglos mutables invariantes | `SEM003`; TAC/MIPS omitidos |
| E06 | error de runtime no capturado | termina sin ejecutar instrucciones posteriores |
| R01 | profundidad estructural patológica | un diagnóstico y ninguna caída |
| I01 | selector, visualización y exportaciones de la GUI | resultados visibles dentro de la aplicación |

## 3. Casos válidos

### V01 — Enteros, constantes y precedencia

```cps
const FACTOR: integer = 4;
let a: integer = 2;
let b: integer = 3;
let resultado: integer = a + b * FACTOR;
print(resultado);
```

Salida exacta en MARS:

```text
14
```

Comprobar además que TAC multiplica antes de sumar.

### V02 — Comparaciones, lógica y operador ternario

```cps
let x: integer = 5;
let dentro: boolean = x >= 5 && x < 10;
print(dentro);
print(dentro ? "si" : "no");
```

Salida exacta:

```text
true
si
```

### V03 — Funciones, pila y llamadas anidadas

```cps
function multiplicar(a: integer, b: integer): integer {
  return a * b;
}

function sumar(a: integer, b: integer): integer {
  return a + b;
}

print(sumar(multiplicar(2, 3), multiplicar(1, 4)));
```

Salida exacta:

```text
10
```

En el ensamblador deben observarse instrucciones de llamada y retorno, uso de `$sp`, `$fp`, `$ra`, `jal` y `jr $ra`. Las llamadas internas no deben destruir los argumentos de la llamada exterior.

### V04 — Recursión

```cps
function factorial(n: integer): integer {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

print(factorial(5));
```

Salida exacta:

```text
120
```

Cada llamada recursiva debe crear su propio frame.

### V05 — Estructuras de control

```cps
let total: integer = 0;

for (let i: integer = 0; i < 5; i = i + 1) {
  if (i == 1) {
    continue;
  }
  if (i == 4) {
    break;
  }
  total = total + i;
}

let vueltas: integer = 0;
while (vueltas < 2) {
  vueltas = vueltas + 1;
}

do {
  total = total + 1;
} while (false);

foreach (valor in [1, 2]) {
  total = total + valor;
}

switch (total) {
  case 9:
    print("nueve");
    break;
  default:
    print("incorrecto");
}

print(vueltas);
```

Salida exacta:

```text
nueve
2
```

### V06 — Arreglos y matrices

```cps
let matriz: integer[][] = [[1, 2], [3, 4]];
let primera: integer[] = matriz[0];
primera[1] = 9;

print(matriz[0][1]);
print(matriz[1][0]);
```

Salida exacta:

```text
9
3
```

El MIPS debe reservar memoria mediante syscall 9 y validar referencia, índice negativo y límite superior antes de cada acceso.

### V07 — Strings, booleanos y flotantes

```cps
let saludo: string = "Hola ";
let destino: string = "MIPS";
let base: float = 2.5;
let resultado: float = base + 1.5;

print(saludo + destino);
print(destino == "MIPS");
print(resultado);
```

Salida exacta:

```text
Hola MIPS
true
4.0
```

### V08 — Clase, constructor, campo y método

```cps
class Contador {
  let valor: integer = 0;

  function constructor(inicial: integer) {
    this.valor = inicial;
  }

  function incrementar(): integer {
    this.valor = this.valor + 1;
    return this.valor;
  }
}

let contador: Contador = new Contador(5);
print(contador.incrementar());
```

Salida exacta:

```text
6
```

### V09 — Herencia y despacho dinámico

```cps
class Animal {
  let nombre: string;

  function constructor(nombre: string) {
    this.nombre = nombre;
  }

  function hablar(): string {
    return this.nombre + " hace ruido";
  }
}

class Perro: Animal {
  function hablar(): string {
    return this.nombre + " ladra";
  }
}

let animal: Animal = new Perro("Toby");
print(animal.hablar());
```

Salida exacta:

```text
Toby ladra
```

Este resultado comprueba simultáneamente:

- constructor heredado;
- inicialización del campo del padre;
- asignación de una instancia hija a una referencia base;
- sobrescritura del método;
- selección mediante vtable y `jalr` según la clase real.

### V10 — Closure con estado persistente

```cps
function crearContador(inicial: integer) {
  let actual: integer = inicial;

  function siguiente(): integer {
    actual = actual + 1;
    return actual;
  }

  return siguiente;
}

let contador = crearContador(0);
print(contador());
print(contador());
```

Salida exacta:

```text
1
2
```

La variable capturada debe sobrevivir al retorno de `crearContador`.

### V11 — Bloques, ámbitos y shadowing

```cps
let valor: integer = 1;

{
  let valor: integer = 2;
  print(valor);
}

print(valor);
```

Salida exacta:

```text
2
1
```

La tabla de símbolos debe mostrar dos símbolos distintos en ámbitos diferentes.

### V12 — Error de arreglo capturado

```cps
let numeros: integer[] = [10, 20];

try {
  print(numeros[5]);
} catch (err) {
  print(err);
}

print("continua");
```

Salida exacta:

```text
Runtime error: array index out of bounds

continua
```

El mensaje de runtime ya contiene un salto de línea; `print(err)` agrega otro. Lo importante es que el `catch` reciba el mensaje y que el programa continúe.

### V13 — División por cero y objeto nulo capturables

```cps
class Caja {
  let valor: integer = 7;
}

try {
  print(1 / 0);
} catch (err) {
  print(err);
}

let caja: Caja = null;
try {
  print(caja.valor);
} catch (err) {
  print(err);
}
```

Salida esperada, ignorando la línea vacía adicional de cada mensaje:

```text
Runtime error: division by zero
Runtime error: null object
```

### V14 — Programa integral existente

Abrir:

```text
examples/tac/13_programa_integral.cps
```

Salida exacta:

```text
2
6
12
```

Este caso combina clase, constructor, campo mutable, método, función, llamadas anidadas, arreglo y `foreach`.

## 4. Recuperación y bloqueo por errores

### E01 — Tres errores léxicos independientes

Abrir:

```text
examples/rubric/low/lexer_errors.cps
```

Resultado esperado:

- 3 errores léxicos para `@`, `#` y `$`;
- el lexer continúa hasta el final del archivo;
- no aparece una repetición infinita del mismo diagnóstico;
- TAC `skipped`;
- MIPS `skipped` y ensamblador vacío.

### E02 — Tres errores sintácticos independientes

Abrir:

```text
examples/rubric/low/parser_errors.cps
```

Resultado esperado:

- 0 errores léxicos;
- 3 errores sintácticos por los tres `;` ausentes;
- los mensajes deben ser comprensibles y señalar línea y columna;
- el parser debe alcanzar instrucciones posteriores;
- TAC y MIPS omitidos.

### E03 — Errores léxicos y sintácticos combinados

Abrir:

```text
examples/rubric/low/lexer_parser_errors.cps
```

Resultado esperado:

- 2 errores léxicos;
- 2 errores sintácticos;
- los cuatro problemas se reportan en la misma ejecución;
- no se generan TAC ni MIPS.

### E04 — Múltiples errores semánticos

```cps
let total: integer = "texto";
print(noExiste);

if (total) {
  print(total);
}

break;
return 1;
```

Los diagnósticos deben incluir:

| Código | Motivo |
| --- | --- |
| `SEM003` | inicializador `string` incompatible con `integer` |
| `SEM001` | identificador `noExiste` no declarado |
| `SEM005` | condición de `if` no booleana |
| `SEM010` | `break` fuera de ciclo o `switch` |
| `SEM009` | `return` fuera de función |

Resultado de fases:

```text
Lexer: completado
Parser: completado
Semántica: con errores
TAC: skipped
MIPS: skipped
```

Para una batería semántica más grande también se puede abrir:

```text
examples/semantic/semantic_errors.cps
```

### E05 — Seguridad de tipos en arreglos mutables

```cps
class Base {
  let x: integer = 1;
}

class Hija: Base {
  let y: integer = 2;
}

let hijas: Hija[] = [new Hija()];
let bases: Base[] = hijas;
```

Resultado esperado:

- diagnóstico `SEM003` en la última asignación;
- TAC y MIPS omitidos.

Los arreglos son mutables, por lo que `Hija[]` no debe tratarse como `Base[]`.

### E06 — Error de runtime no capturado

```cps
let numeros: integer[] = [1];
print(numeros[-1]);
print(99);
```

Salida exacta:

```text
Runtime error: array index out of bounds
```

`99` no debe imprimirse y MARS no debe mostrar una excepción interna por acceso inválido a memoria.

## 5. Robustez extrema

### R01 — Anidamiento patológico

Generar un archivo con 300 paréntesis mediante PowerShell:

```powershell
$entrada = "print(" + ("(" * 300) + "1" + (")" * 300) + ");"
Set-Content -LiteralPath profundidad.cps -Value $entrada -Encoding UTF8
```

Resultado esperado:

- un único error que indica que se excedió el límite seguro de 256 niveles;
- la aplicación no se congela ni muestra `RangeError`;
- semántica, TAC y MIPS quedan omitidos;
- ensamblador vacío.

## 6. Comprobaciones específicas de la interfaz

### I01 — Flujo GUI obligatorio

1. Iniciar la aplicación con `npm.cmd run dev` o `npm.cmd run desktop`.
2. Seleccionar **Archivo → Cargar .cps**.
3. Elegir `examples/tac/13_programa_integral.cps`.
4. Ejecutar la compilación.
5. Confirmar dentro de la interfaz:
   - tokens reconocidos;
   - árbol sintáctico;
   - diagnósticos semánticos;
   - tabla de símbolos y ámbitos;
   - instrucciones TAC;
   - bloques básicos y frames;
   - ensamblador MIPS;
   - métricas de registros y mirilla.
6. Descargar `compiscript.asm`.
7. Ejecutarlo en MARS y comprobar `2`, `6`, `12`.
8. Cargar `examples/mips/05_bloqueo_por_errores.cps`.
9. Confirmar que los diagnósticos aparecen dentro de la GUI y que la descarga MIPS queda deshabilitada.

## 7. Evidencia de llamadas, registros y mirilla

Con V03 o V04, inspeccionar el ensamblador y el panel MIPS.

Se espera encontrar:

```text
addiu $sp, $sp, -...
sw $fp, ...($sp)
sw $ra, ...($sp)
move $fp, $sp
jal ...
jr $ra
```

El panel debe mostrar:

- asignaciones realizadas por `getReg()`;
- máximo de registros temporales simultáneos;
- cantidad de spills;
- instrucciones antes y después de mirilla;
- optimizaciones eliminadas.

Para ejecutar las pruebas estructurales del backend y la suite dedicada de mirilla:

```powershell
npm.cmd test -- src/__tests__/mips.test.ts src/__tests__/peephole.test.ts
```

Resultado esperado:

```text
2 archivos aprobados
25 pruebas aprobadas
```

La suite de mirilla comprueba las ocho transformaciones exigibles de forma aislada, confirma que instrucciones parecidas pero necesarias no se eliminan, verifica idempotencia y garantiza que el optimizador no muta la entrada. La suite MARS posterior valida los efectos colaterales sobre la salida observable del programa completo.

## 8. Tercera auditoría de regresión

Esta suite fuerza combinaciones que suelen revelar efectos colaterales entre semántica, TAC, frames y backend:

```powershell
$env:MARS_JAR = "C:\Herramientas\Mars4_5.jar"
$env:REQUIRE_MARS = "1"
npm.cmd test -- --run src/__tests__/third.audit.test.ts
```

Resultado esperado:

```text
1 archivo aprobado
17 pruebas aprobadas
12 ejecuciones reales en MARS
```

Entre las salidas fijadas se encuentran Fibonacci `21`, método recursivo `32`, herencia de tres niveles `child` y `9`, closure de método que retiene `this` con salida `12`, handlers anidados `inner`, `outer`, `done`, y alias de arreglo de strings `a!`, `a`, `a!`. Las cinco comprobaciones restantes validan la estructura de árboles de activación, estadísticas de registros, ocho reglas de mirilla, captura semántica de `this` y bloqueo de TAC/MIPS ante múltiples errores.

## 9. Cuarta auditoría de regresión

La cuarta suite busca fallos cruzados que no estaban cubiertos por los escenarios anteriores:

```powershell
$env:MARS_JAR = "C:\Herramientas\Mars4_5.jar"
$env:REQUIRE_MARS = "1"
npm.cmd test -- --run src/__tests__/fourth.audit.test.ts
```

Resultado esperado:

```text
1 archivo aprobado
18 pruebas aprobadas
12 ejecuciones reales en MARS
```

Las seis comprobaciones estructurales verifican determinismo después de compilar una entrada inválida, resolución de etiquetas, captura transitiva de `this` y locales, acumulación de errores semánticos, recuperación acotada y coherencia entre instrucciones eliminadas y métricas de mirilla. Las doce ejecuciones fijan salidas para `do-while`, `switch`, closures de método, métodos almacenados, objetos polimórficos en arreglos, tres constructores encadenados, excepciones durante recursión, retorno desde `catch`, diez parámetros, ternarios con efectos laterales, strings y matrices con alias.

Esta auditoría detectó y corrigió una línea vacía espuria después de `print(err)`: los mensajes capturables ya no llevan un salto interno, mientras que el error no capturado conserva una terminación de línea antes de finalizar MARS.

## 10. Quinta auditoría de regresión

La quinta suite intenta romper los contratos cruzados que permanecían menos ejercitados y fija el comportamiento de referencias de método enlazadas:

```powershell
$env:MARS_JAR = "C:\Herramientas\Mars4_5.jar"
$env:REQUIRE_MARS = "1"
npm.cmd test -- --run src/__tests__/fifth.audit.test.ts
```

Resultado esperado:

```text
1 archivo aprobado
18 pruebas aprobadas
12 ejecuciones reales en MARS
```

Las seis comprobaciones estructurales verifican destinos TAC y CFG cerrado, slots estables de vtable y offsets de campos en tres niveles, propagación de `symbolId` bajo `shadowing`, alineación de un frame con doce parámetros, diagnósticos semánticos deterministas y balance de funciones y temporales. Las doce ejecuciones fijan división y módulo con signo, evaluación izquierda-a-derecha, arreglos de closures independientes, método enlazado que conserva el receptor, despacho virtual heredado, `continue` dentro de `switch`, limpieza del handler al hacer `break`, sombreado del identificador de `catch`, closure recursivo mutable, matrices float con alias, concatenación capturada y cortocircuito con objeto nulo.

Esta auditoría detectó que `let f = objeto.metodo` conservaba la dirección de código, pero no el objeto receptor. El descriptor enlazado ahora contiene ambos valores y la llamada `f()` sigue usando el receptor original aunque la variable `objeto` se reasigne a `null`.

## 11. Sexta auditoría de regresión

La sexta suite vuelve a recorrer el pipeline después del ajuste visual que permite solicitar la vista TAC sin detener la generación MIPS:

```powershell
$env:MARS_JAR = "C:\Herramientas\Mars4_5.jar"
$env:REQUIRE_MARS = "1"
npm.cmd test -- --run src/__tests__/sixth.audit.test.ts
```

Resultado esperado:

```text
1 archivo aprobado
18 pruebas aprobadas
12 ejecuciones reales en MARS
```

Las seis comprobaciones estructurales verifican que todas las selecciones de la GUI ejecutan el modo MIPS, que la selección TAC conserva esa pestaña como resultado visible, que una entrada inválida bloquea TAC y MIPS, que un frame con dieciséis parámetros permanece alineado y dentro de los registros permitidos, que los padres de los registros de activación son válidos y que las etiquetas y métricas de las ocho reglas de mirilla son coherentes. Las doce ejecuciones MARS fijan salidas para variables y constantes, aritmética con signo y float, cortocircuito, matrices y límites capturados, todas las estructuras de control, dieciséis parámetros, recursión mutua, métodos enlazados, despacho dinámico desde arreglos, handlers anidados, closures independientes y un programa integral de la rúbrica.

Durante el diseño de la suite se corrigieron cinco expectativas de prueba que no correspondían a Compiscript: un conteo manual, la inferencia invariante de arreglos, una concatenación string-entero no permitida, un acceso directo con sintaxis inválida y una condición integral. Después de ajustar esas entradas válidas no apareció una regresión del compilador; las 18 pruebas y sus salidas pasaron sin cambios adicionales al backend.

## 12. Verificación automatizada completa

Con Java y `tools/Mars4_5.jar` disponibles:

```powershell
$env:REQUIRE_MARS = "1"
npm.cmd run verify
```

Resultado esperado de la versión documentada:

```text
TypeScript: aprobado
Archivos de prueba: 21 aprobados
Pruebas: 332 aprobadas
Ejecuciones MARS incluidas: 100
Build de producción: aprobado
```

Auditoría de dependencias:

```powershell
npm.cmd audit --omit=dev --audit-level=moderate
```

Resultado de producción esperado:

```text
found 0 vulnerabilities
```

El comando anterior debe ejecutarse como `npm.cmd audit --omit=dev --audit-level=moderate`. La auditoría completa reporta actualmente 15 avisos moderados en herramientas transitivas de `electron-builder` por `minimatch`; no forman parte del runtime distribuido y la única corrección automática propuesta por npm es una degradación mayor incompatible, por lo que se documentan en lugar de aplicar `--force`.

## 13. Criterio de aceptación final

La entrega puede considerarse lista cuando:

- todos los casos V01–V14 producen las salidas indicadas;
- E01–E05 reportan varios errores útiles sin generar TAC/MIPS;
- E06 termina de forma controlada sin una excepción interna de MARS;
- R01 produce un diagnóstico normal sin bloquear la aplicación;
- I01 demuestra selección de archivo y resultados dentro de la GUI;
- la suite completa aprueba 332 pruebas en 21 archivos, incluidas las 100 ejecuciones MARS;
- el build termina correctamente y la auditoría de dependencias de producción informa cero vulnerabilidades.
