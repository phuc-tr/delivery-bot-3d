import { sameCell } from './grid';
import type { Knowledge } from './knowledge';
import type { AdaptationPlan } from './plan';

/** Execute: drives the robot's effectors according to the plan. */
export class Execute {
  constructor(private readonly k: Knowledge) {}

  run(plan: AdaptationPlan): boolean {
    const { k } = this;
    switch (plan.action) {
      case 'continue': {
        if (k.isStuck || !k.currentPlan) return true;
        const next = k.getNextPosition();
        if (!next || !k.gridWorld.isValidPosition(next)) return true;

        const from = k.robot.position;
        k.robot.move(next);
        k.updateRobotPosition(next);
        if (!sameCell(from, next)) k.events.push({ type: 'move', from, to: next });
        if (sameCell(next, k.baseLocation)) k.robot.returnToBase(k.baseLocation);
        return true;
      }

      case 'start_mission': {
        const loaded = [];
        for (const order of plan.ordersToLoad) {
          if (k.robot.loadOrder(order)) {
            k.pendingOrders.splice(k.pendingOrders.indexOf(order), 1);
            loaded.push(order);
          }
        }
        k.currentPlan = plan.fullPath;
        k.currentPlanIndex = 0;
        k.setDeliverySequence(plan.deliverySequence);
        k.startMission();
        k.events.push({
          type: 'mission_start',
          orders: loaded,
          sequence: plan.deliverySequence,
          length: plan.fullPath.length - 1,
        });
        return true;
      }

      case 'replan': {
        const before = k.currentPlan ? k.currentPlan.length - k.currentPlanIndex : 0;
        k.isStuck = false;
        k.currentPlan = plan.newPath;
        k.currentPlanIndex = 0;
        if (plan.newSequence.length) k.setDeliverySequence(plan.newSequence);
        k.events.push({ type: 'replan', reason: plan.reason, delta: plan.newPath.length - before });
        return true;
      }

      case 'wait':
        if (!k.isStuck) k.events.push({ type: 'stuck' });
        k.isStuck = true;
        return true;

      case 'deliver': {
        const delivered = k.robot.deliverOrder(plan.order.orderId);
        if (!delivered) return false;
        const seconds = k.recordDelivery(delivered);
        const i = k.deliverySequence.findIndex((c) => sameCell(c, delivered.deliveryLocation));
        if (i >= 0) k.deliverySequence.splice(i, 1);
        k.events.push({ type: 'deliver', order: delivered, seconds });
        return true;
      }

      case 'end_mission':
        k.endMission();
        k.events.push({ type: 'mission_end' });
        return true;
    }
  }
}
