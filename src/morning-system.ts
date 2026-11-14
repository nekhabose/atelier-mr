/**
 * MorningSystem – the morning routine, from your real day.
 *
 *  - Local weather (Open-Meteo, no key): on the start page, "Use my local
 *    weather" asks the browser for your rough position once; after that the
 *    week's forecast is refreshed quietly each day. Only the location rounded
 *    to about 10 km is sent.
 *  - Your calendar: import an .ics file on the start page. It is read on this
 *    device and only the day and kind of event (interview, party, trip, work)
 *    are kept.
 *  - On the closet panel, "This morning" says today's weather and what is on,
 *    and offers "Dress me for today" (the stylist, with those constraints) and
 *    "Lay out tomorrow" (tomorrow's outfit, picked tonight and waiting on the
 *    form in the morning).
 * The week planner plans around the same calendar and forecast.
 */
import { createSystem, UIKit, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { StylistSystem } from './stylist-system.js';
import { sideSection } from './atelier/side-panel.js';
import { localDate } from './atelier/ootd.js';
import { sfx } from './atelier/sfx.js';
import { describeItem, planOffline } from './atelier/stylist-engine.js';
import type { Occasion, Weather } from './atelier/stylist-contract.js';
import { calendarDays, CalendarDay, loadCalendar, saveCalendar, SavedCalendar } from './atelier/calendar.js';
import { DayForecast, describeDay, fetchForecast, Forecast, loadForecast, roughPosition, saveForecast } from './atelier/weather.js';

const CONSENT_KEY = 'atelier.weather.ok';
const LAYOUT_KEY = 'atelier.layout.v1';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OCCASION_WORDS: Record<Occasion, string> = {
  work: 'work',
  interview: 'an interview',
  date: 'a date',
  weekend: 'a relaxed day',
  party: 'a party',
  travel: 'travel',
};

/** An outfit picked the night before. */
interface Layout {
  date: string;
  itemIds: string[];
  title: string;
}

type El = UIKit.Text | undefined;

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* fine for this visit */
  }
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** "Sat 14 Nov" */
export function dayLabel(date: string): string {
  const d = parse(date);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export class MorningSystem extends createSystem({}) {
  forecast: Forecast | null = null;
  calendar: SavedCalendar | null = null;
  /** The last laid-out outfit (for scripted checks). */
  layout: Layout | null = null;
  private atelier!: AtelierSystem;
  private closet!: ClosetSystem;
  private stylist!: StylistSystem;
  private ui: Record<string, El> = {};
  private weatherStatus?: HTMLElement;
  private calendarStatus?: HTMLElement;
  private weatherButton?: HTMLButtonElement;

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.closet = this.world.getSystem(ClosetSystem)!;
    this.stylist = this.world.getSystem(StylistSystem)!;
    this.forecast = loadForecast();
    this.calendar = loadCalendar();
    this.layout = read<Layout>(LAYOUT_KEY);
    this.buildSection();

    const panel = this.world.getSceneObject<UIKitMLAsset>('closet-panel');
    if (panel) {
      const el = (id: string) => panel.getElementById<UIKit.Text>(id) ?? undefined;
      this.ui = { label: el('morning-label'), text: el('morning-text'), today: el('morning-today') };
      const on = (id: string, fn: () => void) => {
        const node = panel.getElementById(id);
        if (!node) return;
        node.addEventListener('click', fn);
        this.cleanupFuncs.push(() => node.removeEventListener('click', fn));
      };
      on('morning-today', () => this.dressToday());
      on('morning-tomorrow', () => this.layOutTomorrow());
    }
    // A new day may have started while the app was open in the background.
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state !== VisibilityState.VisibleBlurred) this.paint();
      }),
    );
    void this.refreshQuietly();
  }

  // ---------------------------------------------------------------- your day

  private dayFor(date: string): { occasion: Occasion; cue?: string; forecast?: DayForecast } {
    const cal: CalendarDay | undefined = this.calendar?.days.find((d) => d.date === date);
    const weekday = parse(date).getDay();
    const occasion = cal?.occasion ?? (weekday === 0 || weekday === 6 ? 'weekend' : 'work');
    return { occasion, cue: cal?.cue, forecast: this.forecast?.days.find((d) => d.date === date) };
  }

  /** Mon..Sun of the week starting `monday`, with calendar and forecast where known. */
  weekDays(monday: string): { day: string; occasion?: Occasion; weather?: Weather }[] {
    const out: { day: string; occasion?: Occasion; weather?: Weather }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      out.push({
        day: DAYS[parse(date).getDay()],
        occasion: this.calendar?.days.find((d) => d.date === date)?.occasion,
        weather: this.forecast?.days.find((d) => d.date === date)?.weather,
      });
    }
    return out;
  }

  /** True once a calendar or a forecast is on the device. */
  get hasRealDay(): boolean {
    return !!this.calendar || !!this.forecast;
  }

  private todayLayout(): Layout | null {
    const l = this.layout;
    if (!l || l.date !== localDate()) return null;
    return l.itemIds.every((id) => this.closet.items.some((i) => i.id === id)) ? l : null;
  }

  /** The closet panel's "This morning" lines. */
  paint(): void {
    const today = localDate();
    const day = this.dayFor(today);
    const laid = this.todayLayout();
    const weather = day.forecast ? describeDay(day.forecast) : null;
    const tomorrow = this.layout?.date === addDays(today, 1) ? this.layout : null;
    let text: string;
    if (laid) {
      text = `Laid out last night: ${laid.title}.${weather ? ` ${weather}.` : ''}`;
    } else if (tomorrow) {
      text = `Tomorrow is laid out: ${tomorrow.title}.`;
    } else {
      const what = day.cue ? ` ${OCCASION_WORDS[day.occasion][0].toUpperCase()}${OCCASION_WORDS[day.occasion].slice(1)} on your calendar.` : '';
      text = weather
        ? `${dayLabel(today)}: ${weather}.${what}`
        : `${dayLabel(today)}.${what} Check the weather on the start page, or pick it in the stylist.`;
    }
    this.ui.text?.setProperties({ text });
    this.ui.today?.setProperties({ text: laid ? 'Wear what I laid out' : 'Dress me for today' });
  }

  /** Today's outfit: what you laid out last night, or the stylist with today's day. */
  dressToday(): void {
    const laid = this.todayLayout();
    if (laid) {
      this.closet.wearOutfit(laid.itemIds, laid.title, 'Laid out last night. Tap Wear today when you put it on.');
      this.atelier.setHint('Here is what you picked last night. Tailor it, or tap Wear today.');
      sfx.sparkle();
      return;
    }
    const day = this.dayFor(localDate());
    this.stylist.occasion = day.occasion;
    if (day.forecast) this.stylist.weather = day.forecast.weather;
    this.stylist.open();
    void this.stylist.styleMe();
    const why = [day.forecast ? describeDay(day.forecast) : '', day.cue ? `${day.cue} on your calendar` : '']
      .filter(Boolean)
      .join(', ');
    if (why) this.atelier.setHint(`Dressed for today: ${why}. Keep it, or see the next idea.`);
  }

  /** Pick tomorrow's outfit tonight; it is waiting on the form in the morning. */
  layOutTomorrow(): void {
    const date = addDays(localDate(), 1);
    const day = this.dayFor(date);
    const items = this.closet.items.map(describeItem);
    const weather = day.forecast?.weather ?? this.stylist.weather;
    const best = planOffline(items, day.occasion, weather, this.stylist.mood, 1).options[0];
    if (!best) {
      this.closet.backToBrowse('Your closet needs a top and a bottom, or a dress, to lay out an outfit.');
      return;
    }
    const names = best.itemIds.map((id) => this.closet.items.find((i) => i.id === id)?.name ?? '').filter(Boolean);
    const title = names.join(', ');
    this.layout = { date, itemIds: best.itemIds, title };
    write(LAYOUT_KEY, this.layout);
    const label = dayLabel(date).split(' ')[0];
    const why = [OCCASION_WORDS[day.occasion], day.forecast ? describeDay(day.forecast) : ''].filter(Boolean).join(', ');
    this.closet.wearOutfit(best.itemIds, `Laid out for ${label}`, `For ${why}. It will be on the form when you open Atelier tomorrow.`);
    this.closet.backToBrowse(`Laid out for ${label}: ${title}.`);
    this.atelier.setHint(`Tomorrow is ready: ${why}. Change it any time tonight, or lay it out again.`);
    sfx.success();
    this.paint();
  }

  // ---------------------------------------------------------------- weather

  /** Refresh today's forecast without prompting, if you said yes before. */
  private async refreshQuietly(): Promise<void> {
    this.paint();
    if (!read<boolean>(CONSENT_KEY) || this.forecast?.fetched === localDate()) return;
    try {
      const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (perm && perm.state !== 'granted') return;
      await this.useLocalWeather(false);
    } catch {
      /* keep the cached forecast */
    }
  }

  /** Ask for a rough position and fetch the week's forecast. */
  async useLocalWeather(announce = true): Promise<boolean> {
    if (announce) this.status(this.weatherStatus, 'Asking for your rough location...');
    try {
      const pos = await roughPosition();
      const f = await fetchForecast(pos.lat, pos.lon, localDate());
      if (!f) throw new Error('no forecast');
      this.forecast = f;
      saveForecast(f);
      write(CONSENT_KEY, true);
      this.paintSection();
      this.paint();
      return true;
    } catch (e) {
      if (announce) {
        const denied = (e as GeolocationPositionError)?.code === 1;
        this.status(
          this.weatherStatus,
          denied ? 'Location not allowed. You can still pick the weather in the stylist.' : 'Could not get the forecast just now. Try again later.',
          true,
        );
      }
      return false;
    }
  }

  // ---------------------------------------------------------------- calendar

  async importCalendar(file: Blob): Promise<void> {
    try {
      const text = await file.text();
      const today = localDate();
      const { days, events } = calendarDays(text, today, 14);
      if (events === 0) {
        this.status(this.calendarStatus, 'No events in the next two weeks in that file.', true);
        return;
      }
      this.calendar = { imported: today, days };
      saveCalendar(this.calendar);
      this.paintSection();
      this.paint();
      const coming = days
        .filter((d) => d.occasion !== 'work' && d.occasion !== 'weekend')
        .slice(0, 3)
        .map((d) => `${OCCASION_WORDS[d.occasion]} on ${dayLabel(d.date).split(' ').slice(0, 2).join(' ')}`);
      this.status(
        this.calendarStatus,
        `Read ${events} events.${coming.length ? ` Coming up: ${coming.join(', ')}.` : ''} Only the day and kind of event are kept.`,
      );
    } catch {
      this.status(this.calendarStatus, 'That file could not be read as a calendar (.ics).', true);
    }
  }

  forget(): void {
    this.forecast = null;
    this.calendar = null;
    saveForecast(null);
    saveCalendar(null);
    write(CONSENT_KEY, null);
    this.paintSection();
    this.paint();
    this.status(this.calendarStatus, 'Weather and calendar removed from this device.');
  }

  // ---------------------------------------------------------------- start page

  private buildSection(): void {
    const box = sideSection('your-mornings', 2, 'Your mornings', false, 'Get dressed for your real weather and your real calendar.');
    const body = document.createElement('div');
    body.innerHTML = `
      <button type="button" data-weather class="as-btn as-wide" style="margin-top:12px">Use my local weather</button>
      <div data-weather-status aria-live="polite" class="as-status"></div>
      <div class="as-note">Sends your rough location (about 10 km) to Open-Meteo for the forecast. Nothing else.</div>
      <label class="as-btn as-wide">
        Import a calendar (.ics)
        <input type="file" accept=".ics,text/calendar" style="display:none">
      </label>
      <div data-calendar-status aria-live="polite" class="as-status"></div>
      <div class="as-note">Read on this device. Only the day and kind of event (interview, party, trip) are kept.</div>
      <button type="button" data-forget class="as-link" style="margin-top:6px">Forget weather and calendar</button>`;
    box.appendChild(body);
    this.weatherButton = body.querySelector<HTMLButtonElement>('[data-weather]')!;
    this.weatherStatus = body.querySelector<HTMLElement>('[data-weather-status]')!;
    this.calendarStatus = body.querySelector<HTMLElement>('[data-calendar-status]')!;
    this.weatherButton.addEventListener('click', () => void this.useLocalWeather(true));
    const input = body.querySelector<HTMLInputElement>('input[type=file]')!;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.importCalendar(file);
      input.value = '';
    });
    body.querySelector('[data-forget]')!.addEventListener('click', () => this.forget());
    this.paintSection();
  }

  private paintSection(): void {
    const today = localDate();
    const f = this.forecast;
    const t = f?.days.find((d) => d.date === today);
    const tm = f?.days.find((d) => d.date === addDays(today, 1));
    if (this.weatherButton) this.weatherButton.textContent = f ? 'Refresh the forecast' : 'Use my local weather';
    if (t) {
      this.status(this.weatherStatus, `Today ${describeDay(t)}.${tm ? ` Tomorrow ${describeDay(tm)}.` : ''}`);
    } else {
      this.status(this.weatherStatus, '');
    }
    if (this.calendar && this.calendarStatus && !this.calendarStatus.textContent) {
      const n = this.calendar.days.length;
      this.status(this.calendarStatus, `Calendar imported ${this.calendar.imported}: ${n} ${n === 1 ? 'day' : 'days'} with plans.`);
    }
  }

  private status(el: HTMLElement | undefined, text: string, error = false): void {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('as-error', error);
  }
}
