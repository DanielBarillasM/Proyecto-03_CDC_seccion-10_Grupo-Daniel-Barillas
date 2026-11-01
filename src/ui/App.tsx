import { useCallback, useEffect, useMemo, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { downloadText } from "../lib/downloads";
import { exampleCase } from "../lib/examples";
import { analyzeInput } from "../lib/analyze";
import { resolveIdeAnalyzerMode, resolveIdeResultTab } from "../lib/idePipeline";
import type { AnalysisMode, AnalyzeResult } from "../lib/types";
import type { ScopeInfo } from "../semantic/scopes";
import { ActivitySidebar } from "./components/ActivitySidebar";
import { CommandPalette } from "./components/CommandPalette";
import type { EditorMarker } from "./components/CodeEditor";
import { EditorTabs, type EditorTabId } from "./components/EditorTabs";
import { MenuBar } from "./components/MenuBar";
import { ProblemsPanel } from "./components/ProblemsPanel";
import { RightDock, type DockTabId } from "./components/RightDock";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { AmbientBackground } from "./components/AmbientBackground";
import { SpotlightSurface } from "./components/SpotlightSurface";

export function App() {
  const [mode, setMode] = useState<AnalysisMode>("valid");
  const [customInput, setCustomInput] = useState<string>("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTabId>("program");
  const [activeDockTab, setActiveDockTab] = useState<DockTabId>("resultado");
  const [scopeChain, setScopeChain] = useState<ScopeInfo[] | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [revealLine, setRevealLine] = useState<number | undefined>(undefined);

  const inputValue = useMemo(() => {
    if (mode === "lexical") return exampleCase.lexicalErrorInput;
    if (mode === "syntax") return exampleCase.syntaxErrorInput;
    if (mode === "semantic-error") return exampleCase.semanticErrorInput;
    if (mode === "custom") return customInput;
    return exampleCase.validInput;
  }, [mode, customInput]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const markers = useMemo<EditorMarker[]>(() => {
    if (!result) return [];
    const lexical: EditorMarker[] = result.lexicalErrors.map((error) => ({
      line: error.line,
      column: error.column,
      message: error.message,
      severity: "error"
    }));
    const syntax: EditorMarker[] = result.syntaxErrors.map((error) => ({
      line: error.line,
      column: error.column,
      message: error.message,
      severity: "error"
    }));
    const semantic: EditorMarker[] = result.semantic.diagnostics.map((diagnostic) => ({
      line: diagnostic.line,
      column: diagnostic.column,
      message: diagnostic.message,
      severity: diagnostic.severity
    }));
    return [...lexical, ...syntax, ...semantic];
  }, [result]);

  const analysisAnnouncement = useMemo(() => {
    if (isRunning) return "Análisis en curso…";
    if (analyzeError || fileError) return analyzeError ?? fileError ?? "";
    if (!result) return "";
    if (result.summary.totalErrorCount > 0) {
      return `Análisis finalizado con ${result.summary.totalErrorCount} errores.`;
    }
    if (result.mips.status === "completed") {
      return `Compilación finalizada sin errores. ${result.tac.instructions.length} instrucciones TAC y ${result.mips.optimizedInstructionCount} instrucciones MIPS generadas.`;
    }
    return `Análisis finalizado sin errores. ${result.tac.instructions.length} instrucciones TAC generadas.`;
  }, [analyzeError, fileError, isRunning, result]);

  function handleModeChange(nextMode: AnalysisMode) {
    setMode(nextMode);
    if (nextMode === "custom" && customInput === "") {
      setCustomInput(exampleCase.validInput);
    }
    setResult(null);
    setAnalyzeError(null);
    setActiveEditorTab("program");
  }

  function handleInputChange(value: string) {
    setMode("custom");
    setCustomInput(value);
    setResult(null);
  }

  async function handleAnalyze() {
    setIsRunning(true);
    setAnalyzeError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Las opciones del explorador cambian la entrada y el énfasis visual,
      // no la profundidad del pipeline: toda ejecución intenta llegar a MIPS.
      const analyzerMode = resolveIdeAnalyzerMode(mode);
      const nextResult = analyzeInput(inputValue, analyzerMode);
      setResult(nextResult);
      setActiveDockTab(resolveIdeResultTab(mode, nextResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Cannot find module") || message.includes("generated")) {
        setAnalyzeError("Los archivos ANTLR generados no están disponibles. Ejecuta 'npm run generate' y reinicia el servidor.");
      } else {
        setAnalyzeError(`Error al analizar: ${message}`);
      }
    } finally {
      setIsRunning(false);
    }
  }

  function handleClear() {
    setMode("valid");
    setCustomInput("");
    setResult(null);
    setAnalyzeError(null);
    setFileError(null);
  }

  function handleLoadFile(text: string) {
    setFileError(null);
    handleInputChange(text);
    setActiveEditorTab("program");
  }

  const revealInEditor = useCallback((line: number) => {
    setActiveEditorTab("program");
    setRevealLine(line);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <AmbientBackground />
      <a
        href="#main-content"
        className="sr-only z-50 bg-background px-3 py-2 font-head focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      >
        Saltar al contenido principal
      </a>
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-20 shrink-0 p-2 pb-0"
      >
        <div className="ide-topbar overflow-hidden">
          <MenuBar
            onLoadFile={handleLoadFile}
            onFileError={setFileError}
            onDownloadInput={() => downloadText(`compiscript_${mode}.cps`, inputValue)}
            onCopyInput={() => navigator.clipboard.writeText(inputValue)}
            onReset={handleClear}
            onAnalyze={handleAnalyze}
            isRunning={isRunning}
            isEmpty={inputValue.trim().length === 0}
            onExportFocus={() => setActiveDockTab("exportar")}
            onOpenDocs={() => setActiveDockTab("documentacion")}
            theme={theme}
            onThemeChange={setTheme}
            aboutOpen={aboutOpen}
            onAboutOpenChange={setAboutOpen}
          />

          <Toolbar
            isRunning={isRunning}
            isEmpty={inputValue.trim().length === 0}
            onAnalyze={handleAnalyze}
            onReset={handleClear}
            result={result}
            theme={theme}
            onThemeChange={setTheme}
          />
        </div>
      </motion.header>

      {(analyzeError || fileError) && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="relative z-20 mx-2 mt-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 shadow-lg backdrop-blur-xl dark:text-red-200"
        >
          {analyzeError ?? fileError}
        </motion.div>
      )}

      <motion.main
        id="main-content"
        initial={{ opacity: 0, scale: 0.992 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 min-h-0 flex-1 overflow-hidden p-2"
        tabIndex={-1}
      >
        <h1 className="sr-only">Compiscript MIPS Compiler IDE</h1>
        <SpotlightSurface className="ide-workbench h-full overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="18" minSize="12" maxSize="30">
            <ActivitySidebar mode={mode} onModeChange={handleModeChange} />
          </ResizablePanel>
          <ResizableHandle withHandle />

          <ResizablePanel defaultSize="52" minSize="30">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="70" minSize="30">
                <EditorTabs
                  activeTab={activeEditorTab}
                  onTabChange={setActiveEditorTab}
                  value={inputValue}
                  onChange={handleInputChange}
                  markers={markers}
                  revealLine={revealLine}
                  onRunShortcut={handleAnalyze}
                  theme={theme}
                  onCursorChange={setCursor}
                  scopeChain={scopeChain}
                  onClearScope={() => setScopeChain(null)}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="30" minSize="15">
                <ProblemsPanel result={result} onRevealLine={revealInEditor} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />

          <ResizablePanel defaultSize="30" minSize="20" maxSize="45">
            <RightDock
              result={result}
              inputText={inputValue}
              activeTab={activeDockTab}
              onTabChange={setActiveDockTab}
              onSelectScope={setScopeChain}
              onLoadTestSource={handleLoadFile}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
        </SpotlightSurface>
      </motion.main>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {analysisAnnouncement}
      </div>

      <div className="relative z-20 shrink-0 px-2 pb-2">
        <StatusBar isRunning={isRunning} result={result} value={inputValue} cursor={cursor} />
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onAnalyze={handleAnalyze}
        onReset={handleClear}
        onCopyInput={() => navigator.clipboard.writeText(inputValue)}
        onDownloadInput={() => downloadText(`compiscript_${mode}.cps`, inputValue)}
        onSelectExample={handleModeChange}
        onOpenGrammar={() => setActiveEditorTab("grammar")}
        onSelectDock={setActiveDockTab}
        onOpenAbout={() => setAboutOpen(true)}
        theme={theme}
        onThemeChange={setTheme}
        isRunning={isRunning}
        isEmpty={inputValue.trim().length === 0}
      />
    </div>
    </MotionConfig>
  );
}
