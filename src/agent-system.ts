/**
 * AgentSystem – the stylist as a tool-using agent, with its plan in view.
 *
 * "Dress me for today", "Lay out tomorrow" and the voice commands start a
 * run. The agent (Claude through /api/agent; the on-device planner when that
 * is not available) decides which tools to call: check the weather and the
 * calendar, recall your preferences, search your closet, put an outfit on the
 * form, tailor it, finish. Each call is validated (known tool, closet ids that
 * exist, a wearable combination, centimetres in range) and executed here,
 * through the same studio methods your hands and voice use. A paper card
 * beside the form shows every step as it happens and ends with Keep and Undo:
 * Undo puts back exactly what was on the form before the run, and both teach
 * the agent what you like (stored on this device only).
 */
import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { AgentButton } from './atelier-components.js';
import { AtelierSystem, Snapshot } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { MorningSystem } from './morning-system.js';
import { StylistSystem } from './stylist-system.js';
import {
  AGENT_TOOLS,
  AgentGoal,
  AgentReply,
  AgentToolCall,
  AgentToolResult,
  AgentTurn,
  MAX_AGENT_TURNS,
  MAX_RESULT_CHARS,
  MAX_TOOL_CALLS,
  plain,
  TOOL_ID_PATTERN,
  validateCall,
} from './atelier/agent-contract.js';
import { AgentMemory, emptyMemory, loadMemory, outfitTraits, preferenceNotes, remember, saveMemory, Tailoring } from './atelier/agent-memory.js';
import { AgentPiece, planAgentOffline } from './atelier/agent-offline.js';
import { isWearable, StylistItem } from './atelier/stylist-contract.js';
import { describeItem } from './atelier/stylist-engine.js';
import { itemsOnForm } from './atelier/wear.js';
import { localDate } from './atelier/ootd.js';
import { measureText, pieceForParam, TailorParam } from './atelier/garments.js';
import { describeDay } from './atelier/weather.js';
import { postAgent } from './atelier/stylist-client.js';
import { makeLabel } from './atelier/labels.js';
import { CREAM_TEXT, EDGE, INK, INK_SOFT, PAPER, SERIF, THREAD } from './atelier/palette.js';
import { sideSection } from './atelier/side-panel.js';
import { sfx } from './atelier/sfx.js';
import { say } from './atelier/voice.js';

type StepState = 'doing' | 'done' | 'failed';
interface Step {
  label: string;
  detail: string;
  state: StepState;
}
interface Outcome {
  title: string;
  reason: string;
  tip: string;
  itemIds: string[];
}
export interface AgentRunRecord {
  goal: AgentGoal;
  source: 'live' | 'on-device';
  calls: string[];
  steps: string[];
  outcome?: Outcome;
  decision?: 'kept' | 'undone' | 'stopped';
  liveError?: string;
}

const W = 1024;
const H = 1152;
const SANS = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const MAX_ROWS = 6;
/** After the live agent fails, plan on the device for this long before trying it again. */
const LIVE_RETRY_MS = 5 * 60 * 1000;
const MEASURE: Record<'hem' | 'sleeve' | 'neckline', TailorParam> = { hem: 'hem', sleeve: 'sleeve', neckline: 'neck' };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function daysBetween(a: string, b: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86400000);
}

