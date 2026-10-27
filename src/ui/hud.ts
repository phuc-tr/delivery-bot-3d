import type { Metrics } from '../sim/knowledge';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>',
};

export interface HudHandlers {
  pause(): void;
  speed(v: number): void;
  follow(): void;
  sound(): void;
  quality(): void;
  reset(): void;
  carrier(): void;
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: preference just won't persist
  }
}

export type LogKind = 'info' | 'warn' | 'bad' | 'good';

/** DOM overlay: stats, countdown, event log, control dock. */
export class Hud {
  private readonly last: Record<string, string> = {};
  private hintTimer = 0;

  constructor(h: HudHandlers) {
    $('b-collapse').onclick = () => this.setCollapsed(!document.body.classList.contains('ui-collapsed'));
    this.setCollapsed(load('delivery-bot.collapsed') === '1');
    $('b-carrier').onclick = h.carrier;
    $('b-pause').onclick = h.pause;
    $('b-follow').onclick = h.follow;
    $('b-sound').onclick = h.sound;
    $('b-quality').onclick = h.quality;
    $('b-reset').onclick = h.reset;
    $('b-follow').innerHTML = ICONS.follow;
    $('b-reset').innerHTML = ICONS.reset;
    document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) => {
      b.onclick = () => h.speed(Number(b.dataset.speed));
    });
  }

  setStatus(pos: readonly [number, number], cargo: number, cap: number, pending: number, stuck: boolean): void {
    this.text('s-pos', `(${pos[0]}, ${pos[1]})`);
    this.text('s-pending', String(pending));
    const key = `${cargo}/${cap}/${stuck}`;
    if (this.last.cargo !== key) {
      this.last.cargo = key;
      const el = $('s-cargo');
      el.innerHTML = Array.from({ length: cap }, (_, i) => `<i class="${i < cargo ? 'on' : ''}"></i>`).join('');
      el.classList.toggle('stuck', stuck);
    }
  }

  setMetrics(m: Metrics): void {
    this.text('m-deliveries', String(m.totalDeliveries), true);
    this.text('m-distance', String(m.totalDistance));
    this.text('m-replans', String(m.replans), true);
    this.text('m-avg', `${m.avgDeliveryTime.toFixed(1)}s`);
  }

  /** Called every frame; the bar drains from full to empty as the auto-start timer runs out. */
  setCountdown(seconds: number | null, total: number, pending: number, mission: boolean): void {
    let width = 0;
    let tone = '';
    if (seconds === null) {
      this.text('cd-label', mission ? 'Out on a mission' : 'Waiting for orders');
      this.text('cd-time', '—');
    } else {
      const s = Math.ceil(seconds);
      this.text('cd-label', mission ? 'Next run queued' : seconds <= 0 ? 'Departing…' : 'Auto-start in');
      this.text('cd-time', seconds <= 0 ? (mission ? 'after return' : 'now') : `${s}s`);
      width = Math.max(0, Math.min(1, seconds / total));
      tone = pending >= 3 ? 'full' : seconds <= 5 ? 'low' : '';
    }
    const key = `${width.toFixed(4)}|${tone}`;
    if (this.last.cdFill === key) return;
    this.last.cdFill = key;
    const fill = $('cd-fill');
    fill.style.width = `${width * 100}%`;
    fill.className = `cd-fill ${tone}`;
  }

  log(text: string, kind: LogKind = 'info'): void {
    const ol = $('log');
    const li = document.createElement('li');
    li.className = kind;
    li.textContent = text;
    // Newest on top; if the reader has scrolled down into history, hold their place
    const reading = ol.scrollTop > 0;
    const before = ol.scrollHeight;
    ol.prepend(li);
    if (reading) ol.scrollTop += ol.scrollHeight - before;
    while (ol.children.length > 60) ol.lastElementChild!.remove();
  }

  setPaused(p: boolean): void {
    $('b-pause').innerHTML = p ? ICONS.play : ICONS.pause;
    $('b-pause').classList.toggle('active', p);
    $('b-pause').title = p ? 'Resume (Space)' : 'Pause (Space)';
  }

  setSpeed(v: number): void {
    document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === v);
    });
  }

  setCarrier(name: string): void {
    const b = $('b-carrier');
    b.textContent = name;
    b.title = `Courier: ${name} (C)`;
    b.setAttribute('aria-label', `Change courier (now ${name})`);
  }

  setFollow(on: boolean): void {
    $('b-follow').classList.toggle('active', on);
  }

  setMuted(m: boolean): void {
    $('b-sound').innerHTML = m ? ICONS.mute : ICONS.sound;
    $('b-sound').classList.toggle('active', !m);
  }

  setQuality(q: 'high' | 'low'): void {
    $('b-quality').textContent = q === 'high' ? 'HQ' : 'LQ';
    $('b-quality').classList.toggle('active', q === 'high');
  }

  /** Slide the stats/countdown column and the event log off to the right, leaving just the tab. */
  setCollapsed(on: boolean): void {
    document.body.classList.toggle('ui-collapsed', on);
    const b = $('b-collapse');
    const label = on ? 'Show side panels' : 'Hide side panels';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-expanded', String(!on));
    save('delivery-bot.collapsed', on ? '1' : '0');
  }

  fadeHint(): void {
    if (this.hintTimer) return;
    this.hintTimer = window.setTimeout(() => $('hint').classList.add('fade'), 6000);
  }

  hideLoader(): void {
    $('loader').classList.add('done');
  }

  setCanClick(on: boolean): void {
    $('app').classList.toggle('can-click', on);
  }

  private text(id: string, value: string, bump = false): void {
    if (this.last[id] === value) return;
    const had = id in this.last;
    this.last[id] = value;
    const el = $(id);
    el.textContent = value;
    if (bump && had) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }
}
