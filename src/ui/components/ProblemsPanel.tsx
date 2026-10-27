import { AlertCircle, AlertOctagon, AlertTriangle, CheckCircle2, CircleAlert, ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { SEMANTIC_CODE_CATALOG } from "../../semantic/diagnostics";
import type { SemanticDiagnostic } from "../../semantic/diagnostics";
import type { AnalyzeError, AnalyzeResult } from "../../lib/types";
import { EmptyPanel } from "./EmptyPanel";

interface ProblemsPanelProps {
  result: AnalyzeResult | null;
  onRevealLine: (line: number) => void;
}

type SeverityFilter = "all" | "error" | "warning";

export function ProblemsPanel({ result, onRevealLine }: ProblemsPanelProps) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");

  const totalProblems =
    (result?.lexicalErrors.length ?? 0) +
    (result?.syntaxErrors.length ?? 0) +
    (result?.semantic.diagnostics.length ?? 0) +
    (result?.mips.diagnostics.length ?? 0);

  const filteredSemantic = useMemo(() => {
    if (!result) return [];
    const normalized = query.trim().toLowerCase();
    return result.semantic.diagnostics.filter((diagnostic) => {
      if (severity !== "all" && diagnostic.severity !== severity) return false;
      if (!normalized) return true;
      return [diagnostic.code, SEMANTIC_CODE_CATALOG[diagnostic.code], diagnostic.message, diagnostic.symbol ?? "", diagnostic.hint ?? ""].some(
        (value) => value.toLowerCase().includes(normalized)
      );
    });
  }, [query, result, severity]);

  if (!result) {
    return <EmptyPanel icon={<ListChecks size={22} />} text="Ejecuta el análisis para ver problemas." />;
  }

  const showLexical = severity === "warning" ? [] : matchesQuery(result.lexicalErrors, query);
  const showSyntax = severity === "warning" ? [] : matchesQuery(result.syntaxErrors, query);

  return (
    <div className="flex h-full flex-col bg-card/20">
      <div className="flex min-h-10 items-center gap-2 border-b border-border bg-background/35 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ListChecks size={14} /> {totalProblems} problemas
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" />
            <Input
              name="problems-query"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar código, símbolo o mensaje…"
              aria-label="Buscar problemas"
              className="h-7 w-56 rounded-lg border-border bg-background/45 pl-7 text-xs shadow-none"
            />
          </div>
          <select className="native-select" aria-label="Filtrar por severidad" name="problems-severity" autoComplete="off" value={severity} onChange={(event) => setSeverity(event.target.value as SeverityFilter)}>
            <option value="all">Todos</option>
            <option value="error">Errores</option>
            <option value="warning">Warnings</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {totalProblems === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-400/10 p-3 text-sm text-emerald-700 dark:text-emerald-200">
            <CheckCircle2 size={18} />
            <span>Sin errores léxicos, sintácticos ni semánticos.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {showLexical.length > 0 && (
              <ErrorGroup
                title="Errores léxicos"
                subtitle="Caracteres o lexemas no reconocidos por el lexer"
                errors={showLexical}
                icon={<AlertCircle size={14} />}
                onRevealLine={onRevealLine}
              />
            )}
            {showSyntax.length > 0 && (
              <ErrorGroup
                title="Errores sintácticos"
                subtitle="Secuencias de tokens que no cumplen la gramática"
                errors={showSyntax}
                icon={<AlertOctagon size={14} />}
                onRevealLine={onRevealLine}
              />
            )}
            {result.semantic.status === "skipped" && (
              <div className="rounded-xl border bg-muted/50 p-2 text-xs text-muted-foreground">{result.semantic.skipReason}</div>
            )}
            {filteredSemantic.length > 0 && (
              <div>
                <GroupHeader title="Diagnósticos semánticos" subtitle="Reglas de tipos, nombres y flujo" count={filteredSemantic.length} />
                <div className="flex flex-col gap-1.5">
                  {filteredSemantic.map((diagnostic) => (
                    <DiagnosticRow key={diagnostic.id} diagnostic={diagnostic} onRevealLine={onRevealLine} />
                  ))}
                </div>
              </div>
            )}
            {result.mips.diagnostics.length > 0 && (
              <div>
                <GroupHeader
                  title="Diagnósticos MIPS"
                  subtitle="Traducción de TAC, ABI y ensamblador destino"
                  count={result.mips.diagnostics.length}
                />
                <div className="flex flex-col gap-1.5">
                  {result.mips.diagnostics
                    .filter((diagnostic) => severity === "all" || diagnostic.severity === severity)
                    .filter((diagnostic) => {
                      const normalized = query.trim().toLowerCase();
                      return !normalized || diagnostic.code.toLowerCase().includes(normalized) || diagnostic.message.toLowerCase().includes(normalized);
                    })
                    .map((diagnostic, index) => (
                      <div
                        key={`${diagnostic.code}-${diagnostic.tacIndex ?? index}`}
                        className={`flex flex-col gap-1 rounded-xl border p-2 text-xs ${
                          diagnostic.severity === "error"
                            ? "border-red-500/20 bg-red-400/10 text-red-700 dark:text-red-200"
                            : "border-amber-500/20 bg-amber-400/10 text-amber-800 dark:text-amber-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {diagnostic.severity === "error" ? <CircleAlert size={14} /> : <AlertTriangle size={14} />}
                          <code className="rounded-md border bg-card px-1.5 text-foreground">{diagnostic.code}</code>
                          {diagnostic.tacIndex !== undefined && <span>TAC #{diagnostic.tacIndex}</span>}
                        </div>
                        <p>{diagnostic.message}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function matchesQuery(errors: AnalyzeError[], query: string): AnalyzeError[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return errors;
  return errors.filter((error) => error.message.toLowerCase().includes(normalized));
}

function GroupHeader({ title, subtitle, count }: { title: string; subtitle: string; count: number }) {
  return (
    <div className="mb-1 flex items-baseline gap-2">
      <strong className="font-head text-xs uppercase tracking-wide">{title}</strong>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
      <span className="ml-auto rounded-full border bg-secondary px-2 py-0.5 font-mono text-[10px] text-secondary-foreground">{count}</span>
    </div>
  );
}

function ErrorGroup({
  title,
  subtitle,
  errors,
  icon,
  onRevealLine
}: {
  title: string;
  subtitle: string;
  errors: AnalyzeError[];
  icon: ReactNode;
  onRevealLine: (line: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <strong className="font-head text-xs uppercase tracking-wide">{title}</strong>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
        <span className="ml-auto rounded-full border bg-secondary px-2 py-0.5 font-mono text-[10px] text-secondary-foreground">{errors.length}</span>
      </div>
      <div className="flex flex-col gap-1">
        {errors.map((error, idx) => (
          <button
            key={`${error.source}-${error.line}-${error.column}-${idx}`}
            type="button"
            onClick={() => onRevealLine(error.line)}
            className="flex flex-col items-start gap-0.5 rounded-xl border border-red-500/20 bg-red-400/10 p-2 text-left text-xs text-red-700 transition hover:border-red-500/35 hover:bg-red-400/15 dark:text-red-200"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-red-400/25 bg-red-400/10 px-1.5 font-mono text-[10px]">{error.source === "lexer" ? "LEX" : "SYN"}</span>
              <span>
                Línea {error.line}, columna {error.column}
              </span>
              {error.offendingSymbol && <code className="rounded-md border bg-card px-1 text-foreground">{JSON.stringify(error.offendingSymbol)}</code>}
            </div>
            <p>{error.message}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function DiagnosticRow({ diagnostic, onRevealLine }: { diagnostic: SemanticDiagnostic; onRevealLine: (line: number) => void }) {
  const isError = diagnostic.severity === "error";
  return (
    <button
      type="button"
      onClick={() => onRevealLine(diagnostic.line)}
      className={`flex flex-col items-start gap-1 rounded-xl border p-2 text-left text-xs transition ${
        isError ? "border-red-500/20 bg-red-400/10 text-red-700 hover:bg-red-400/15 dark:text-red-200" : "border-amber-500/20 bg-amber-400/10 text-amber-800 hover:bg-amber-400/15 dark:text-amber-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isError ? <CircleAlert size={14} /> : <AlertTriangle size={14} />}
        <code className="rounded-md border bg-card px-1.5 text-foreground">{diagnostic.code}</code>
        <strong className="font-head">{SEMANTIC_CODE_CATALOG[diagnostic.code]}</strong>
        <span>
          L{diagnostic.line}:C{diagnostic.column}
        </span>
      </div>
      <p>{diagnostic.message}</p>
      {diagnostic.symbol && (
        <div className="flex items-center gap-1">
          <span>Símbolo</span>
          <code className="rounded-md border bg-card px-1.5 text-foreground">{diagnostic.symbol}</code>
        </div>
      )}
      {diagnostic.hint && <p className="italic">Sugerencia: {diagnostic.hint}</p>}
      {diagnostic.related?.map((related, index) => (
        <p key={`${diagnostic.id}-related-${index}`}>
          {related.message}, L{related.line}:C{related.column}
        </p>
      ))}
    </button>
  );
}
