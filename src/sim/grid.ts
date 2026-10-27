export type Cell = readonly [row: number, col: number];

export const cellKey = (p: Cell): string => `${p[0]},${p[1]}`;
export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined): boolean =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1];

export enum Tile {
  Empty = 0,
  Obstacle = 1,
  Base = 2,
  Delivery = 3,
  Dynamic = 5,
  /** Supermarket building footprint — solid, unlike the original's walkable BASE cells. */
  Building = 6,
}

/**
 * The town map. Deviation from the original repo: an irregular little town with alleys and
 * dead ends around a central supermarket, with single houses scattered across it.
 *
 *   .  street   B  loading pad (robot base)   M  supermarket
 *   H  house (delivery)   #  city block (buildings, lawns, parks, rock gardens)
 */
export const MAP = [
  '....##...H##....##....',
  '.##.##.#.###.##.##.H..',
  '.##....#......#H...#..',
  '....#.##.H##.##..###..',
  '.H#.#....###.....#....',
  '.##...##........##..#.',
  '.#..#..#.MMM.##.....H#',
  '....#..#.MMM.##.###.##',
  '##.H##....B......#....',
  '##...#.###.##.##...##.',
  '...#.....#..#.##.#.##.',
  '.#.#H##.##.....#.#....',
  '.#....#..H.##.##..##H.',
  '.##.#.#H...##.....##..',
  '....#........#H.##....',
];

export type Zone = '.' | 'B' | 'H' | 'M' | '#';

/** 2D grid environment — port of environment/grid_world.py, on the town map above. */
export class GridWorld {
  readonly width = MAP[0].length;
  readonly height = MAP.length;
  readonly grid: Tile[][];
  readonly baseLocation: Cell;
  readonly deliveryLocations: Cell[] = [];
  readonly dynamicObstacles = new Map<string, Cell>();

  constructor() {
    let base: Cell = [0, 0];
    this.grid = MAP.map((row, r) =>
      [...row].map((ch, c) => {
        switch (ch) {
          case '.':
            return Tile.Empty;
          case 'B':
            base = [r, c];
            return Tile.Base;
          case 'H':
            this.deliveryLocations.push([r, c]);
            return Tile.Delivery;
          case 'M':
            return Tile.Building;
          default:
            return Tile.Obstacle;
        }
      }),
    );
    this.baseLocation = base;
  }

  /** District letter of a cell (for the renderer). */
  zone([r, c]: Cell): Zone {
    return MAP[r][c] as Zone;
  }

  inBounds([r, c]: Cell): boolean {
    return r >= 0 && r < this.height && c >= 0 && c < this.width;
  }

  tile([r, c]: Cell): Tile {
    return this.grid[r][c];
  }

  isHouse(p: Cell): boolean {
    return this.deliveryLocations.some((d) => sameCell(d, p));
  }

  isValidPosition(p: Cell): boolean {
    if (!this.inBounds(p)) return false;
    const t = this.tile(p);
    return t !== Tile.Obstacle && t !== Tile.Dynamic && t !== Tile.Building;
  }

  addDynamicObstacle(p: Cell): boolean {
    if (this.isValidPosition(p) && !sameCell(p, this.baseLocation) && !this.isHouse(p)) {
      this.dynamicObstacles.set(cellKey(p), p);
      this.grid[p[0]][p[1]] = Tile.Dynamic;
      return true;
    }
    return false;
  }

  removeDynamicObstacle(p: Cell): boolean {
    if (this.dynamicObstacles.delete(cellKey(p))) {
      this.grid[p[0]][p[1]] = Tile.Empty;
      return true;
    }
    return false;
  }

  neighbors([r, c]: Cell): Cell[] {
    const out: Cell[] = [];
    const cand: Cell[] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const n of cand) if (this.isValidPosition(n)) out.push(n);
    return out;
  }
}
