/**
 * PlannerSystem – plan ahead from your closet (closet panel, "Plan week" in
 * the stylist view).
 *
 *  - Your week: seven outfits, Monday to Sunday (work days, a Friday date,
 *    a relaxed weekend), varied so pieces are not over-worn, fitted to the
 *    weather and mood picked in the stylist. Tap a day to put it on the form;
 *    today is marked. The plan is kept on the device for the week.
 *  - Pack for a trip: 3, 5 or 7 days from the fewest pieces.
 */
import { createSystem, UIKit, UIKitMLAsset } from '@iwsdk/core';
import { CHIP } from './atelier/palette.js';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { StylistSystem } from './stylist-system.js';
import { describeItem } from './atelier/stylist-engine.js';
import { planPacking, planWeek, WEEK, WeekPlan } from './atelier/planner.js';
import { localDate } from './atelier/ootd.js';
import { sfx } from './atelier/sfx.js';

const KEY = 'atelier.week.v1';
const ON = CHIP.on;
const TODAY = CHIP.today;
const OFF = CHIP.off;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = UIKit.Component<any> | undefined;

interface SavedWeek {
  /** Monday of the planned week (local date). */
  week: string;
  plan: WeekPlan;
}

/** Monday of the week containing `date` (YYYY-MM-DD). */
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}

/** 0 = Monday ... 6 = Sunday. */
function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

export class PlannerSystem extends createSystem({}) {
  /** The plan on the panel (for scripted checks). */
  plan?: WeekPlan;
  /** Day shown on the form, -1 for none. */
  selected = -1;
  private atelier!: AtelierSystem;
  private closet!: ClosetSystem;
  private stylist!: StylistSystem;
  private ui: Record<string, El> = {};

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.closet = this.world.getSystem(ClosetSystem)!;
    this.stylist = this.world.getSystem(StylistSystem)!;
    const panel = this.world.getSceneObject<UIKitMLAsset>('closet-panel');
    if (!panel) return;
    const el = (id: string) => panel.getElementById(id) ?? undefined;
    for (const id of ['closet-eyebrow', 'closet-title', 'closet-note', 'week-summary', 'pack-list', ...WEEK.map((_, i) => `wk-${i}`)]) {
      this.ui[id] = el(id);
    }
    const on = (id: string, fn: () => void) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener('click', fn);
      this.cleanupFuncs.push(() => node.removeEventListener('click', fn));
    };
    on('week-button', () => this.open());
    on('week-replan', () => this.open(true));
    on('week-back', () => this.close());
    WEEK.forEach((_, i) => on(`wk-${i}`, () => this.wearDay(i)));
    for (const n of [3, 5, 7]) on(`pack-${n}`, () => this.pack(n));
  }

  /** Show the week (reusing this week's saved plan unless asked to replan). */
  open(replan = false): void {
    const items = this.closet.items.map(describeItem);
    const week = mondayOf(localDate());
    let saved: SavedWeek | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedWeek | null;
    } catch {
      saved = null;
    }
    const ids = new Set(items.map((i) => i.id));
    const stillValid =
      !!saved && saved.week === week && saved.plan.days.every((d) => d.itemIds.every((id) => ids.has(id)));
    this.plan = !replan && stillValid ? saved!.plan : planWeek(items, this.stylist.weather, this.stylist.mood);
    try {
      localStorage.setItem(KEY, JSON.stringify({ week, plan: this.plan } satisfies SavedWeek));
    } catch {
      /* fine for this visit */
    }
    this.closet.panelSections('week');
    this.ui['closet-eyebrow']?.setProperties({ text: 'Plan ahead' });
    if (this.plan.days.length === 0) {
      this.ui['closet-title']?.setProperties({ text: 'Your closet needs more' });
      this.ui['closet-note']?.setProperties({ text: 'Add a dress, or a top and a bottom, then plan again.' });
      return;
    }
    this.ui['closet-title']?.setProperties({ text: 'Your week, planned' });
    this.ui['closet-note']?.setProperties({
      text: `${this.plan.outfits} different outfits from ${this.plan.pieces} pieces, for ${this.stylist.weather} weather.`,
    });
    this.ui['week-summary']?.setProperties({
      text: 'Mon to Thu for work, a Friday date, a relaxed weekend. Today is outlined.',
    });
    this.ui['pack-list']?.setProperties({ display: 'none' });
    this.selected = -1;
    this.paint();
    sfx.sparkle();
    this.atelier.setHint(`Week planned: ${this.plan.outfits} outfits from ${this.plan.pieces} pieces. Tap a day to see it on the form.`);
  }

  close(): void {
    this.selected = -1;
    this.stylist.open();
  }

  /** Put day `i` of the plan on the form. */
  wearDay(i: number): void {
    const day = this.plan?.days[i];
    if (!day) return;
    this.selected = i;
    const label = `${WEEK[i].day}: ${day.occasion === 'date' ? 'date night' : day.occasion}`;
    this.closet.wearOutfit(day.itemIds, label, `Planned for ${WEEK[i].day}. Tailor it, or tap another day.`);
    this.closet.panelSections('week');
    this.paint();
  }

  /** A trip of `days` days from the fewest pieces. */
  pack(days: number): void {
    const items = this.closet.items;
    const plan = planPacking(items.map(describeItem), this.stylist.weather, this.stylist.mood, days);
    if (plan.days.length === 0) return;
    const names = plan.pack.map((id) => items.find((i) => i.id === id)?.name ?? id);
    const text = `${days}-day trip: pack ${plan.pack.length} pieces for ${plan.outfits} outfits. ${names.join(', ')}.`;
    this.ui['pack-list']?.setProperties({ display: 'flex', text });
    this.closet.wearOutfit(plan.days[0].itemIds, `Trip, day 1`, `Packing for ${days} days: ${plan.pack.length} pieces.`);
    this.closet.panelSections('week');
    this.atelier.setHint(text);
    sfx.success();
  }

  private paint(): void {
    const today = todayIndex();
    WEEK.forEach((_, i) => {
      const c = i === this.selected ? ON : i === today ? TODAY : OFF;
      this.ui[`wk-${i}`]?.setProperties({ backgroundColor: c.bg, borderColor: c.border, color: c.text });
    });
  }
}
