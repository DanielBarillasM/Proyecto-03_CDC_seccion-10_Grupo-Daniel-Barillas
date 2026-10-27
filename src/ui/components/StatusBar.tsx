import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { AnalyzeResult } from "../../lib/types";

interface StatusBarProps {
  isRunning: boolean;
  result: AnalyzeResult | null;
  value: string;
  cursor: { line: number; column: number };
}

export function StatusBar({ isRunning, result, value, cursor }: StatusBarProps) {
  const lineCount = value.split("\n").length;
  const isEmpty = value.trim().length === 0;

  const state = isRunning
    ? { icon: <Loader2 size={12} className="animate-spin" />, label: "Analizando…", color: "text-cyan-700 dark:text-cyan-300" }
    : !result
      ? { icon: <CircleDashed size={12} />, label: "Esperando ejecución", color: "text-muted-foreground" }
      : result.accepted
        ? { icon: <CheckCircle2 size={12} />, label: "Aceptado", color: "text-emerald-700 dark:text-emerald-300" }
        : { icon: <XCircle size={12} />, label: "Con diagnósticos", color: "text-red-700 dark:text-red-300" };

  return (
    <div className="flex h-8 items-center justify-between rounded-xl border border-border bg-card/65 px-3 text-[10px] shadow-lg backdrop-blur-xl">
      <div className={`flex items-center gap-1.5 font-semibold ${state.color}`}>
        {state.icon}
        <span>{state.label}</span>
      </div>
      <div className="flex items-center gap-3 font-mono text-muted-foreground">
        <span>{isEmpty ? "Esperando código" : "Entrada lista"}</span>
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span>
          {lineCount} {lineCount === 1 ? "línea" : "líneas"} · {value.length} caracteres
        </span>
        <span className="hidden items-center gap-1.5 sm:flex"><span className="glow-dot" /> Compiscript 3.0</span>
      </div>
    </div>
  );
}