export class AgentSystem extends createSystem({
  pressed: { required: [AgentButton, Pressed] },
  hovered: { required: [AgentButton, Hovered] },
}) {
  state: 'idle' | 'running' | 'deciding' = 'idle';
  /** The last run, for scripted checks. */
  last?: AgentRunRecord;
  memory: AgentMemory = emptyMemory();
  private goal: AgentGoal = 'today';
  private steps: Step[] = [];
  private thinking = false;
  private outcome?: Outcome;
  private record?: AgentRunRecord;
  private before?: Snapshot;
  private generation = 0;
  /** True while the agent itself changes the form. */
  private acting = false;
  private dressed: StylistItem[] = [];
  private dressedIds: string[] = [];
  private tailoring: Tailoring[] = [];
  private onFormAtStart = new Set<string>();
  private liveDownUntil = 0;
  private fast = false;

  private cardEntity?: Entity;
  private card?: Mesh;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private texture?: CanvasTexture;
  private keepButton?: Entity;
  private undoButton?: Entity;
  private head = new Vector3();
  private formPos = new Vector3();
  private spot = new Vector3();
  private notesBox?: HTMLElement;

  private get atelier() {
    return this.world.getSystem(AtelierSystem)!;
  }
  private get closet() {
    return this.world.getSystem(ClosetSystem)!;
  }
  private get morning() {
    return this.world.getSystem(MorningSystem)!;
  }
  private get stylist() {
    return this.world.getSystem(StylistSystem)!;
  }

  init(): void {
    this.memory = loadMemory();
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (e) => {
        if (e.getValue(AgentButton, 'keep')) this.keep();
        else this.undo();
      }),
      this.queries.hovered.subscribe('qualify', (e) => e.object3D?.scale.setScalar(1.08)),
      this.queries.hovered.subscribe('disqualify', (e) => e.object3D?.scale.setScalar(1)),
    );
    // Wait for the studio systems, then follow the outfit.
    queueMicrotask(() => {
      const off = this.world.getSystem(AtelierSystem)?.onOutfitChange(() => {
        if (this.state === 'running' && !this.acting) this.halt('You changed the outfit, so your stylist stopped. Nothing else was changed.');
      });
      if (off) this.cleanupFuncs.push(() => void off());
    });
    const morning = this.world.getSystem(MorningSystem);
    if (morning) morning.runAgent = (goal) => void this.run(goal);
    this.buildSideSection();
  }

  // ---------------------------------------------------------------- the run

  /**
   * Start a run. `live: false` plans on the device only; `fast` skips the
   * pacing between steps (scripted checks).
   */
  async run(goal: AgentGoal, opts: { live?: boolean; fast?: boolean } = {}): Promise<void> {
    if (this.state === 'running') return;
    if (this.state === 'deciding') this.hide();
    const gen = ++this.generation;
    this.goal = goal;
    this.fast = !!opts.fast;
    this.state = 'running';
    this.steps = [];
    this.outcome = undefined;
    this.dressed = [];
    this.dressedIds = [];
    this.tailoring = [];
    this.before = this.atelier.snapshot();
    this.onFormAtStart = new Set(itemsOnForm(this.closet.items, this.atelier.currentPieces));
    const live = opts.live !== false && Date.now() > this.liveDownUntil;
    const record: AgentRunRecord = { goal, source: live ? 'live' : 'on-device', calls: [], steps: [] };
    this.record = record;
    this.last = record;
    this.closet.backToBrowse('Your stylist is working beside the form.');
    this.atelier.setBadge('Your stylist is planning');
    this.show();
    try {
      let result: 'done' | 'failed' | 'cancelled' = 'failed';
      if (live) result = await this.runLive(gen);
      if (result === 'failed' && gen === this.generation) {
        if (live) this.liveDownUntil = Date.now() + LIVE_RETRY_MS;
        if (this.changed()) this.putBack();
        const started = this.steps.length > 0;
        record.source = 'on-device';
        if (started) this.addStep({ label: 'Live AI stopped', detail: 'Finishing the plan on this device', state: 'failed' });
        await this.runOffline(gen);
      }
    } catch (error) {
      console.warn('[atelier] stylist agent', error);
      if (gen === this.generation) {
        if (this.changed()) this.putBack();
        this.halt('Your stylist hit a problem, so nothing was changed.');
      }
    }
  }

  private async runLive(gen: number): Promise<'done' | 'failed' | 'cancelled'> {
    const day = this.morning.day(this.goal);
    const turns: AgentTurn[] = [];
    let calls = 0;
    for (let t = 0; t < MAX_AGENT_TURNS; t++) {
      this.thinking = true;
      this.draw();
      const reply = await postAgent<AgentReply>({ goal: this.goal, date: day.date, mood: this.stylist.mood, turns });
      this.thinking = false;
      if (gen !== this.generation) return 'cancelled';
      if (!reply || !Array.isArray(reply.content)) {
        if (this.record) this.record.liveError = t === 0 ? 'unavailable' : `turn ${t + 1}`;
        return 'failed';
      }
      const uses = reply.content.filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input: unknown } =>
          !!b &&
          typeof b === 'object' &&
          (b as { type?: unknown }).type === 'tool_use' &&
          typeof (b as { id?: unknown }).id === 'string' &&
          TOOL_ID_PATTERN.test((b as { id: string }).id) &&
          (AGENT_TOOLS as readonly unknown[]).includes((b as { name?: unknown }).name),
      );
      if (uses.length === 0) {
        // Ended without finish: present what is on the form, in its words.
        const text = reply.content
          .map((b) => ((b as { type?: string }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
          .join(' ');
        if (this.dressedIds.length === 0) return 'failed';
        this.present({ title: this.atelier.outfitTitle || 'Your look', reason: plain(text, 260), tip: '' });
        return 'done';
      }
      const results: AgentToolResult[] = [];
      for (const use of uses) {
        if (++calls > MAX_TOOL_CALLS) return 'failed';
        const call: AgentToolCall = { id: use.id, name: use.name as AgentToolCall['name'], input: (use.input ?? {}) as Record<string, unknown> };
        if (call.name === 'finish') {
          const v = validateCall('finish', call.input);
          if ('error' in v || v.name !== 'finish' || this.dressedIds.length === 0) return 'failed';
          this.record?.calls.push('finish');
          this.present(v);
          return 'done';
        }
        const r = this.execute(call);
        results.push({ tool_use_id: use.id, content: r.content.slice(0, MAX_RESULT_CHARS), ...(r.error ? { is_error: true } : {}) });
        if (!this.fast) await wait(260);
        if (gen !== this.generation) return 'cancelled';
      }
      turns.push({ assistant: reply.content, results });
    }
    return 'failed';
  }

  private async runOffline(gen: number): Promise<void> {
    const d = this.morning.day(this.goal);
    const calls = planAgentOffline({
      goal: this.goal,
      day: { occasion: d.occasion, cue: d.cue, weather: d.forecast?.weather },
      mood: this.stylist.mood,
      pieces: this.pieces(),
      memory: this.memory,
    });
    for (const call of calls) {
      if (!this.fast) {
        this.thinking = true;
        this.draw();
        await wait(520);
        this.thinking = false;
      }
      if (gen !== this.generation) return;
      if (call.name === 'finish') {
        const v = validateCall('finish', call.input);
        this.record?.calls.push('finish');
        if (!('error' in v) && v.name === 'finish') this.present(v);
        return;
      }
      this.execute(call);
    }
  }

  // ---------------------------------------------------------------- tools

  /** The closet as search_closet reports it. */
  private pieces(): AgentPiece[] {
    const today = localDate();
    return this.closet.items.map((item) => {
      const last = item.worn?.[item.worn.length - 1];
      return {
        ...describeItem(item),
        worn: item.worn?.length ?? 0,
        daysSince: last ? Math.max(0, daysBetween(last, today)) : null,
        onForm: this.onFormAtStart.has(item.id),
      };
    });
  }

  /** Run one validated tool call; returns what the model is told. */
  private execute(call: AgentToolCall): { content: string; error?: boolean } {
    this.record?.calls.push(call.name);
    const v = validateCall(call.name, call.input);
    if ('error' in v) {
      this.addStep({ label: 'Corrected a step', detail: v.error, state: 'failed' });
      return { content: v.error, error: true };
    }
    switch (v.name) {
      case 'check_weather': {
        const f = this.morning.day(v.day).forecast;
        if (!f) {
          this.addStep({ label: 'Checked the weather', detail: 'No forecast on this device', state: 'done' });
          return { content: 'No forecast on this device. Assume a mild day and say so.' };
        }
        const words = describeDay(f);
        this.addStep({ label: 'Checked the weather', detail: words, state: 'done' });
        return { content: `${words}. High ${f.max} C, low ${f.min} C, ${f.rain}% chance of rain. Summary: ${f.weather}.` };
      }
      case 'check_calendar': {
        const d = this.morning.day(v.day);
        const what = d.cue ? `${d.cue} on the calendar` : `nothing on the calendar, so ${d.occasion === 'weekend' ? 'a weekend day' : 'a workday'}`;
        this.addStep({ label: 'Checked your calendar', detail: what[0].toUpperCase() + what.slice(1), state: 'done' });
        return { content: `${d.date}: occasion ${d.occasion}${d.cue ? ` (${d.cue} on the calendar)` : ' (nothing on the calendar)'}.` };
      }
      case 'recall_preferences': {
        const notes = preferenceNotes(this.memory);
        this.addStep({
          label: 'Recalled what you like',
          detail: notes[1] ?? notes[0] ?? 'Nothing yet: this is our first run',
          state: 'done',
        });
        return { content: notes.length ? notes.join(' ') : 'No earlier runs yet.' };
      }
      case 'search_closet': {
        const all = this.pieces();
        const found = v.kinds.length ? all.filter((p) => v.kinds.includes(p.kind)) : all;
        const fresh = found.filter((p) => p.daysSince === null || p.daysSince >= 14).length;
        this.addStep({
          label: 'Searched your closet',
          detail: `${found.length} piece${found.length === 1 ? '' : 's'}${fresh ? `, ${fresh} not worn lately` : ''}`,
          state: 'done',
        });
        if (found.length === 0) return { content: 'No pieces of those kinds in the closet.' };
        const lines = found.map(
          (p) =>
            `${p.id}: ${p.name}; ${p.kind}, ${p.color}, ${p.fabric}, ${p.length}, sleeves ${p.sleeves}; ` +
            `worn ${p.worn}x${p.daysSince === null ? '' : `, last ${p.daysSince}d ago`}${p.onForm ? '; on the form now' : ''}`,
        );
        return { content: `${found.length} pieces:\n${lines.join('\n')}`.slice(0, MAX_RESULT_CHARS) };
      }
      case 'put_on_form': {
        const items = v.itemIds.map((id) => this.closet.items.find((i) => i.id === id));
        if (items.some((i) => !i)) {
          this.addStep({ label: 'Corrected a step', detail: 'A piece that is not in your closet', state: 'failed' });
          return { content: 'Unknown id: use ids from search_closet.', error: true };
        }
        const described = items.map((i) => describeItem(i!));
        if (!isWearable(described.map((i) => i.kind))) {
          this.addStep({ label: 'Corrected a step', detail: 'That combination is not wearable', state: 'failed' });
          return { content: 'Not wearable: one dress, or one top and one bottom, plus at most one jacket.', error: true };
        }
        this.acting = true;
        this.closet.wearOutfit(v.itemIds, v.title, v.note || 'Your stylist chose this.');
        this.acting = false;
        this.dressed = described;
        this.dressedIds = v.itemIds;
        this.tailoring = [];
        sfx.sparkle();
        this.addStep({ label: 'Dressed the form', detail: v.note || described.map((i) => i.name).join(', '), state: 'done' });
        const pieces = this.atelier.currentPieces;
        const { w, h } = this.atelier.bodyScale;
        const facts = (['hem', 'sleeve'] as TailorParam[])
          .map((p) => {
            const piece = pieceForParam(pieces, p);
            return piece ? measureText(piece, p, w, h) : '';
          })
          .filter(Boolean)
          .join('; ');
        return { content: `On the form: ${described.map((i) => i.name).join(', ')}. ${facts}.` };
      }
      case 'tailor': {
        const param = MEASURE[v.measure];
        const pieces = this.atelier.currentPieces;
        const piece = pieceForParam(pieces, param);
        if (this.dressedIds.length === 0 || !piece) {
          this.addStep({ label: 'Corrected a step', detail: 'Nothing to tailor yet', state: 'failed' });
          return { content: 'Put an outfit on the form first.', error: true };
        }
        const { w, h } = this.atelier.bodyScale;
        const before = piece[param];
        const delta = v.cm / 100 / h;
        const target = param === 'hem' ? before - delta : before + delta;
        this.acting = true;
        const set = this.atelier.setMeasure(param, target);
        this.acting = false;
        if (!set || Math.abs(set.value - before) < 1e-4) {
          this.addStep({ label: `Kept the ${v.measure}`, detail: 'It is as far as it goes', state: 'failed' });
          return { content: `The ${v.measure} cannot go further that way.`, error: true };
        }
        const moved = Math.round(Math.abs(set.value - before) * h * 100);
        const way = v.cm > 0 ? (v.measure === 'neckline' ? 'deeper' : 'longer') : v.measure === 'neckline' ? 'higher' : 'shorter';
        this.tailoring.push({ measure: v.measure, cm: v.cm });
        sfx.tick();
        this.addStep({ label: `Tailored the ${v.measure}`, detail: `${moved} cm ${way}${v.note ? `: ${v.note}` : ''}`, state: 'done' });
        const clamped = Math.abs(moved - Math.abs(v.cm)) > 1 ? ' (as far as it goes)' : '';
        return { content: `${measureText(set.piece, param, w, h)}, ${moved} cm ${way}${clamped}.` };
      }
      case 'finish':
        return { content: 'Finished.' };
    }
  }

  // ---------------------------------------------------------------- decide

  private present(v: { title: string; reason: string; tip: string }): void {
    this.state = 'deciding';
    this.thinking = false;
    this.outcome = { title: v.title, reason: v.reason, tip: v.tip, itemIds: [...this.dressedIds] };
    if (this.record) this.record.outcome = this.outcome;
    this.atelier.setBadge(this.goal === 'today' ? 'Your stylist: dressed for today' : 'Your stylist: laid out for tomorrow');
    this.draw();
    this.setButtons(true);
    sfx.success();
    if (this.dressedIds.length > 0) {
      this.atelier.setHint(`${v.title}. Keep it, or Undo puts back what you had.`);
      say(`${v.title}. ${v.reason}`);
    } else {
      this.atelier.setHint(v.reason);
    }
  }

  /** Keep the run's outfit; the agent learns you liked it. */
  keep(): void {
    if (this.state !== 'deciding' || !this.outcome) return;
    const o = this.outcome;
    if (o.itemIds.length > 0) {
      this.memory = remember(this.memory, outfitTraits(this.dressed, this.tailoring), true);
      saveMemory(this.memory);
      if (this.goal === 'tomorrow') this.morning.keepTomorrow(o.itemIds, o.title);
    }
    if (this.record) this.record.decision = 'kept';
    this.finishRun();
    this.closet.backToBrowse(`Kept "${o.title}".`);
    this.atelier.setHint(
      this.goal === 'tomorrow'
        ? 'Tomorrow is laid out. It will be on the form when you open Atelier in the morning.'
        : 'Kept. Tailor it with the pins, or tap Wear today when you put it on.',
    );
    this.paintNotes();
  }

  /** Put back exactly what was on the form before the run. */
  undo(): void {
    if (this.state !== 'deciding') return;
    if (this.outcome && this.outcome.itemIds.length > 0) {
      this.memory = remember(this.memory, outfitTraits(this.dressed, this.tailoring), false);
      saveMemory(this.memory);
    }
    if (this.record) this.record.decision = 'undone';
    if (this.changed()) this.putBack();
    this.finishRun();
    sfx.rewind();
    this.atelier.setHint('Undone: your outfit from before is back. Your stylist will remember.');
    this.paintNotes();
  }

  /** Stop a run without deciding (you changed the outfit, or an error). */
  private halt(note: string): void {
    this.generation++;
    if (this.record) this.record.decision = 'stopped';
    this.finishRun();
    this.atelier.setHint(note);
  }

  private finishRun(): void {
    this.state = 'idle';
    this.thinking = false;
    this.atelier.setBadge(null);
    this.hide();
  }

  /** Did the run change the form? */
  private changed(): boolean {
    return this.dressedIds.length > 0;
  }

  private putBack(): void {
    const b = this.before;
    this.acting = true;
    if (b && b.pieces.length > 0) {
      this.atelier.restore(b, 'Back to what you had before your stylist.');
    } else {
      this.atelier.dress([], 'Choose a look', 'Tap any outfit on the brass rail to dress the form.', { quiet: true });
    }
    this.acting = false;
    this.dressed = [];
    this.dressedIds = [];
    this.tailoring = [];
  }

  // ---------------------------------------------------------------- the card

  private addStep(step: Step): void {
    this.steps.push(step);
    this.record?.steps.push(`${step.label}: ${step.detail}`);
    this.draw();
  }

  private build(): void {
    if (this.card) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const group = new Group();
    group.name = 'agent-plan';
    this.card = new Mesh(new PlaneGeometry(1, H / W), new MeshBasicMaterial({ map: this.texture, transparent: true }));
    this.card.name = 'agent-plan-card';
    this.card.raycast = () => {};
    group.add(this.card);
    group.visible = false;
    this.cardEntity = this.world.createTransformEntity(group);
    const button = (text: string, keep: boolean, x: number) => {
      const g = new Group();
      g.name = keep ? 'agent-keep' : 'agent-undo';
      const style = { width: 0.36, fontSize: 44, weight: 600, shape: 'card' as const, font: SERIF };
      g.add(makeLabel(text, keep ? { ...style, color: CREAM_TEXT, background: INK } : { ...style, color: INK, background: PAPER }));
      g.add(new Mesh(new BoxGeometry(0.36, 0.11, 0.03), new MeshBasicMaterial({ visible: false })));
      g.position.set(x, -H / W / 2 + 0.085, 0.015);
      const e = this.world.createTransformEntity(g, { parent: this.cardEntity });
      e.addComponent(AgentButton, { keep });
      return e;
    };
    this.undoButton = button('Undo', false, -0.22);
    this.keepButton = button('Keep', true, 0.22);
  }

  private show(): void {
    this.build();
    this.place();
    this.setButtons(false);
    const g = this.cardEntity?.object3D;
    if (g) g.visible = true;
    this.draw();
  }

  private hide(): void {
    this.setButtons(false);
    const g = this.cardEntity?.object3D;
    if (g) g.visible = false;
  }

  private setButtons(on: boolean): void {
    const empty = !this.outcome || this.outcome.itemIds.length === 0;
    for (const [e, keep] of [
      [this.keepButton, true],
      [this.undoButton, false],
    ] as const) {
      if (!e) continue;
      const visible = on && !(keep && empty);
      e.object3D!.visible = visible;
      e.object3D!.scale.setScalar(1);
      if (visible && !e.hasComponent(RayInteractable)) e.addComponent(RayInteractable);
      if (!visible && e.hasComponent(RayInteractable)) e.removeComponent(RayInteractable);
    }
  }

  /** Beside the form, on your left, at eye level, facing you (any layout, any field of view). */
  private place(): void {
    const group = this.cardEntity?.object3D;
    const form = this.world.getSceneObject('dress-form');
    if (!group || !form) return;
    this.world.camera.getWorldPosition(this.head);
    form.getWorldPosition(this.formPos);
    const dx = this.formPos.x - this.head.x;
    const dz = this.formPos.z - this.head.z;
    const d = Math.max(0.6, Math.hypot(dx, dz));
    const fx = dx / d;
    const fz = dz / d;
    // In the headset about 17 degrees wide at any distance; larger on the
    // flat page, where the camera stands farther back.
    const flat = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    const width = flat ? 0.8 : Math.min(0.5, Math.max(0.26, 0.3 * d));
    const side = 0.27 + width / 2 + 0.04;
    this.spot.set(this.formPos.x + fz * side, this.head.y - 0.06, this.formPos.z - fx * side);
    // Then a fifth of the way toward you, shrunk to look the same size, so the
    // rail and board (which stand nearer than the form) never cover it.
    const k = 0.78;
    this.spot.x = this.head.x + (this.spot.x - this.head.x) * k;
    this.spot.z = this.head.z + (this.spot.z - this.head.z) * k;
    group.scale.setScalar(width * k);
    if (group.parent) {
      group.parent.updateMatrixWorld();
      group.parent.worldToLocal(this.spot);
    }
    group.position.copy(this.spot);
    group.updateMatrixWorld();
    group.lookAt(this.head.x, group.getWorldPosition(this.spot).y, this.head.z);
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || !this.texture) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.roundRect(8, 8, W - 16, H - 16, 30);
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = THREAD;
    ctx.fillRect(56, 52, 120, 6);
    ctx.fillStyle = INK;
    ctx.font = `600 58px ${SERIF}`;
    ctx.fillText('Your stylist', 56, 130);
    ctx.fillStyle = INK_SOFT;
    ctx.font = `500 30px ${SANS}`;
    const source = this.record?.source === 'live' ? 'Live AI agent' : 'On-device agent';
    ctx.fillText(`${source}, dressing you for ${this.goal}`, 56, 176);

    const rows: Step[] = [...this.steps];
    if (this.thinking) rows.push({ label: 'Thinking', detail: this.steps.length ? 'Deciding the next step' : 'Reading your day', state: 'doing' });
    const shown = rows.slice(-MAX_ROWS);
    shown.forEach((s, i) => {
      const y = 246 + i * 94;
      this.marker(76, y - 12, s.state);
      ctx.fillStyle = INK;
      ctx.font = `600 36px ${SANS}`;
      ctx.fillText(this.fit(s.label, 860), 112, y);
      ctx.fillStyle = INK_SOFT;
      ctx.font = `400 30px ${SANS}`;
      ctx.fillText(this.fit(s.detail, 860), 112, y + 40);
    });

    const o = this.state === 'deciding' ? this.outcome : undefined;
    if (o) {
      ctx.fillStyle = EDGE;
      ctx.fillRect(56, 818, W - 112, 3);
      ctx.fillStyle = INK;
      ctx.font = `600 46px ${SERIF}`;
      ctx.fillText(this.fit(o.title, W - 112), 56, 876);
      ctx.fillStyle = INK_SOFT;
      ctx.font = `400 30px ${SANS}`;
      this.wrap(o.reason, W - 112, 3).forEach((line, i) => ctx.fillText(line, 56, 922 + i * 38));
    }
    this.texture.needsUpdate = true;
  }

  private marker(x: number, y: number, state: StepState): void {
    const ctx = this.ctx!;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    if (state === 'done') {
      ctx.fillStyle = THREAD;
      ctx.fill();
      ctx.strokeStyle = PAPER;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x - 2, y + 7);
      ctx.lineTo(x + 9, y - 7);
      ctx.stroke();
    } else if (state === 'failed') {
      ctx.strokeStyle = INK_SOFT;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = THREAD;
      ctx.stroke();
      ctx.fillStyle = THREAD;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** One line, shortened with an ellipsis to fit. */
  private fit(text: string, max: number): string {
    const ctx = this.ctx!;
    if (ctx.measureText(text).width <= max) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(`${s}...`).width > max) s = s.slice(0, -1);
    return `${s.trimEnd()}...`;
  }

  private wrap(text: string, max: number, lines: number): string[] {
    const ctx = this.ctx!;
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= max) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    if (out.length > lines) {
      out.length = lines;
      out[lines - 1] = this.fit(`${out[lines - 1]} ...`, max);
    }
    return out;
  }

  // ---------------------------------------------------------------- start page

  /** What the agent learned, with a way to forget it. */
  private buildSideSection(): void {
    const box = sideSection('stylist-memory', 5, 'What your stylist remembers', false, 'Learned only from Keep and Undo, kept on this device.');
    const notes = document.createElement('div');
    notes.className = 'as-note';
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'as-btn as-wide';
    forget.textContent = 'Forget what it learned';
    forget.addEventListener('click', () => {
      this.memory = emptyMemory();
      saveMemory(this.memory);
      this.paintNotes();
    });
    box.append(notes, forget);
    this.notesBox = notes;
    this.paintNotes();
  }

  private paintNotes(): void {
    if (!this.notesBox) return;
    const notes = preferenceNotes(this.memory);
    this.notesBox.textContent = notes.length ? notes.join(' ') : 'Nothing yet. Keep or undo a plan and it learns what you like.';
  }
}
