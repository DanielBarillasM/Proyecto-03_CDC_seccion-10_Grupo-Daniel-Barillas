import type { ActivationTreeNode, TacExecutionResult } from "../../tac/interpreter";

const STATUS_TEXT: Record<TacExecutionResult["status"], string> = {
  "not-run": "Sin ejecutar",
  completed: "Completada",
  "uncaught-error": "Error de ejecución no capturado",
  "step-limit": "Límite de pasos alcanzado",
  "depth-limit": "Límite de profundidad alcanzado",
  "resource-limit": "Límite de memoria o salida alcanzado",
  fault: "Ejecución interrumpida"
};

const NODE_STATUS_TEXT: Record<ActivationTreeNode["status"], string> = {
  active: "activa",
  returned: "retornó",
  unwound: "desenrollada"
};

export const MAX_VISIBLE_ACTIVATIONS = 300;

function visibleActivationNodes(execution: TacExecutionResult): ActivationTreeNode[] {
  const byId = new Map(execution.nodes.map((node) => [node.id, node]));
  const root = execution.nodes.find((node) => node.parentId === null);
  if (!root) return [];
  const visible: ActivationTreeNode[] = [];
  const pending = [root];
  while (pending.length > 0 && visible.length < MAX_VISIBLE_ACTIVATIONS) {
    const node = pending.pop()!;
    visible.push(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = byId.get(node.children[index]);
      if (child) pending.push(child);
    }
  }
  return visible;
}

export function ActivationTreePanel({ execution }: { execution: TacExecutionResult }) {
  const visibleNodes = visibleActivationNodes(execution);
  const visuallyTruncated = execution.nodes.length > visibleNodes.length;
  return (
    <section className="min-w-0 space-y-2" aria-label="Árbol de activación de la ejecución">
      <div>
        <h4 className="font-head text-xs uppercase tracking-wide">Árbol de activación (ejecución del TAC)</h4>
        <p className="mt-1 text-xs text-muted-foreground">Cada nodo es una llamada real ocurrida al interpretar el TAC una vez. El padre es quien hizo la llamada, no el ámbito léxico.</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[["Estado", STATUS_TEXT[execution.status]], ["Pasos TAC", execution.steps], ["Activaciones", execution.nodeCount], ["Profundidad", execution.maxDepth]].map(([label, value]) => (
          <div key={String(label)} className="rounded border bg-muted/20 p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-mono text-sm">{value}</p></div>
        ))}
      </div>
      {execution.message && <p role="status" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{execution.message}</p>}
      {execution.truncated && <p className="text-xs text-amber-700 dark:text-amber-300">Se muestran solo las primeras {execution.limits.maxNodes} activaciones de {execution.nodeCount}.</p>}
      {visuallyTruncated && <p className="text-xs text-muted-foreground">La vista está limitada a {MAX_VISIBLE_ACTIVATIONS} nodos para mantener fluida la interfaz; el reporte exportable conserva hasta {execution.limits.maxNodes}.</p>}
      {visibleNodes.length > 0 ? (
        <ul role="tree" className="max-h-72 overflow-auto rounded border bg-muted/10 p-2">
          {visibleNodes.map((node) => (
            <li
              key={node.id}
              role="treeitem"
              aria-level={node.depth + 1}
              className="min-w-0 border-l border-border py-0.5"
              style={{ paddingLeft: `${Math.min(node.depth, 12) * 12 + 6}px` }}
              title={node.depth > 12 ? `Profundidad real: ${node.depth}` : undefined}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 rounded px-1.5 py-0.5 font-mono text-[11px] hover:bg-primary/10">
                <span className="font-semibold text-primary">#{node.id}</span>
                <span>{node.name}({node.arguments.join(", ")})</span>
                {node.returnValue !== undefined && <span className="text-emerald-600 dark:text-emerald-400">→ {node.returnValue}</span>}
                <span className={node.status === "returned" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}>{NODE_STATUS_TEXT[node.status]}</span>
                <span className="text-[10px] text-muted-foreground">{node.kind} · profundidad {node.depth} · pasos {node.enterStep}–{node.exitStep ?? "…"}{node.callLine ? ` · línea ${node.callLine}` : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">No hay activaciones registradas.</p>}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Salida de la ejecución</p>
        <pre className="max-h-40 overflow-auto rounded border bg-[#0d1217] p-2 font-mono text-[11px] leading-5 text-white/90">{execution.output || "(sin salida)"}</pre>
      </div>
    </section>
  );
}
