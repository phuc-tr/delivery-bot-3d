import type { Carrier, CarrierKind } from './base';
import { Robot3D } from './robot';
import { GROB, Motorbike, SHOPOO } from './motorbike';
import { Taxi } from './taxi';
import { GanhCarrier } from './ganh';

export type { Carrier, CarrierKind, Expression } from './base';

export interface CarrierInfo {
  kind: CarrierKind;
  name: string;
  /** Event-log line when this carrier takes over. */
  hello: string;
  make(): Carrier;
}

export const CARRIERS: CarrierInfo[] = [
  { kind: 'robot', name: 'Robot', hello: 'Delivery bot is back on duty', make: () => new Robot3D() },
  { kind: 'grob', name: 'Grob bike', hello: 'A Grob rider takes the next run', make: () => new Motorbike(GROB) },
  { kind: 'shopoo', name: 'Shopoo', hello: 'Shopoo Express scooter reporting in', make: () => new Motorbike(SHOPOO) },
  { kind: 'taxi', name: 'Taxi', hello: 'Taxi on the meter, parcels on the roof', make: () => new Taxi() },
  { kind: 'ganh', name: 'Quang gánh', hello: 'Cô bán hàng grabs her đòn gánh. Out of the way!', make: () => new GanhCarrier() },
];

export const carrierInfo = (kind: CarrierKind) => CARRIERS.find((c) => c.kind === kind) ?? CARRIERS[0];
