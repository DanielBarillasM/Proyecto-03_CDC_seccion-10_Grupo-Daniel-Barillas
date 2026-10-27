import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, FolderClosed, Orbit } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExamplesExplorer } from "./ExamplesExplorer";
import { CompilerGuide } from "./CompilerGuide";
import type { AnalysisMode } from "../../lib/types";

interface ActivitySidebarProps {
  mode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
}

export function ActivitySidebar({ mode, onModeChange }: ActivitySidebarProps) {
  const [examplesOpen, setExamplesOpen] = useState(true);
  const [guideOpen, setGuideOpen] = useState(true);

  return (
    <aside className="flex h-full flex-col bg-card/30">
      <div className="flex min-h-12 items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Orbit size={15} /></div>
        <div className="min-w-0 flex-1">
          <p className="surface-label">Workspace</p>
          <p className="truncate text-xs font-semibold">Explorador de compilación</p>
        </div>
        <button
          type="button"
          onClick={() => setExamplesOpen((value) => !value)}
          className="flex size-7 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-accent hover:text-foreground"
          aria-label="Ejemplos"
          title="Ejemplos"
        >
          <FolderClosed size={16} />
        </button>
        <button
          type="button"
          onClick={() => setGuideOpen((value) => !value)}
          className="flex size-7 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-accent hover:text-foreground"
          aria-label="Ruta de análisis"
          title="Ruta de análisis"
        >
          <BookOpen size={16} />
        </button>
      </div>

      <div role="region" aria-label="Ejemplos y ruta de análisis" tabIndex={0} className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30">
        <div className="flex flex-col gap-2 p-2.5">
          <Collapsible open={examplesOpen} onOpenChange={setExamplesOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-accent hover:text-foreground">
              {examplesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Ejemplos
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1">
              <ExamplesExplorer value={mode} onChange={onModeChange} />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-accent hover:text-foreground">
              {guideOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Ruta de análisis
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1">
              <CompilerGuide />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </aside>
  );
}
