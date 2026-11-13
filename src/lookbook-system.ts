/**
 * LookbookSystem – save the outfit on the form (tailoring and fabrics
 * included) and put it back on later, from the closet panel.
 *
 *  - "Save look" stores the current outfit under its name.
 *  - Each saved look is a chip under LOOKBOOK; tapping it dresses the form
 *    (undoable). Tapping the chip of the look already on the form removes it.
 */
import { createSystem, UIKit, UIKitMLAsset } from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { sfx } from './atelier/sfx.js';
import { localDate } from './atelier/ootd.js';
import { LOOKBOOK_CAPACITY, loadLookbook, removeLook, SavedLook, saveLook } from './atelier/lookbook.js';

type El = UIKit.Text | undefined;

const shorten = (s: string) => (s.length > 16 ? `${s.slice(0, 15).trimEnd()}.` : s);

export class LookbookSystem extends createSystem({}) {
  looks: SavedLook[] = [];
  private atelier!: AtelierSystem;
  private chips: El[] = [];
  private empty: El;
  private note: El;
  /** The look most recently put on from the lookbook (a second tap removes it). */
  private wornId?: string;

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.looks = loadLookbook();
    const panel = this.world.getSceneObject<UIKitMLAsset>('closet-panel');
    if (!panel) return;
    const el = (id: string) => panel.getElementById<UIKit.Text>(id) ?? undefined;
    this.empty = el('lookbook-empty');
    this.note = el('closet-note');
    for (let i = 0; i < LOOKBOOK_CAPACITY; i++) {
      this.chips.push(el(`lb-${i}`));
      const node = panel.getElementById(`lb-${i}`);
      if (!node) continue;
      const fn = () => this.tap(i);
      node.addEventListener('click', fn);
      this.cleanupFuncs.push(() => node.removeEventListener('click', fn));
    }
    const save = panel.getElementById('save-look-button');
    if (save) {
      const fn = () => this.saveCurrent();
      save.addEventListener('click', fn);
      this.cleanupFuncs.push(() => save.removeEventListener('click', fn));
    }
    this.render();
  }

  /** Save what is on the form. Returns false when the form is bare. */
  saveCurrent(name = this.atelier.outfitTitle): boolean {
    const pieces = this.atelier.currentPieces;
    if (pieces.length === 0 || this.atelier.draftOpen) {
      this.say(
        this.atelier.draftOpen
          ? 'Save or cancel the closet piece first.'
          : 'Dress the form first - a look, your closet, or the stylist.',
      );
      return false;
    }
    const full = this.looks.length >= LOOKBOOK_CAPACITY && !this.looks.some((l) => l.name === name);
    this.looks = saveLook(this.looks, name, pieces, localDate());
    this.wornId = this.looks[0].id;
    this.render();
    sfx.success();
    this.say(
      `Saved "${this.looks[0].name}" to your lookbook.` +
        (full ? ' Your oldest look made room for it.' : ' Tap it any day to wear it again.'),
    );
    this.atelier.setHint('Saved with every pin and fabric. Find it under LOOKBOOK.');
    return true;
  }

  private tap(index: number): void {
    const look = this.looks[index];
    if (!look) return;
    if (this.wornId === look.id && this.atelier.outfitTitle === look.name) {
      this.looks = removeLook(this.looks, look.id);
      this.wornId = undefined;
      this.render();
      this.say(`Removed "${look.name}" from the lookbook. Undo still has the outfit.`);
      return;
    }
    this.wornId = look.id;
    this.render();
    this.atelier.dress(
      look.pieces.map((p) => ({ ...p })),
      look.name,
      `From your lookbook, saved ${look.date}.`,
    );
    this.say(`Wearing "${look.name}". Tap the gold chip again to remove it from the lookbook.`);
  }

  private say(text: string): void {
    this.note?.setProperties({ text });
  }

  render(): void {
    this.empty?.setProperties({ display: this.looks.length === 0 ? 'flex' : 'none' });
    this.chips.forEach((chip, i) => {
      const look = this.looks[i];
      if (!look) {
        chip?.setProperties({ display: 'none' });
        return;
      }
      // The look on the form is gold, so "tap again to remove" has a visible target.
      const worn = look.id === this.wornId;
      chip?.setProperties({
        display: 'flex',
        text: worn ? `${shorten(look.name)}  x` : shorten(look.name),
        backgroundColor: worn ? '#e2c27d' : '#2c2e33',
        borderColor: worn ? '#e2c27d' : '#4a4d55',
        color: worn ? '#2b2118' : '#f1ede4',
      });
    });
  }
}
