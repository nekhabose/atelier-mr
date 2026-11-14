/**
 * AccessSystem – accessibility, voice and sharing.
 *
 * In the studio (atelier panel, "Access"):
 *  - Large text, High contrast, Calm motion, Read aloud, Voice commands;
 *  - "Tailor without dragging": step buttons for hem, waist and sleeves, so
 *    every edit works with a single tap (one hand, limited grip strength, or
 *    no fine motor control needed).
 * On the flat start page: the same settings, plus Share look (link and QR
 * code) and the guided showcase.
 *
 * Share: the look travels inside the link (#look=...). Opening it dresses the
 * form in that look. Nothing is uploaded.
 */
import { createSystem, UIKit, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { CHIP } from './atelier/palette.js';
import { sideSection } from './atelier/side-panel.js';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { StylistSystem } from './stylist-system.js';
import { access, ACCESS_LABELS, AccessKey } from './atelier/access.js';
import { canListen, canSpeak, say, stopSpeaking, VoiceControl } from './atelier/voice.js';
import { clearLookFromLocation, lookFromLocation, qrSvg, shareUrl } from './atelier/share.js';
import { TailorParam } from './atelier/garments.js';
import { sfx } from './atelier/sfx.js';
import { WardrobeSystem } from './wardrobe-system.js';

const ON = CHIP.on;
const OFF = CHIP.off;
const OFF_HC = { bg: '#000000', border: '#ffffff', text: '#ffffff' };
const KEYS: AccessKey[] = ['largeText', 'highContrast', 'calmMotion', 'readAloud', 'voice', 'seated'];
const SHARE_KEY = 'atelier.share.v1';

/** Text that turns pure white (or bright gold) in high contrast. */
const HC_TEXT: Record<string, string[]> = {
  'atelier-panel': ['look-name', 'look-note', 'access-status'],
  'closet-panel': [
    'closet-title', 'closet-note', 'streak-title', 'streak-sub', 'lookbook-empty', 'morning-text', 'wear-text',
    'stylist-tip', 'stylist-meta', 'verdict-stat', 'verdict-sub', 'verdict-reason',
  ],
};
const HC_GOLD: Record<string, string[]> = {
  'atelier-panel': [],
  'closet-panel': ['closet-eyebrow'],
};

const TAILOR: { id: string; param: TailorParam; dir: 1 | -1 }[] = [
  { id: 'tl-hem-up', param: 'hem', dir: 1 },
  { id: 'tl-hem-down', param: 'hem', dir: -1 },
  { id: 'tl-fit-up', param: 'fit', dir: 1 },
  { id: 'tl-fit-down', param: 'fit', dir: -1 },
  { id: 'tl-sleeve-down', param: 'sleeve', dir: -1 },
  { id: 'tl-sleeve-up', param: 'sleeve', dir: 1 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = UIKit.Component<any>;

export class AccessSystem extends createSystem({}) {
  /** Whether the access section is open on the studio panel. */
  panelOpen = false;
  /** The last link made by Share (for scripted checks and the start page). */
  lastShareUrl = '';
  voice!: VoiceControl;
  private atelier!: AtelierSystem;
  private els: Record<string, El | undefined> = {};
  private hcEls: { el: El; gold: boolean }[] = [];
  private hint?: El;
  private card?: HTMLDivElement;
  private shareBox?: HTMLDivElement;

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.voice = new VoiceControl(this.commands(), (phrase, matched) => {
      if (matched) return;
      // Not a command: maybe a tailoring request ("make it midi with long sleeves").
      const wardrobe = this.world.getSystem(WardrobeSystem);
      if (wardrobe && phrase.split(' ').length >= 2) void wardrobe.tailor(phrase);
      else this.atelier.setHint(`Heard "${phrase}". Try "style me", "undo", "shorter" or "turn".`);
    });
    this.wirePanel();
    this.buildCard();
    try {
      this.lastShareUrl = localStorage.getItem(SHARE_KEY) ?? '';
    } catch {
      /* ignore */
    }

    this.cleanupFuncs.push(
      access.subscribe((s, changed) => {
        this.paint();
        if (changed === null || changed === 'highContrast') this.applyContrast(s.highContrast);
        if (changed === 'readAloud') {
          if (s.readAloud) say('Read aloud is on. I will read changes to the studio panel.');
          else stopSpeaking();
        }
        if (changed === null || changed === 'voice') {
          if (s.voice) {
            if (!this.voice.start()) {
              this.status('Voice commands are not available in this browser.');
            } else {
              this.status('Listening. Say "style me", "undo", "shorter", "turn" or "share".');
            }
          } else {
            this.voice.stop();
          }
        }
      }),
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.VisibleBlurred) stopSpeaking();
      }),
      () => {
        this.voice.stop();
        stopSpeaking();
        this.card?.remove();
      },
    );

    // A look shared by link: dress the form in it.
    this.receiveShared();
    const onHash = () => this.receiveShared();
    window.addEventListener('hashchange', onHash);
    this.cleanupFuncs.push(() => window.removeEventListener('hashchange', onHash));
  }

  // ---------------------------------------------------------------- studio panel

  private wirePanel(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('atelier-panel');
    if (!panel) return;
    const ids = ['access-button', 'access-label', 'access-section', 'access-status', 'share-button', 'hint'];
    for (const id of [...ids, ...KEYS.map((k) => `acc-${k}`), ...TAILOR.map((t) => t.id)]) {
      this.els[id] = panel.getElementById(id) ?? undefined;
    }
    this.hint = this.els.hint;
    const on = (id: string, fn: () => void) => {
      const el = this.els[id];
      if (!el) return;
      el.addEventListener('click', fn);
      this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
    };
    on('access-button', () => this.togglePanel());
    on('share-button', () => this.share());
    for (const k of KEYS) on(`acc-${k}`, () => this.toggle(k));
    for (const t of TAILOR) on(t.id, () => this.atelier.nudge(t.param, t.dir));

    for (const [panelId, list] of Object.entries(HC_TEXT)) {
      const p = this.world.getSceneObject<UIKitMLAsset>(panelId);
      for (const id of list) {
        const el = p?.getElementById(id);
        if (el) this.hcEls.push({ el, gold: false });
      }
      for (const id of HC_GOLD[panelId] ?? []) {
        const el = p?.getElementById(id);
        if (el) this.hcEls.push({ el, gold: true });
      }
    }
  }

  togglePanel(open = !this.panelOpen): void {
    this.panelOpen = open;
    this.els['access-section']?.setProperties({ display: open ? 'flex' : 'none' });
    this.els['access-label']?.setProperties({ text: open ? 'Close' : 'Access' });
    if (open) {
      this.atelier.setHint('Accessibility: bigger text, high contrast, calm motion, read aloud, voice, and tailoring by tap.');
    }
  }

  /** Toggle a setting, refusing features this browser cannot provide. */
  toggle(key: AccessKey): boolean {
    const turningOn = !access.settings[key];
    if (turningOn && key === 'readAloud' && !canSpeak) {
      this.status('Read aloud is not available in this browser.');
      return false;
    }
    if (turningOn && key === 'voice' && !canListen) {
      this.status('Voice commands are not available in this browser.');
      return false;
    }
    access.set(key, turningOn);
    sfx.tick();
    if (key !== 'voice') this.status(`${ACCESS_LABELS[key]} ${turningOn ? 'on' : 'off'}. Settings stay on this device.`);
    return true;
  }

  private status(text: string): void {
    this.els['access-status']?.setProperties({ text });
    const live = this.card?.querySelector<HTMLElement>('[data-live]');
    if (live) live.textContent = text;
    say(text);
  }

  private paint(): void {
    const s = access.settings;
    const off = s.highContrast ? OFF_HC : OFF;
    for (const k of KEYS) {
      const c = s[k] ? ON : off;
      this.els[`acc-${k}`]?.setProperties({ backgroundColor: c.bg, borderColor: c.border, color: c.text });
    }
    for (const t of TAILOR) {
      this.els[t.id]?.setProperties({ backgroundColor: off.bg, borderColor: off.border, color: off.text });
    }
    if (this.card) {
      for (const box of this.card.querySelectorAll<HTMLInputElement>('input[data-key]')) {
        box.checked = s[box.dataset.key as AccessKey];
      }
    }
  }

  /** High contrast: pure white text, bright gold accents, black hint card. */
  private applyContrast(on: boolean): void {
    for (const { el, gold } of this.hcEls) {
      const color = on ? (gold ? '#ffd25e' : '#ffffff') : undefined;
      el.setProperties({ color, dark: { color } } as never);
    }
    this.hint?.setProperties(
      (on
        ? { backgroundColor: '#000000', color: '#ffffff', borderWidth: 2, borderColor: '#ffd25e', dark: { backgroundColor: '#000000', color: '#ffffff' } }
        : { backgroundColor: undefined, color: undefined, borderWidth: undefined, borderColor: undefined, dark: {} }) as never,
    );
  }

  // ---------------------------------------------------------------- voice

  private commands() {
    const stylist = () => this.world.getSystem(StylistSystem)!;
    const closet = () => this.world.getSystem(ClosetSystem)!;
    const a = () => this.atelier;
    const look = (n: number) => () => a().wearLook(n - 1);
    const numbers = ['one', 'two', 'three', 'four', 'five', 'six'];
    return [
      { phrases: ['style me', 'dress me', 'stylist'], run: () => { stylist().open(); void stylist().styleMe(); } },
      { phrases: ['next', 'next idea', 'another', 'something else'], run: () => stylist().nextIdea() },
      { phrases: ['keep', 'keep it', 'i like it', 'love it'], run: () => stylist().keep() },
      { phrases: ['warmer', 'warm'], run: () => void stylist().refine('warmer') },
      { phrases: ['dressier', 'fancier', 'more formal'], run: () => void stylist().refine('dressier') },
      { phrases: ['more colour', 'more color', 'colour', 'color', 'colourful', 'colorful'], run: () => void stylist().refine('colour') },
      { phrases: ['undo', 'go back'], run: () => a().undo() },
      { phrases: ['redo'], run: () => a().redo() },
      { phrases: ['turn', 'turn around', 'spin', 'show the back'], run: () => a().turnForm(1) },
      { phrases: ['reset', 'start over'], run: () => a().resetLook() },
      { phrases: ['shorter', 'hem up'], run: () => a().nudge('hem', 1) },
      { phrases: ['longer', 'hem down'], run: () => a().nudge('hem', -1) },
      { phrases: ['sleeves longer', 'longer sleeves'], run: () => a().nudge('sleeve', 1) },
      { phrases: ['sleeves shorter', 'shorter sleeves'], run: () => a().nudge('sleeve', -1) },
      { phrases: ['waist in', 'more fitted', 'tighter'], run: () => a().nudge('fit', 1) },
      { phrases: ['waist out', 'looser', 'more relaxed'], run: () => a().nudge('fit', -1) },
      { phrases: ['boutique', 'shop', 'shopping'], run: () => closet().openBoutique() },
      { phrases: ['share', 'share this', 'share look'], run: () => this.share() },
      { phrases: ['read', 'read it', 'what is this', 'describe'], run: () => say(`${a().outfitTitle || 'No look yet'}.`, { force: true }) },
      ...numbers.flatMap((w, i) => [
        { phrases: [`look ${w}`, `look ${i + 1}`, `wear look ${w}`, `wear look ${i + 1}`], run: look(i + 1) },
      ]),
    ];
  }

  // ---------------------------------------------------------------- share

  /** Make a link for the look on the form. */
  share(): string {
    const pieces = this.atelier.currentPieces;
    if (pieces.length === 0) {
      this.atelier.setHint('Dress the form first, then share the look.');
      return '';
    }
    const name = this.atelier.outfitTitle || 'My look';
    const url = shareUrl(name, pieces);
    this.lastShareUrl = url;
    try {
      localStorage.setItem(SHARE_KEY, url);
    } catch {
      /* ignore */
    }
    sfx.success();
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (inXR) {
      this.atelier.setHint(`"${name}" is ready to share. Exit the studio: the start page shows its link and QR code.`);
    } else {
      this.showShare(url, name);
    }
    return url;
  }

  private receiveShared(): void {
    const look = lookFromLocation();
    if (!look) return;
    clearLookFromLocation();
    this.atelier.dress(look.pieces, look.name, 'Shared with you. Wear it, tailor it, or save it to your lookbook.');
    this.atelier.setHint('A shared look is on the form. Undo returns to what you had before.');
  }

  // ---------------------------------------------------------------- start page card

  private buildCard(): void {
    const card = sideSection('studio-options', 3, 'Share and accessibility', false, 'Send this look, or change how Atelier looks and sounds.') as HTMLDivElement;
    card.setAttribute('aria-label', 'Sharing and accessibility');
    const body = document.createElement('div');
    body.innerHTML = `
      <button type="button" data-share class="as-btn as-wide" style="margin-top:12px">Share this look</button>
      <div data-sharebox style="display:none;margin-top:10px"></div>
      <div class="as-label">Accessibility</div>
      <div data-boxes style="margin-top:4px"></div>
      <div data-live aria-live="polite" class="as-note">Also in the studio: Access on the panel.</div>`;
    card.appendChild(body);
    const boxes = card.querySelector('[data-boxes]')!;
    for (const k of KEYS) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:10px;padding:4px 0;cursor:pointer';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.key = k;
      box.addEventListener('change', () => {
        if (!this.toggle(k)) box.checked = false;
      });
      label.append(box, document.createTextNode(ACCESS_LABELS[k]));
      boxes.appendChild(label);
    }
    card.querySelector('[data-share]')!.addEventListener('click', () => this.share());
    this.shareBox = card.querySelector<HTMLDivElement>('[data-sharebox]')!;
    this.card = card;
    this.paint();
    if (this.lastShareUrl) {
      /* a look shared from inside the studio is waiting */
      const live = card.querySelector<HTMLElement>('[data-live]');
      if (live) live.textContent = 'Your last shared look is ready: tap Share this look.';
    }
  }

  private showShare(url: string, name: string): void {
    const box = this.shareBox;
    if (!box) return;
    box.style.display = 'block';
    (this.card as HTMLDetailsElement | undefined)?.setAttribute('open', '');
    box.innerHTML = `
      <div style="background:#fffdf8;border:1px solid #d8ccb6;border-radius:10px;padding:6px;width:150px;margin:0 auto" aria-label="QR code for ${name.replace(/[<>"&]/g, '')}">${qrSvg(url)}</div>
      <div class="as-note" style="margin:6px 0">Scan with a phone, or send the link. The look travels inside the link; nothing is uploaded.</div>
      <div style="display:flex;gap:6px">
        <button type="button" data-copy class="as-btn" style="flex:1">Copy link</button>
        <button type="button" data-send class="as-btn as-btn-main" style="flex:1">Send...</button>
      </div>`;
    const live = this.card?.querySelector<HTMLElement>('[data-live]');
    box.querySelector('[data-copy]')!.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        if (live) live.textContent = 'Link copied.';
      } catch {
        if (live) live.textContent = url;
      }
    });
    const send = box.querySelector<HTMLButtonElement>('[data-send]')!;
    if (!navigator.share) send.style.display = 'none';
    send.addEventListener('click', () => {
      void navigator.share?.({ title: `Atelier: ${name}`, text: `Try "${name}" on in Atelier`, url }).catch(() => {});
    });
  }
}
