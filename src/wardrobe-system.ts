/**
 * WardrobeSystem – your real clothes, and tailoring in your own words.
 *
 * Photo to closet (start page): photograph one garment; the live AI stylist
 * names its type, colour, fabric, length and sleeves, and it joins your
 * closet rail, cut to match, and goes on the form. The photo is sent to the
 * stylist to be read and is not stored. Without the live AI, the colour is
 * read on the device and you get a top in that colour to adjust.
 *
 * Tell the tailor (start page box, or any spoken phrase the voice commands
 * do not know): "make the dress midi with long sleeves", "red satin skirt".
 * Clear requests are read on the device and applied instantly; anything else
 * goes to the live AI tailor. Every change is one undo step.
 */
import { createSystem } from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { applyRefine, describeOutfit } from './atelier/refine.js';
import { planTailorOffline } from './atelier/tailor.js';
import { postStylist } from './atelier/stylist-client.js';
import { templatePiece } from './atelier/closet.js';
import { CLOSET_COLORS, closetFabricId, ClosetColor, ClosetMaterial } from './atelier/fabrics.js';
import { GarmentReply, KEEP, MAX_INSTRUCTION, RefineReply } from './atelier/stylist-contract.js';
import { sfx } from './atelier/sfx.js';

const PHOTO_PX = 768;
const PHOTO_TIMEOUT_MS = 25_000;
const TAILOR_TIMEOUT_MS = 12_000;

export type TailorSource = 'on-device' | 'live-ai' | 'none';

/** Average colour of the photo's centre, matched to the closet palette. */
function nearestColor(ctx: CanvasRenderingContext2D, w: number, h: number): ClosetColor {
  const { data } = ctx.getImageData(Math.round(w * 0.3), Math.round(h * 0.3), Math.round(w * 0.4), Math.round(h * 0.4));
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  r /= n;
  g /= n;
  b /= n;
  let best: ClosetColor = 'white';
  let bestD = Infinity;
  for (const c of CLOSET_COLORS) {
    const v = parseInt(c.hex.slice(1), 16);
    const d = (r - (v >> 16)) ** 2 + (g - ((v >> 8) & 255)) ** 2 + (b - (v & 255)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.key;
    }
  }
  return best;
}

