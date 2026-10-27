import { type Cell, sameCell } from './grid';
import type { Knowledge } from './knowledge';
import type { Analysis } from './analyze';
import type { Order } from './robot';
import { AStar, DeliveryPlanner } from './pathfinding';

export type AdaptationPlan =
  | { action: 'continue' }
  | { action: 'start_mission'; ordersToLoad: Order[]; deliverySequence: Cell[]; fullPath: Cell[] }
  | { action: 'replan'; newPath: Cell[]; newSequence: Cell[]; reason: string }
  | { action: 'deliver'; order: Order }
  | { action: 'wait'; reason: string }
  | { action: 'end_mission' };

const CONTINUE: AdaptationPlan = { action: 'continue' };

/** Plan: turns an analysis into a concrete adaptation. */
export class Plan {
  constructor(private readonly k: Knowledge) {}

  create(analysis: Analysis): AdaptationPlan {
    if (!analysis.requiresAdaptation) return CONTINUE;
    switch (analysis.adaptationType) {
      case 'start_mission':
        return this.planNewMission();
      case 'replan_path':
        return this.planPathAdaptation(analysis.reason ?? '');
      case 'deliver_order':
        return this.planDelivery();
      case 'end_mission':
        return { action: 'end_mission' };
      default:
        return CONTINUE;
    }
  }

  private planNewMission(): AdaptationPlan {
    const { k } = this;
    const ordersToLoad = k.pendingOrders.slice(0, k.robot.maxCapacity);
    if (!ordersToLoad.length) return CONTINUE;

    const stops = ordersToLoad.map((o) => o.deliveryLocation);
    const sequence = DeliveryPlanner.planSequence(k.gridWorld, k.baseLocation, stops, k.baseLocation);
    const fullPath = DeliveryPlanner.fullPath(k.gridWorld, k.baseLocation, sequence, k.baseLocation);
    if (!fullPath) return CONTINUE;

    return { action: 'start_mission', ordersToLoad, deliverySequence: sequence, fullPath };
  }

  private planPathAdaptation(reason: string): AdaptationPlan {
    const { k } = this;
    const pos = k.robot.position;
    const remaining = k.loadedOrders.map((o) => o.deliveryLocation);

    let newSequence: Cell[] = [];
    let newPath: Cell[] | null;
    if (!remaining.length) {
      newPath = AStar.findPath(k.gridWorld, pos, k.baseLocation);
    } else {
      newSequence = DeliveryPlanner.planSequence(k.gridWorld, pos, remaining, k.baseLocation);
      newPath = DeliveryPlanner.fullPath(k.gridWorld, pos, newSequence, k.baseLocation);
    }

    if (!newPath) {
      // Deviation from the original: retrying while already stuck isn't a new adaptation.
      if (!k.isStuck) k.numberOfReplans++;
      return { action: 'wait', reason: 'no_valid_path' };
    }
    k.numberOfReplans++;
    return { action: 'replan', newPath, newSequence, reason };
  }

  private planDelivery(): AdaptationPlan {
    const pos = this.k.robot.position;
    const order = this.k.loadedOrders.find((o) => sameCell(o.deliveryLocation, pos));
    return order ? { action: 'deliver', order } : CONTINUE;
  }
}
