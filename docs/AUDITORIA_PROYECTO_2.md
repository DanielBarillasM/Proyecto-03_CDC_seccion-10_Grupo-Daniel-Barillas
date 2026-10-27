# Auditoría técnica del frontend heredado y Proyecto 2

**Última verificación:** 4 de octubre de 2026, sobre la versión 2.0.0 del Proyecto 2 con generación TAC integrada.

## Resultado ejecutivo

La revisión contrastó el proyecto con el README del lenguaje, la gramática ANTLR, los requisitos de análisis semántico y la rúbrica proporcionada. Se conservó la arquitectura real React + Vite + TypeScript + Electron y se corrigieron defectos de semántica, gramática, casos integrados, experiencia de uso y documentación.

Estado final verificado:

- `npm run check`: aprobado;
- Línea base actual: 167 pruebas aprobadas en 12 archivos de prueba, incluida la generación TAC, el CFG y constructores implícitos/heredados;
- `npm run build`: aprobado;
- parser regenerado desde la gramática activa;
- generador TAC conectado al CST y a la información semántica;
- temporales reutilizables, etiquetas, bloques básicos, aristas de flujo, layouts de clase y registros de activación;
- CLI, interfaz, exportaciones, ejemplos y documentación actualizados para la cuarta fase;
- archivos `.cps` cargados o editados ejecutan el pipeline completo y generan TAC cuando son válidos;
- informe heredado del Proyecto 1 identificado como material histórico, no como evidencia completa de TAC.

## Evidencia reproducible del cierre

La verificación final se ejecutó desde una instalación limpia en la carpeta de entrega, con Node.js 22.23.3 y npm 10.9.9:

| Comprobación | Resultado observado |
| --- | --- |
| `npm ci` | 489 paquetes instalados; auditoría de npm sin vulnerabilidades |
| `npm run check` | TypeScript finalizó sin errores |
| `npm test` | 12 archivos y 167 pruebas aprobadas con Vitest 5.0.2 |
| `npm run cli:tac` | caso integral aceptado: 53 instrucciones, 14 bloques, 8 aristas y 4 frames |
| `npm run build` | build de producción aprobado; el conteo de módulos se considera informativo y puede variar entre revisiones |
| Revisión en navegador | ejemplo TAC integrado aceptado con 74 instrucciones, 23 bloques y 5 frames —incluido el constructor implícito heredado de `Perro`—; carga real de `08_switch_try.cps` aceptada con 25 instrucciones y 9 bloques; carga real de `16_error_semantico.cps` reportó 2 errores y omitió TAC con causa explícita |
| Consola del navegador | 0 errores y 0 advertencias |
| Informe técnico | 81 páginas; 0 desbordamientos, referencias o citas indefinidas |
| Enlaces y workflow | enlaces Markdown locales existentes y YAML del workflow válido |

El aviso de Vite sobre el tamaño del chunk principal permanece como recomendación de rendimiento: Monaco Editor se distribuye localmente y concentra gran parte del bundle. No invalida el build ni las pruebas funcionales.

## Hallazgos y correcciones

