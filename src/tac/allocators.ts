import type { SemanticType } from "../semantic/semanticTypes";

export interface Temporary {
  name: string;
  type: SemanticType;
  frameId?: string;
}

interface FramePool {
  nextId: number;
  free: Temporary[];
  live: Set<string>;
  allocated: Map<string, Temporary>;
}

/**
 * Asigna temporales por registro de activación. Un nombre puede reutilizarse
 * en otra función porque `frameId` forma parte de su identidad, pero nunca se
 * recicla mientras siga vivo dentro del mismo frame.
 */
export class TemporaryAllocator {
  private readonly pools = new Map<string, FramePool>();
  private currentFrameId = "frame-global";
  created = 0;
  reused = 0;
  peak = 0;

  private pool(frameId: string): FramePool {
    let pool = this.pools.get(frameId);
    if (!pool) {
      pool = { nextId: 0, free: [], live: new Set(), allocated: new Map() };
      this.pools.set(frameId, pool);
    }
    return pool;
  }

  acquire(type: SemanticType, frameId = this.currentFrameId): Temporary {
    const pool = this.pool(frameId);
    const recycled = pool.free.pop();
    const temp = recycled ?? { name: `t${pool.nextId++}`, type, frameId };
    if (recycled) this.reused += 1;
    temp.type = type;
    temp.frameId = frameId;
    pool.live.add(temp.name);
    pool.allocated.set(temp.name, { ...temp });
    this.created = [...this.pools.values()].reduce((total, value) => total + value.nextId, 0);
    this.peak = Math.max(this.peak, this.activeCount);
    return temp;
  }

  release(temp: Temporary): void {
    const frameId = temp.frameId ?? this.currentFrameId;
    const pool = this.pool(frameId);
    if (pool.live.delete(temp.name) && !pool.free.some((candidate) => candidate.name === temp.name)) {
      pool.free.push({ ...temp, frameId });
    }
  }

  beginFrame(frameId: string): void {
    this.currentFrameId = frameId;
    this.pool(frameId);
  }

  endFrame(frameId: string): void {
    const pool = this.pool(frameId);
    for (const name of [...pool.live]) {
      const temp = pool.allocated.get(name);
      if (temp) this.release(temp);
    }
  }

  allocations(): Temporary[] {
    return [...this.pools.values()].flatMap((pool) => [...pool.allocated.values()]);
  }

  get activeCount(): number {
    return [...this.pools.values()].reduce((total, pool) => total + pool.live.size, 0);
  }
}

export class LabelFactory {
  private counters = new Map<string, number>();

  next(prefix = "label"): string {
    const value = this.counters.get(prefix) ?? 0;
    this.counters.set(prefix, value + 1);
    return `L_${prefix}_${value}`;
  }

  reset(): void {
    this.counters.clear();
  }
}
