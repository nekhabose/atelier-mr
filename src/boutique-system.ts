/**
 * BoutiqueSystem – "shop against your closet".
 *
 *  - A BOUTIQUE tab above the rail opens three original labels. Their pieces
 *    slide onto the rail, each tagged with how many new outfits it unlocks
 *    with the user's own closet.
 *  - The boutique stylist greets you and names the piece that adds the most.
 *  - Tap a piece: it is tried on the form together with the closet pieces it
 *    pairs best with, and the panel gives a verdict (BUY / MAYBE / SKIP) with
 *    the facts behind it: new outfits, cost per outfit, near-duplicates.
 *    Claude phrases the verdict and may pick the pairing when configured;
 *    the numbers always come from the offline analysis.
 *  - Add to closet keeps it; Next pairing cycles the best combinations;
 *    Back returns to your closet (Undo still has the previous outfit).
 */
import {
  BoxGeometry,
  createSystem,
  Group,
  Mesh,
  MeshStandardMaterial,
  Pressed,
  RayInteractable,
  UIKit,
  UIKitMLAsset,
} from '@iwsdk/core';
import { CHIP, CREAM_TEXT, INK, PAPER, PAPER_LIGHT, SERIF } from './atelier/palette.js';
import { AtelierSystem } from './atelier-system.js';
import { BoutiqueSlot, BoutiqueTab } from './atelier-components.js';
import { ClosetSystem } from './closet-system.js';
import { analyse, bestPick, Boutique, BOUTIQUES, BoutiqueAnalysis, BoutiquePiece } from './atelier/boutique.js';
import { miniMaterial } from './atelier/fabrics.js';
import { buildPieceGroup, GarmentPiece, MINI_DETAIL } from './atelier/garments.js';
import { makeLabel } from './atelier/labels.js';
import { sfx } from './atelier/sfx.js';
import { access } from './atelier/access.js';
import { say } from './atelier/voice.js';
import { postStylist } from './atelier/stylist-client.js';
import { BoutiqueReply, isWearable, VERDICTS } from './atelier/stylist-contract.js';
import { describeItem } from './atelier/stylist-engine.js';
import { createHanger, RACK } from './scene-assets/atelier.scene-asset.js';

const MINI_SCALE = 0.19;
const SLIDE_TIME = 0.55;
const VERDICT_STYLE: Record<string, { bg: string; fg: string; word: string }> = {
  buy: { bg: '#5f8a4f', fg: '#ffffff', word: 'Buy' },
  maybe: { bg: '#c8963e', fg: '#2a231c', word: 'Maybe' },
  skip: { bg: '#8c3b3b', fg: '#ffffff', word: 'Skip' },
};

type El = UIKit.Text | undefined;

interface Hanger {
  group: Group;
  targetX: number;
  delay: number;
}

