# Documentación del Proyecto 3

La documentación vigente describe el pipeline completo de Compiscript hasta MIPS32/MARS. Los materiales de Proyectos 1 y 2 se conservan como historial del frontend y de TAC, pero no sustituyen los documentos actuales.

| Documento | Contenido |
| --- | --- |
| [`../README.md`](../README.md) | instalación, uso, comandos, ejemplos y estado verificable |
| [`ARQUITECTURA_MIPS_PROYECTO_3.md`](ARQUITECTURA_MIPS_PROYECTO_3.md) | ABI, frames, registros, memoria, runtime y mirilla |
| [`MATRIZ_REQUISITOS.md`](MATRIZ_REQUISITOS.md) | trazabilidad del enunciado a código y pruebas |
| [`AUDITORIA_PROYECTO_3.md`](AUDITORIA_PROYECTO_3.md) | hallazgos, correcciones y ejecuciones MARS |
| [`../TAC_DESIGN.md`](../TAC_DESIGN.md) | diseño de la representación intermedia heredada |
| [`DECISIONES_SEMANTICAS.md`](DECISIONES_SEMANTICAS.md) | decisiones de tipos y reglas de Compiscript |
| [`../examples/mips/README.md`](../examples/mips/README.md) | batería del backend y salidas esperadas |
| [`../presentation/compiscript-proyecto-3.html`](../presentation/compiscript-proyecto-3.html) | presentación navegable del Proyecto 3 |
| [`informe/INFORME_PROYECTO_03.pdf`](informe/INFORME_PROYECTO_03.pdf) | informe técnico compilado del Proyecto 3 |
| [`informe/INFORME_PROYECTO_03.tex`](informe/INFORME_PROYECTO_03.tex) | informe técnico actual en LaTeX |

## Historial

- `informe/INFORME_PROYECTO_01.*`: lexer, parser y semántica inicial;
- `informe/INFORME_PROYECTO_02.*`: TAC, CFG, frames y layouts;
- `ARQUITECTURA_PROYECTO_2.md` y `AUDITORIA_PROYECTO_2.md`: cierre del Proyecto 2.

Estos archivos tienen valor histórico y sus cifras/versiones corresponden a sus entregas. La versión actual es 3.0.0 y su evidencia vigente está en la auditoría del Proyecto 3.

## Verificación reproducible

```powershell
npm.cmd ci
npm.cmd run verify
npm.cmd run cli -- examples/mips/07_recursion.cps --mode mips --out factorial.asm
npm.cmd run mars -- factorial.asm C:\ruta\Mars4_5.jar
```

Salida esperada del último comando: `120`.
