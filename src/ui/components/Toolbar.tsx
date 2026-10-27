import { Command, Moon, Play, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import type { AnalyzeResult } from "../../lib/types";
import { PhasePipeline } from "./PhasePipeline";

interface ToolbarProps {
  isRunning: boolean;
  isEmpty: boolean;
  onAnalyze: () => void;
  onReset: () => void;
  result: AnalyzeResult | null;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
}

export function Toolbar({ isRunning, isEmpty, onAnalyze, onReset, result, theme, onThemeChange }: ToolbarProps) {
  return (
    <div className="flex min-h-13 items-center gap-2 overflow-x-auto px-3 py-2">
      <Button size="sm" onClick={onAnalyze} disabled={isEmpty || isRunning} className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary to-violet-500 px-3 shadow-[0_8px_24px_rgba(109,93,252,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(109,93,252,0.34)]">
        <Play size={14} />
        {isRunning ? "Analizando…" : "Ejecutar análisis"}
      </Button>
      <span className="flex items-center gap-1.5 rounded-lg border border-border bg-background/40 px-2 py-1 text-[10px] text-muted-foreground">
        <Command size={11} /> Ctrl + Enter
      </span>

      <div className="mx-1 h-6 w-px bg-border" />
      <div className="min-w-max"><PhasePipeline result={result} /></div>

      <div className="flex-1" />

      <AlertDialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Restablecer">
                <RotateCcw size={15} />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Restablecer entrada</TooltipContent>
        </Tooltip>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer entrada</AlertDialogTitle>
            <AlertDialogDescription>
              Se perderá el código actual y se cargará el ejemplo "Entrada válida".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onReset}>Restablecer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Cambiar tema"
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cambiar tema</TooltipContent>
      </Tooltip>
    </div>
  );
}
