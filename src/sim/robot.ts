import { type Cell, sameCell } from './grid';

export type OrderStatus = 'pending' | 'loaded' | 'delivered';

export interface Order {
  orderId: string;
  deliveryLocation: Cell;
  /** Sim-clock seconds when the order was placed. */
  timestamp: number;
  status: OrderStatus;
}

/** The delivery robot's sensors and effectors — port of environment/robot.py. */
export class Robot {
  loadedOrders: Order[] = [];
  isAtBase = true;

  constructor(public position: Cell, readonly maxCapacity = 3) {}

  getLoadedOrders(): Order[] {
    return this.loadedOrders.slice();
  }

  move(next: Cell): boolean {
    this.position = next;
    this.isAtBase = false;
    return true;
  }

  loadOrder(order: Order): boolean {
    if (!this.isAtBase || this.loadedOrders.length >= this.maxCapacity) return false;
    order.status = 'loaded';
    this.loadedOrders.push(order);
    return true;
  }

  deliverOrder(orderId: string): Order | null {
    const i = this.loadedOrders.findIndex(
      (o) => o.orderId === orderId && sameCell(o.deliveryLocation, this.position),
    );
    if (i < 0) return null;
    const [order] = this.loadedOrders.splice(i, 1);
    order.status = 'delivered';
    return order;
  }

  returnToBase(base: Cell): void {
    if (sameCell(this.position, base)) this.isAtBase = true;
  }

  clearLoadedOrders(): void {
    this.loadedOrders = [];
  }
}
