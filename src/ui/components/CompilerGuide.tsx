import { Braces, CheckCircle2, Cpu, Database, GitBranch, ScanSearch, Split } from "lucide-react";
import type { ReactNode } from "react";

interface Phase {
  number: string;
  title: string;
  description: string;
  icon: ReactNode;
}

const phases: Phase[] = [
  {
    number: "01",
    title: "Análisis léxico",
    description: "Convierte caracteres en tokens y localiza símbolos no reconocidos.",
    icon: <ScanSearch size={16} />
  },
  {
    number: "02",
    title: "Análisis sintáctico",
    description: "Valida la estructura con ANTLR y construye el árbol de parseo.",
    icon: <Braces size={16} />
  },
  {
    number: "03",
    title: "Análisis semántico",
    description: "Resuelve nombres, tipos, ámbitos, flujo, funciones y clases.",
    icon: <GitBranch size={16} />
  },
  {
    number: "04",
    title: "Código intermedio TAC",
    description: "Descompone operaciones, crea temporales y etiquetas, y asigna registros de activación.",
    icon: <Split size={16} />
  },
  {
    number: "05",
    title: "Ensamblador MIPS32",
    description: "Traduce TAC, administra pila y registros, aplica mirilla y produce un .asm para MARS.",
    icon: <Cpu size={16} />
  }
];

export function CompilerGuide() {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Del código a MIPS32</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Ejecuta las fases en orden. TAC y MIPS solo se generan cuando las fases anteriores terminan sin errores.
        </p>
      </div>

      <ol className="relative flex flex-col gap-1 before:absolute before:bottom-4 before:left-[18px] before:top-4 before:w-px before:bg-gradient-to-b before:from-primary/60 before:to-cyan-300/15">
        {phases.map((phase) => (
          <li key={phase.number} className="relative flex items-start gap-2.5 rounded-xl border border-transparent bg-transparent p-2 transition hover:border-border hover:bg-accent/55">
            <span className="z-10 flex size-5 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-background font-mono text-[8px] text-primary">{phase.number}</span>
            <span className="mt-0.5 text-muted-foreground">{phase.icon}</span>
            <span className="min-w-0">
              <strong className="block text-[11px] font-semibold text-foreground">{phase.title}</strong>
              <span className="block text-[10px] leading-relaxed text-muted-foreground">{phase.description}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-1 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/10 to-cyan-300/5 p-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Database size={14} /> Resultados
        </div>
        <p className="text-muted-foreground">
          Diagnósticos, símbolos, ámbitos, TAC, CFG, frames y ensamblador listo para MARS 4.5.
        </p>
        <span className="flex items-center gap-1 text-muted-foreground">
          <CheckCircle2 size={12} /> Ctrl + Enter ejecuta el análisis
        </span>
      </div>
    </div>
  );
}
