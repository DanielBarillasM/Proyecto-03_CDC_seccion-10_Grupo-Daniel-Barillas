import { useMemo, useState } from "react";
import { Braces, Cpu, Database, Download, FlaskConical, FolderTree, ListChecks, Network, Search, Split, Workflow } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadText, tacReportToText, tacToCsv } from "../../lib/downloads";
import type { AnalyzeResult } from "../../lib/types";
import { formatTac } from "../../tac/types";
import type { ScopeInfo } from "../../semantic/scopes";
import { ActivationTreePanel } from "./ActivationTreePanel";
import { DocumentationPanel } from "./DocumentationPanel";
import { EmptyPanel } from "./EmptyPanel";
import { ExportsPanel } from "./ExportsPanel";
import { ParseTreePanel } from "./ParseTreePanel";
import { ResultOverviewPanel } from "./ResultOverviewPanel";
import { ScopeTreePanel } from "./ScopeTreePanel";
import { SemanticTreePanel } from "./SemanticTreePanel";
import { SymbolTablePanel } from "./SymbolTablePanel";
import { TestsPanel } from "./TestsPanel";

export type DockTabId = "resultado" | "simbolos" | "ambitos" | "arboles" | "tac" | "mips" | "visual" | "documentacion" | "exportar" | "pruebas";

interface RightDockProps {
  result: AnalyzeResult | null;
  inputText: string;
  activeTab: DockTabId;
  onTabChange: (tab: DockTabId) => void;
  onSelectScope: (chain: ScopeInfo[]) => void;
  onLoadTestSource?: (source: string) => void;
}

