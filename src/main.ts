import './style.css';
import { loadCourier, picker, saveCourier } from './courier';

// Boot screen: only the courier picker. The town (sim, world, HUD) is a separate chunk that isn't
// downloaded or built until a courier is chosen.
const loader = document.getElementById('loader')!;
loader.classList.add('done');
document.body.classList.add('pre');

picker.onPick = async (kind) => {
  saveCourier(kind);
  document.body.classList.remove('pre');
  loader.classList.remove('done');
  // Let the loader paint before the heavy synchronous build
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await import('./game');
};
picker.show(loadCourier(), false);
