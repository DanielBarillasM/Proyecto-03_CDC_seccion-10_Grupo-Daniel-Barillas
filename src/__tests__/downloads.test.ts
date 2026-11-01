import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { resultToJson } from "../lib/downloads";
import { resolveIdeAnalyzerMode, resolveIdeResultTab } from "../lib/idePipeline";
import type { AnalysisMode } from "../lib/types";

describe("analysis JSON export", () => {
  it.each(["lexer", "parser", "semantic", "tac", "mips"] as const)("retains every result field and metadata in %s mode", (mode) => {
    const result = analyzeInput("let value: integer = 1; print(value);", mode);
    const { generatedBy, project, ...exportedResult } = JSON.parse(resultToJson(result));

    expect(exportedResult).toEqual(JSON.parse(JSON.stringify(result)));
    expect(generatedBy).toBe("ANTLR 4 + antlr4ts + visitors semánticos + TAC + backend MIPS32 TypeScript");
    expect(project).toBe("Proyecto 3: Compiscript MIPS Compiler IDE");

    if (mode === "tac") {
      const selections: AnalysisMode[] = ["valid", "lexical", "syntax", "semantic-error", "tac", "mips", "custom"];
      for (const selection of selections) expect(resolveIdeAnalyzerMode(selection)).toBe("mips");

      const fullPipeline = analyzeInput("let value: integer = 1; print(value);", resolveIdeAnalyzerMode("tac"));
      expect(fullPipeline.tac.status).toBe("completed");
      expect(fullPipeline.mips.status).toBe("completed");
      expect(fullPipeline.mips.assembly).not.toBe("");
      expect(resolveIdeResultTab("tac", fullPipeline)).toBe("tac");
      expect(resolveIdeResultTab("mips", fullPipeline)).toBe("mips");
    }
  });

  it("retains errors and skipped phases", () => {
    const result = analyzeInput("let value: integer = ;", "tac");
    const exported = JSON.parse(resultToJson(result));

    expect(exported.accepted).toBe(false);
    expect(exported.syntaxErrors).toEqual(result.syntaxErrors);
    expect(exported.semantic.status).toBe("skipped");
    expect(exported.tac.status).toBe("skipped");
    expect(exported.mips.status).toBe("not-requested");
  });
});
