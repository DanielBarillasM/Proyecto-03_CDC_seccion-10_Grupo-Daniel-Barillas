import { BookOpen, FileCode2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ScopeInfo } from "../../semantic/scopes";
import { CodeEditor, type EditorMarker } from "./CodeEditor";
import { EditorBreadcrumb } from "./EditorBreadcrumb";
import { GrammarTab } from "./GrammarTab";

export type EditorTabId = "program" | "grammar";

interface EditorTabsProps {
  activeTab: EditorTabId;
  onTabChange: (tab: EditorTabId) => void;
  value: string;
  onChange: (value: string) => void;
  markers: EditorMarker[];
  revealLine?: number;
  onRunShortcut: () => void;
  theme: "light" | "dark";
  onCursorChange: (position: { line: number; column: number }) => void;
  scopeChain: ScopeInfo[] | null;
  onClearScope: () => void;
}

export function EditorTabs({
  activeTab,
  onTabChange,
  value,
  onChange,
  markers,
  revealLine,
  onRunShortcut,
  theme,
  onCursorChange,
  scopeChain,
  onClearScope
}: EditorTabsProps) {
  const isEmpty = value.trim().length === 0;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(next) => onTabChange(next as EditorTabId)}
      className="flex h-full flex-col gap-0 bg-[#080b14]/35"
    >
      <TabsList variant="line" className="h-11 justify-start gap-1 rounded-none border-b border-white/5 bg-card/30 px-2.5 pt-1">
        <TabsTrigger value="program" className="h-9 rounded-t-xl border border-transparent px-3 text-xs data-[state=active]:border-border data-[state=active]:border-b-transparent data-[state=active]:bg-background/70">
          <FileCode2 size={14} /> program.cps
        </TabsTrigger>
        <TabsTrigger value="grammar" className="h-9 rounded-t-xl border border-transparent px-3 text-xs data-[state=active]:border-border data-[state=active]:border-b-transparent data-[state=active]:bg-background/70">
          <BookOpen size={14} /> Compiscript.g4
        </TabsTrigger>
      </TabsList>

      <TabsContent value="program" className="flex min-h-0 flex-1 flex-col">
        <EditorBreadcrumb fileName="program.cps" scopeChain={scopeChain} onClearScope={onClearScope} />
        {isEmpty && (
          <div className="border-b border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs text-amber-200">
            La entrada está vacía. Selecciona un caso o carga un archivo Compiscript.
          </div>
        )}
        <div className="min-h-0 flex-1">
          <CodeEditor
            value={value}
            onChange={onChange}
            markers={markers}
            revealLine={revealLine}
            onRunShortcut={onRunShortcut}
            theme={theme}
            onCursorChange={onCursorChange}
          />
        </div>
      </TabsContent>

      <TabsContent value="grammar" className="flex min-h-0 flex-1 flex-col">
        <GrammarTab theme={theme} />
      </TabsContent>
    </Tabs>
  );
}
