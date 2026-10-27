import { type Cell, type GridWorld, Tile, cellKey, sameCell } from './grid';

interface Node {
  f: number;
  seq: number;
  pos: Cell;
  g: number;
  parent: Node | null;
}

/** Minimal binary heap ordered by (f, seq) — mirrors Python's heapq tuple ordering. */
class Heap {
  private a: Node[] = [];
  get size() {
    return this.a.length;
  }
  private less(i: number, j: number) {
    const x = this.a[i], y = this.a[j];
    return x.f < y.f || (x.f === y.f && x.seq < y.seq);
  }
  push(n: Node) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

const manhattan = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

export const AStar = {
  findPath(world: GridWorld, start: Cell, goal: Cell): Cell[] | null {
    if (sameCell(start, goal)) return [start];
    if (!world.isValidPosition(goal)) return null;

    let seq = 0;
    const frontier = new Heap();
    frontier.push({ f: 0, seq, pos: start, g: 0, parent: null });
    const visited = new Set<string>();

    while (frontier.size) {
      const cur = frontier.pop();
      const k = cellKey(cur.pos);
      if (visited.has(k)) continue;
      visited.add(k);

      if (sameCell(cur.pos, goal)) {
        const path: Cell[] = [];
        for (let n: Node | null = cur; n; n = n.parent) path.push(n.pos);
        return path.reverse();
      }

      for (const nb of world.neighbors(cur.pos)) {
        if (visited.has(cellKey(nb))) continue;
        // Houses are destinations, not shortcuts: only enter one if it is the goal.
        if (world.tile(nb) === Tile.Delivery && !sameCell(nb, goal)) continue;
        const g = cur.g + 1;
        frontier.push({ f: g + manhattan(nb, goal), seq: ++seq, pos: nb, g, parent: cur });
      }
    }
    return null;
  },
};

function distance(world: GridWorld, a: Cell, b: Cell): number {
  const p = AStar.findPath(world, a, b);
  return p ? p.length - 1 : Infinity;
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items.slice();
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) yield [items[i], ...p];
  }
}

/** Port of utils/pathfinding.py DeliveryPlanner. */
export const DeliveryPlanner = {
  planSequence(world: GridWorld, start: Cell, stops: Cell[], home: Cell): Cell[] {
    if (!stops.length) return [];
    if (stops.length === 1) return stops.slice();
    if (stops.length <= 5) return optimalSequence(world, start, stops, home);
    return nearestNeighbor(world, start, stops);
  },

  fullPath(world: GridWorld, start: Cell, sequence: Cell[], home: Cell): Cell[] | null {
    const full: Cell[] = [];
    let cur = start;
    for (const stop of [...sequence, home]) {
      const seg = AStar.findPath(world, cur, stop);
      if (!seg) return null;
      full.push(...(full.length ? seg.slice(1) : seg));
      cur = stop;
    }
    return full;
  },
};

function optimalSequence(world: GridWorld, start: Cell, stops: Cell[], home: Cell): Cell[] {
  const points = [start, ...stops, home];
  const cache = new Map<string, number>();
  const pairKey = (a: Cell, b: Cell) => `${cellKey(a)}>${cellKey(b)}`;
  for (const p of points) {
    for (const q of points) {
      if (p === q || cache.has(pairKey(p, q))) continue;
      const d = distance(world, p, q);
      cache.set(pairKey(p, q), d);
      cache.set(pairKey(q, p), d);
    }
  }
  const dist = (a: Cell, b: Cell) => (sameCell(a, b) ? 0 : cache.get(pairKey(a, b)) ?? Infinity);

  let best: Cell[] | null = null;
  let bestTotal = Infinity;
  let bestSumTimes = Infinity;

  for (const perm of permutations(stops)) {
    let total = 0, cumulative = 0, sumTimes = 0;
    let cur = start;
    let valid = true;
    for (const stop of perm) {
      const d = dist(cur, stop);
      if (d === Infinity) { valid = false; break; }
      cumulative += d;
      sumTimes += cumulative;
      total += d;
      cur = stop;
    }
    if (valid) {
      const back = dist(cur, home);
      if (back === Infinity) valid = false;
      else total += back;
    }
    // Prefer shorter total distance, then closer deliveries first.
    if (valid && (total < bestTotal || (total === bestTotal && sumTimes < bestSumTimes))) {
      bestTotal = total;
      bestSumTimes = sumTimes;
      best = perm;
    }
  }
  return best ?? nearestNeighbor(world, start, stops);
}

function nearestNeighbor(world: GridWorld, start: Cell, stops: Cell[]): Cell[] {
  const seq: Cell[] = [];
  const remaining = stops.slice();
  let cur = start;
  while (remaining.length) {
    let bestIdx = -1, bestD = Infinity;
    remaining.forEach((loc, i) => {
      const d = distance(world, cur, loc);
      if (d < bestD) { bestD = d; bestIdx = i; }
    });
    if (bestIdx < 0) break;
    cur = remaining.splice(bestIdx, 1)[0];
    seq.push(cur);
  }
  return seq;
}
