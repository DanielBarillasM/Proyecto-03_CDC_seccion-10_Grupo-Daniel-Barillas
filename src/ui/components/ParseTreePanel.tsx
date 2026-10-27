import { Check, Copy, Download, GitBranch } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadText, parseTreeToText } from "../../lib/downloads";
import type { AnalyzeResult, TreeNode } from "../../lib/types";
import { EmptyPanel } from "./EmptyPanel";

interface ParseTreePanelProps {
  result: AnalyzeResult;
}

export function ParseTreePanel({ result }: ParseTreePanelProps) {
  const [view, setView] = useState<"text" | "visual">("visual");
  const [copied, setCopied] = useState(false);

  const hasTree = result.parseTreeText.trim().length > 0 && result.parseTreeText !== "—";

  function handleCopy() {
    navigator.clipboard.writeText(result.formattedParseTree).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <GitBranch size={15} />
          <div>
            <strong className="font-head">Árbol de parseo</strong>
            <span className="ml-1.5 text-muted-foreground">Estructura reconocida por el parser generado de Compiscript</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Tabs value={view} onValueChange={(value) => setView(value as "text" | "visual")}>
            <TabsList className="h-7">
              <TabsTrigger value="visual" className="h-6 px-2 text-xs">
                Visual
              </TabsTrigger>
              <TabsTrigger value="text" className="h-6 px-2 text-xs">
                Texto
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => downloadText("arbol_compiscript.txt", parseTreeToText(result))}>
            <Download size={13} /> .txt
          </Button>
        </div>
      </div>

      {!hasTree ? (
        <EmptyPanel
          icon={<GitBranch size={22} />}
          text={
            result.lexicalErrors.length > 0
              ? "No se puede generar el árbol de parseo porque hay errores léxicos."
              : "No se generó árbol de parseo."
          }
        />
      ) : view === "text" ? (
        <pre className="max-h-[50vh] overflow-auto rounded border-2 bg-card p-2 text-xs">{result.formattedParseTree}</pre>
      ) : (
        <div className="max-h-[50vh] overflow-auto rounded border-2 bg-card p-2">
          {result.parseTreeNodes.map((node, i) => (
            <TreeNodeVisual key={i} node={node} depth={0} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">Análisis sintáctico de Compiscript:</strong> ANTLR genera el parser desde
        Compiscript.g4. El árbol aparece incluso cuando el parser se recupera de errores sintácticos.
      </p>
    </div>
  );
}

function TreeNodeVisual({ node, depth }: { node: TreeNode; depth: number }) {
  const isLeaf = node.children.length === 0;
  const isRule = /^[a-z]/.test(node.label);

  if (isLeaf) {
    return <div className="rounded px-1 py-0.5 text-xs text-blue-900 dark:text-blue-300" style={{ marginLeft: depth > 0 ? "1.25rem" : 0 }}>{node.label}</div>;
  }

  return (
    <details open style={{ marginLeft: depth > 0 ? "1.25rem" : 0 }}>
      <summary className={`cursor-pointer rounded px-1 py-0.5 text-xs text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary ${isRule ? "" : "font-head"}`}>
        <span>{node.label}</span>
        <span className="ml-1.5 text-muted-foreground">{node.children.length}</span>
      </summary>
      {node.children.map((child, i) => (
        <TreeNodeVisual key={i} node={child} depth={depth + 1} />
      ))}
    </details>
  );
}
