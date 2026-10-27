import { CheckCircle2, MinusCircle, TriangleAlert, XCircle } from "lucide-react";
import type { AnalyzeResult } from "../../lib/types";

type PhaseState = "ok" | "warning" | "error" | "skipped" | "not-run" | "idle";

const STATE_STYLES: Record<PhaseState, string> = {
  ok: "border-emerald-500/25 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/25 bg-amber-400/10 text-amber-800 dark:text-amber-300",
  error: "border-red-500/25 bg-red-400/10 text-red-700 dark:text-red-300",
  skipped: "border-border bg-background/40 text-muted-foreground",
  "not-run": "border-border bg-background/40 text-muted-foreground",
  idle: "border-border bg-transparent text-muted-foreground"
};

export function PhasePipeline({ result }: { result: AnalyzeResult | null }) {
  if (!result) {
    return (
      <div className="flex items-center gap-1" aria-label="Estado de las fases de compilación">
        <PhaseStep label="Lexer" state="idle" detail="sin ejecutar" />
        <Arrow />
        <PhaseStep label="Parser" state="idle" detail="sin ejecutar" />
        <Arrow />
        <PhaseStep label="Semántica" state="idle" detail="sin ejecutar" />
        <Arrow />
        <PhaseStep label="TAC" state="idle" detail="sin ejecutar" />
        <Arrow />
        <PhaseStep label="MIPS / MARS" state="idle" detail="sin ejecutar" />
      </div>
    );
  }

  const { summary } = result;
  const isLexerMode = result.mode === "lexer";
  const isSemanticMode = result.mode === "semantic" || result.mode === "tac" || result.mode === "mips";
  const isTacMode = result.mode === "tac" || result.mode === "mips";
  const isMipsMode = result.mode === "mips";

  const lexerState: PhaseState = summary.lexicalErrorCount > 0 ? "error" : "ok";
  const parserState: PhaseState = isLexerMode
    ? "not-run"
    : summary.syntaxErrorCount > 0
      ? "error"
      : summary.lexicalErrorCount > 0
        ? "warning"
        : "ok";
  const semanticState: PhaseState = !isSemanticMode
    ? "not-run"
    : result.semantic.status === "skipped"
      ? "skipped"
      : summary.semanticErrorCount > 0
        ? "error"
        : summary.semanticWarningCount > 0
          ? "warning"
          : "ok";
  const tacState: PhaseState = !isTacMode
    ? "not-run"
    : result.tac.status === "skipped"
      ? "skipped"
      : result.tac.status === "failed"
        ? "error"
        : result.tac.status === "completed"
          ? "ok"
          : "not-run";
  const mipsState: PhaseState = !isMipsMode || result.mips.status === "not-requested"
    ? "not-run"
    : result.mips.status === "skipped"
      ? "skipped"
      : result.mips.status === "failed"
        ? "error"
        : result.mips.status === "completed"
          ? result.mips.diagnostics.some((diagnostic) => diagnostic.severity === "warning") ? "warning" : "ok"
          : "not-run";

  return (
    <div className="flex items-center gap-1" aria-label="Estado de las fases de compilación">
      <PhaseStep label="Lexer" state={lexerState} detail={`${summary.lexicalErrorCount} errores`} />
      <Arrow />
      <PhaseStep
        label="Parser"
        state={parserState}
        detail={isLexerMode ? "no solicitado" : `${summary.syntaxErrorCount} errores`}
      />
      <Arrow />
      <PhaseStep
        label="Semántica"
        state={semanticState}
        detail={
          !isSemanticMode
            ? "no solicitada"
            : result.semantic.status === "skipped"
              ? "omitida"
              : `${summary.semanticErrorCount} errores · ${summary.semanticWarningCount} warnings`
        }
      />
      <Arrow />
      <PhaseStep
        label="TAC"
        state={tacState}
        detail={
          !isTacMode
            ? "no solicitado"
            : result.tac.status === "completed"
              ? `${result.tac.metrics.instructionCount} instrucciones`
              : result.tac.status === "skipped"
                ? "omitido"
                : result.tac.status === "failed"
                  ? "falló"
                  : "sin ejecutar"
        }
      />
      <Arrow />
      <PhaseStep
        label="MIPS / MARS"
        state={mipsState}
        detail={
          !isMipsMode
            ? "no solicitado"
            : result.mips.status === "completed"
              ? `${result.mips.optimizedInstructionCount} instrucciones · listo para MARS`
              : result.mips.status === "skipped"
                ? "omitido por errores previos"
                : result.mips.status === "failed"
                  ? "falló la generación"
                  : "sin ejecutar"
        }
      />
    </div>
  );
}

function Arrow() {
  return (
    <span className="h-px w-3 bg-gradient-to-r from-border to-primary/35" aria-hidden="true" />
  );
}

function PhaseStep({ label, state, detail }: { label: string; state: PhaseState; detail: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs shadow-inner backdrop-blur-sm ${STATE_STYLES[state]}`}>
      {state === "ok" && <CheckCircle2 size={13} />}
      {state === "warning" && <TriangleAlert size={13} />}
      {state === "error" && <XCircle size={13} />}
      {(state === "skipped" || state === "not-run" || state === "idle") && <MinusCircle size={13} />}
      <span className="flex flex-col leading-none">
        <strong className="font-head text-[10px] font-semibold uppercase tracking-[0.08em]">{label}</strong>
        <span className="max-w-28 truncate text-[9px] opacity-70">{detail}</span>
      </span>
    </div>
  );
}
