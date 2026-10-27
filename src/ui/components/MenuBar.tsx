import { useRef } from "react";
import { Braces, Code2, Cpu, Database, GitBranch, Play, Sparkles, Upload } from "lucide-react";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger
} from "@/components/ui/menubar";
import { Badge } from "@/components/ui/badge";
import { AboutDialog } from "./AboutDialog";

const capabilities = [
  { label: "ANTLR 4", icon: <Braces size={12} /> },
  { label: "TypeScript", icon: <Code2 size={12} /> },
  { label: "Tabla de símbolos", icon: <Database size={12} /> },
  { label: "Ámbitos léxicos", icon: <GitBranch size={12} /> }
];

interface MenuBarProps {
  onLoadFile: (text: string) => void;
  onFileError: (message: string) => void;
  onDownloadInput: () => void;
  onCopyInput: () => void;
  onReset: () => void;
  onAnalyze: () => void;
  isRunning: boolean;
  isEmpty: boolean;
  onExportFocus: () => void;
  onOpenDocs: () => void;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  aboutOpen: boolean;
  onAboutOpenChange: (open: boolean) => void;
}

export function MenuBar({
  onLoadFile,
  onFileError,
  onDownloadInput,
  onCopyInput,
  onReset,
  onAnalyze,
  isRunning,
  isEmpty,
  onExportFocus,
  onOpenDocs,
  theme,
  onThemeChange,
  aboutOpen,
  onAboutOpenChange
}: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".cps")) {
      onFileError("El archivo seleccionado debe tener extensión .cps.");
      return;
    }
    onLoadFile(await file.text());
  }

  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-border px-3 py-1.5">
      <div className="relative flex size-8 items-center justify-center rounded-xl border border-primary/35 bg-primary/15 text-primary shadow-[0_0_24px_rgba(139,124,255,0.24)]">
        <Cpu size={16} />
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-background bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-head text-sm font-semibold tracking-tight">Compiscript Studio</span>
          <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] text-primary lg:inline">MIPS32</span>
        </div>
        <span className="block text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Daniel-Barillas · 22193</span>
      </div>

      <input ref={fileInputRef} type="file" accept=".cps,text/plain" aria-label="Seleccionar archivo Compiscript" hidden onChange={handleFile} />

      <Menubar className="h-auto border-0 bg-transparent px-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger>Archivo</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} /> Cargar .cps
            </MenubarItem>
            <MenubarItem onClick={onDownloadInput}>Descargar entrada .cps</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onExportFocus}>Exportar evidencia</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Editar</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onCopyInput}>Copiar entrada</MenubarItem>
            <MenubarItem onClick={onReset}>Restablecer</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Ejecutar</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onAnalyze} disabled={isEmpty || isRunning}>
              <Play size={14} /> Analizar
              <MenubarShortcut>Ctrl+Enter</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Ver</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onOpenDocs}>Documentación</MenubarItem>
            <MenubarSeparator />
            <MenubarCheckboxItem checked={theme === "dark"} onCheckedChange={(checked) => onThemeChange(checked ? "dark" : "light")}>
              Tema oscuro
            </MenubarCheckboxItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Ayuda</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => onAboutOpenChange(true)}>Acerca de</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="ml-auto hidden items-center gap-1.5 xl:flex">
        {capabilities.map((item) => (
          <Badge key={item.label} variant="outline" className="border-border bg-background/40 text-[10px] text-muted-foreground shadow-none">
            {item.icon}
            {item.label}
          </Badge>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
          <Sparkles size={11} /> pipeline listo
        </span>
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={onAboutOpenChange} />
    </div>
  );
}
