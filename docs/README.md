# Documentación del Proyecto 3

La documentación vigente describe el pipeline completo de Compiscript hasta MIPS32/MARS. El diseño TAC, las decisiones semánticas, los ejemplos y los recursos gráficos heredados se conservan porque forman parte de la implementación actual.

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

## Verificación reproducible

```powershell
npm.cmd ci
npm.cmd run verify
npm.cmd run cli -- examples/mips/07_recursion.cps --mode mips --out factorial.asm
npm.cmd run mars -- factorial.asm C:\ruta\Mars4_5.jar
```

Salida esperada del último comando: `120`.
