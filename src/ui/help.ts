const STEPS: { img: string; text: string }[] = [
  { img: 'help/order.jpg', text: 'Click a house to order.' },
  { img: 'help/countdown.jpg', text: 'The courier leaves at 3 orders, or after 30 s.' },
  { img: 'help/block.jpg', text: 'Click a road to block it. Click again to clear.' },
  { img: 'help/reroute.jpg', text: 'Blocked? It finds another way, or waits until you clear one.' },
];

/** The "?" button in the bottom-left corner and its little how-to card. */
export class HelpPanel {
  private readonly btn: HTMLButtonElement;
  private readonly card: HTMLDivElement;

  constructor() {
    this.btn = document.createElement('button');
    this.btn.className = 'help-btn';
    this.btn.textContent = '?';
    this.btn.title = 'How it works (?)';
    this.btn.setAttribute('aria-label', 'How it works');
    this.btn.setAttribute('aria-expanded', 'false');
    this.btn.setAttribute('aria-controls', 'help-card');

    this.card = document.createElement('div');
    this.card.className = 'help-card';
    this.card.id = 'help-card';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', 'How it works');
    this.card.innerHTML = `
      <b class="help-title">How it works</b>
      <ol>${STEPS.map((s) => `<li><span class="help-shot"><img src="${s.img}" alt="" loading="lazy" /></span><span>${s.text}</span></li>`).join('')}</ol>`;

    this.btn.onclick = () => this.toggle();
    document.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !this.card.contains(e.target as Node) && e.target !== this.btn) this.toggle(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === '?') this.toggle();
      else if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });
    document.body.append(this.card, this.btn);
  }

  get isOpen(): boolean {
    return this.card.classList.contains('open');
  }

  toggle(open = !this.isOpen): void {
    this.card.classList.toggle('open', open);
    this.btn.classList.toggle('active', open);
    this.btn.setAttribute('aria-expanded', String(open));
  }
}
