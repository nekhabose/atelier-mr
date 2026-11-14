/**
 * ClosetSystem – the Digital Closet.
 *
 *  - Two tabs above the brass rail switch it between DESIGNER LOOKS and
 *    MY CLOSET. In closet mode the rail shows the user's own pieces plus a
 *    "+ NEW PIECE" hanger.
 *  - Tapping a closet piece mixes it into the outfit on the form (a top
 *    replaces a top or dress, trousers replace a skirt, and so on).
 *  - New piece / Edit opens the builder on the closet panel: pick a garment
 *    template, colour and fabric; the draft is worn live on the form and the
 *    tailoring pins shape it. Save stores it in the closet (localStorage).
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
import { sfx } from './atelier/sfx.js';
import { ClosetSlot, RackLook, RackTab } from './atelier-components.js';
import {
  CLOSET_CAPACITY,
  ClosetItem,
  loadCloset,
  mixIn,
  newClosetItem,
  pieceName,
  saveCloset,
  TEMPLATES,
  templatePiece,
} from './atelier/closet.js';
import {
  CLOSET_COLORS,
  CLOSET_MATERIALS,
  ClosetColor,
  closetFabricId,
  ClosetMaterial,
  miniMaterial,
  parseClosetFabric,
} from './atelier/fabrics.js';
import { buildPieceGroup, GarmentPiece, MINI_DETAIL, PieceKind } from './atelier/garments.js';
import { makeLabel } from './atelier/labels.js';
import { itemsOnForm, leastWorn, PRICES, recordWear, wearLine } from './atelier/wear.js';
import { localDate } from './atelier/ootd.js';
import { createHanger, RACK } from './scene-assets/atelier.scene-asset.js';

const MINI_SCALE = 0.19;

interface Design {
  draft: GarmentPiece;
  /** What the piece cost (for cost per wear). */
  price?: number;
  editingId?: string;
  stash: GarmentPiece[];
  stashName: string;
}

type El = UIKit.Text | undefined;