| Prioridad | Área | Hallazgo | Corrección | Evidencia |
| --- | --- | --- | --- | --- |
| Crítica | Clases y ámbitos | Las clases se consultaban desde un registro global por nombre; una clase local podía verse fuera del bloque y nombres iguales colisionaban entre ámbitos hermanos. | Cada declaración recibe `classId`; el nombre se declara y resuelve mediante `ScopeManager`. | Regresiones de clase local y clases homónimas. |
| Alta | Tipos de instancia | La igualdad usaba únicamente el nombre textual de la clase. | Los tipos de clase e instancia conservan la identidad de declaración. | Clases hermanas no se confunden. |
| Alta | Inferencia de campos | Un método podía usar un campo antes de que su inicializador fuera analizado, haciendo el resultado dependiente del orden. | Se procesan campos antes que métodos y se restaura el orden del árbol presentado. | Regresión de campo declarado después del método. |
| Alta | Retornos | Las funciones sin anotación se trataban como `void`. | Se recopilan retornos observados, se calcula un tipo común y se actualiza la firma. | Regresión de retorno `integer` inferido. |
| Alta | Referencias | Accesos a clases, campos y métodos no actualizaban todos los contadores. | Miembros conservan `symbolId` y cada resolución registra la referencia real. | Prueba de referencias de clase/campo/método. |
| Crítica | Archivo propio y TAC | Editar o cargar un `.cps` cambiaba la fuente a modo `custom`, pero `App` solicitaba únicamente análisis semántico; el evaluador no podía generar TAC para su archivo desde la GUI. | `App` ejecuta siempre `analyzeInput(..., "tac")` sobre la fuente visible y abre TAC cuando se completa o muestra la causa del bloqueo. | Pruebas TAC reutilizan la misma llamada que el IDE; verificación real del selector `.cps`. |
| Alta | Tabla de símbolos | No existía una operación pública y acotada para demostrar actualización. | Se añadió `updateSymbol` con invariantes de identidad y se reutiliza en inicialización/captura. | Suite directa de `ScopeManager`. |
| Alta | Gramática | La gramática activa aceptaba instrucciones sin bloque en estructuras de control, a diferencia del archivo oficial adjunto. | `if`, ciclos y `foreach` vuelven a requerir `block`; se regeneró ANTLR. | Prueba sintáctica de llaves obligatorias. |
| Alta | Ejemplos | El ejemplo integral y el caso de recursión usaban `if` sin llaves, por lo que fallaron después de alinear la gramática. | Se actualizaron ejemplos, fixture integrado y prueba de recursión. | Suite integral aprobada. |
| Media | UI | Editor, gramática y resultados extensos competían en una pila difícil de leer. | Workbench con guía lateral, gramática plegable, editor dominante y explorador por pestañas. | Build de Vite y revisión de componentes. |
| Media | UI | Faltaban acciones y señales básicas del editor. | Copia con confirmación, indicador de preparación, guía de atajos y estados del pipeline. | `EditorTabs`, `CompilerGuide`, `MenuBar`. |
| Media | Documentación | El README indicaba ejecutar npm desde la raíz, aunque `package.json` está en la subcarpeta. | Comandos y estructura corregidos; se añadieron matriz, informe y presentación. | Documentos vigentes enlazados. |
| Media | Presentación | No existía un material autocontenido para explicar diseño, teoría y demostración. | Presentación HTML navegable, imprimible y con notas del expositor, actualizada con TAC y CFG. | `presentation/compiscript-proyecto-2.html`. |
| Baja | Estilo | Había emojis en documentación heredada y elementos decorativos de la UI. | Se eliminan emojis del texto fuente; la UI utiliza iconos vectoriales consistentes. | Búsqueda Unicode final. |
| Crítica | Generación TAC | El generador inicial extraía texto crudo de nodos y producía operandos incorrectos en declaraciones, `print`, ciclos, retornos y expresiones. | Se reemplazó por un recorrido dirigido por sintaxis de los contextos ANTLR, con precedencia, lvalues, control de flujo, llamadas, arreglos, clases y closures. | `generator.ts` y `tac.test.ts`. |
| Alta | Almacenamiento | Los registros se construían después de emitir instrucciones, por lo que los operandos no incluían frame ni offset. | Los frames y layouts se preparan antes de emitir; símbolos y temporales quedan asociados a almacenamiento abstracto. | Inspector TAC, exportaciones y pruebas de storage. |
| Alta | Flujo TAC | Los bloques se reconstruían dentro de React y `RETURN` podía mostrar una caída inexistente. | `controlFlow.ts` construye bloques y aristas en el núcleo TAC; los terminadores no tienen sucesor y la UI consume el resultado probado. | `tac.test.ts`, `TacGenerationResult`, `TacVisualPanel`. |
| Crítica | Constructores TAC | Una clase sin constructor emitía una llamada a una etiqueta inexistente y una hija con constructor heredado omitía sus campos propios. | Cada clase recibe un constructor TAC invocable; el constructor implícito encadena al padre, reenvía parámetros e inicializa los campos propios. | Regresiones de constructor implícito y herencia en `tac.test.ts`. |
| Media | UI TAC | La cuarta fase no aparecía de forma consistente y la pestaña activa podía quedar fuera del ancho visible. | Pipeline ordenado Lexer → Parser → Semántica → TAC y barra desplazable que centra la pestaña activa. | Revisión automatizada del build en navegador. |

## Decisiones conservadas

### Tipo `float`

