import { AlertCircle, AlertOctagon, BrainCircuit, CheckCircle, Cpu, Edit3, Split } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { exampleCase } from "../../lib/examples";
import type { AnalysisMode } from "../../lib/types";

interface CaseOption {
  id: AnalysisMode;
  label: string;
  icon: ReactNode;
  description: string;
}

const cases: CaseOption[] = [
  {
    id: "valid",
    label: "Entrada válida",
    icon: <CheckCircle size={14} />,
    description: "Programa válido compilado automáticamente hasta MIPS32 para MARS."
  },
  {
    id: "lexical",
    label: "Errores léxicos",
    icon: <AlertCircle size={14} />,
    description: exampleCase.lexicalErrorDescription
  },
  {
    id: "syntax",
    label: "Errores sintácticos",
    icon: <AlertOctagon size={14} />,
    description: exampleCase.syntaxErrorDescription
  },
  {
    id: "tac",
    label: "Generación TAC",
    icon: <Split size={14} />,
    description: "Destaca instrucciones de tres direcciones, temporales, etiquetas y marcos; después continúa automáticamente hasta MIPS."
  },
  {
    id: "mips",
    label: "Backend MIPS / MARS",
    icon: <Cpu size={14} />,
    description: "Ejecuta lexer, parser, semántica y TAC antes de generar ensamblador MIPS para MARS."
  },
  {
    id: "semantic-error",
    label: "Errores semánticos",
    icon: <BrainCircuit size={14} />,
    description: exampleCase.semanticErrorDescription
  },
  {
    id: "custom",
    label: "Archivo propio",
    icon: <Edit3 size={14} />,
    description: "Escribe, pega o selecciona un .cps y compílalo automáticamente hasta MIPS."
  }
];

interface ExamplesExplorerProps {
  value: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
}

export function ExamplesExplorer({ value, onChange }: ExamplesExplorerProps) {
  const active = cases.find((item) => item.id === value);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {cases.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                "group flex w-full items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-left text-xs text-muted-foreground transition hover:border-border hover:bg-accent hover:text-foreground",
                value === item.id && "border-primary/20 bg-primary/12 text-foreground shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/15"
              )}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {active && <p className="rounded-xl border border-border bg-background/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">{active.description}</p>}
    </div>
  );
}
