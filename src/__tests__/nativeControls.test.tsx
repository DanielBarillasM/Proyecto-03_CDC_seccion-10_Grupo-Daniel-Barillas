import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { DocumentationPanel } from "../ui/components/DocumentationPanel";
import { ProblemsPanel } from "../ui/components/ProblemsPanel";
import { ParseTreePanel } from "../ui/components/ParseTreePanel";
import { SemanticTreePanel } from "../ui/components/SemanticTreePanel";
import { SymbolTablePanel } from "../ui/components/SymbolTablePanel";
import type { SemanticTreeNode } from "../semantic/ast";

describe("native IDE controls", () => {
  it("opens all documentation sections with native disclosure controls", () => {
    const markup = renderToStaticMarkup(<DocumentationPanel />);
    expect(markup.match(/<details open=""/g)).toHaveLength(9);
    expect(markup.match(/<summary>/g)).toHaveLength(9);
    expect(markup).toContain("Catálogo de diagnósticos semánticos");
    expect(markup).toContain("Backend MIPS32 y MARS");
  });

  it("labels the native severity filter and retains all options", () => {
    const result = analyzeInput("print(missing);", "semantic");
    const markup = renderToStaticMarkup(<ProblemsPanel result={result} onRevealLine={() => {}} />);
    expect(markup).toContain('aria-label="Filtrar por severidad"');
    expect(markup.match(/<select\b/g)).toHaveLength(1);
    expect(markup).toContain('<option value="all" selected="">Todos</option>');
    expect(markup).toContain('<option value="error">Errores</option>');
    expect(markup).toContain('<option value="warning">Warnings</option>');
  });

  it("labels symbol filters and builds native options from analysis results", () => {
    const result = analyzeInput("let value: integer = 1;", "semantic");
    const markup = renderToStaticMarkup(<SymbolTablePanel result={result} />);
    expect(markup.match(/<select\b/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Filtrar por clase de símbolo"');
    expect(markup).toContain('aria-label="Filtrar por ámbito"');
    expect(markup).toContain('<option value="variable">variable</option>');
    expect(markup).toContain('<option value="scope-0">global');
  });

  it("renders parse branches as open disclosures and leaves as plain text", () => {
    const result = analyzeInput("print(1);");
    result.parseTreeNodes = [{ label: "program", children: [{ label: "1", children: [] }] }];
    const markup = renderToStaticMarkup(<ParseTreePanel result={result} />);
    expect(markup.match(/<details open=""/g)).toHaveLength(1);
    expect(markup.match(/<summary\b/g)).toHaveLength(1);
    expect(markup).toContain(">1</div>");
    expect(markup).not.toContain('role="button"');
  });

  it("preserves semantic annotations and lazily renders closed branches beyond depth three", () => {
    const result = analyzeInput("print(1);", "semantic");
    let node: SemanticTreeNode = { id: "leaf", kind: "literal", label: "1", inferredType: "integer", diagnostics: [], children: [] };
    for (let depth = 4; depth >= 0; depth -= 1) {
      node = { id: `branch-${depth}`, kind: "block", label: `depth ${depth}`, diagnostics: ["SEM018"], children: [node] };
    }
    node.inferredType = "integer";
    result.semantic.semanticTree = [node];
    const markup = renderToStaticMarkup(<SemanticTreePanel result={result} />);
    expect(markup.match(/<details\b/g)).toHaveLength(5);
    expect(markup.match(/<details open=""/g)).toHaveLength(4);
    expect(markup.match(/<summary\b/g)).toHaveLength(5);
    expect(markup).toContain("integer");
    expect(markup).toContain("SEM018");
    expect(markup).toContain("depth 4");
    expect(markup).not.toContain(">1</strong>");
    expect(markup).not.toContain("<button");
  });
});
