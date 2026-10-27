import { Braces, Code2, Cpu, Database, GitBranch, GraduationCap, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const capabilities = [
  { label: "ANTLR 4", icon: <Braces size={13} /> },
  { label: "TypeScript", icon: <Code2 size={13} /> },
  { label: "Tabla de símbolos", icon: <Database size={13} /> },
  { label: "Ámbitos léxicos", icon: <GitBranch size={13} /> },
  { label: "MIPS32 / MARS", icon: <Cpu size={13} /> }
];

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover/90 shadow-2xl backdrop-blur-2xl sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-1.5 text-xs font-head uppercase tracking-wide text-muted-foreground">
            <GraduationCap size={14} /> Construcción de Compiladores · Proyecto 3
          </div>
          <DialogTitle className="text-lg">
            Compiscript <span className="text-primary">MIPS Compiler IDE</span>
          </DialogTitle>
          <DialogDescription>
            Recorre el código fuente desde los tokens hasta TAC y ensamblador MIPS32 ejecutable en MARS.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {capabilities.map((item) => (
            <Badge key={item.label} variant="outline">
              {item.icon}
              {item.label}
            </Badge>
          ))}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/10 to-cyan-300/5 p-3 text-secondary-foreground">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <small className="text-secondary-foreground/70">Motor activo</small>
            <strong className="block font-head">Pipeline de cinco fases</strong>
            <p className="text-secondary-foreground/70">
              Lexer, parser, semántica, TAC y backend MIPS con pila, registros y mirilla.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/45 p-3 text-sm">
          <span className="surface-label">Autor</span>
          <strong className="mt-1 block">Pablo Daniel Barillas Moreno</strong>
          <span className="text-xs text-muted-foreground">Carné 22193 · Grupo Daniel-Barillas</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
