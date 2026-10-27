import type { Knowledge } from './knowledge';
import type { MonitoringResults } from './monitor';

export type AdaptationType = 'start_mission' | 'replan_path' | 'deliver_order' | 'end_mission';

export interface Analysis {
  requiresAdaptation: boolean;
  adaptationType: AdaptationType | null;
  reason: string | null;
  estimatedRemainingDistance: number;
}

/** Analyze: decides whether the situation calls for adaptation. */
export class Analyze {
  constructor(private readonly k: Knowledge) {}

  analyze(m: MonitoringResults): Analysis {
    const adapt = (adaptationType: AdaptationType, reason: string): Analysis => ({
      requiresAdaptation: true,
      adaptationType,
      reason,
      estimatedRemainingDistance: 0,
    });

    if (m.needsNewMission && !this.k.missionInProgress) {
      return adapt('start_mission', 'Capacity full or timeout reached');
    }
    if (m.pathBlocked) {
      return adapt('replan_path', 'Current path blocked by dynamic obstacle');
    }
    if (m.obstacleRemoved && this.k.missionInProgress) {
      return adapt(
        'replan_path',
        this.k.isStuck ? 'Obstacle removed — attempting to resume' : 'Obstacle removed — looking for a shorter path',
      );
    }
    if (m.atDeliveryLocation && this.k.loadedOrders.length) {
      return adapt('deliver_order', 'Reached delivery location');
    }
    if (this.k.missionInProgress && m.atBase && !this.k.loadedOrders.length) {
      return adapt('end_mission', 'All deliveries completed, returned to base');
    }

    const plan = this.k.currentPlan;
    return {
      requiresAdaptation: false,
      adaptationType: null,
      reason: null,
      estimatedRemainingDistance: plan ? plan.length - this.k.currentPlanIndex : 0,
    };
  }
}
