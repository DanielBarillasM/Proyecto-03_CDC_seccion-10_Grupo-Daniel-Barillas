import { Database, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayType } from "../../semantic/semanticTypes";
import type { SymbolKind } from "../../semantic/symbols";
import type { AnalyzeResult } from "../../lib/types";
import { EmptyPanel } from "./EmptyPanel";

interface SymbolTablePanelProps {
  result: AnalyzeResult;
}

type KindFilter = "all" | SymbolKind;

const KIND_LABELS: Record<string, string> = {
  variable: "variable",
  constant: "constante",
  parameter: "parámetro",
  function: "función",
  class: "clase",
  field: "campo",
  method: "método",
  catch: "catch"
};

export function SymbolTablePanel({ result }: SymbolTablePanelProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [scopeId, setScopeId] = useState("all");
  const symbols = result.semantic.symbols;
  const scopes = result.semantic.scopes;
  const scopeNameById = useMemo(() => new Map(scopes.map((scope) => [scope.id, scope.name])), [scopes]);

  const kinds = useMemo(() => Array.from(new Set(symbols.map((symbol) => symbol.kind))).sort(), [symbols]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return symbols.filter((symbol) => {
      if (kind !== "all" && symbol.kind !== kind) return false;
      if (scopeId !== "all" && symbol.scopeId !== scopeId) return false;
      if (!normalized) return true;
      return [symbol.name, symbol.kind, displayType(symbol.type), scopeNameById.get(symbol.scopeId) ?? "", symbol.parentClass ?? ""].some(
        (value) => value.toLowerCase().includes(normalized)
      );
    });
  }, [kind, query, scopeId, symbols, scopeNameById]);

  if (result.semantic.status !== "completed") {
    return <EmptyPanel icon={<Database size={22} />} text="La tabla de símbolos se genera durante el análisis semántico." />;
  }

  if (symbols.length === 0) {
    return <EmptyPanel icon={<Database size={22} />} text="No se registraron símbolos." />;
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Database size={14} /> {filtered.length}/{symbols.length} símbolos
        </span>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" />
            <Input
              name="symbols-query"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, tipo o ámbito…"
              aria-label="Buscar en la tabla de símbolos"
              className="h-7 w-48 pl-7 text-xs"
            />
          </div>
          <select className="native-select" aria-label="Filtrar por clase de símbolo" name="symbols-kind" autoComplete="off" value={kind} onChange={(event) => setKind(event.target.value as KindFilter)}>
            <option value="all">Todos los símbolos</option>
            {kinds.map((item) => (
              <option key={item} value={item}>
                {KIND_LABELS[item] ?? item}
              </option>
            ))}
          </select>
          <select className="native-select" aria-label="Filtrar por ámbito" name="symbols-scope" autoComplete="off" value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
            <option value="all">Todos los ámbitos</option>
            {scopes.map((scope) => (
              <option key={scope.id} value={scope.id}>
                {scope.name} · {scope.kind}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Clase</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Ámbito</TableHead>
            <TableHead>Almacenamiento</TableHead>
            <TableHead>Frame</TableHead>
            <TableHead>Offset</TableHead>
            <TableHead>Tamaño</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Refs.</TableHead>
            <TableHead>Declaración</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((symbol) => (
            <TableRow key={symbol.id}>
              <TableCell>
                <code className="text-xs">{symbol.name}</code>
              </TableCell>
              <TableCell>{KIND_LABELS[symbol.kind] ?? symbol.kind}</TableCell>
              <TableCell>
                <code className="text-xs">{displayType(symbol.type)}</code>
              </TableCell>
              <TableCell title={symbol.scopeId}>{scopeNameById.get(symbol.scopeId) ?? symbol.scopeId}</TableCell>
              <TableCell><code className="text-xs">{symbol.storage?.kind ?? "—"}</code></TableCell>
              <TableCell><code className="text-xs">{symbol.storage?.frameId ?? symbol.storage?.label ?? "—"}</code></TableCell>
              <TableCell className="text-right">{symbol.storage?.offset ?? "—"}</TableCell>
              <TableCell className="text-right">{symbol.storage?.size ?? "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded border-2 bg-muted px-1.5 py-0.5 text-xs">
                    {symbol.mutable ? "mutable" : "const"}
                  </span>
                  <span
                    className={`rounded border-2 px-1.5 py-0.5 text-xs ${
                      symbol.initialized ? "border-green-900 bg-green-200 text-green-900" : "border-yellow-900 bg-yellow-200 text-yellow-900"
                    }`}
                  >
                    {symbol.initialized ? "inicializado" : "sin inicializar"}
                  </span>
                  {symbol.captured && <span className="rounded border-2 bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">closure</span>}
                </div>
              </TableCell>
              <TableCell className="text-right">{symbol.references.length}</TableCell>
              <TableCell className="text-right">
                L{symbol.declaration.line}:C{symbol.declaration.column}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No hay símbolos que coincidan con los filtros.</p>}
    </div>
  );
}