export class BoutiqueSystem extends createSystem({
  slots: { required: [BoutiqueSlot] },
  slotPressed: { required: [BoutiqueSlot, Pressed] },
  tabPressed: { required: [BoutiqueTab, Pressed] },
}) {
  /** Index of the open boutique, -1 when closed. */
  shop = -1;
  /** The piece being tried on, and its analysis (for scripted checks). */
  selected?: BoutiquePiece;
  analysis?: BoutiqueAnalysis;
  /** Where the current verdict text came from. */
  source: 'claude' | 'offline' = 'offline';
  private pairing = 0;
  private request = 0;
  /** True while this system itself dresses the form. */
  private applying = false;
  private atelier!: AtelierSystem;
  private closet!: ClosetSystem;
  private ui: Record<string, El> = {};
  private tabOn?: Mesh;
  private tabOff?: Mesh;
  private hangers: Hanger[] = [];
  private slideT = SLIDE_TIME * 3;
  private hitGeo = new BoxGeometry(0.14, 0.4, 0.12);
  private hitMaterial = new MeshStandardMaterial({ visible: false });

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.closet = this.world.getSystem(ClosetSystem)!;
    this.buildTab();
    this.wirePanel();
    this.closet.onLeaveBoutique = () => this.close(false);
    // Undo, a rack look or the stylist replaced the try-on: forget it.
    this.cleanupFuncs.push(
      this.atelier.onOutfitChange(() => {
        if (this.applying || !this.selected) return;
        this.selected = undefined;
        this.analysis = undefined;
        this.request++;
        this.atelier.setBadge(null);
        if (this.shop >= 0) this.buildRail(false);
      }),
    );
    this.cleanupFuncs.push(
      this.queries.tabPressed.subscribe('qualify', () => this.open(this.shop >= 0 ? this.shop : 0)),
      this.queries.slotPressed.subscribe('qualify', (e) => {
        this.tryOn(e.getValue(BoutiqueSlot, 'index') ?? 0);
      }),
    );
  }

  // ------------------------------------------------------------------ build

  private buildTab(): void {
    const rack = this.world.requireSceneEntity('clothing-rack');
    const group = new Group();
    group.name = 'rack-tab-boutique';
    const style = { width: 0.28, fontSize: 40, weight: 500, shape: 'card' as const, font: SERIF };
    this.tabOn = makeLabel('Boutique', { ...style, color: CREAM_TEXT, background: INK });
    this.tabOff = makeLabel('Boutique', { ...style, color: INK, background: PAPER });
    const hit = new Mesh(new BoxGeometry(0.28, 0.07, 0.03), this.hitMaterial);
    group.add(this.tabOn, this.tabOff, hit);
    group.position.set(0.31, RACK.barY + 0.2, 0.02);
    const entity = this.world.createTransformEntity(group, { parent: rack });
    entity.addComponent(BoutiqueTab);
    entity.addComponent(RayInteractable);
    this.paintTab();
  }

  private paintTab(): void {
    if (this.tabOn) this.tabOn.visible = this.shop >= 0;
    if (this.tabOff) this.tabOff.visible = this.shop < 0;
  }

  private wirePanel(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('closet-panel');
    if (!panel) return;
    const el = (id: string) => panel.getElementById<UIKit.Text>(id) ?? undefined;
    for (const id of [
      'closet-eyebrow', 'closet-title', 'closet-note', 'verdict-card', 'verdict-badge', 'verdict-word',
      'verdict-stat', 'verdict-sub', 'verdict-reason', 'add-closet-label', 'shop-0', 'shop-1', 'shop-2',
    ]) {
      this.ui[id] = el(id);
    }
    const on = (id: string, fn: () => void) => {
      const node = panel.getElementById(id);
      if (!node) return;
      node.addEventListener('click', fn);
      this.cleanupFuncs.push(() => node.removeEventListener('click', fn));
    };
    BOUTIQUES.forEach((b, i) => {
      this.ui[`shop-${i}`]?.setProperties({ text: b.name });
      on(`shop-${i}`, () => this.open(i));
    });
    on('add-closet-button', () => this.addToCloset());
    on('pairing-button', () => this.nextPairing());
    on('boutique-back', () => this.close(true));
  }

  private clearRail(): void {
    for (const e of [...this.queries.slots.entities]) {
      e.object3D?.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || m.geometry === this.hitGeo) return;
        m.geometry.dispose();
        if (m.name.startsWith('label-')) {
          const mat = m.material as MeshStandardMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
      });
      e.dispose();
    }
    this.hangers = [];
  }

  /** Hang the open boutique's pieces, each tagged with what it adds. */
  private buildRail(animate: boolean): void {
    this.clearRail();
    const b = BOUTIQUES[this.shop];
    if (!b) return;
    const rack = this.world.requireSceneEntity('clothing-rack');
    const spacing = (RACK.width - 0.2) / (RACK.slots - 1);
    const offset = (RACK.slots - b.pieces.length) / 2;
    b.pieces.forEach((bp, i) => {
      const a = analyse(bp, this.closet.items, b.occasion);
      const owned = this.owns(bp);
      const group = new Group();
      group.name = `boutique-${bp.id}`;
      group.add(createHanger());
      const mini = new Group();
      mini.scale.setScalar(MINI_SCALE);
      mini.position.y = -0.064 - 1.432 * MINI_SCALE;
      mini.add(buildPieceGroup(bp.piece, miniMaterial(bp.piece.fabric), MINI_DETAIL));
      group.add(mini);
      const hit = new Mesh(this.hitGeo, this.hitMaterial);
      hit.position.y = -0.2;
      group.add(hit);
      const selected = this.selected?.id === bp.id;
      const name = makeLabel(bp.name, {
        width: 0.17,
        fontSize: 34,
        weight: 500,
        color: selected ? CREAM_TEXT : INK,
        background: selected ? INK : PAPER_LIGHT,
        shape: 'tag',
        font: SERIF,
      });
      name.position.set(0, -0.46, 0.02);
      group.add(name);
      const tagText = owned ? 'In your closet' : a.newOutfits > 0 ? `+${a.newOutfits} outfits, $${bp.price}` : `$${bp.price}`;
      const tag = makeLabel(tagText, {
        width: 0.15,
        fontSize: 26,
        weight: 600,
        color: a.verdict === 'buy' && !owned ? '#ffffff' : INK,
        background: owned ? '#ddd3c2' : a.verdict === 'buy' ? '#5f8a4f' : '#e3c98f',
        pill: true,
      });
      tag.position.set(0, -0.505, 0.022);
      group.add(tag);
      const targetX = -RACK.width / 2 + 0.1 + spacing * (i + offset);
      group.position.set(animate ? targetX + 0.9 : targetX, RACK.barY + 0.03, 0);
      const e = this.world.createTransformEntity(group, { parent: rack });
      e.addComponent(BoutiqueSlot, { index: i });
      e.addComponent(RayInteractable);
      this.hangers.push({ group, targetX, delay: i * 0.08 });
    });
    if (animate) this.slideT = 0;
  }

  private owns(bp: BoutiquePiece): boolean {
    return this.closet.items.some((i) => i.name === bp.name);
  }

  // ------------------------------------------------------------------ flow

  /** Walk into a boutique: the rail fills with its pieces, the stylist greets you. */
  open(index: number): void {
    const b = BOUTIQUES[index];
    if (!b) return;
    const switching = this.shop !== index;
    this.shop = index;
    this.atelier.boutiqueCount++;
    this.selected = undefined;
    this.analysis = undefined;
    this.closet.openBoutique();
    this.paintTab();
    this.buildRail(switching || this.hangers.length === 0);
    if (switching) sfx.sparkle();
    BOUTIQUES.forEach((_, i) => {
      const on = i === index;
      this.ui[`shop-${i}`]?.setProperties({
        backgroundColor: on ? CHIP.on.bg : CHIP.off.bg,
        borderColor: on ? CHIP.on.border : CHIP.off.border,
        color: on ? CHIP.on.text : CHIP.off.text,
      });
    });
    const best = bestPick(b, this.closet.items);
    this.ui['closet-eyebrow']?.setProperties({ text: `Boutique, ${b.name}` });
    this.ui['closet-title']?.setProperties({ text: b.tagline });
    this.ui['closet-note']?.setProperties({
      display: 'flex',
      text:
        `${b.host} ` +
        (best.analysis.newOutfits > 0
          ? `For your closet, start with the ${best.piece.name}: +${best.analysis.newOutfits} outfits.`
          : ''),
    });
    this.ui['verdict-card']?.setProperties({ display: 'none' });
    this.atelier.setHint('Tap a piece on the rail to try it with your own clothes.');
  }

  /** Try a boutique piece on the form with the closet pieces it pairs best with. */
  tryOn(index: number): void {
    const b = BOUTIQUES[this.shop];
    const bp = b?.pieces[index];
    if (!b || !bp) return;
    this.selected = bp;
    this.pairing = 0;
    this.analysis = analyse(bp, this.closet.items, b.occasion);
    this.source = 'offline';
    this.dressPairing(false);
    this.renderVerdict();
    this.buildRail(false);
    void this.askClaude(b, bp, this.analysis);
  }

  /** Put pairing #this.pairing on the form. */
  private dressPairing(quiet: boolean): void {
    const a = this.analysis;
    const bp = this.selected;
    if (!a || !bp) return;
    const ids = a.pairings[this.pairing] ?? ['new'];
    const pieces: GarmentPiece[] = ids
      .map((id) => (id === 'new' ? bp.piece : this.closet.items.find((i) => i.id === id)?.piece))
      .filter((p): p is GarmentPiece => !!p)
      .map((p) => ({ ...p }));
    // A lone top or bottom still gets tried on by itself.
    this.applying = true;
    this.atelier.dress(pieces, bp.name, `${BOUTIQUES[this.shop].name}  |  ${bp.blurb}`, { quiet });
    this.applying = false;
    this.atelier.setBadge('Boutique try-on');
  }

  private renderVerdict(): void {
    const a = this.analysis;
    const bp = this.selected;
    if (!a || !bp) return;
    const v = VERDICT_STYLE[a.verdict];
    const b = BOUTIQUES[this.shop];
    this.ui['closet-eyebrow']?.setProperties({
      text: `${b.name}, ${this.source === 'claude' ? 'live AI' : 'on-device'} stylist`,
    });
    this.ui['closet-title']?.setProperties({ text: `${bp.name}  $${bp.price}` });
    this.ui['closet-note']?.setProperties({ display: 'none' });
    this.ui['verdict-card']?.setProperties({ display: 'flex' });
    this.ui['verdict-badge']?.setProperties({ backgroundColor: v.bg });
    this.ui['verdict-word']?.setProperties({ text: v.word, color: v.fg });
    this.ui['verdict-stat']?.setProperties({
      text: a.newOutfits > 0 ? `+${a.newOutfits} new outfits with your closet` : 'No new outfits yet',
    });
    this.ui['verdict-sub']?.setProperties({
      text:
        a.newOutfits > 0
          ? `About $${a.costPerOutfit} per outfit. Your closet makes ${a.closetOutfits} today.`
          : `Your closet makes ${a.closetOutfits} outfits today.`,
    });
    this.ui['verdict-reason']?.setProperties({ text: a.reason });
    say(`${bp.name}, ${bp.price} dollars. Verdict: ${v.word}. ${a.newOutfits > 0 ? `${a.newOutfits} new outfits with your closet.` : ''} ${a.reason}`);
    const owned = this.owns(bp);
    this.ui['add-closet-label']?.setProperties({ text: owned ? 'In your closet' : 'Add to closet' });
    this.atelier.setHint(
      a.pairings.length > 1
        ? 'Next pairing shows it with other pieces you own. Add to closet if it earns its place.'
        : 'Add to closet if it earns its place, or tap another piece.',
    );
  }

  /** Let Claude phrase the verdict and pick the pairing (numbers stay ours). */
  private async askClaude(b: Boutique, bp: BoutiquePiece, a: BoutiqueAnalysis): Promise<void> {
    const request = ++this.request;
    const items = this.closet.items.map(describeItem);
    const reply = await postStylist<BoutiqueReply>({
      mode: 'boutique',
      occasion: b.occasion,
      candidate: a.candidate,
      price: bp.price,
      newOutfits: a.newOutfits,
      costPerOutfit: a.costPerOutfit,
      duplicate: a.duplicate?.name ?? '',
      items,
    });
    if (!reply || request !== this.request || this.selected !== bp) return;
    if (!(VERDICTS as readonly string[]).includes(reply.verdict) || typeof reply.reason !== 'string') return;
    // Claude may not call a near-duplicate a buy, or praise a piece with no outfits.
    if ((a.duplicate || a.newOutfits === 0) && reply.verdict === 'buy') return;
    a.verdict = reply.verdict;
    a.reason = reply.reason;
    const kindOf = new Map(items.map((i) => [i.id, i.kind as string]));
    kindOf.set('new', a.candidate.kind);
    const ids = Array.isArray(reply.itemIds) ? reply.itemIds : [];
    const valid =
      ids.includes('new') && ids.every((id) => kindOf.has(id)) && isWearable(ids.map((id) => kindOf.get(id)!));
    if (valid && ids.sort().join() !== [...(a.pairings[0] ?? [])].sort().join()) {
      a.pairings = [ids, ...a.pairings.filter((p) => [...p].sort().join() !== [...ids].sort().join())].slice(0, 3);
      this.pairing = 0;
      this.dressPairing(true);
    }
    this.source = 'claude';
    this.renderVerdict();
  }

  nextPairing(): void {
    const a = this.analysis;
    if (!a || a.pairings.length < 2) {
      this.atelier.setHint(a ? 'That is the only way it works with your closet today.' : 'Tap a piece on the rail first.');
      return;
    }
    this.pairing = (this.pairing + 1) % a.pairings.length;
    this.dressPairing(false);
    this.atelier.setHint(`Pairing ${this.pairing + 1} of ${a.pairings.length}.`);
  }

  addToCloset(): void {
    const bp = this.selected;
    if (!bp) {
      this.atelier.setHint('Tap a piece on the rail first.');
      return;
    }
    if (this.owns(bp)) {
      this.atelier.setHint(`The ${bp.name} is already in your closet.`);
      return;
    }
    const item = this.closet.addItem(bp.piece, bp.name);
    if (!item) {
      this.ui['verdict-reason']?.setProperties({
        text: 'Your closet rail is full. Remove a piece in My closet to make room.',
      });
      return;
    }
    sfx.success();
    const b = BOUTIQUES[this.shop];
    const total = analyse(b.pieces[0], this.closet.items, b.occasion).closetOutfits;
    this.ui['verdict-reason']?.setProperties({
      text: `Added to your closet. You can now make ${total} outfits - the stylist will use it too.`,
    });
    this.ui['add-closet-label']?.setProperties({ text: 'In your closet' });
    this.buildRail(false);
  }

  /** Leave the boutique; back to the closet rail when asked by the user. */
  close(toCloset: boolean): void {
    if (this.shop < 0) return;
    this.shop = -1;
    this.selected = undefined;
    this.analysis = undefined;
    this.request++;
    this.clearRail();
    this.paintTab();
    this.atelier.setBadge(null);
    if (toCloset) {
      this.closet.boutiqueOpen = false;
      this.closet.setMode(true);
    }
  }

  update(delta: number): void {
    if (this.slideT >= SLIDE_TIME + 0.5) return;
    // Calm motion: pieces are simply there.
    this.slideT += access.calmMotion ? SLIDE_TIME + 1 : delta;
    for (const h of this.hangers) {
      const t = Math.min(1, Math.max(0, (this.slideT - h.delay) / SLIDE_TIME));
      const ease = 1 - Math.pow(1 - t, 3);
      h.group.position.x = h.targetX + (1 - ease) * 0.9;
    }
  }
}
