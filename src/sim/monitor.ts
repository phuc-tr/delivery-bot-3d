import { type Cell, sameCell } from './grid';
import type { Knowledge } from './knowledge';
import type { Order } from './robot';

export interface SensorData {
  robotPosition: Cell;
  loadedOrders: Order[];
  isAtBase: boolean;
  dynamicObstacles: Cell[];
}

export interface MonitoringResults {
  sensorData: SensorData;
  needsNewMission: boolean;
  pathBlocked: boolean;
  obstacleRemoved: boolean;
  atDeliveryLocation: boolean;
  atBase: boolean;
}

/** Monitor: collects sensor data and refreshes the knowledge base. */
export class Monitor {
  private previousObstacles = new Set<string>();

  constructor(private readonly k: Knowledge) {}

  private collectData(): SensorData {
    const { robot, gridWorld } = this.k;
    const data: SensorData = {
      robotPosition: robot.position,
      loadedOrders: robot.getLoadedOrders(),
      isAtBase: robot.isAtBase,
      dynamicObstacles: [...gridWorld.dynamicObstacles.values()],
    };
    this.k.loadedOrders = data.loadedOrders;
    this.k.knownBlockages = data.dynamicObstacles;
    return data;
  }

  step(): MonitoringResults {
    const sensorData = this.collectData();

    const current = new Set(this.k.gridWorld.dynamicObstacles.keys());
    let obstacleRemoved = false;
    for (const key of this.previousObstacles) if (!current.has(key)) obstacleRemoved = true;
    this.previousObstacles = current;

    return {
      sensorData,
      needsNewMission: this.k.shouldStartMission(),
      pathBlocked: this.k.isPathBlocked(),
      obstacleRemoved,
      atDeliveryLocation: this.k.loadedOrders.some((o) => sameCell(o.deliveryLocation, sensorData.robotPosition)),
      atBase: sensorData.isAtBase,
    };
  }
}