export class ClosetSystem extends createSystem({
  slots: { required: [ClosetSlot] },
  slotPressed: { required: [ClosetSlot, Pressed] },
  tabs: { required: [RackTab] },
  tabPressed: { required: [RackTab, Pressed] },
  lookPressed: { required: [RackLook, Pressed] },
}) {
  items: ClosetItem[] = [];
  closetMode = false;
  /** The boutique has the rail (BoutiqueSystem owns its hangers). */
  boutiqueOpen = false;
  /** Called when a rack tab takes the rail back from the boutique. */
  onLeaveBoutique?: () => void;
  selectedId?: string;
  design?: Design;
  private atelier!: AtelierSystem;
  private ui: Record<string, El> = {};
  private chips: Record<string, El> = {};
  private hitMaterial = new MeshStandardMaterial({ visible: false });
  private hitGeo = new BoxGeometry(0.14, 0.4, 0.12);

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.items = loadCloset();
    this.buildTabs();
    this.wirePanel();

    this.cleanupFuncs.push(
      this.queries.tabPressed.subscribe('qualify', (e) => {
        this.setMode(e.getValue(RackTab, 'closet') === true);
      }),
      this.queries.slotPressed.subscribe('qualify', (e) => {
        const slot = e.getValue(ClosetSlot, 'slot') ?? 0;
        if (slot < 0) this.startDesign();
        else this.wearItem(slot);
      }),
      // Tapping a designer look abandons an open draft.
      this.queries.lookPressed.subscribe('qualify', () => {
        if (this.design) this.endDesign();
      }),
    );
    this.showBrowse();
  }

  // ------------------------------------------------------------------ rail

  private buildTabs(): void {
    const rack = this.world.requireSceneEntity('clothing-rack');
    const make = (text: string, closet: boolean, x: number) => {
      const group = new Group();
      group.name = `rack-tab-${closet ? 'closet' : 'designer'}`;
      const on = makeLabel(text, {
        width: 0.28,
        fontSize: 40,
        weight: 500,
        color: CREAM_TEXT,
        background: INK,
        shape: 'card',
        font: SERIF,
      });
      on.name = 'on';
      const off = makeLabel(text, {
        width: 0.28,
        fontSize: 40,
        weight: 500,
        color: INK,
        background: PAPER,
        shape: 'card',
        font: SERIF,
      });
      off.name = 'off';
      const hit = new Mesh(new BoxGeometry(0.28, 0.07, 0.03), this.hitMaterial);
      group.add(on, off, hit);
      group.position.set(x, RACK.barY + 0.2, 0.02);
      const entity = this.world.createTransformEntity(group, { parent: rack });
      entity.addComponent(RackTab, { closet });
      entity.addComponent(RayInteractable);
    };
    make('Designer looks', false, -0.31);
    make('My closet', true, 0);
    this.paintTabs();
  }

  private paintTabs(): void {
    for (const e of this.queries.tabs.entities) {
      const active = !this.boutiqueOpen && (e.getValue(RackTab, 'closet') === true) === this.closetMode;
      const g = e.object3D!;
      g.getObjectByName('on')!.visible = active;
      g.getObjectByName('off')!.visible = !active;
    }
  }

  /** Switch the rail between designer looks and the closet. */
  setMode(closet: boolean): void {
    if (this.boutiqueOpen) {
      this.boutiqueOpen = false;
      this.onLeaveBoutique?.();
    }
    this.closetMode = closet;
    this.atelier.setDesignerRackVisible(!closet);
    this.paintTabs();
    this.rebuildRail();
    if (!this.design) this.showBrowse();
  }

  private clearRail(): void {
    for (const e of [...this.queries.slots.entities]) {
      e.object3D?.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || m.geometry === this.hitGeo) return;
        m.geometry.dispose();
        // Labels own their canvas texture + material; fabrics/hangers are shared.
        if (m.name.startsWith('label-')) {
          const mat = m.material as MeshStandardMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
      });
      e.dispose();
    }
  }

  private rebuildRail(): void {
    this.clearRail();
    if (!this.closetMode) return;
    const rack = this.world.requireSceneEntity('clothing-rack');
    const spacing = (RACK.width - 0.2) / (RACK.slots - 1);
    const slotX = (i: number) => -RACK.width / 2 + 0.1 + spacing * i;
    const count = Math.min(this.items.length, CLOSET_CAPACITY);
    for (let i = 0; i < count; i++) {
      const item = this.items[i];
      const selected = item.id === this.selectedId;
      const group = new Group();
      group.name = `closet-item-${i}`;
      group.add(createHanger());
      const mini = new Group();
      mini.scale.setScalar(MINI_SCALE);
      mini.position.y = -0.064 - 1.432 * MINI_SCALE;
      mini.add(buildPieceGroup(item.piece, miniMaterial(item.piece.fabric), MINI_DETAIL));
      group.add(mini);
      const hit = new Mesh(this.hitGeo, this.hitMaterial);
      hit.position.y = -0.2;
      group.add(hit);
      const label = makeLabel(item.name, {
        width: 0.17,
        fontSize: 36,
        weight: 500,
        color: selected ? CREAM_TEXT : INK,
        background: selected ? INK : PAPER_LIGHT,
        shape: 'tag',
        font: SERIF,
      });
      label.position.set(0, -0.46, 0.02);
      group.add(label);
      group.position.set(slotX(i), RACK.barY + 0.03, 0);
      const e = this.world.createTransformEntity(group, { parent: rack });
      e.addComponent(ClosetSlot, { slot: i });
      e.addComponent(RayInteractable);
    }
    // "+ NEW PIECE" hanger in the next free slot.
    if (count < CLOSET_CAPACITY + 1) {
      const group = new Group();
      group.name = 'closet-new';
      group.add(createHanger());
      const plus = makeLabel('+', {
        width: 0.12,
        fontSize: 80,
        weight: 400,
        color: INK,
        background: PAPER_LIGHT,
        pill: true,
      });
      plus.position.y = -0.2;
      group.add(plus);
      const label = makeLabel('New piece', {
        width: 0.17,
        fontSize: 36,
        weight: 500,
        color: INK,
        background: PAPER_LIGHT,
        shape: 'tag',
        font: SERIF,
      });
      label.position.set(0, -0.46, 0.02);
      group.add(label);
      const hit = new Mesh(this.hitGeo, this.hitMaterial);
      hit.position.y = -0.2;
      group.add(hit);
      group.position.set(slotX(count), RACK.barY + 0.03, 0);
      const e = this.world.createTransformEntity(group, { parent: rack });
      e.addComponent(ClosetSlot, { slot: -1 });
      e.addComponent(RayInteractable);
    }
    this.atelier.refreshOcclusion();
  }

  // ------------------------------------------------------------------ wearing

  /** Mix a closet piece into whatever is on the form. */
  wearItem(index: number): void {
    const item = this.items[index];
    if (!item) return;
    if (this.design) this.endDesign();
    this.selectedId = item.id;
    const outfit = mixIn(this.atelier.currentPieces, item.piece);
    const name = outfit.length === 1 ? item.name : 'Your mix';
    this.atelier.dress(outfit, name, outfit.map(pieceName).join(' + '));
    this.atelier.setHint('Add more from your closet, or tailor it with the pins.');
    this.rebuildRail();
    this.showBrowse();
  }

  // ------------------------------------------------------------------ builder

  /** Open the builder for a new piece, or for an existing closet item. */
  startDesign(item?: ClosetItem): void {
    if (this.design) return;
    if (!item && this.items.length >= CLOSET_CAPACITY) {
      this.setNote('Your rail is full. Remove a piece to make room.');
      return;
    }
    const draft = item
      ? { ...item.piece }
      : templatePiece('top', closetFabricId('cotton', 'white'));
    this.atelier.draftOpen = true;
    this.design = {
      draft,
      price: item?.price,
      editingId: item?.id,
      stash: this.atelier.currentPieces.map((p) => ({ ...p })),
      stashName: this.atelier.outfitTitle,
    };
    if (!this.closetMode) this.setMode(true);
    this.atelier.dress([draft], pieceName(draft), 'Pick a garment, colour and fabric on the closet panel.');
    this.atelier.setHint('Pull the pins to match the length and fit of the piece you own.');
    this.showDesign();
  }

  private setTemplate(kind: PieceKind): void {
    const d = this.design;
    if (!d) return;
    const fresh = templatePiece(kind, d.draft.fabric);
    Object.assign(d.draft, fresh);
    if (!fresh.strapless) delete d.draft.strapless;
    this.atelier.refreshAll();
    this.afterDraftChange();
  }

  private setFabric(material?: ClosetMaterial, color?: ClosetColor): void {
    const d = this.design;
    if (!d) return;
    const current = parseClosetFabric(d.draft.fabric);
    d.draft.fabric = closetFabricId(
      material ?? current?.material ?? 'cotton',
      color ?? current?.color ?? 'white',
    );
    this.atelier.refreshPiece(0);
    this.afterDraftChange();
  }

  private afterDraftChange(): void {
    const d = this.design;
    if (!d) return;
    const name = pieceName(d.draft);
    this.atelier.setPanel(name, 'Your draft - tailor it with the pins, then save.');
    this.ui.title?.setProperties({ text: name });
    this.paintChips();
  }

  private save(): void {
    const d = this.design;
    if (!d) return;
    const name = pieceName(d.draft);
    let item = d.editingId ? this.items.find((i) => i.id === d.editingId) : undefined;
    if (item) {
      item.piece = { ...d.draft };
      item.name = name;
      if (d.price) item.price = d.price;
    } else {
      item = newClosetItem(d.draft, d.price);
      this.items.push(item);
    }
    saveCloset(this.items);
    sfx.success();
    this.selectedId = item.id;
    this.design = undefined;
    this.atelier.draftOpen = false;
    this.atelier.setPanel(name, 'Saved to your closet. Mix it with anything on the rail.');
    this.rebuildRail();
    this.showBrowse(`Saved "${name}". ${this.items.length} pieces in your closet.`);
  }

  private cancel(): void {
    const d = this.design;
    if (!d) return;
    this.design = undefined;
    this.atelier.draftOpen = false;
    if (d.stash.length > 0) {
      this.atelier.dress(d.stash, d.stashName || 'Your mix', 'Back to what you were wearing.', {
        quiet: true,
      });
    } else {
      this.atelier.dress([], 'Choose a look', 'Tap any outfit on the brass rail to dress the form.', {
        quiet: true,
      });
    }
    this.showBrowse('Draft discarded.');
  }

  /** Close the builder without restoring (the user moved on). */
  private endDesign(): void {
    this.design = undefined;
    this.atelier.draftOpen = false;
    this.showBrowse();
  }

  private editSelected(): void {
    const item = this.items.find((i) => i.id === this.selectedId);
    if (!item) {
      this.setNote('Tap one of your pieces on the rail first, then Edit.');
      if (!this.closetMode) this.setMode(true);
      return;
    }
    this.startDesign(item);
  }

  private removeSelected(): void {
    const idx = this.items.findIndex((i) => i.id === this.selectedId);
    if (idx < 0) {
      this.setNote('Tap one of your pieces on the rail first, then Remove.');
      if (!this.closetMode) this.setMode(true);
      return;
    }
    const [removed] = this.items.splice(idx, 1);
    saveCloset(this.items);
    this.selectedId = undefined;
    this.rebuildRail();
    this.showBrowse(`Removed "${removed.name}".`);
  }

  // ------------------------------------------------------------------ panel

  private wirePanel(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('closet-panel');
    if (!panel) return;
    const el = (id: string) => panel.getElementById<UIKit.Text>(id) ?? undefined;
    this.ui = {
      eyebrow: el('closet-eyebrow'),
      title: el('closet-title'),
      note: el('closet-note'),
      design: el('design-section'),
      browse: el('browse-actions'),
      designActions: el('design-actions'),
      browse2: el('browse-actions-2'),
      streak: el('streak-row'),
      stylist: el('stylist-section'),
      stylistActions: el('stylist-actions'),
      proposalActions: el('proposal-actions'),
      lookbook: el('lookbook-section'),
      boutique: el('boutique-section'),
      boutiqueActions: el('boutique-actions'),
      week: el('week-section'),
      weekActions: el('week-actions'),
    };
    const on = (id: string, fn: () => void) => {
      const node = panel.getElementById(id);
      if (!node) return;
      node.addEventListener('click', fn);
      this.cleanupFuncs.push(() => node.removeEventListener('click', fn));
    };
    on('new-button', () => this.startDesign());
    on('edit-button', () => this.editSelected());
    on('remove-button', () => this.removeSelected());
    on('save-button', () => this.save());
    on('cancel-button', () => this.cancel());
    for (const t of TEMPLATES) {
      this.chips[`tpl-${t.kind}`] = el(`tpl-${t.kind}`);
      on(`tpl-${t.kind}`, () => this.setTemplate(t.kind));
    }
    for (const c of CLOSET_COLORS) {
      this.chips[`col-${c.key}`] = el(`col-${c.key}`);
      on(`col-${c.key}`, () => this.setFabric(undefined, c.key));
    }
    for (const m of CLOSET_MATERIALS) {
      this.chips[`mat-${m.key}`] = el(`mat-${m.key}`);
      on(`mat-${m.key}`, () => this.setFabric(m.key, undefined));
    }
    for (const p of PRICES) {
      this.chips[`price-${p}`] = el(`price-${p}`);
      on(`price-${p}`, () => {
        if (!this.design) return;
        this.design.price = p;
        this.paintChips();
      });
    }
    this.ui.morning = el('morning-section');
    this.ui.wear = el('wear-row');
    this.ui.wearText = el('wear-text');
  }

  private setNote(text: string): void {
    this.ui.note?.setProperties({ text });
  }

  private showBrowse(note?: string): void {
    this.atelier.stylistOpen = false;
    const selected = this.items.find((i) => i.id === this.selectedId);
    this.ui.eyebrow?.setProperties({ text: 'My closet' });
    this.ui.title?.setProperties({
      text: selected ? selected.name : `${this.items.length} pieces`,
    });
    this.setNote(
      note ??
        (selected
          ? wearLine(selected, localDate())
          : this.closetMode
            ? 'Tap a piece on the rail to wear it. Mix tops, bottoms and jackets.'
            : 'Recreate clothes you own. Tap My closet above the rail to see them.'),
    );
    this.panelSections('browse');
    this.paintWearRow();
  }

  /** The piece worn least recently, for "Style it". */
  leastWornItem(): ClosetItem | undefined {
    const wearing = itemsOnForm(this.items, this.atelier.currentPieces);
    return leastWorn(this.items, localDate(), wearing) as ClosetItem | undefined;
  }

  private paintWearRow(): void {
    const item = this.leastWornItem();
    this.ui.wear?.setProperties({ display: item ? 'flex' : 'none' });
    if (!item) return;
    this.ui.wearText?.setProperties({ text: `Least worn: ${item.name}. ${wearLine(item, localDate())}` });
  }

  /**
   * Log a wear for every closet piece on the form (Wear today). Returns how
   * many pieces were logged.
   */
  recordWear(pieces: GarmentPiece[]): number {
    const today = localDate();
    let n = 0;
    for (const id of itemsOnForm(this.items, pieces)) {
      const item = this.items.find((i) => i.id === id);
      if (item && recordWear(item, today)) n++;
    }
    if (n > 0) saveCloset(this.items);
    this.paintWearRow();
    return n;
  }

  /** Show exactly one of the panel's three states. */
  panelSections(state: 'browse' | 'design' | 'stylist' | 'boutique' | 'week'): void {
    const show = (el: El, on: boolean) => el?.setProperties({ display: on ? 'flex' : 'none' });
    show(this.ui.browse, state === 'browse');
    show(this.ui.browse2, state === 'browse');
    show(this.ui.streak, state === 'browse');
    show(this.ui.lookbook, state === 'browse');
    show(this.ui.morning, state === 'browse');
    show(this.ui.wear, state === 'browse');
    show(this.ui.boutique, state === 'boutique');
    show(this.ui.boutiqueActions, state === 'boutique');
    show(this.ui.proposalActions, false);
    show(this.ui.note, true);
    show(this.ui.design, state === 'design');
    show(this.ui.designActions, state === 'design');
    show(this.ui.stylist, state === 'stylist');
    show(this.ui.stylistActions, state === 'stylist');
    show(this.ui.week, state === 'week');
    show(this.ui.weekActions, state === 'week');
  }

  /** Switch the panel to the stylist (StylistSystem owns its content). */
  openStylistView(): void {
    if (this.design) this.endDesign();
    if (!this.closetMode) this.setMode(true);
    this.panelSections('stylist');
  }

  /** Return the panel to the closet overview. */
  backToBrowse(note?: string): void {
    this.showBrowse(note);
  }

  /** Dress the form in several closet items at once (used by the stylist). */
  wearOutfit(itemIds: string[], name: string, note: string): boolean {
    const pieces = itemIds
      .map((id) => this.items.find((i) => i.id === id))
      .filter((i): i is ClosetItem => !!i)
      .map((i) => ({ ...i.piece }));
    if (pieces.length === 0) return false;
    if (this.design) this.endDesign();
    this.selectedId = undefined;
    this.atelier.dress(pieces, name, note);
    this.rebuildRail();
    return true;
  }

  /** Hand the rail and panel to the boutique. */
  openBoutique(): void {
    if (this.design) this.endDesign();
    this.boutiqueOpen = true;
    this.closetMode = false;
    this.atelier.setDesignerRackVisible(false);
    this.clearRail();
    this.paintTabs();
    this.panelSections('boutique');
  }

  /** Add a piece to the closet (from the boutique). Null when the rail is full. */
  addItem(piece: GarmentPiece, name: string, price?: number): ClosetItem | null {
    if (this.items.length >= CLOSET_CAPACITY) return null;
    const item = newClosetItem({ ...piece }, price);
    item.name = name;
    this.items.push(item);
    saveCloset(this.items);
    return item;
  }

  /** Dress the form in explicit pieces (stylist refinements). */
  wearPieces(pieces: GarmentPiece[], name: string, note: string): void {
    if (this.design) this.endDesign();
    this.selectedId = undefined;
    this.atelier.dress(pieces, name, note);
    this.rebuildRail();
  }

  private showDesign(): void {
    const d = this.design;
    if (!d) return;
    this.ui.eyebrow?.setProperties({ text: d.editingId ? 'My closet, editing' : 'My closet, new piece' });
    this.ui.title?.setProperties({ text: pieceName(d.draft) });
    this.setNote('Garment, colour, fabric and what it cost - then pull the pins to match yours.');
    this.panelSections('design');
    this.paintChips();
  }

  private paintChips(): void {
    const d = this.design;
    if (!d) return;
    const fabric = parseClosetFabric(d.draft.fabric);
    for (const t of TEMPLATES) {
      this.chip(`tpl-${t.kind}`, d.draft.kind === t.kind);
    }
    for (const m of CLOSET_MATERIALS) {
      this.chip(`mat-${m.key}`, fabric?.material === m.key);
    }
    for (const p of PRICES) this.chip(`price-${p}`, d.price === p);
    for (const c of CLOSET_COLORS) {
      const el = this.chips[`col-${c.key}`];
      const on = fabric?.color === c.key;
      el?.setProperties({ borderColor: on ? CHIP.on.border : CHIP.off.border, borderWidth: on ? 4 : 3 });
    }
  }

  private chip(id: string, on: boolean): void {
    const c = on ? CHIP.on : CHIP.off;
    this.chips[id]?.setProperties({ backgroundColor: c.bg, borderColor: c.border, color: c.text });
  }
}
