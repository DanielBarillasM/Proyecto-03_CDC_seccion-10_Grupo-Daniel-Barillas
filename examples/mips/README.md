# Ejemplos MIPS32 / MARS del Proyecto 3

Todos los casos positivos se compilan desde Compiscript a TAC y después a MIPS32. Para generar y ejecutar uno:

```powershell
npm.cmd run cli -- examples/mips/01_aritmetica.cps --mode mips --out programa.asm
npm.cmd run mars -- programa.asm C:\ruta\Mars4_5.jar
```

| Archivo | Objetivo | Salida esperada |
| --- | --- | --- |
| `01_aritmetica.cps` | enteros y precedencia | `14` |
| `02_funciones_y_pila.cps` | prólogo, parámetros, `jal` y retorno | `42` |
| `03_control_y_arreglos.cps` | heap, longitud, acceso e iteración | `6` |
| `04_cadenas_y_booleanos.cps` | runtime de concatenación e igualdad | `Hola MIPS`, `true` |
| `05_bloqueo_por_errores.cps` | errores mezclados; no debe generar TAC/MIPS | sin `.asm` |
| `06_flotantes.cps` | coprocesador 1 | `4.0` |
| `07_recursion.cps` | frames recursivos | `120` |

Los casos `examples/tac/06_clases.cps`, `07_closure.cps` y `13_programa_integral.cps` completan la cobertura de objetos, métodos, closures y llamadas anidadas.