export class WardrobeSystem extends createSystem({}) {
  /** Last result, for scripted checks. */
  lastPhoto: { source: 'live-ai' | 'on-device'; reply: GarmentReply } | null = null;
  lastTailor: { source: TailorSource; summary: string } | null = null;
  private atelier!: AtelierSystem;
  private closet!: ClosetSystem;
  private status?: HTMLElement;

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    this.closet = this.world.getSystem(ClosetSystem)!;
    this.buildCardSection();
  }

  // ---------------------------------------------------------------- photo to closet

  /** Read a garment photo and add it to the closet (and to the form). */
  async addFromPhoto(file: Blob): Promise<boolean> {
    this.say('Reading your garment...');
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      this.say('That file could not be read. Try a JPG or PNG photo.');
      return false;
    }
    const scale = Math.min(1, PHOTO_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const image = canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? '';

    let source: 'live-ai' | 'on-device' = 'live-ai';
    let reply = await postStylist<GarmentReply>({ mode: 'garment', mediaType: 'image/jpeg', image }, PHOTO_TIMEOUT_MS);
    if (!reply) {
      source = 'on-device';
      const color = nearestColor(ctx, w, h);
      const name = CLOSET_COLORS.find((c) => c.key === color)!.name;
      reply = { kind: 'top', color, material: 'cotton', length: 'hip', sleeves: 'long', name: `${name} Top` };
    }
    if (reply.kind === 'none') {
      this.say('I could not see one garment clearly. Try one piece on a plain background.');
      return false;
    }
    this.lastPhoto = { source, reply };
    const base = templatePiece(reply.kind, closetFabricId(reply.material as ClosetMaterial, reply.color as ClosetColor));
    const fit: RefineReply = {
      summary: '',
      addItemId: '',
      edits: [{ piece: 'p0', length: reply.length, sleeves: reply.sleeves, material: KEEP, color: KEEP }],
    };
    const piece = applyRefine([base], fit, []).pieces[0];
    const name = reply.name || `${reply.color} ${reply.kind}`;
    const item = this.closet.addItem(piece, name);
    if (!item) {
      this.say('Your closet rail is full (7 pieces). Remove one in the studio first.');
      return false;
    }
    this.closet.setMode(true);
    this.atelier.dress([{ ...piece }], name, 'From your photo. Pull the pins to match it exactly.');
    sfx.sparkle();
    this.say(
      source === 'live-ai'
        ? `Added "${name}" to your closet and put it on the form.`
        : `Live AI unavailable: I matched the colour (${reply.color}) and added a top. Change the type in the closet.`,
    );
    return true;
  }

  // ---------------------------------------------------------------- tailor

  /**
   * Apply a tailoring instruction to the outfit on the form. Returns where the
   * answer came from ('none' when nothing could be done).
   */
  async tailor(instruction: string): Promise<TailorSource> {
    const text = instruction.replace(/\s+/g, ' ').trim().slice(0, MAX_INSTRUCTION);
    const pieces = this.atelier.currentPieces;
    if (!text) return 'none';
    if (pieces.length === 0) {
      this.atelier.setHint('Dress the form first, then tell the tailor what to change.');
      return 'none';
    }
    const outfit = describeOutfit(pieces);
    let source: TailorSource = 'on-device';
    let reply = planTailorOffline(text, outfit);
    if (!reply) {
      source = 'live-ai';
      this.atelier.setHint(`Asking the tailor: "${text}"...`);
      const before = this.atelier.currentPieces;
      reply = await postStylist<RefineReply>({ mode: 'tailor', instruction: text.replace(/[^\p{L}\p{N} ,.'!?-]/gu, ''), outfit }, TAILOR_TIMEOUT_MS);
      // The user changed the outfit while waiting: do not overwrite it.
      if (this.atelier.currentPieces !== before) return 'none';
    }
    if (!reply || reply.edits.length === 0) {
      this.lastTailor = { source: 'none', summary: reply?.summary ?? '' };
      this.atelier.setHint(
        reply?.summary || 'I could not turn that into a change. Try "midi length", "long sleeves" or "red satin".',
      );
      return 'none';
    }
    const { pieces: next, changed } = applyRefine(pieces, reply, this.closet.items);
    if (!changed) {
      this.atelier.setHint('That is already how it is cut.');
      return 'none';
    }
    this.atelier.dress(next, this.atelier.outfitTitle || 'Your look', reply.summary);
    this.atelier.setHint(`${source === 'live-ai' ? 'Live AI tailor' : 'Tailor'}: ${reply.summary} Undo to go back.`);
    this.lastTailor = { source, summary: reply.summary };
    sfx.swish();
    return source;
  }

  // ---------------------------------------------------------------- start page

  private say(text: string): void {
    if (this.status) this.status.textContent = text;
  }

  private buildCardSection(): void {
    const card = document.getElementById('studio-options');
    if (!card) return;
    const box = document.createElement('div');
    box.innerHTML = `
      <details open style="margin-top:12px">
      <summary style="cursor:pointer;font-size:11px;letter-spacing:2px;font-weight:700;color:#e2c27d">YOUR REAL CLOTHES</summary>
      <label style="display:block;margin-top:6px;cursor:pointer;text-align:center;border-radius:999px;padding:7px 12px;border:1px solid #8a7656;font-weight:700">
        Add a garment from a photo
        <input type="file" accept="image/*" capture="environment" style="display:none">
      </label>
      <div style="font-size:11px;color:#bfb4a0;margin-top:4px">The photo goes to the AI stylist to be read; it is not stored.</div>
      <div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#e2c27d;margin-top:10px">TELL THE TAILOR</div>
      <form data-tailor style="display:flex;gap:6px;margin-top:6px">
        <input type="text" maxlength="${MAX_INSTRUCTION}" aria-label="Tailoring instruction" placeholder="midi, long sleeves, red satin"
          style="flex:1;min-width:0;border-radius:8px;border:1px solid #6b5a44;background:#1c1814;color:#f6efe2;padding:6px 8px;font:13px inherit">
        <button type="submit" style="cursor:pointer;border:none;border-radius:8px;background:#e2c27d;color:#2b2118;font-weight:700;padding:6px 10px">Go</button>
      </form>
      <div data-wardrobe-status aria-live="polite" style="font-size:12px;color:#d8cfbf;margin-top:6px"></div>
      </details>`;
    card.appendChild(box);
    this.status = box.querySelector<HTMLElement>('[data-wardrobe-status]')!;
    const file = box.querySelector<HTMLInputElement>('input[type=file]')!;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) void this.addFromPhoto(f);
      file.value = '';
    });
    const form = box.querySelector<HTMLFormElement>('[data-tailor]')!;
    const input = form.querySelector<HTMLInputElement>('input')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value;
      void this.tailor(text).then((src) => {
        this.say(src === 'none' ? 'Nothing changed. Try "midi length" or "long sleeves".' : `Done (${src === 'live-ai' ? 'live AI' : 'on device'}). Undo is on the studio panel.`);
        if (src !== 'none') input.value = '';
      });
    });
  }
}
