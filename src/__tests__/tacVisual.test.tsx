import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analyzeInput } from "../lib/analyze";
import { RightDock } from "../ui/components/RightDock";

describe("TAC visual panel", () => {
  it("renders block IDs and conditional destinations directly", () => {
    const result = analyzeInput("let x: integer = 0; while (x < 2) { x = x + 1; }", "tac");
    expect(result.tac.status).toBe("completed");
    result.tac.basicBlocks.forEach((block) => { block.id = `block-${block.id}`; });
    result.tac.controlFlowEdges.forEach((edge) => {
      edge.from = `block-${edge.from}`;
      edge.to = `block-${edge.to}`;
    });
    result.tac.basicBlocks.reverse();
    const markup = renderToStaticMarkup(<RightDock result={result} inputText="" activeTab="visual" onTabChange={() => {}} onSelectScope={() => {}} />);
    expect(markup.match(/role="listitem"/g)).toHaveLength(result.tac.basicBlocks.length);
    for (const edge of result.tac.controlFlowEdges) {
      expect(markup).toContain(`${edge.kind} → ${edge.to}`);
    }
    expect(markup).toContain("bg-amber-400/15 text-amber-300");
    expect(markup).toContain("fin del flujo");
  });

  it("limits instruction previews to six and reports the remaining count", () => {
    const result = analyzeInput(Array.from({ length: 10 }, (_, index) => `print(${index});`).join("\n"), "tac");
    const markup = renderToStaticMarkup(<RightDock result={result} inputText="" activeTab="visual" onTabChange={() => {}} onSelectScope={() => {}} />);
    expect(result.tac.basicBlocks.some((block) => block.instructionIndices.length > 6)).toBe(true);
    for (const block of result.tac.basicBlocks.filter((block) => block.instructionIndices.length > 6)) {
      expect(markup).toContain(`+ ${block.instructionIndices.length - 6} instrucciones`);
    }
  });

  it("shows the skip reason instead of blocks for rejected input", () => {
    const result = analyzeInput("print(missing);", "tac");
    const markup = renderToStaticMarkup(<RightDock result={result} inputText="" activeTab="visual" onTabChange={() => {}} onSelectScope={() => {}} />);
    expect(markup).toContain(result.tac.skipReason);
    expect(markup).not.toContain('role="listitem"');
  });
});
