import type { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import type { ParseTree } from "antlr4ts/tree/ParseTree";
import type {
  AdditiveExpressionContext,
  ArrayLiteralContext,
  AssignmentExpressionContext,
  BlockContext,
  ClassDeclarationContext,
  ConditionalExpressionContext,
  ConstantDeclarationContext,
  DoWhileStatementContext,
  EqualityExpressionContext,
  ExpressionContext,
  ForInitializerContext,
  ForStatementContext,
  ForeachStatementContext,
  FunctionDeclarationContext,
  IfStatementContext,
  LeftHandSideContext,
  LiteralExpressionContext,
  LogicalAndExpressionContext,
  LogicalOrExpressionContext,
  MultiplicativeExpressionContext,
  PrimaryAtomContext,
  PrimaryExpressionContext,
  ProgramContext,
  RelationalExpressionContext,
  StatementContext,
  SuffixOperatorContext,
  SwitchStatementContext,
  TryCatchStatementContext,
  UnaryExpressionContext,
  VariableDeclarationContext,
  WhileStatementContext
} from "../generated/CompiscriptParser";
import type { SemanticAnalysisResult } from "../lib/types";
import type { ScopeInfo, ScopeKind } from "../semantic/scopes";
import type { SymbolEntry } from "../semantic/symbols";
import { T, type SemanticType } from "../semantic/semanticTypes";
import { commonType } from "../semantic/typeSystem";
import { LabelFactory, TemporaryAllocator, type Temporary } from "./allocators";
import { buildTacControlFlow } from "./controlFlow";
import {
  emptyTacResult,
  formatTac,
  sourceOf,
  tacOperand,
  type ActivationRecord,
  type ClassLayout,
  type FrameSlot,
  type TacDiagnostic,
  type TacGenerationResult,
  type TacInstruction,
  type TacOperand
} from "./types";

type LValue =
  | { kind: "symbol"; operand: TacOperand }
  | { kind: "capture"; operand: TacOperand; captureIndex: number }
  | { kind: "array"; base: TacOperand; index: TacOperand }
  | { kind: "field"; base: TacOperand; field: TacOperand };

const ALLOCATABLE_SYMBOLS = new Set(["variable", "constant", "parameter", "catch"]);

function children(ctx: ParserRuleContext): ParseTree[] {
  return (ctx as ParserRuleContext & { children?: ParseTree[] }).children ?? [];
}

function operators(ctx: ParserRuleContext): string[] {
  return children(ctx)
    .filter((child) => child.childCount === 0)
    .map((child) => child.text)
    .filter((value) => ["+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">="].includes(value));
}

function symbolOrder(symbol: SymbolEntry): number {
  const match = /([0-9]+)$/.exec(symbol.id);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function storageSize(type: SemanticType): number {
  return type.kind === "primitive" && type.name === "void" ? 0 : 4;
}

function storageAlignment(type: SemanticType): number {
  return Math.max(1, Math.min(8, storageSize(type)));
}

class TacGenerator {
  private readonly instructions: TacInstruction[] = [];
  private readonly diagnostics: TacDiagnostic[] = [];
  private readonly labels = new LabelFactory();
  private readonly temps = new TemporaryAllocator();
  private readonly scopeById = new Map<string, ScopeInfo>();
  private readonly frameById = new Map<string, ActivationRecord>();
  private readonly frameIdByScope = new Map<string, string>();
  private readonly classLayouts: ClassLayout[];
  private readonly breakTargets: string[] = [];
  private readonly continueTargets: string[] = [];
  private currentScopeId: string;
  private currentFrameId: string;
  private nextInstruction = 0;

  constructor(
    private readonly program: ProgramContext,
    private readonly semantic: SemanticAnalysisResult
  ) {
    semantic.scopes.forEach((scope) => this.scopeById.set(scope.id, scope));
    this.currentScopeId = semantic.scopeRootId ?? semantic.scopes[0]?.id ?? "scope-0";
    this.classLayouts = this.buildClassLayouts();
    const frames = this.buildActivationRecords();
    frames.forEach((frame) => this.frameById.set(frame.id, frame));
    this.currentFrameId = this.frameIdByScope.get(this.currentScopeId) ?? frames[0]?.id ?? "frame-scope-0";
    this.temps.beginFrame(this.currentFrameId);
  }

  run(): TacGenerationResult {
    try {
      this.emit("PROGRAM_BEGIN", {}, this.program);
      this.statements(this.program.statement());
      this.emit("PROGRAM_END", {}, this.program);
      this.temps.endFrame(this.currentFrameId);
      this.finalizeFrames();
      const controlFlow = buildTacControlFlow(this.instructions);
      return {
        status: "completed",
        instructions: this.instructions,
        formattedCode: formatTac(this.instructions),
        basicBlocks: controlFlow.blocks,
        controlFlowEdges: controlFlow.edges,
        activationRecords: [...this.frameById.values()],
        classLayouts: this.classLayouts,
        diagnostics: this.diagnostics,
        metrics: {
          instructionCount: this.instructions.length,
          labelCount: this.instructions.filter((instruction) => instruction.op === "LABEL").length,
          temporaryCount: this.temps.created,
          temporariesReuseCount: this.temps.reused,
          peakLiveTemporaries: this.temps.peak,
          activeTemporaryCount: this.temps.activeCount,
          activationRecordCount: this.frameById.size
        }
      };
    } catch (error) {
      this.diagnostics.push({
        code: "TAC_GENERATION_FAILED",
        message: error instanceof Error ? error.message : "Error inesperado durante la generación TAC.",
        severity: "error"
      });
      return {
        ...emptyTacResult("failed", "La generación TAC terminó con un error interno."),
        diagnostics: this.diagnostics
      };
    }
  }

  private emit(
    op: TacInstruction["op"],
    args: Partial<Omit<TacInstruction, "index" | "op" | "scopeId" | "frameId">> = {},
    ctx?: ParserRuleContext
  ): TacInstruction {
    const instruction: TacInstruction = {
      index: this.nextInstruction++,
      op,
      scopeId: this.currentScopeId,
      frameId: this.currentFrameId,
      ...(ctx ? { source: sourceOf(ctx), sourceText: ctx.text } : {}),
      ...args
    };
    this.instructions.push(instruction);
    return instruction;
  }

  private temp(type: SemanticType = T.unknown): TacOperand {
    const temporary = this.temps.acquire(type, this.currentFrameId);
    return { kind: "temporary", value: temporary.name, type, frameId: temporary.frameId };
  }

  private release(operand?: TacOperand): void {
    if (operand?.kind !== "temporary") return;
    this.temps.release({
      name: String(operand.value),
      type: operand.type ?? T.unknown,
      frameId: operand.frameId ?? this.currentFrameId
    });
  }

  private resolveSymbol(name: string, fromScopeId = this.currentScopeId): SymbolEntry | undefined {
    let scopeId: string | null = fromScopeId;
    while (scopeId) {
      const found = this.semantic.symbols.find((symbol) => symbol.scopeId === scopeId && symbol.name === name);
      if (found) return found;
      scopeId = this.scopeById.get(scopeId)?.parentId ?? null;
    }
    return undefined;
  }

  private symbolOperand(symbol: SymbolEntry | undefined, fallback: string): TacOperand {
    if (!symbol) return { kind: "symbol", value: fallback };
    const storage = symbol.storage;
    return {
      kind: "symbol",
      value: storage?.label ?? symbol.name,
      symbolId: symbol.id,
      frameId: storage?.frameId,
      offset: storage?.offset,
      captureIndex: storage?.captureIndex,
      type: symbol.type
    };
  }

  private readIdentifier(name: string, ctx: ParserRuleContext): TacOperand {
    const symbol = this.resolveSymbol(name);
    const operand = this.symbolOperand(symbol, name);
    if (!symbol || !symbol.captured || !symbol.storage?.frameId || symbol.storage.frameId === this.currentFrameId) {
      return operand;
    }
    const captureIndex = this.ensureCapture(symbol);
    const result = this.temp(symbol.type);
    this.emit("LOAD_CAPTURE", {
      arg1: operand,
      arg2: tacOperand(captureIndex),
      result
    }, ctx);
    return result;
  }

  private ensureCapture(symbol: SymbolEntry): number {
    const frame = this.frameById.get(this.currentFrameId);
    if (!frame) return 0;
    const existing = frame.slots.find((slot) => slot.kind === "captured" && slot.symbolId === symbol.id);
    if (existing) return frame.slots.filter((slot) => slot.kind === "captured").indexOf(existing);
    const size = storageSize(symbol.type);
    const alignment = storageAlignment(symbol.type);
    const offset = alignUp(
      frame.slots.reduce((max, slot) => Math.max(max, slot.offset + slot.size), 0),
      alignment
    );
    frame.slots.push({
      name: symbol.name,
      symbolId: symbol.id,
      kind: "captured",
      type: symbol.type,
      offset,
      size,
      alignment
    });
    return frame.slots.filter((slot) => slot.kind === "captured").length - 1;
  }

  private statement(ctx: StatementContext): void {
    const variable = ctx.variableDeclaration();
    if (variable) return this.variableDeclaration(variable);
    const constant = ctx.constantDeclaration();
    if (constant) return this.constantDeclaration(constant);
    const fn = ctx.functionDeclaration();
    if (fn) return this.functionDeclaration(fn);
    const cls = ctx.classDeclaration();
    if (cls) return this.classDeclaration(cls);
    const print = ctx.printStatement();
    if (print) {
      const value = this.expression(print.expression());
      this.emit("PRINT", { arg1: value }, print);
      this.release(value);
      return;
    }
    const block = ctx.block();
    if (block) return this.block(block, "block", "bloque");
    const ifStatement = ctx.ifStatement();
    if (ifStatement) return this.ifStatement(ifStatement);
    const whileStatement = ctx.whileStatement();
    if (whileStatement) return this.whileStatement(whileStatement);
    const doWhile = ctx.doWhileStatement();
    if (doWhile) return this.doWhileStatement(doWhile);
    const forStatement = ctx.forStatement();
    if (forStatement) return this.forStatement(forStatement);
    const foreach = ctx.foreachStatement();
    if (foreach) return this.foreachStatement(foreach);
    const tryCatch = ctx.tryCatchStatement();
    if (tryCatch) return this.tryCatchStatement(tryCatch);
    const switchStatement = ctx.switchStatement();
    if (switchStatement) return this.switchStatement(switchStatement);
    if (ctx.breakStatement()) {
      const target = this.breakTargets[this.breakTargets.length - 1];
      if (target) this.emit("GOTO", { arg1: tacOperand(target, "label") }, ctx);
      return;
    }
    if (ctx.continueStatement()) {
      const target = this.continueTargets[this.continueTargets.length - 1];
      if (target) this.emit("GOTO", { arg1: tacOperand(target, "label") }, ctx);
      return;
    }
    const returnStatement = ctx.returnStatement();
    if (returnStatement) {
      const expression = returnStatement.expression();
      const value = expression ? this.expression(expression) : undefined;
      this.emit("RETURN", { arg1: value }, returnStatement);
      this.release(value);
      return;
    }
    const expressionStatement = ctx.expressionStatement();
    if (expressionStatement) {
      this.release(this.expression(expressionStatement.expression()));
    }
  }

  private statements(statements: StatementContext[]): void {
    statements.filter((statement) => statement.functionDeclaration()).forEach((statement) => this.statement(statement));
    statements.filter((statement) => !statement.functionDeclaration()).forEach((statement) => this.statement(statement));
  }

  private variableDeclaration(ctx: VariableDeclarationContext): void {
    const initializer = ctx.initializer();
    if (!initializer) return;
    const value = this.expression(initializer.expression());
    const symbol = this.resolveSymbol(ctx.Identifier().text);
    this.emit("MOV", { arg1: value, result: this.symbolOperand(symbol, ctx.Identifier().text) }, ctx);
    this.release(value);
  }

  private constantDeclaration(ctx: ConstantDeclarationContext): void {
    const value = this.expression(ctx.expression());
    const symbol = this.resolveSymbol(ctx.Identifier().text);
    this.emit("MOV", { arg1: value, result: this.symbolOperand(symbol, ctx.Identifier().text) }, ctx);
    this.release(value);
  }

  private block(ctx: BlockContext, kind: ScopeKind, name: string): void {
    this.withScope(kind, name, ctx, () => this.statements(ctx.statement()));
  }

  private ifStatement(ctx: IfStatementContext): void {
    const falseLabel = this.labels.next("if_false");
    const endLabel = this.labels.next("if_end");
    const condition = this.expression(ctx.expression());
    this.emit("IF_FALSE", { arg1: condition, result: tacOperand(falseLabel, "label") }, ctx.expression());
    this.release(condition);
    const branches = ctx.block();
    this.block(branches[0], "block", "bloque");
    if (branches.length > 1) {
      this.emit("GOTO", { arg1: tacOperand(endLabel, "label") }, ctx);
      this.emit("LABEL", { result: tacOperand(falseLabel, "label") }, ctx);
      this.block(branches[1], "block", "bloque");
      this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
    } else {
      this.emit("LABEL", { result: tacOperand(falseLabel, "label") }, ctx);
    }
  }

  private whileStatement(ctx: WhileStatementContext): void {
    const conditionLabel = this.labels.next("while_condition");
    const endLabel = this.labels.next("while_end");
    this.emit("LABEL", { result: tacOperand(conditionLabel, "label") }, ctx);
    const condition = this.expression(ctx.expression());
    this.emit("IF_FALSE", { arg1: condition, result: tacOperand(endLabel, "label") }, ctx.expression());
    this.release(condition);
    this.breakTargets.push(endLabel);
    this.continueTargets.push(conditionLabel);
    this.block(ctx.block(), "loop", "cuerpo de while");
    this.continueTargets.pop();
    this.breakTargets.pop();
    this.emit("GOTO", { arg1: tacOperand(conditionLabel, "label") }, ctx);
    this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
  }

  private doWhileStatement(ctx: DoWhileStatementContext): void {
    const bodyLabel = this.labels.next("do_body");
    const conditionLabel = this.labels.next("do_condition");
    const endLabel = this.labels.next("do_end");
    this.emit("LABEL", { result: tacOperand(bodyLabel, "label") }, ctx);
    this.breakTargets.push(endLabel);
    this.continueTargets.push(conditionLabel);
    this.block(ctx.block(), "loop", "cuerpo de do-while");
    this.continueTargets.pop();
    this.breakTargets.pop();
    this.emit("LABEL", { result: tacOperand(conditionLabel, "label") }, ctx.expression());
    const condition = this.expression(ctx.expression());
    this.emit("IF_TRUE", { arg1: condition, result: tacOperand(bodyLabel, "label") }, ctx.expression());
    this.release(condition);
    this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
  }

  private forStatement(ctx: ForStatementContext): void {
    this.withScope("loop", "for", ctx, () => {
      const initializer = ctx.forInitializer();
      if (initializer) this.forInitializer(initializer);
      const expressions = ctx.expression();
      let condition: ExpressionContext | undefined;
      let update: ExpressionContext | undefined;
      if (expressions.length === 2) {
        [condition, update] = expressions;
      } else if (expressions.length === 1) {
        if (expressions[0].start.tokenIndex < ctx.SEMI(1).symbol.tokenIndex) condition = expressions[0];
        else update = expressions[0];
      }
      const conditionLabel = this.labels.next("for_condition");
      const updateLabel = this.labels.next("for_update");
      const endLabel = this.labels.next("for_end");
      this.emit("LABEL", { result: tacOperand(conditionLabel, "label") }, ctx);
      if (condition) {
        const value = this.expression(condition);
        this.emit("IF_FALSE", { arg1: value, result: tacOperand(endLabel, "label") }, condition);
        this.release(value);
      }
      this.breakTargets.push(endLabel);
      this.continueTargets.push(updateLabel);
      this.block(ctx.block(), "block", "bloque");
      this.continueTargets.pop();
      this.breakTargets.pop();
      this.emit("LABEL", { result: tacOperand(updateLabel, "label") }, ctx);
      if (update) this.release(this.expression(update));
      this.emit("GOTO", { arg1: tacOperand(conditionLabel, "label") }, ctx);
      this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
    });
  }

  private forInitializer(ctx: ForInitializerContext): void {
    const identifier = ctx.Identifier();
    if (identifier) {
      const initializer = ctx.initializer();
      if (!initializer) return;
      const value = this.expression(initializer.expression());
      this.emit("MOV", {
        arg1: value,
        result: this.symbolOperand(this.resolveSymbol(identifier.text), identifier.text)
      }, ctx);
      this.release(value);
      return;
    }
    const expression = ctx.expression();
    if (expression) this.release(this.expression(expression));
  }

  private foreachStatement(ctx: ForeachStatementContext): void {
    this.withScope("loop", "foreach", ctx, () => {
      const iterable = this.expression(ctx.expression());
      const index = this.temp(T.integer);
      this.emit("MOV", { arg1: tacOperand(0), result: index }, ctx);
      const conditionLabel = this.labels.next("foreach_condition");
      const updateLabel = this.labels.next("foreach_update");
      const endLabel = this.labels.next("foreach_end");
      this.emit("LABEL", { result: tacOperand(conditionLabel, "label") }, ctx);
      const length = this.temp(T.integer);
      this.emit("ARRAY_LENGTH", { arg1: iterable, result: length }, ctx.expression());
      const condition = this.temp(T.boolean);
      this.emit("LT", { arg1: index, arg2: length, result: condition }, ctx);
      this.release(length);
      this.emit("IF_FALSE", { arg1: condition, result: tacOperand(endLabel, "label") }, ctx);
      this.release(condition);
      const item = this.temp(iterable.type?.kind === "array" ? iterable.type.element : T.unknown);
      this.emit("ARRAY_GET", { arg1: iterable, arg2: index, result: item }, ctx);
      this.emit("MOV", {
        arg1: item,
        result: this.symbolOperand(this.resolveSymbol(ctx.Identifier().text), ctx.Identifier().text)
      }, ctx);
      this.release(item);
      this.breakTargets.push(endLabel);
      this.continueTargets.push(updateLabel);
      this.block(ctx.block(), "block", "bloque");
      this.continueTargets.pop();
      this.breakTargets.pop();
      this.emit("LABEL", { result: tacOperand(updateLabel, "label") }, ctx);
      const next = this.temp(T.integer);
      this.emit("ADD", { arg1: index, arg2: tacOperand(1), result: next }, ctx);
      this.emit("MOV", { arg1: next, result: index }, ctx);
      this.release(next);
      this.emit("GOTO", { arg1: tacOperand(conditionLabel, "label") }, ctx);
      this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
      this.release(index);
      this.release(iterable);
    });
  }

  private tryCatchStatement(ctx: TryCatchStatementContext): void {
    const catchLabel = this.labels.next("catch");
    const endLabel = this.labels.next("try_end");
    this.emit("TRY_BEGIN", { result: tacOperand(catchLabel, "label") }, ctx);
    this.block(ctx.block(0), "block", "bloque");
    this.emit("TRY_END", {}, ctx);
    this.emit("GOTO", { arg1: tacOperand(endLabel, "label") }, ctx);
    this.emit("LABEL", { result: tacOperand(catchLabel, "label") }, ctx);
    this.withScope("catch", "catch", ctx, () => {
      this.emit("CATCH_BEGIN", {
        result: this.symbolOperand(this.resolveSymbol(ctx.Identifier().text), ctx.Identifier().text)
      }, ctx);
      this.statements(ctx.block(1).statement());
    });
    this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
  }

  private switchStatement(ctx: SwitchStatementContext): void {
    this.withScope("switch", "switch", ctx, () => {
      const selector = this.expression(ctx.expression());
      const endLabel = this.labels.next("switch_end");
      const caseLabels = ctx.switchCase().map(() => this.labels.next("case"));
      const defaultLabel = ctx.defaultCase() ? this.labels.next("default") : endLabel;
      ctx.switchCase().forEach((switchCase, index) => {
        const caseValue = this.expression(switchCase.expression());
        const comparison = this.temp(T.boolean);
        this.emit("EQ", { arg1: selector, arg2: caseValue, result: comparison }, switchCase);
        this.release(caseValue);
        this.emit("IF_TRUE", { arg1: comparison, result: tacOperand(caseLabels[index], "label") }, switchCase);
        this.release(comparison);
      });
      this.emit("GOTO", { arg1: tacOperand(defaultLabel, "label") }, ctx);
      this.breakTargets.push(endLabel);
      ctx.switchCase().forEach((switchCase, index) => {
        this.emit("LABEL", { result: tacOperand(caseLabels[index], "label") }, switchCase);
        this.statements(switchCase.statement());
      });
      const defaultCase = ctx.defaultCase();
      if (defaultCase) {
        this.emit("LABEL", { result: tacOperand(defaultLabel, "label") }, defaultCase);
        this.statements(defaultCase.statement());
      }
      this.breakTargets.pop();
      this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
      this.release(selector);
    });
  }

  private functionDeclaration(ctx: FunctionDeclarationContext, prologue?: () => void): void {
    const name = ctx.Identifier().text;
    const symbol = this.resolveSymbol(name);
    const functionScope = this.findScope("function", name, ctx);
    if (!functionScope) throw new Error(`No se encontró el ámbito semántico de la función '${name}'.`);
    const outerScopeId = this.currentScopeId;
    const outerFrameId = this.currentFrameId;
    const outerScope = this.scopeById.get(outerScopeId);
    const afterLabel = this.labels.next(`after_${name}`);
    this.emit("GOTO", { arg1: tacOperand(afterLabel, "label") }, ctx);
    this.currentScopeId = functionScope.id;
    this.currentFrameId = this.frameIdByScope.get(functionScope.id) ?? `frame-${functionScope.id}`;
    this.temps.beginFrame(this.currentFrameId);
    const functionOperand = this.symbolOperand(symbol, name);
    const frame = this.frameById.get(this.currentFrameId);
    if (frame && symbol?.type.kind === "function") frame.returnType = symbol.type.returnType;
    this.emit("FUNC_BEGIN", { result: functionOperand }, ctx);
    prologue?.();
    this.statements(ctx.block().statement());
    const last = this.instructions[this.instructions.length - 1];
    if (last?.op !== "RETURN") this.emit("RETURN", {}, ctx.block());
    this.emit("FUNC_END", { result: functionOperand }, ctx);
    this.temps.endFrame(this.currentFrameId);
    const functionFrame = this.frameById.get(this.currentFrameId);
    this.currentScopeId = outerScopeId;
    this.currentFrameId = outerFrameId;
    this.temps.beginFrame(this.currentFrameId);
    this.emit("LABEL", { result: tacOperand(afterLabel, "label") }, ctx);
    if (outerScope?.kind !== "global" && outerScope?.kind !== "class") {
      const closure = this.temp(symbol?.type ?? T.unknown);
      this.emit("MAKE_CLOSURE", { arg1: functionOperand, result: closure }, ctx);
      const captures = functionFrame?.slots.filter((slot) => slot.kind === "captured") ?? [];
      captures.forEach((capture, captureIndex) => {
        const capturedSymbol = this.semantic.symbols.find((candidate) => candidate.id === capture.symbolId);
        if (capturedSymbol?.storage?.frameId !== this.currentFrameId && capturedSymbol) this.ensureCapture(capturedSymbol);
        this.emit("CAPTURE", {
          arg1: this.symbolOperand(capturedSymbol, capture.name),
          result: { kind: "constant", value: captureIndex }
        }, ctx);
      });
      this.emit("MOV", { arg1: closure, result: functionOperand }, ctx);
      this.release(closure);
    }
  }

  private classDeclaration(ctx: ClassDeclarationContext): void {
    const name = ctx.Identifier(0).text;
    this.withScope("class", name, ctx, () => {
      const initializeFields = (owner = this.readIdentifier("this", ctx)) => {
        for (const member of ctx.classMember()) {
          const variable = member.variableDeclaration();
          const constant = member.constantDeclaration();
          const expression = variable?.initializer()?.expression() ?? constant?.expression();
          const fieldName = variable?.Identifier().text ?? constant?.Identifier().text;
          if (!expression || !fieldName) continue;
          const value = this.expression(expression);
          this.emit("SET_FIELD", { arg1: owner, arg2: tacOperand(fieldName, "symbol"), result: value }, expression);
          this.release(value);
        }
      };
      const explicitConstructor = ctx.classMember()
        .map((member) => member.functionDeclaration())
        .find((fn) => fn?.Identifier().text === "constructor");

      if (!explicitConstructor) this.implicitConstructor(ctx, name, initializeFields);

      for (const member of ctx.classMember()) {
        const fn = member.functionDeclaration();
        if (fn) {
          this.functionDeclaration(
            fn,
            fn.Identifier().text === "constructor" ? () => initializeFields() : undefined
          );
        }
      }
    });
  }

  /** Emite un constructor real para las clases que solo poseen el constructor
   * implícito. La firma se hereda del constructor padre, tal como la valida la
   * fase semántica, y los inicializadores propios se ejecutan después de él. */
  private implicitConstructor(
    ctx: ClassDeclarationContext,
    className: string,
    initializeFields: (owner?: TacOperand) => void
  ): void {
    const classType = this.resolveSymbol(className)?.type;
    const layout = this.classLayouts.find((candidate) => classType?.kind === "class" && candidate.classId === classType.classId);
    const constructor = layout?.methods?.find((method) => method.name === "constructor");
    if (!layout || !constructor) return;

    const parentLayout = layout.parentClassId
      ? this.classLayouts.find((candidate) => candidate.classId === layout.parentClassId)
      : undefined;
    const parentConstructor = parentLayout?.methods?.find((method) => method.name === "constructor");
    const parameters = constructor.parameters ?? [];
    const outerScopeId = this.currentScopeId;
    const outerFrameId = this.currentFrameId;
    const afterLabel = this.labels.next(`after_${className}_constructor`);
    const frameId = `frame-implicit-${layout.classId}`;
    const slots: FrameSlot[] = [];
    let offset = 0;
    const addParameter = (name: string, type: SemanticType): TacOperand => {
      const size = storageSize(type);
      const alignment = storageAlignment(type);
      offset = alignUp(offset, alignment);
      const operand: TacOperand = { kind: "symbol", value: name, frameId, offset, type };
      slots.push({ name, kind: "parameter", type, offset, size, alignment });
      offset += size;
      return operand;
    };
    const owner = addParameter("this", T.instance(className, layout.classId));
    const forwardedParameters = parameters.map((parameter) => addParameter(parameter.name, parameter.type));

    this.frameById.set(frameId, {
      id: frameId,
      name: `${className}.constructor`,
      kind: "constructor",
      scopeId: outerScopeId,
      parentFrameId: outerFrameId,
      lexicalParentFrameId: outerFrameId,
      parameterCount: slots.length,
      parameterBytes: slots.reduce((sum, slot) => sum + slot.size, 0),
      localBytes: 0,
      temporaryBytes: 0,
      totalBytes: alignUp(offset, 8),
      slots,
      staticLinkRequired: false
    });

    this.emit("GOTO", { arg1: tacOperand(afterLabel, "label") }, ctx);
    this.currentFrameId = frameId;
    this.temps.beginFrame(frameId);
    const functionOperand = tacOperand(constructor.label, "symbol");
    this.emit("FUNC_BEGIN", { result: functionOperand }, ctx);
    if (parentConstructor) {
      this.emit("PARAM", { arg1: owner }, ctx);
      forwardedParameters.forEach((parameter) => this.emit("PARAM", { arg1: parameter }, ctx));
      this.emit("CALL", {
        arg1: tacOperand(parentConstructor.label, "symbol"),
        arg2: tacOperand(forwardedParameters.length + 1)
      }, ctx);
    }
    initializeFields(owner);
    this.emit("RETURN", {}, ctx);
    this.emit("FUNC_END", { result: functionOperand }, ctx);
    this.temps.endFrame(frameId);
    this.currentScopeId = outerScopeId;
    this.currentFrameId = outerFrameId;
    this.temps.beginFrame(outerFrameId);
    this.emit("LABEL", { result: tacOperand(afterLabel, "label") }, ctx);
  }

  private expression(ctx: ExpressionContext): TacOperand {
    return this.assignment(ctx.assignmentExpression());
  }

  private assignment(ctx: AssignmentExpressionContext): TacOperand {
    const conditional = ctx.conditionalExpression();
    if (conditional) return this.conditional(conditional);
    const target = ctx.leftHandSide();
    const right = ctx.assignmentExpression();
    if (!target || !right) return tacOperand(null);
    const value = this.assignment(right);
    this.write(this.lvalue(target), value, ctx);
    return value;
  }

  private conditional(ctx: ConditionalExpressionContext): TacOperand {
    const condition = this.logicalOr(ctx.logicalOrExpression());
    if (!ctx.QUESTION()) return condition;
    const branches = ctx.expression();
    const falseLabel = this.labels.next("ternary_false");
    const endLabel = this.labels.next("ternary_end");
    const result = this.temp(T.unknown);
    this.emit("IF_FALSE", { arg1: condition, result: tacOperand(falseLabel, "label") }, ctx);
    this.release(condition);
    const whenTrue = this.expression(branches[0]);
    this.emit("MOV", { arg1: whenTrue, result }, branches[0]);
    this.release(whenTrue);
    this.emit("GOTO", { arg1: tacOperand(endLabel, "label") }, ctx);
    this.emit("LABEL", { result: tacOperand(falseLabel, "label") }, ctx);
    const whenFalse = this.expression(branches[1]);
    result.type = commonType([whenTrue.type ?? T.unknown, whenFalse.type ?? T.unknown]) ?? T.unknown;
    this.emit("MOV", { arg1: whenFalse, result }, branches[1]);
    this.release(whenFalse);
    this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
    return result;
  }

  private logicalOr(ctx: LogicalOrExpressionContext): TacOperand {
    const operands = ctx.logicalAndExpression();
    if (operands.length === 1) return this.logicalAnd(operands[0]);
    const trueLabel = this.labels.next("or_true");
    const endLabel = this.labels.next("or_end");
    const result = this.temp(T.boolean);
    for (const operand of operands) {
      const value = this.logicalAnd(operand);
      this.emit("IF_TRUE", { arg1: value, result: tacOperand(trueLabel, "label") }, operand);
      this.release(value);
    }
    this.emit("MOV", { arg1: tacOperand(false), result }, ctx);
    this.emit("GOTO", { arg1: tacOperand(endLabel, "label") }, ctx);
    this.emit("LABEL", { result: tacOperand(trueLabel, "label") }, ctx);
    this.emit("MOV", { arg1: tacOperand(true), result }, ctx);
    this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
    return result;
  }

  private logicalAnd(ctx: LogicalAndExpressionContext): TacOperand {
    const operands = ctx.equalityExpression();
    if (operands.length === 1) return this.equality(operands[0]);
    const falseLabel = this.labels.next("and_false");
    const endLabel = this.labels.next("and_end");
    const result = this.temp(T.boolean);
    for (const operand of operands) {
      const value = this.equality(operand);
      this.emit("IF_FALSE", { arg1: value, result: tacOperand(falseLabel, "label") }, operand);
      this.release(value);
    }
    this.emit("MOV", { arg1: tacOperand(true), result }, ctx);
    this.emit("GOTO", { arg1: tacOperand(endLabel, "label") }, ctx);
    this.emit("LABEL", { result: tacOperand(falseLabel, "label") }, ctx);
    this.emit("MOV", { arg1: tacOperand(false), result }, ctx);
    this.emit("LABEL", { result: tacOperand(endLabel, "label") }, ctx);
    return result;
  }

  private equality(ctx: EqualityExpressionContext): TacOperand {
    return this.foldBinary(
      ctx.relationalExpression(),
      operators(ctx),
      (operand) => this.relational(operand),
      { "==": "EQ", "!=": "NE" },
      T.boolean,
      ctx
    );
  }

  private relational(ctx: RelationalExpressionContext): TacOperand {
    return this.foldBinary(
      ctx.additiveExpression(),
      operators(ctx),
      (operand) => this.additive(operand),
      { "<": "LT", "<=": "LE", ">": "GT", ">=": "GE" },
      T.boolean,
      ctx
    );
  }

  private additive(ctx: AdditiveExpressionContext): TacOperand {
    return this.foldBinary(
      ctx.multiplicativeExpression(),
      operators(ctx),
      (operand) => this.multiplicative(operand),
      { "+": "ADD", "-": "SUB" },
      undefined,
      ctx
    );
  }

  private multiplicative(ctx: MultiplicativeExpressionContext): TacOperand {
    return this.foldBinary(
      ctx.unaryExpression(),
      operators(ctx),
      (operand) => this.unary(operand),
      { "*": "MUL", "/": "DIV", "%": "MOD" },
      undefined,
      ctx
    );
  }

  private foldBinary<T extends ParserRuleContext>(
    operands: T[],
    ops: string[],
    evaluate: (operand: T) => TacOperand,
    opcodeByText: Record<string, TacInstruction["op"]>,
    forcedType: SemanticType | undefined,
    ctx: ParserRuleContext
  ): TacOperand {
    let left = evaluate(operands[0]);
    for (let index = 1; index < operands.length; index += 1) {
      const right = evaluate(operands[index]);
      const type = forcedType ?? this.numericResultType(left.type, right.type);
      const result = this.temp(type);
      this.emit(opcodeByText[ops[index - 1]], { arg1: left, arg2: right, result }, ctx);
      this.release(left);
      this.release(right);
      left = result;
    }
    return left;
  }

  private numericResultType(left?: SemanticType, right?: SemanticType): SemanticType {
    if (left?.kind === "primitive" && left.name === "string") return T.string;
    if (right?.kind === "primitive" && right.name === "string") return T.string;
    if (
      (left?.kind === "primitive" && left.name === "float") ||
      (right?.kind === "primitive" && right.name === "float")
    ) return T.float;
    return T.integer;
  }

  private unary(ctx: UnaryExpressionContext): TacOperand {
    const primary = ctx.primaryExpression();
    if (primary) return this.primary(primary);
    const nested = ctx.unaryExpression();
    if (!nested) return tacOperand(null);
    const value = this.unary(nested);
    const result = this.temp(ctx.NOT() ? T.boolean : value.type ?? T.unknown);
    this.emit(ctx.NOT() ? "NOT" : "NEG", { arg1: value, result }, ctx);
    this.release(value);
    return result;
  }

  private primary(ctx: PrimaryExpressionContext): TacOperand {
    const literal = ctx.literalExpression();
    if (literal) return this.literal(literal);
    const leftHandSide = ctx.leftHandSide();
    if (leftHandSide) return this.leftHandValue(leftHandSide);
    const expression = ctx.expression();
    return expression ? this.expression(expression) : tacOperand(null);
  }

  private literal(ctx: LiteralExpressionContext): TacOperand {
    const array = ctx.arrayLiteral();
    if (array) return this.arrayLiteral(array);
    if (ctx.TRUE()) return { kind: "constant", value: true, type: T.boolean };
    if (ctx.FALSE()) return { kind: "constant", value: false, type: T.boolean };
    if (ctx.NULL()) return { kind: "constant", value: null, type: T.null };
    if (ctx.IntegerLiteral()) return { kind: "constant", value: Number(ctx.text), type: T.integer };
    if (ctx.FloatLiteral()) return { kind: "constant", value: Number(ctx.text), type: T.float };
    if (ctx.StringLiteral()) {
      let value = ctx.text.slice(1, -1);
      try { value = JSON.parse(ctx.text) as string; } catch {}
      return { kind: "constant", value, type: T.string };
    }
    return tacOperand(null);
  }

  private arrayLiteral(ctx: ArrayLiteralContext): TacOperand {
    const result = this.temp(T.array(T.unknown));
    const values = ctx.expression();
    this.emit("NEW_ARRAY", { arg1: tacOperand(values.length), result }, ctx);
    const elementTypes: SemanticType[] = [];
    values.forEach((expression, index) => {
      const value = this.expression(expression);
      elementTypes.push(value.type ?? T.unknown);
      this.emit("ARRAY_SET", { arg1: result, arg2: tacOperand(index), result: value }, expression);
      this.release(value);
    });
    result.type = T.array(commonType(elementTypes) ?? T.unknown);
    return result;
  }

  private primaryAtom(ctx: PrimaryAtomContext): TacOperand {
    if (ctx.NEW()) {
      const className = ctx.Identifier()?.text ?? "<clase>";
      const classType = this.resolveSymbol(className)?.type;
      const result = this.temp(T.instance(className, classType?.kind === "class" ? classType.classId : className));
      const args = ctx.arguments()?.expression() ?? [];
      const constructorLabel = this.classLayouts
        .find((layout) => classType?.kind === "class" && layout.classId === classType.classId)
        ?.methods?.find((method) => method.name === "constructor")?.label ?? `${className}.constructor`;
      this.emit("NEW_OBJECT", { arg1: tacOperand(className, "symbol"), arg2: tacOperand(args.length), result }, ctx);
      this.emit("PARAM", { arg1: result }, ctx);
      for (const argument of args) {
        const value = this.expression(argument);
        this.emit("PARAM", { arg1: value }, argument);
        this.release(value);
      }
      this.emit("CALL", {
        arg1: tacOperand(constructorLabel, "symbol"),
        arg2: tacOperand(args.length + 1)
      }, ctx);
      return result;
    }
    const name = ctx.THIS() ? "this" : ctx.Identifier()?.text;
    return name ? this.readIdentifier(name, ctx) : tacOperand(null);
  }

  private leftHandValue(ctx: LeftHandSideContext): TacOperand {
    let current = this.primaryAtom(ctx.primaryAtom());
    const suffixes = ctx.suffixOperator();
    for (let index = 0; index < suffixes.length; index += 1) {
      const suffix = suffixes[index];
      const next = suffixes[index + 1];
      if (suffix.DOT() && next?.LPAREN()) {
        current = this.applyMethodCall(current, suffix, next);
        index += 1;
      } else {
        current = this.applySuffix(current, suffix);
      }
    }
    return current;
  }

  private applyMethodCall(base: TacOperand, property: SuffixOperatorContext, call: SuffixOperatorContext): TacOperand {
    const methodName = property.Identifier()?.text ?? "<método>";
    const methodType = this.memberType(base.type, methodName);
    const callable = this.temp(methodType.kind === "function" ? T.fn([base.type ?? T.unknown, ...methodType.params], methodType.returnType) : methodType);
    this.emit("GET_FIELD", { arg1: base, arg2: tacOperand(methodName, "symbol"), result: callable }, property);
    this.emit("PARAM", { arg1: base }, property);
    const args = call.arguments()?.expression() ?? [];
    for (const argument of args) {
      const value = this.expression(argument);
      this.emit("PARAM", { arg1: value }, argument);
      this.release(value);
    }
    const result = this.temp(methodType.kind === "function" ? methodType.returnType : T.unknown);
    this.emit("CALL", { arg1: callable, arg2: tacOperand(args.length + 1), result }, call);
    this.release(callable);
    this.release(base);
    return result;
  }

  private applySuffix(base: TacOperand, suffix: SuffixOperatorContext): TacOperand {
    if (suffix.LPAREN()) {
      const args = suffix.arguments()?.expression() ?? [];
      for (const argument of args) {
        const value = this.expression(argument);
        this.emit("PARAM", { arg1: value }, argument);
        this.release(value);
      }
      const returnType = base.type?.kind === "function" ? base.type.returnType : T.unknown;
      const isVoid = returnType.kind === "primitive" && returnType.name === "void";
      const result = isVoid ? undefined : this.temp(returnType);
      this.emit("CALL", { arg1: base, arg2: tacOperand(args.length), result }, suffix);
      this.release(base);
      return result ?? { kind: "constant", value: null, type: T.void };
    }
    if (suffix.LBRACKET()) {
      const index = this.expression(suffix.expression()!);
      const type = base.type?.kind === "array" ? base.type.element : T.unknown;
      const result = this.temp(type);
      this.emit("ARRAY_GET", { arg1: base, arg2: index, result }, suffix);
      this.release(base);
      this.release(index);
      return result;
    }
    const field = suffix.Identifier()?.text ?? "<campo>";
    const result = this.temp(this.memberType(base.type, field));
    this.emit("GET_FIELD", { arg1: base, arg2: tacOperand(field, "symbol"), result }, suffix);
    this.release(base);
    return result;
  }

  private memberType(type: SemanticType | undefined, name: string): SemanticType {
    const classId = type?.kind === "instance" || type?.kind === "class" ? type.classId : undefined;
    const layout = this.classLayouts.find((candidate) => candidate.classId === classId);
    const field = layout?.fields.find((candidate) => candidate.name === name);
    if (field) return field.type;
    const method = layout?.methods?.find((candidate) => candidate.name === name);
    return this.semantic.symbols.find((symbol) => symbol.id === method?.symbolId)?.type ?? T.unknown;
  }

  private lvalue(ctx: LeftHandSideContext): LValue {
    const suffixes = ctx.suffixOperator();
    if (suffixes.length === 0) {
      const identifier = ctx.primaryAtom().Identifier()?.text ?? (ctx.primaryAtom().THIS() ? "this" : ctx.text);
      const symbol = this.resolveSymbol(identifier);
      const operand = this.symbolOperand(symbol, identifier);
      if (symbol?.captured && symbol.storage?.frameId && symbol.storage.frameId !== this.currentFrameId) {
        return { kind: "capture", operand, captureIndex: this.ensureCapture(symbol) };
      }
      return { kind: "symbol", operand };
    }
    let base = this.primaryAtom(ctx.primaryAtom());
    for (let index = 0; index < suffixes.length - 1; index += 1) base = this.applySuffix(base, suffixes[index]);
    const last = suffixes[suffixes.length - 1];
    if (last.LBRACKET()) {
      return { kind: "array", base, index: this.expression(last.expression()!) };
    }
    return { kind: "field", base, field: tacOperand(last.Identifier()?.text ?? "<campo>", "symbol") };
  }

  private write(target: LValue, value: TacOperand, ctx: ParserRuleContext): void {
    if (target.kind === "symbol") {
      this.emit("MOV", { arg1: value, result: target.operand }, ctx);
      return;
    }
    if (target.kind === "capture") {
      this.emit("STORE_CAPTURE", {
        arg1: target.operand,
        arg2: tacOperand(target.captureIndex),
        result: value
      }, ctx);
      return;
    }
    if (target.kind === "array") {
      this.emit("ARRAY_SET", { arg1: target.base, arg2: target.index, result: value }, ctx);
      this.release(target.base);
      this.release(target.index);
      return;
    }
    this.emit("SET_FIELD", { arg1: target.base, arg2: target.field, result: value }, ctx);
    this.release(target.base);
  }

  private findScope(kind: ScopeKind, name: string, ctx: ParserRuleContext): ScopeInfo | undefined {
    const location = sourceOf(ctx);
    return this.semantic.scopes.find((scope) =>
      scope.kind === kind &&
      scope.name === name &&
      scope.parentId === this.currentScopeId &&
      scope.start.line === location?.line &&
      scope.start.column === location?.column
    ) ?? this.semantic.scopes.find((scope) =>
      scope.kind === kind &&
      scope.name === name &&
      scope.parentId === this.currentScopeId
    );
  }

  private withScope(kind: ScopeKind, name: string, ctx: ParserRuleContext, action: () => void): void {
    const scope = this.findScope(kind, name, ctx);
    if (!scope) {
      action();
      return;
    }
    const previousScope = this.currentScopeId;
    const previousFrame = this.currentFrameId;
    this.currentScopeId = scope.id;
    this.currentFrameId = this.frameIdByScope.get(scope.id) ?? previousFrame;
    this.temps.beginFrame(this.currentFrameId);
    action();
    this.currentScopeId = previousScope;
    this.currentFrameId = previousFrame;
    this.temps.beginFrame(this.currentFrameId);
  }

  private buildClassLayouts(): ClassLayout[] {
    const classes = this.semantic.symbols.filter((symbol) => symbol.kind === "class");
    const classScopeBySymbol = new Map<string, ScopeInfo>();
    for (const classSymbol of classes) {
      const scope = this.semantic.scopes.find((candidate) =>
        candidate.kind === "class" &&
        candidate.name === classSymbol.name &&
        candidate.start.line === classSymbol.declaration.line &&
        candidate.start.column === classSymbol.declaration.column
      );
      if (scope) classScopeBySymbol.set(classSymbol.id, scope);
      classSymbol.storage = { kind: "class", label: `class_${classSymbol.id}_${classSymbol.name}` };
    }
    const cache = new Map<string, ClassLayout>();
    const build = (classSymbol: SymbolEntry, visiting = new Set<string>()): ClassLayout => {
      const cached = cache.get(classSymbol.id);
      if (cached) return cached;
      if (visiting.has(classSymbol.id)) {
        return { name: classSymbol.name, classId: classSymbol.id, fields: [], methods: [], instanceSize: 0 };
      }
      visiting.add(classSymbol.id);
      const parent = classSymbol.parentClass
        ? classes.find((candidate) => candidate.id === classSymbol.parentClass || (candidate.type.kind === "class" && candidate.type.classId === classSymbol.parentClass))
          ?? this.resolveSymbol(classSymbol.parentClass, classSymbol.scopeId)
        : undefined;
      const parentLayout = parent ? build(parent, visiting) : undefined;
      const fields = parentLayout ? parentLayout.fields.map((field) => ({ ...field })) : [];
      const methods = parentLayout ? (parentLayout.methods ?? []).map((method) => ({ ...method })) : [];
      const classScope = classScopeBySymbol.get(classSymbol.id);
      const ownMembers = classScope
        ? this.semantic.symbols.filter((symbol) => symbol.scopeId === classScope.id)
        : [];
      let offset = parentLayout?.instanceSize ?? 0;
      for (const field of ownMembers.filter((symbol) => symbol.kind === "field")) {
        const size = storageSize(field.type);
        const alignment = storageAlignment(field.type);
        offset = alignUp(offset, alignment);
        field.storage = { kind: "field", offset, size, alignment };
        fields.push({ name: field.name, offset, size, type: field.type });
        offset += size;
      }
      for (const method of ownMembers.filter((symbol) => symbol.kind === "method")) {
        const label = `fn_${classSymbol.id}_${classSymbol.name}_${method.name}`;
        method.storage = { kind: "function", label };
        const inherited = methods.findIndex((entry) => entry.name === method.name);
        const entry = {
          name: method.name,
          label,
          symbolId: method.id,
          parameters: method.parameters?.map((parameter) => ({ ...parameter })) ?? []
        };
        if (inherited >= 0) methods[inherited] = entry;
        else methods.push(entry);
      }
      if (!ownMembers.some((symbol) => symbol.kind === "method" && symbol.name === "constructor")) {
        const inherited = methods.findIndex((entry) => entry.name === "constructor");
        const inheritedConstructor = inherited >= 0 ? methods[inherited] : undefined;
        const implicitConstructor = {
          name: "constructor",
          label: `fn_${classSymbol.id}_${classSymbol.name}_constructor`,
          parameters: inheritedConstructor?.parameters?.map((parameter) => ({ ...parameter })) ?? []
        };
        if (inherited >= 0) methods[inherited] = implicitConstructor;
        else methods.push(implicitConstructor);
      }
      const publicClassId = classSymbol.type.kind === "class" ? classSymbol.type.classId : classSymbol.id;
      const parentPublicId = parent?.type.kind === "class" ? parent.type.classId : parent?.id;
      const layout: ClassLayout = {
        name: classSymbol.name,
        classId: publicClassId,
        parentClassId: parentPublicId,
        fields,
        methods,
        instanceSize: alignUp(offset, 8)
      };
      cache.set(classSymbol.id, layout);
      visiting.delete(classSymbol.id);
      return layout;
    };
    return classes.map((classSymbol) => build(classSymbol));
  }

  private buildActivationRecords(): ActivationRecord[] {
    const frameScopes = this.semantic.scopes.filter((scope) => scope.kind === "global" || scope.kind === "function");
    const frameScopeIds = new Set(frameScopes.map((scope) => scope.id));
    const nearestFrameScope = (scopeId: string | null): ScopeInfo | undefined => {
      let current = scopeId;
      while (current) {
        const scope = this.scopeById.get(current);
        if (scope && frameScopeIds.has(scope.id)) return scope;
        current = scope?.parentId ?? null;
      }
      return undefined;
    };
    for (const scope of this.semantic.scopes) {
      const frameScope = nearestFrameScope(scope.id);
      if (frameScope) this.frameIdByScope.set(scope.id, `frame-${frameScope.id}`);
    }
    for (const symbol of this.semantic.symbols) {
      if (symbol.kind === "function" && !symbol.storage) {
        symbol.storage = { kind: "function", label: `fn_${symbol.scopeId}_${symbol.name}` };
      }
    }
    return frameScopes.map((scope) => {
      const parentFrameScope = nearestFrameScope(scope.parentId);
      const parentScope = scope.parentId ? this.scopeById.get(scope.parentId) : undefined;
      const ownedSymbols = this.semantic.symbols
        .filter((symbol) =>
          (ALLOCATABLE_SYMBOLS.has(symbol.kind) || (symbol.kind === "function" && this.scopeById.get(symbol.scopeId)?.kind !== "global")) &&
          nearestFrameScope(symbol.scopeId)?.id === scope.id &&
          symbol.kind !== "field"
        )
        .sort((left, right) => {
          const leftParameter = left.kind === "parameter" ? 0 : 1;
          const rightParameter = right.kind === "parameter" ? 0 : 1;
          return leftParameter - rightParameter || symbolOrder(left) - symbolOrder(right);
        });
      const slots: FrameSlot[] = [];
      let offset = 0;
      for (const symbol of ownedSymbols) {
        const size = storageSize(symbol.type);
        const alignment = storageAlignment(symbol.type);
        offset = alignUp(offset, alignment);
        const kind: FrameSlot["kind"] = symbol.kind === "parameter" ? "parameter" : "local";
        const storageKind = scope.kind === "global" ? "global" : kind;
        symbol.storage = {
          ...symbol.storage,
          kind: storageKind,
          frameId: `frame-${scope.id}`,
          offset,
          size,
          alignment
        };
        slots.push({ name: symbol.name, symbolId: symbol.id, kind, type: symbol.type, offset, size, alignment, sharedCell: symbol.captured });
        offset += size;
      }
      const kind: ActivationRecord["kind"] = scope.kind === "global"
        ? "global"
        : parentScope?.kind === "class"
          ? scope.name === "constructor" ? "constructor" : "method"
          : "function";
      const parameterBytes = slots.filter((slot) => slot.kind === "parameter").reduce((sum, slot) => sum + slot.size, 0);
      const localBytes = slots.filter((slot) => slot.kind === "local").reduce((sum, slot) => sum + slot.size, 0);
      return {
        id: `frame-${scope.id}`,
        name: scope.name,
        kind,
        scopeId: scope.id,
        parentFrameId: parentFrameScope ? `frame-${parentFrameScope.id}` : null,
        lexicalParentFrameId: parentFrameScope ? `frame-${parentFrameScope.id}` : null,
        parameterCount: slots.filter((slot) => slot.kind === "parameter").length,
        parameterBytes,
        localBytes,
        temporaryBytes: 0,
        totalBytes: alignUp(offset, 8),
        slots,
        staticLinkRequired: false
      };
    });
  }

  private finalizeFrames(): void {
    for (const temporary of this.temps.allocations()) {
      if (!temporary.frameId) continue;
      const frame = this.frameById.get(temporary.frameId);
      if (!frame || frame.slots.some((slot) => slot.kind === "temporary" && slot.temporary === temporary.name)) continue;
      const size = storageSize(temporary.type);
      const alignment = storageAlignment(temporary.type);
      const offset = alignUp(frame.slots.reduce((max, slot) => Math.max(max, slot.offset + slot.size), 0), alignment);
      frame.slots.push({
        name: temporary.name,
        temporary: temporary.name,
        kind: "temporary",
        type: temporary.type,
        offset,
        size,
        alignment
      });
    }
    for (const frame of this.frameById.values()) {
      frame.parameterBytes = frame.slots.filter((slot) => slot.kind === "parameter").reduce((sum, slot) => sum + slot.size, 0);
      frame.localBytes = frame.slots.filter((slot) => slot.kind === "local").reduce((sum, slot) => sum + slot.size, 0);
      frame.temporaryBytes = frame.slots.filter((slot) => slot.kind === "temporary").reduce((sum, slot) => sum + slot.size, 0);
      frame.totalBytes = alignUp(frame.slots.reduce((max, slot) => Math.max(max, slot.offset + slot.size), 0), 8);
      frame.staticLinkRequired = frame.slots.some((slot) => slot.kind === "captured");
    }
  }
}

export function generateTac(program: ProgramContext, semantic: SemanticAnalysisResult): TacGenerationResult {
  if (semantic.status !== "completed" || semantic.errors.length > 0) {
    return emptyTacResult(
      "skipped",
      semantic.errors.length
        ? "El código intermedio no se generó porque existen errores semánticos."
        : "La generación TAC requiere un análisis semántico completado."
    );
  }
  return new TacGenerator(program, semantic).run();
}

export type { Temporary };
