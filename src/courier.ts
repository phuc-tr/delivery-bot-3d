import { CARRIERS, carrierInfo, type CarrierKind } from './world/carriers';
import { CarrierPicker } from './ui/picker';

const KEY = 'delivery-bot.carrier';

export function loadCourier(): CarrierKind {
  try {
    return carrierInfo(localStorage.getItem(KEY) as CarrierKind).kind;
  } catch {
    return 'robot';
  }
}

export function saveCourier(kind: CarrierKind): void {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    // storage blocked: the choice just won't stick across reloads
  }
}

/** One picker for the whole session: the boot screen opens it first, the game reopens it from the dock. */
export const picker = new CarrierPicker(CARRIERS, () => {});