function TacInspector({ result }: { result: AnalyzeResult }) {
  const [query, setQuery] = useState("");
  const [opcode, setOpcode] = useState("all");
  const instructions = result.tac.instructions;
  const opcodes = useMemo(() => [...new Set(instructions.map((item) => item.op))].sort(), [instructions]);
  const filtered = useMemo(() => instructions.filter((item) => {
    const matchesOpcode = opcode === "all" || item.op === opcode;
    const haystack = `${item.op} ${item.arg1?.value ?? ""} ${item.arg2?.value ?? ""} ${item.result?.value ?? ""}`.toLowerCase();
    return matchesOpcode && haystack.includes(query.toLowerCase());
  }), [instructions, opcode, query]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-head uppercase tracking-wide">Código de tres direcciones</p>
          <p className="mt-1 text-xs text-muted-foreground">Filtra y exporta las instrucciones TAC.</p>
        </div>
        <div className="flex gap-1">
          <button disabled={result.tac.status !== "completed"} className="rounded border bg-primary px-2 py-1 text-[11px] font-semibold shadow-xs disabled:opacity-40" onClick={() => downloadText("compiscript.tac", result.tac.formattedCode)}>Descargar TAC</button>
          <button disabled={result.tac.status !== "completed"} className="rounded border px-2 py-1 text-[11px] disabled:opacity-40" onClick={() => downloadText("compiscript_tac.csv", tacToCsv(instructions), "text/csv;charset=utf-8")}>CSV</button>
          <button disabled={result.tac.status !== "completed"} className="rounded border px-2 py-1 text-[11px] disabled:opacity-40" onClick={() => downloadText("reporte_tac.txt", tacReportToText(result))}>Reporte</button>
        </div>
      </div>
      {result.tac.status !== "completed" ? <p className="text-sm text-muted-foreground">{result.tac.skipReason ?? "Selecciona Generación TAC y ejecuta el análisis."}</p> : (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {[['Instr.', result.tac.metrics.instructionCount], ['Bloques', result.tac.basicBlocks.length], ['Temps.', result.tac.metrics.temporaryCount], ['Reusos', result.tac.metrics.temporariesReuseCount], ['Pico vivos', result.tac.metrics.peakLiveTemporaries], ['Labels', result.tac.metrics.labelCount], ['Frames', result.tac.metrics.activationRecordCount]].map(([label, value]) => (
              <div key={String(label)} className="rounded border bg-muted/20 p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-mono text-sm">{value}</p></div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded border bg-background px-2 py-1 focus-within:ring-1 focus-within:ring-ring">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input aria-label="Filtrar TAC" name="tac-query" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar operando o etiqueta…" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
            </label>
            <select aria-label="Filtrar opcode" name="tac-opcode" autoComplete="off" value={opcode} onChange={(event) => setOpcode(event.target.value)} className="rounded border bg-background px-2 py-1 text-xs"><option value="all">Todos los opcodes</option>{opcodes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </div>
          <div className="overflow-hidden rounded-md border bg-[#10151a] shadow-inner">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span className="text-white">Listado de instrucciones</span>
              <span className="font-mono normal-case tracking-normal">TAC / IR</span>
            </div>
            <div className="max-h-80 overflow-auto py-1 font-mono text-[12px] leading-6">
              {filtered.length ? filtered.map((item) => {
                const line = formatTac([item]);
                return (
                  <div key={item.index} className="group grid min-w-[34rem] grid-cols-[3.5rem_5.75rem_minmax(0,1fr)] items-baseline px-3 hover:bg-primary/10">
                    <span className="select-none text-right text-[10px] text-muted-foreground/60">{String(item.index).padStart(3, "0")}</span>
                    <span className="pl-4 text-[10px] font-semibold tracking-wide text-primary/80">{item.op}</span>
                    <code className="whitespace-pre pl-3 text-white/90">{line}</code>
                  </div>
                );
              }) : <p className="px-4 py-8 text-center text-xs text-muted-foreground">Sin coincidencias.</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {instructions.length} instrucciones · reutilización de temporales: {result.tac.metrics.temporariesReuseCount}</p>
          <section className="min-w-0 space-y-2">
            <h4 className="font-head text-xs uppercase tracking-wide">Registros de activación</h4>
            <div className="max-h-64 space-y-2 overflow-auto">
              {result.tac.activationRecords.map((frame) => (
                <article key={frame.id} className="min-w-0 overflow-hidden rounded border bg-muted/20">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5 text-xs">
                    <strong>{frame.name}</strong>
                    <code>{frame.kind} · {frame.totalBytes} B</code>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-left text-[11px]">
                      <thead><tr className="border-b"><th className="p-1.5">Slot</th><th>Clase</th><th>Tipo</th><th>Offset</th><th>Tamaño</th></tr></thead>
                      <tbody>{frame.slots.map((slot, index) => (
                        <tr key={`${frame.id}-${slot.name}-${index}`} className="border-b last:border-0">
                          <td className="p-1.5 font-mono">{slot.name}</td><td>{slot.kind}</td><td className="font-mono">{slot.type.kind === "primitive" ? slot.type.name : slot.type.kind}</td><td>{slot.offset}</td><td>{slot.size}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <ActivationTreePanel execution={result.execution} />
          {result.tac.classLayouts.length > 0 && (
            <section className="min-w-0 space-y-2">
              <h4 className="font-head text-xs uppercase tracking-wide">Layouts de clases</h4>
              <div className="grid min-w-0 grid-cols-1 gap-2">
                {result.tac.classLayouts.map((layout) => (
                  <article key={layout.classId} className="min-w-0 rounded border bg-muted/20 p-2 text-xs">
                    <div className="flex justify-between gap-2"><strong>{layout.name}</strong><code>{layout.instanceSize} B</code></div>
                    <p className="mt-1 break-words text-muted-foreground">
                      {layout.fields.length ? layout.fields.map((field) => `${field.name}@${field.offset}`).join(" · ") : "Sin campos"}
                    </p>
                    <p className="mt-1 break-words text-muted-foreground">
                      {(layout.methods ?? []).length ? (layout.methods ?? []).map((method) => `${method.name}→${method.label}`).join(" · ") : "Sin métodos"}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TacVisualPanel({ result }: { result: AnalyzeResult }) {
  const instructions = result.tac.instructions;
  const instructionsByIndex = useMemo(() => new Map(instructions.map((item) => [item.index, item])), [instructions]);
  const blocks = result.tac.basicBlocks;
  const outgoingByBlock = useMemo(() => {
    const outgoing = new Map<string, typeof result.tac.controlFlowEdges>();
    for (const edge of result.tac.controlFlowEdges) {
      const edges = outgoing.get(edge.from);
      if (edges) edges.push(edge);
      else outgoing.set(edge.from, [edge]);
    }
    return outgoing;
  }, [result.tac.controlFlowEdges]);
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-head uppercase tracking-wide">Flujo visual del TAC</p><p className="mt-1 max-w-xl text-xs text-muted-foreground">Cada tarjeta es un bloque básico. Las conexiones muestran la siguiente instrucción o el destino de un salto.</p></div>
        <div className="hidden shrink-0 items-center gap-2 text-[10px] text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-primary" /> salto <span className="h-2 w-2 rounded-full bg-amber-400" /> condición</div>
      </div>
      {result.tac.status === "skipped" ? <p className="text-sm text-muted-foreground">{result.tac.skipReason}</p> : (
        <div className="min-w-0 overflow-hidden rounded-lg border bg-[#0d1217] p-3">
          <div className="grid min-w-0 grid-cols-1 gap-3" role="list" aria-label="Bloques básicos del código TAC">
            {blocks.map((block, index) => {
              const outgoing = outgoingByBlock.get(block.id) ?? [];
              const visibleInstructions = block.instructionIndices.slice(0, 6)
                .map((instructionIndex) => instructionsByIndex.get(instructionIndex))
                .filter((instruction) => instruction !== undefined);
              return <article key={block.id} role="listitem" className="relative min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#18212a] shadow-sm transition-colors hover:border-primary/70">
                <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2"><div><span className="font-mono text-xs font-bold text-primary">{block.id}</span><span className="ml-2 text-[10px] text-white/60">{block.label ?? `entrada_${index}`}</span></div><span className="font-mono text-[10px] text-white/45">{block.startIndex.toString().padStart(3, "0")}</span></header>
                <div className="min-w-0 space-y-1 p-3">{visibleInstructions.map((item) => <div key={item.index} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 font-mono text-[11px] leading-5"><span className="text-right text-white/35">{item.index}</span><code className="min-w-0 break-words whitespace-normal text-white/90" title={formatTac([item])}>{formatTac([item])}</code></div>)}{block.instructionIndices.length > 6 && <p className="pl-10 text-[10px] text-white/45">+ {block.instructionIndices.length - 6} instrucciones</p>}</div>
                <footer className="flex flex-wrap gap-1 border-t border-white/10 px-3 py-2">{outgoing.length ? outgoing.map((edge) => <span key={`${edge.from}-${edge.to}-${edge.kind}`} className={`rounded-full px-2 py-0.5 text-[10px] ${edge.kind === "true" || edge.kind === "false" ? "bg-amber-400/15 text-amber-300" : "bg-primary/15 text-primary"}`}>{edge.kind} → {edge.to}</span>) : <span className="text-[10px] text-white/45">fin del flujo</span>}</footer>
              </article>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MipsInspector({ result }: { result: AnalyzeResult }) {
  const mips = result.mips;
  if (mips.status === "not-requested" || mips.status === "skipped") {
    return <EmptyPanel icon={<Cpu size={22} />} text={mips.skipReason ?? result.tac.skipReason ?? "MIPS requiere TAC válido."} />;
  }
  const exportable = mips.status === "completed";
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-head uppercase tracking-wide">Backend MIPS32 para MARS</p><p className="mt-1 text-xs text-muted-foreground">Salida generada desde las instrucciones TAC del análisis actual.</p></div>
        <button type="button" disabled={!exportable} className="rounded border bg-primary px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => exportable && downloadText("compiscript.asm", mips.assembly, "text/plain;charset=utf-8")}>Descargar .asm</button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {[["Estado", mips.status], ["Instrucciones", `${mips.instructionCount} → ${mips.optimizedInstructionCount}`], ["Eliminadas por mirilla", mips.optimizationCount], ["Diagnósticos", mips.diagnostics.length], ["TAC fuente", result.tac.instructions.length], ["Registros pico", mips.registerStats.maxConcurrent], ["Reusos de registro", mips.registerStats.reuses], ["Desalojos", mips.registerStats.evictions], ["Spills", mips.registerStats.spills], ["Stores evitados", mips.registerStats.storesAvoided]].map(([label, value]) => <div key={String(label)} className="rounded border bg-muted/20 p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-mono text-sm">{value}</p></div>)}
      </div>
      <div className="rounded border bg-muted/20 p-2 text-[11px]">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Reglas de mirilla aplicadas</p>
        <div className="grid grid-cols-1 gap-x-3 font-mono sm:grid-cols-2">{Object.entries(mips.peephole).map(([rule, count]) => <p key={rule} className={count ? "" : "text-muted-foreground"}>{rule}: {count}</p>)}</div>
      </div>
      {mips.diagnostics.length > 0 && <div role="alert" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{mips.diagnostics.map((diagnostic, index) => <p key={`${diagnostic.code}-${diagnostic.tacIndex ?? index}`}><strong>{diagnostic.code}</strong>: {diagnostic.message}</p>)}</div>}
      <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-[#0d1217] p-3 font-mono text-[11px] leading-5 text-white/90" aria-label="Ensamblador MIPS generado">{mips.assembly || "No se generó ensamblador válido."}</pre>
    </div>
  );
}

export function RightDock({ result, inputText, activeTab, onTabChange, onSelectScope, onLoadTestSource }: RightDockProps) {
  return (
    <Tabs orientation="vertical" value={activeTab} onValueChange={(next) => onTabChange(next as DockTabId)} className="flex h-full min-w-0 flex-row gap-0 bg-card/20">
      <TabsList variant="line" className="h-full w-12 min-w-12 flex-none flex-col justify-start gap-1 overflow-y-auto rounded-none border-r border-border bg-background/35 px-1.5 py-2">
        <TabsTrigger value="resultado" className="size-9 flex-none rounded-xl p-0" aria-label="Resultado" title="Resultado">
          <ListChecks size={15} /> <span className="sr-only">Resultado</span>
        </TabsTrigger>
        <TabsTrigger value="simbolos" className="size-9 flex-none rounded-xl p-0" aria-label="Símbolos" title="Símbolos">
          <Database size={15} /> <span className="sr-only">Símbolos</span>
        </TabsTrigger>
        <TabsTrigger value="ambitos" className="size-9 flex-none rounded-xl p-0" aria-label="Ámbitos" title="Ámbitos">
          <FolderTree size={15} /> <span className="sr-only">Ámbitos</span>
        </TabsTrigger>
        <TabsTrigger value="arboles" className="size-9 flex-none rounded-xl p-0" aria-label="Árboles" title="Árboles">
          <Network size={15} /> <span className="sr-only">Árboles</span>
        </TabsTrigger>
        <span className="my-1 h-px w-6 shrink-0 bg-border" />
        <TabsTrigger value="tac" className="size-9 flex-none rounded-xl bg-primary/8 p-0 text-primary" aria-label="Código TAC" title="Código TAC">
          <Split size={15} /> <span className="sr-only">TAC</span>
        </TabsTrigger>
        <TabsTrigger value="mips" className="size-9 flex-none rounded-xl bg-primary/8 p-0 text-primary" aria-label="Ensamblador MIPS" title="Ensamblador MIPS">
          <Cpu size={15} /> <span className="sr-only">MIPS</span>
        </TabsTrigger>
        <TabsTrigger value="visual" className="size-9 flex-none rounded-xl p-0" aria-label="Flujo visual" title="Flujo visual">
          <Workflow size={15} /> <span className="sr-only">Visual</span>
        </TabsTrigger>
        <span className="my-1 h-px w-6 shrink-0 bg-border" />
        <TabsTrigger value="documentacion" className="size-9 flex-none rounded-xl p-0" aria-label="Documentación" title="Documentación">
          <Braces size={15} /> <span className="sr-only">Docs</span>
        </TabsTrigger>
        <TabsTrigger value="exportar" className="size-9 flex-none rounded-xl p-0" aria-label="Exportar" title="Exportar">
          <Download size={15} /> <span className="sr-only">Exportar</span>
        </TabsTrigger>
        <TabsTrigger value="pruebas" className="size-9 flex-none rounded-xl p-0" aria-label="Pruebas" title="Pruebas">
          <FlaskConical size={15} /> <span className="sr-only">Pruebas</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="resultado" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        <ResultOverviewPanel result={result} />
      </TabsContent>

      <TabsContent value="simbolos" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        {result ? <SymbolTablePanel result={result} /> : <EmptyPanel icon={<Database size={22} />} text="Ejecuta el análisis para ver los símbolos." />}
      </TabsContent>

      <TabsContent value="ambitos" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        {result ? (
          <ScopeTreePanel result={result} onSelectScope={onSelectScope} />
        ) : (
          <EmptyPanel icon={<FolderTree size={22} />} text="Ejecuta el análisis para ver los ámbitos." />
        )}
      </TabsContent>

      <TabsContent value="arboles" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        {result ? (
          <div className="flex flex-col gap-2">
            <p className="px-3 pt-3 text-xs font-head uppercase tracking-wide text-muted-foreground">Árbol semántico anotado</p>
            <SemanticTreePanel result={result} />
            <Separator />
            <p className="px-3 text-xs font-head uppercase tracking-wide text-muted-foreground">Árbol de parseo ANTLR</p>
            <ParseTreePanel result={result} />
          </div>
        ) : (
          <EmptyPanel icon={<Network size={22} />} text="Ejecuta el análisis para ver los árboles." />
        )}
      </TabsContent>

  <TabsContent value="tac" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
  {result ? <TacInspector result={result} /> : <EmptyPanel icon={<Split size={22} />} text="Ejecuta el análisis para generar TAC." />}
  </TabsContent>
  <TabsContent value="mips" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
  {result ? <MipsInspector result={result} /> : <EmptyPanel icon={<Cpu size={22} />} text="Ejecuta el análisis para generar MIPS." />}
  </TabsContent>

      <TabsContent value="visual" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        {result ? <TacVisualPanel result={result} /> : <EmptyPanel icon={<Workflow size={22} />} text="Ejecuta el análisis para visualizar el flujo TAC." />}
      </TabsContent>

      <TabsContent value="documentacion" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        <DocumentationPanel />
      </TabsContent>

      <TabsContent value="exportar" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        <ExportsPanel result={result} inputText={inputText} />
      </TabsContent>

      <TabsContent value="pruebas" className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-primary">
        <TestsPanel onLoadSource={onLoadTestSource} />
      </TabsContent>
    </Tabs>
  );
}