El requisito semántico lo exige aunque la gramática base no lo incluya. Se mantiene como extensión explícita con literal decimal y promoción segura `integer -> float`.

### `switch`

Se conserva el discriminante escalar porque el ejemplo oficial utiliza `case 1` y la gramática acepta cualquier expresión. Cada caso debe ser comparable con el discriminante; los valores no escalares producen `SEM021`.

### Cascadas entre fases

Si lexer o parser producen errores, el análisis semántico no se ejecuta. Esta política evita fabricar errores sobre un CST incompleto.

### `break` y `continue`

`break` se permite en ciclos y `switch`; `continue` solo en ciclos. Es coherente con la estructura de control de lenguajes de la familia C/TypeScript.

## Distribución de pruebas

| Archivo | Fase | Cantidad |
| --- | --- | ---: |
| `semantic/semanticAnalyzer.test.ts` | semántico | 84 |
| `semantic/scopeManager.test.ts` | semántico | 4 |
| `semantic/projectExamples.test.ts` | semántico | 8 |
| `lexer.test.ts` | léxico | 5 |
| `parser.test.ts` | sintáctico | 9 |
| `rubric.examples.test.ts` | léxico + sintáctico | 8 |
| `testCases.defaults.test.ts` | las cuatro fases + rúbrica | 16 |
| `tac.test.ts` | código intermedio TAC, CFG y constructores | 17 |
| `downloads.test.ts` | exportación íntegra de resultados | 5 |
| `nativeControls.test.tsx` | controles nativos y accesibilidad | 5 |
| `tacVisual.test.tsx` | visualización de bloques y destinos | 3 |
| `uiVariants.test.tsx` | variantes visuales de componentes | 3 |
| Total | | 167 |

Las pruebas semánticas incluyen programas válidos, diagnósticos `SEM001`–`SEM023`, flujo, arreglos, funciones, closures, herencia, constructores, identidad de clases, inferencia y referencias. La suite de ejemplos garantiza además que los archivos de exposición siguen siendo ejecutables y producen sus códigos documentados. Las pruebas directas de tabla de símbolos demuestran las cuatro operaciones solicitadas en la rúbrica: insertar, recuperar, actualizar y manejar alcances.

## Build

El build de producción finaliza correctamente. Vite advierte que el chunk JavaScript principal supera 500 kB; es una recomendación de optimización, no un error funcional. El volumen proviene principalmente de Monaco Editor, que se empaqueta localmente para funcionar sin CDN. La cantidad exacta de módulos transformados se conserva en la salida de cada build, pero no se usa como criterio estable porque cambia con ajustes menores de dependencias.

## Empaquetado multiplataforma

`npm run exe:portable` genera el portable Windows x64; `npm run exe:mac` genera ZIP y DMG sin firma para Intel y Apple Silicon; `npm run exe:linux` genera AppImage x64. Los paquetes macOS se producen en una Mac o runner macOS. El AppImage se genera en Linux nativo o mediante el runner correspondiente. El workflow `Verify and release` ejecuta primero TypeScript, Vitest, el build y el caso integral TAC; luego empaqueta las tres plataformas y rechaza cualquier job que no produzca el artefacto esperado. Un tag `v*` publica los archivos en GitHub Releases.

Por decisión de alcance de esta auditoría no se generó ningún ejecutable local. La configuración de Electron Builder y la sintaxis del workflow fueron revisadas, pero la producción efectiva de los artefactos Windows, macOS y Linux debe confirmarse al ejecutar el workflow en sus runners nativos. Esta distinción evita presentar configuración estática como evidencia de empaquetado exitoso.

El [release V1.2.0](https://github.com/DanielBarillasM/Proyecto-01_CDC_seccion-10_Grupo-DragonsSlayers-2.0/releases/tag/Compiscript-Semantic-IDE-V1.2.0) corresponde al Proyecto 1 y no contiene esta implementación TAC. El Proyecto 2 usa la versión 2.0.0; mientras no exista un tag publicado, sus artefactos deben compilarse desde el código fuente vigente o descargarse desde una ejecución manual del workflow.

## Límite de esta auditoría

La autoría individual solo puede verificarse en el historial real de Git. No se modificaron commits ni se atribuyeron contribuciones desde la documentación. Ese criterio debe revisarse manualmente antes de la entrega, tal como exige el enunciado.
