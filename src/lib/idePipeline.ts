import type { AnalysisMode, AnalyzerMode, AnalyzeResult } from "./types";

/**
 * Las opciones del explorador cambian la entrada y el énfasis de la demo,
 * pero el botón principal siempre ejecuta el compilador completo.
 */
export function resolveIdeAnalyzerMode(_selection: AnalysisMode): AnalyzerMode {
  return "mips";
}

export function resolveIdeResultTab(
  selection: AnalysisMode,
  result: Pick<AnalyzeResult, "tac" | "mips">
): "resultado" | "tac" | "mips" {
  if (selection === "tac" && result.tac.status === "completed") return "tac";
  if (result.mips.status === "completed") return "mips";
  if (result.tac.status === "completed") return "tac";
  return "resultado";
}
