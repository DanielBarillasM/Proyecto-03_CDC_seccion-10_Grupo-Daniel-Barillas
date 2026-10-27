import type { TacBasicBlock, TacControlFlowEdge, TacInstruction } from "./types";

export interface TacControlFlow {
  blocks: TacBasicBlock[];
  edges: TacControlFlowEdge[];
}

const BRANCH_OPS = new Set<TacInstruction["op"]>(["GOTO", "IF_TRUE", "IF_FALSE"]);
const TERMINATORS = new Set<TacInstruction["op"]>(["GOTO", "RETURN", "FUNC_END", "PROGRAM_END"]);

function branchTarget(instruction: TacInstruction): string | undefined {
  const operand = instruction.op === "GOTO" ? instruction.arg1 : instruction.result;
  return operand?.kind === "label" ? String(operand.value) : undefined;
}

/** Construye bloques básicos y aristas de flujo a partir de la secuencia TAC. */
export function buildTacControlFlow(instructions: TacInstruction[]): TacControlFlow {
  if (instructions.length === 0) return { blocks: [], edges: [] };

  const labelIndex = new Map<string, number>();
  for (const instruction of instructions) {
    if (instruction.op === "LABEL" && instruction.result?.kind === "label") {
      labelIndex.set(String(instruction.result.value), instruction.index);
    }
  }

  const leaders = new Set<number>([instructions[0].index]);
  for (let position = 0; position < instructions.length; position += 1) {
    const instruction = instructions[position];
    if (instruction.op === "LABEL") leaders.add(instruction.index);

    const target = branchTarget(instruction);
    if (target !== undefined) {
      const targetIndex = labelIndex.get(target);
      if (targetIndex !== undefined) leaders.add(targetIndex);
    }

    if ((BRANCH_OPS.has(instruction.op) || TERMINATORS.has(instruction.op)) && instructions[position + 1]) {
      leaders.add(instructions[position + 1].index);
    }
  }

  const starts = instructions.flatMap((instruction, position) => leaders.has(instruction.index) ? [position] : []);
  const blocks = starts.map((start, position): TacBasicBlock => {
    const blockInstructions = instructions.slice(start, starts[position + 1] ?? instructions.length);
    const startIndex = blockInstructions[0].index;
    const labelInstruction = blockInstructions.find((instruction) => instruction.op === "LABEL");
    return {
      id: `B${position}`,
      startIndex,
      endIndex: blockInstructions[blockInstructions.length - 1]?.index ?? startIndex,
      label: labelInstruction?.result?.kind === "label" ? String(labelInstruction.result.value) : undefined,
      instructionIndices: blockInstructions.map((instruction) => instruction.index)
    };
  });

  const blockByInstruction = new Map<number, TacBasicBlock>();
  for (const block of blocks) {
    for (const index of block.instructionIndices) blockByInstruction.set(index, block);
  }

  const edges: TacControlFlowEdge[] = [];
  const instructionByIndex = new Map(instructions.map((instruction) => [instruction.index, instruction]));
  const addEdge = (from: TacBasicBlock, to: TacBasicBlock | undefined, kind: TacControlFlowEdge["kind"]): void => {
    if (!to) return;
    edges.push({ from: from.id, to: to.id, kind });
  };

  blocks.forEach((block, position) => {
    const lastIndex = block.instructionIndices[block.instructionIndices.length - 1];
    const last = lastIndex === undefined ? undefined : instructionByIndex.get(lastIndex);
    if (!last) return;

    const target = branchTarget(last);
    const targetBlock = target === undefined ? undefined : blockByInstruction.get(labelIndex.get(target) ?? -1);
    const nextBlock = blocks[position + 1];

    if (last.op === "GOTO") {
      addEdge(block, targetBlock, "jump");
    } else if (last.op === "IF_TRUE") {
      addEdge(block, targetBlock, "true");
      addEdge(block, nextBlock, "false");
    } else if (last.op === "IF_FALSE") {
      addEdge(block, targetBlock, "false");
      addEdge(block, nextBlock, "true");
    } else if (!TERMINATORS.has(last.op)) {
      addEdge(block, nextBlock, "fallthrough");
    }
  });

  return { blocks, edges };
}
