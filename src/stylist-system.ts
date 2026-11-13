/**
 * StylistSystem – the AI stylist and Outfit of the Day.
 *
 * The stylist is a small agent loop over the user's real closet:
 *  1. "Ask stylist" opens occasion / weather / mood chips (the constraints).
 *  2. "Style me" plans up to three distinct outfits. Claude does it through
 *     /api/stylist when the endpoint is configured and answers in time;
 *     otherwise the offline engine plans them, so it always works.
 *  3. It acts: the first option is put on the mannequin as a PREVIEW.
 *  4. The user decides: Keep, Next idea (cycle alternatives) or Undo (the
 *     outfit from before the stylist comes back). Changing a chip while a
 *     preview is up re-plans with the new constraints.
 *  "Wear today" logs the outfit as the Outfit of the Day and keeps a daily
 *  streak (localStorage); it also saves the look to the lookbook.
 */
import { AudioUtils, createSystem, UIKit, UIKitMLAsset } from '@iwsdk/core';
import { AtelierSystem, Snapshot } from './atelier-system.js';
import { LookbookSystem } from './lookbook-system.js';
import { DressForm as AtelierForm } from './atelier-components.js';
import { ClosetSystem } from './closet-system.js';
import { currentStreak, loadOotd, loggedToday, logToday, OotdState } from './atelier/ootd.js';
import {
  isWearable,
  MAX_OPTIONS,
  Mood,
  MOODS,
  Occasion,
  OCCASIONS,
  StylistItem,
  StylistReply,
  Weather,
  WEATHERS,
} from './atelier/stylist-contract.js';
import { describeItem, planOffline, StylistPlan, StylistResult } from './atelier/stylist-engine.js';

interface Proposal {
  options: StylistResult[];
  index: number;
  /** The outfit on the form before the stylist acted (Undo restores it). */
  before: Snapshot;
  considered: number;
  gap?: string;
}

const ENDPOINT: string = import.meta.env.VITE_STYLIST_URL || 'api/stylist';
const TIMEOUT_MS = 15_000;
const ON = { bg: '#e2c27d', border: '#e2c27d', text: '#2b2118' };
const OFF = { bg: '#2c2e33', border: '#4a4d55', text: '#f1ede4' };

type El = UIKit.Text | undefined;

