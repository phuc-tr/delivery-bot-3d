import type { Cell, GridWorld } from './grid';
import type { Order, Robot } from './robot';

export type SimEvent =
  | { type: 'order_added'; order: Order }
  | { type: 'obstacle_added'; cell: Cell }
  | { type: 'obstacle_removed'; cell: Cell }
  | { type: 'move'; from: Cell; to: Cell }
  | { type: 'mission_start'; orders: Order[]; sequence: Cell[]; length: number }
  | { type: 'replan'; reason: string; delta: number }
  | { type: 'stuck' }
  | { type: 'deliver'; order: Order; seconds: number }
  | { type: 'mission_end' };

export interface Metrics {
  totalDeliveries: number;
  pendingOrders: number;
  totalDistance: number;
  replans: number;
  avgDeliveryTime: number;
}

/** Shared knowledge base for all MAPE components — port of mape_k/knowledge.py. */
export class Knowledge {
  pendingOrders: Order[] = [];
  loadedOrders: Order[] = [];
  completedOrders: Order[] = [];

  currentPlan: Cell[] | null = null;
  currentPlanIndex = 0;
  deliverySequence: Cell[] = [];
  /** Fixed at mission start so the return leg can still be coloured after the last drop. */
  originalLastDelivery: Cell | null = null;

  lastMissionStartTime: number;
  readonly missionTimeout = 30;
  missionInProgress = false;
  isStuck = false;
  knownBlockages: Cell[] = [];

  totalDistanceTraveled = 0;
  numberOfReplans = 0;
  deliveryTimes: number[] = [];

  /** Side-channel for the renderer: what happened during the current tick. */
  events: SimEvent[] = [];

  constructor(
    readonly gridWorld: GridWorld,
    readonly robot: Robot,
    readonly baseLocation: Cell,
    readonly now: () => number,
  ) {
    this.lastMissionStartTime = now();
  }

  addOrder(order: Order): void {
    this.pendingOrders.push(order);
    // Reset timer when the first order arrives.
    if (this.pendingOrders.length === 1) this.lastMissionStartTime = this.now();
  }

  shouldStartMission(): boolean {
    if (this.missionInProgress) return false;
    if (this.pendingOrders.length >= this.robot.maxCapacity) return true;
    return this.pendingOrders.length > 0 && this.now() - this.lastMissionStartTime >= this.missionTimeout;
  }

  startMission(): void {
    this.missionInProgress = true;
    this.lastMissionStartTime = this.now();
  }

  setDeliverySequence(sequence: Cell[]): void {
    this.deliverySequence = sequence;
    if (sequence.length) this.originalLastDelivery = sequence[sequence.length - 1];
  }

  endMission(): void {
    this.missionInProgress = false;
    this.currentPlan = null;
    this.currentPlanIndex = 0;
    this.deliverySequence = [];
    this.originalLastDelivery = null;
    this.robot.clearLoadedOrders();
    this.isStuck = false;
  }

  updateRobotPosition(pos: Cell): void {
    this.robot.position = pos;
    if (this.currentPlan && this.currentPlanIndex < this.currentPlan.length) {
      this.currentPlanIndex++;
      this.totalDistanceTraveled++;
    }
  }

  isPathBlocked(): boolean {
    if (!this.currentPlan) return false;
    for (let i = this.currentPlanIndex; i < this.currentPlan.length; i++) {
      if (!this.gridWorld.isValidPosition(this.currentPlan[i])) return true;
    }
    return false;
  }

  getNextPosition(): Cell | null {
    if (!this.currentPlan || this.currentPlanIndex >= this.currentPlan.length) return null;
    return this.currentPlan[this.currentPlanIndex];
  }

  recordDelivery(order: Order): number {
    const seconds = this.now() - order.timestamp;
    this.deliveryTimes.push(seconds);
    this.completedOrders.push(order);
    return seconds;
  }

  getMetrics(): Metrics {
    const n = this.deliveryTimes.length;
    return {
      totalDeliveries: this.completedOrders.length,
      pendingOrders: this.pendingOrders.length,
      totalDistance: this.totalDistanceTraveled,
      replans: this.numberOfReplans,
      avgDeliveryTime: n ? this.deliveryTimes.reduce((a, b) => a + b, 0) / n : 0,
    };
  }
}
