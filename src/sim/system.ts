import { type Cell, GridWorld, Tile, sameCell } from './grid';
import { Robot } from './robot';
import { Knowledge, type SimEvent } from './knowledge';
import { Monitor } from './monitor';
import { Analyze, type Analysis } from './analyze';
import { Plan, type AdaptationPlan } from './plan';
import { Execute } from './execute';

export interface TickResult {
  analysis: Analysis;
  action: AdaptationPlan['action'];
  events: SimEvent[];
}

export type ClickIntent = 'order' | 'block' | 'unblock' | 'none';

/** Wires the MAPE-K loop together — port of WebDeliverySystem in web/app.py. */
export class DeliverySystem {
  readonly world = new GridWorld();
  readonly robot: Robot;
  readonly knowledge: Knowledge;
  private readonly monitor: Monitor;
  private readonly analyzer: Analyze;
  private readonly planner: Plan;
  private readonly executor: Execute;
  private orderCounter = 0;
  /** Sim-clock seconds; advanced by the host so speed and pause apply to timers too. */
  time = 0;

  constructor() {
    const base = this.world.baseLocation;
    this.robot = new Robot(base, 3);
    this.knowledge = new Knowledge(this.world, this.robot, base, () => this.time);
    this.monitor = new Monitor(this.knowledge);
    this.analyzer = new Analyze(this.knowledge);
    this.planner = new Plan(this.knowledge);
    this.executor = new Execute(this.knowledge);
  }

  tick(): TickResult {
    const monitoring = this.monitor.step();
    const analysis = this.analyzer.analyze(monitoring);
    const plan = analysis.requiresAdaptation ? this.planner.create(analysis) : ({ action: 'continue' } as const);
    this.executor.run(plan);
    return { analysis, action: plan.action, events: this.drainEvents() };
  }

  /** What clicking this cell would do — used for the hover cursor. */
  intentAt(cell: Cell): ClickIntent {
    const w = this.world;
    if (!w.inBounds(cell)) return 'none';
    if (w.isHouse(cell)) return 'order';
    const t = w.tile(cell);
    if (t === Tile.Dynamic) return 'unblock';
    if (t !== Tile.Empty || sameCell(cell, this.robot.position)) return 'none';
    return 'block';
  }

  click(cell: Cell): SimEvent[] {
    switch (this.intentAt(cell)) {
      case 'order': {
        const order = {
          orderId: `ORD_${String(++this.orderCounter).padStart(3, '0')}`,
          deliveryLocation: cell,
          timestamp: this.time,
          status: 'pending' as const,
        };
        this.knowledge.addOrder(order);
        this.knowledge.events.push({ type: 'order_added', order });
        break;
      }
      case 'block':
        if (this.world.addDynamicObstacle(cell)) this.knowledge.events.push({ type: 'obstacle_added', cell });
        break;
      case 'unblock':
        if (this.world.removeDynamicObstacle(cell)) this.knowledge.events.push({ type: 'obstacle_removed', cell });
        break;
    }
    return this.drainEvents();
  }

  /** Seconds left until auto-start, or null when nothing is pending. */
  countdown(): number | null {
    const k = this.knowledge;
    if (!k.pendingOrders.length) return null;
    return Math.max(0, k.missionTimeout - (this.time - k.lastMissionStartTime));
  }

  /** Index into the current plan where the return leg (→ base) starts. */
  returnLegStart(): number {
    const k = this.knowledge;
    const plan = k.currentPlan;
    if (!plan) return 0;
    const last = k.deliverySequence.length ? k.deliverySequence[k.deliverySequence.length - 1] : null;
    if (!last) return k.currentPlanIndex; // only the trip home remains
    for (let i = plan.length - 1; i >= k.currentPlanIndex; i--) if (sameCell(plan[i], last)) return i;
    return plan.length;
  }

  private drainEvents(): SimEvent[] {
    const ev = this.knowledge.events;
    this.knowledge.events = [];
    return ev;
  }
}