export class StylistSystem extends createSystem({
  forms: { required: [AtelierForm] },
}) {
  occasion: Occasion = 'work';
  weather: Weather = 'mild';
  mood: Mood = 'classic';
  busy = false;
  /** A chip changed while a request was in flight: plan again after it. */
  private replan = false;
  /** The previewed proposal awaiting Keep / Next idea / Undo. */
  proposal?: Proposal;
  /** The last kept answer, for scripted checks. */
  last?: StylistResult;
  /** Where the last plan came from, for scripted checks. */
  lastSource?: 'claude' | 'offline';
  private lookbook?: LookbookSystem;
  ootd!: OotdState;
  private atelier!: AtelierSystem;
  private closet!: ClosetSystem;
  private ui: Record<string, El> = {};
  private chips: Record<string, El> = {};

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.closet = this.world.getSystem(ClosetSystem)!;
    this.lookbook = this.world.getSystem(LookbookSystem);
    this.ootd = loadOotd();

    const panel = this.world.getSceneObject<UIKitMLAsset>('closet-panel');
    if (!panel) return;
    const el = (id: string) => panel.getElementById<UIKit.Text>(id) ?? undefined;
    this.ui = {
      eyebrow: el('closet-eyebrow'),
      title: el('closet-title'),
      note: el('closet-note'),
      tip: el('stylist-tip'),
      meta: el('stylist-meta'),
      stylistActions: el('stylist-actions'),
      proposalActions: el('proposal-actions'),
      nextLabel: el('next-label'),
      styleLabel: el('style-label'),
      badge: el('streak-badge'),
      count: el('streak-count'),
      streakTitle: el('streak-title'),
      streakSub: el('streak-sub'),
    };
    const on = (id: string, fn: () => void) => {
      const node = panel.getElementById(id);
      if (!node) return;
      node.addEventListener('click', fn);
      this.cleanupFuncs.push(() => node.removeEventListener('click', fn));
    };
    on('stylist-button', () => this.open());
    on('stylist-back', () => this.back());
    on('style-button', () => void this.styleMe());
    on('keep-button', () => this.keep());
    on('next-button', () => this.nextIdea());
    on('revert-button', () => this.revert());
    on('today-button', () => this.wearToday());
    for (const o of OCCASIONS) {
      this.chips[`occ-${o}`] = el(`occ-${o}`);
      on(`occ-${o}`, () => this.choose({ occasion: o }));
    }
    for (const w of WEATHERS) {
      this.chips[`wx-${w}`] = el(`wx-${w}`);
      on(`wx-${w}`, () => this.choose({ weather: w }));
    }
    for (const m of MOODS) {
      this.chips[`mood-${m}`] = el(`mood-${m}`);
      on(`mood-${m}`, () => this.choose({ mood: m }));
    }
    this.renderStreak();
  }

  // ------------------------------------------------------------------ stylist

  open(): void {
    this.closet.openStylistView();
    this.showAsk();
  }

  /** The constraint picker (no proposal on the form). */
  private showAsk(note?: string): void {
    this.ui.eyebrow?.setProperties({ text: 'AI STYLIST' });
    this.ui.title?.setProperties({ text: 'Where are you headed?' });
    this.ui.note?.setProperties({
      display: 'flex',
      text: note ?? 'Pick the occasion, weather and mood. I will dress the form from your closet.',
    });
    this.ui.tip?.setProperties({ display: 'none' });
    this.ui.meta?.setProperties({ display: 'none' });
    this.ui.styleLabel?.setProperties({ text: 'Style me' });
    this.setActions(false);
    this.paintChips();
  }

  private setActions(proposal: boolean): void {
    this.ui.stylistActions?.setProperties({ display: proposal ? 'none' : 'flex' });
    this.ui.proposalActions?.setProperties({ display: proposal ? 'flex' : 'none' });
  }

  choose(c: { occasion?: Occasion; weather?: Weather; mood?: Mood }): void {
    if (c.occasion) this.occasion = c.occasion;
    if (c.weather) this.weather = c.weather;
    if (c.mood) this.mood = c.mood;
    this.paintChips();
    // The agent responds to new constraints while a preview is up.
    if (this.proposal || this.busy) void this.styleMe();
  }

  /** Plan outfits for the current constraints and preview the best one. */
  async styleMe(): Promise<void> {
    if (this.busy) {
      this.replan = true;
      return;
    }
    const items = this.closet.items.map(describeItem);
    const plan = planOffline(items, this.occasion, this.weather, this.mood, MAX_OPTIONS);
    if (plan.options.length === 0) {
      this.ui.title?.setProperties({ text: 'Your closet needs more' });
      this.ui.note?.setProperties({
        text: 'Add a dress, or a top and a bottom, with New piece - then ask again.',
      });
      return;
    }
    const before = this.proposal?.before ?? this.atelier.snapshot();
    this.busy = true;
    this.ui.styleLabel?.setProperties({ text: 'Styling...' });
    this.ui.eyebrow?.setProperties({ text: 'AI STYLIST  |  THINKING' });
    this.ui.title?.setProperties({ text: 'Reading your closet...' });
    this.ui.note?.setProperties({
      display: 'flex',
      text: `Weighing ${plan.considered} outfits from ${items.length} pieces for ${this.occasion}, ${this.weather}, ${this.mood}.`,
    });

    let options: StylistResult[] = plan.options;
    try {
      const remote = await this.askClaude(items);
      if (remote.length > 0) options = remote;
    } catch {
      /* keep the offline plan */
    }
    this.busy = false;
    if (this.replan) {
      this.replan = false;
      this.proposal = { ...this.toProposal(plan, options), before };
      return this.styleMe();
    }
    this.proposal = { ...this.toProposal(plan, options), before };
    this.lastSource = options[0].source;
    this.showOption();
  }

  private toProposal(plan: StylistPlan, options: StylistResult[]) {
    return { options, index: 0, considered: plan.considered, gap: plan.gap };
  }

  /** Put the current option on the form as a preview and describe it. */
  private showOption(): void {
    const p = this.proposal;
    if (!p) return;
    const opt = p.options[p.index];
    this.closet.wearOutfit(opt.itemIds, opt.title, opt.reason);
    this.atelier.setBadge(`STYLIST PREVIEW  ${p.index + 1}/${p.options.length}`);
    const source = opt.source === 'claude' ? 'CLAUDE' : 'OFFLINE';
    this.ui.eyebrow?.setProperties({ text: `PREVIEW ${p.index + 1} OF ${p.options.length}  |  ${source}` });
    this.ui.title?.setProperties({ text: opt.title });
    // The reason is on the studio panel (look-note); keep this panel short
    // so it stays inside a narrow field of view.
    this.ui.note?.setProperties({ display: 'none', text: opt.reason });
    this.ui.tip?.setProperties({ display: 'flex', text: `Tip: ${opt.tip}` });
    this.ui.meta?.setProperties({
      display: 'flex',
      text: `Weighed ${p.considered} outfits from your closet.${p.gap ? ` ${p.gap}` : ''}`,
    });
    this.ui.nextLabel?.setProperties({ text: p.options.length > 1 ? 'Next idea' : 'Restyle' });
    this.setActions(true);
    this.atelier.setHint('Keep it, see the next idea, or Undo. Change a chip and I will re-plan.');
  }

  nextIdea(): void {
    const p = this.proposal;
    if (!p || this.busy) return;
    if (p.options.length < 2) {
      void this.styleMe();
      return;
    }
    p.index = (p.index + 1) % p.options.length;
    this.showOption();
  }

  keep(): void {
    const p = this.proposal;
    if (!p) return;
    const opt = p.options[p.index];
    this.last = opt;
    this.proposal = undefined;
    this.atelier.setBadge(null);
    this.closet.backToBrowse(`Kept "${opt.title}". Wear today to log it, or Save look to keep it.`);
    this.atelier.setHint('Tailor it with the pins, or tap Wear today to start your streak.');
  }

  /** Undo the stylist: the outfit from before it acted comes back. */
  revert(): void {
    const p = this.proposal;
    if (!p) return;
    this.proposal = undefined;
    this.atelier.setBadge(null);
    if (p.before.pieces.length > 0) {
      this.atelier.restore(p.before, 'Back to what you had before the stylist.');
    } else {
      this.atelier.dress([], 'Choose a look', 'Tap any outfit on the brass rail to dress the form.', {
        quiet: true,
      });
    }
    this.showAsk('Undone - your previous outfit is back. Change the chips and try again.');
  }

  /** Leaving the stylist without Keep discards an open preview. */
  private back(): void {
    if (this.proposal) this.revert();
    this.closet.backToBrowse();
  }

  private async askClaude(items: StylistItem[]): Promise<StylistResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occasion: this.occasion,
          weather: this.weather,
          mood: this.mood,
          items,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as StylistReply;
      if (!Array.isArray(data.options)) return [];
      const kindOf = new Map(items.map((i) => [i.id, i.kind as string]));
      return data.options
        .filter(
          (o) =>
            Array.isArray(o.itemIds) &&
            typeof o.title === 'string' &&
            typeof o.reason === 'string' &&
            typeof o.tip === 'string' &&
            o.itemIds.every((id) => kindOf.has(id)) &&
            isWearable(o.itemIds.map((id) => kindOf.get(id)!)),
        )
        .slice(0, MAX_OPTIONS)
        .map((o) => ({ ...o, source: 'claude' as const }));
    } finally {
      clearTimeout(timer);
    }
  }

  private paintChips(): void {
    const paint = (id: string, on: boolean) => {
      const c = on ? ON : OFF;
      this.chips[id]?.setProperties({ backgroundColor: c.bg, borderColor: c.border, color: c.text });
    };
    for (const o of OCCASIONS) paint(`occ-${o}`, o === this.occasion);
    for (const w of WEATHERS) paint(`wx-${w}`, w === this.weather);
    for (const m of MOODS) paint(`mood-${m}`, m === this.mood);
  }

  // ------------------------------------------------------------------ outfit of the day

  wearToday(): void {
    const pieces = this.atelier.currentPieces;
    if (pieces.length === 0) {
      this.closet.backToBrowse('Dress the form first - a look, your closet, or the stylist.');
      return;
    }
    if (this.proposal) this.keep();
    const name = this.atelier.outfitTitle || 'Today\'s look';
    const extended = logToday(this.ootd, name);
    this.lookbook?.saveCurrent(name);
    const streak = currentStreak(this.ootd);
    for (const form of this.queries.forms.entities) AudioUtils.play(form);
    this.closet.backToBrowse(
      extended
        ? `Logged "${name}" as today's outfit. ${streak === 1 ? 'Streak started!' : `${streak} days in a row!`}`
        : `Updated today's outfit to "${name}".`,
    );
    this.atelier.setHint(`Outfit of the Day saved. Come back tomorrow to keep the streak.`);
    this.renderStreak();
  }

  renderStreak(): void {
    const streak = currentStreak(this.ootd);
    const today = loggedToday(this.ootd);
    this.ui.count?.setProperties({ text: String(streak) });
    this.ui.badge?.setProperties({ backgroundColor: today ? '#e2c27d' : '#34363c' });
    this.ui.count?.setProperties({ color: today ? '#2b2118' : '#f1ede4' });
    this.ui.streakTitle?.setProperties({
      text: today ? 'Today is logged' : streak > 0 ? 'Keep it going today' : 'Outfit of the Day',
    });
    const last = this.ootd.log[this.ootd.log.length - 1];
    this.ui.streakSub?.setProperties({
      text: today && last
        ? `${last.name}. Best streak: ${this.ootd.best} ${this.ootd.best === 1 ? 'day' : 'days'}.`
        : 'Dress the form, then tap Wear today.',
    });
  }
}
