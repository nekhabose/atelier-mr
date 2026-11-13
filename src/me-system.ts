/**
 * MeSystem – "make the form you".
 *
 * Before entering the studio (the flat page, on Quest or desktop) a small
 * card lets you:
 *  - add a photo of yourself: it is cropped to an oval with a soft edge and
 *    mapped onto the front of the mannequin's head, so you see the outfit
 *    "on you";
 *  - choose a skin tone for the form.
 * Privacy: the photo is processed in the browser and stored only on this
 * device (localStorage). It is never uploaded or sent to the stylist.
 *
 * The card hides inside the immersive session; the face and tone stay.
 */
import {
  CanvasTexture,
  Color,
  createSystem,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  VisibilityState,
} from '@iwsdk/core';

const FACE_KEY = 'atelier.face.v1';
const TONE_KEY = 'atelier.tone.v1';
const FACE_PX = 384;

export const SKIN_TONES = [
  { key: 'porcelain', name: 'Porcelain', hex: '#ede8e2' },
  { key: 'ivory', name: 'Ivory', hex: '#efd6c0' },
  { key: 'sand', name: 'Sand', hex: '#d8b08a' },
  { key: 'honey', name: 'Honey', hex: '#b9835a' },
  { key: 'cocoa', name: 'Cocoa', hex: '#86563a' },
  { key: 'ebony', name: 'Ebony', hex: '#56382a' },
] as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Crop a portrait to a soft-edged oval (face usually sits upper-centre). */
function cropFace(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_PX;
  canvas.height = FACE_PX;
  const ctx = canvas.getContext('2d')!;
  const side = Math.min(img.naturalWidth, img.naturalHeight) * 0.78;
  const cx = img.naturalWidth / 2;
  const cy = Math.min(img.naturalHeight - side / 2, Math.max(side / 2, img.naturalHeight * 0.42));
  ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, FACE_PX, FACE_PX);
  // Soft oval mask, a little taller than wide like a face.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.translate(FACE_PX / 2, FACE_PX / 2);
  ctx.scale(0.82, 1);
  const r = FACE_PX / 2;
  const g = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r * 0.98);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return canvas.toDataURL('image/png');
}

export class MeSystem extends createSystem({}) {
  /** Whether a face photo is on the form (for scripted checks). */
  hasFace = false;
  tone = 'porcelain';
  private faceMesh?: Mesh;
  private faceMat?: MeshStandardMaterial;
  private bodyMat?: MeshStandardMaterial;
  private card?: HTMLDivElement;
  private status?: HTMLDivElement;
  private removeBtn?: HTMLButtonElement;

  init(): void {
    const form = this.world.getSceneObject('dress-form');
    const head = form?.getObjectByName('mannequin-head') as Mesh | undefined;
    if (head) {
      this.bodyMat = head.material as MeshStandardMaterial;
      // Front cap of the head's unit sphere, with a planar (front view) UV map.
      const geo = new SphereGeometry(1.012, 40, 28, Math.PI / 2 - 1.05, 2.1, 0.3, 1.95);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, 0.5 + pos.getX(i) * 0.52, 0.5 + pos.getY(i) * 0.52);
      }
      uv.needsUpdate = true;
      this.faceMat = new MeshStandardMaterial({ transparent: true, roughness: 0.55, alphaTest: 0.02 });
      this.faceMesh = new Mesh(geo, this.faceMat);
      this.faceMesh.name = 'mannequin-face';
      this.faceMesh.visible = false;
      this.faceMesh.raycast = () => {};
      head.add(this.faceMesh);
    }
    const tone = read(TONE_KEY);
    if (tone) this.setTone(tone, false);
    const face = read(FACE_KEY);
    if (face) this.applyFace(face);
    this.buildCard();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (this.card) this.card.style.display = state === VisibilityState.NonImmersive ? 'block' : 'none';
      }),
      () => this.card?.remove(),
    );
  }

  setTone(key: string, save = true): void {
    const t = SKIN_TONES.find((s) => s.key === key);
    if (!t || !this.bodyMat) return;
    this.tone = t.key;
    this.bodyMat.color = new Color(t.hex);
    if (save) write(TONE_KEY, t.key);
    this.paintCard();
  }

  /** Put a cropped face (data URL) on the form. */
  applyFace(dataUrl: string): void {
    if (!this.faceMat || !this.faceMesh) return;
    const img = new Image();
    img.onload = () => {
      const tex = new CanvasTexture(img as unknown as HTMLCanvasElement);
      tex.colorSpace = SRGBColorSpace;
      this.faceMat!.map?.dispose();
      this.faceMat!.map = tex;
      this.faceMat!.needsUpdate = true;
      this.faceMesh!.visible = true;
      this.hasFace = true;
      this.paintCard();
    };
    img.src = dataUrl;
  }

  removeFace(): void {
    write(FACE_KEY, null);
    if (this.faceMesh) this.faceMesh.visible = false;
    this.faceMat?.map?.dispose();
    if (this.faceMat) this.faceMat.map = null;
    this.hasFace = false;
    this.paintCard();
  }

  private loadFile(file: File): void {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const data = cropFace(img);
      if (!write(FACE_KEY, data)) {
        this.say('Could not save on this device, but it is on the form for now.');
      }
      this.applyFace(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.say('That file could not be read. Try a JPG or PNG photo.');
    };
    img.src = url;
  }

  // ------------------------------------------------------------------ card

  private say(text: string): void {
    if (this.status) this.status.textContent = text;
  }

  private paintCard(): void {
    if (!this.card) return;
    for (const b of this.card.querySelectorAll<HTMLButtonElement>('[data-tone]')) {
      b.style.outline = b.dataset.tone === this.tone ? '3px solid #e2c27d' : 'none';
    }
    if (this.removeBtn) this.removeBtn.style.display = this.hasFace ? 'inline-block' : 'none';
    this.say(
      this.hasFace
        ? 'Your photo is on the form. It stays on this device only.'
        : 'Add a photo to see outfits on you. It stays on this device only.',
    );
  }

  private buildCard(): void {
    const card = document.createElement('div');
    card.id = 'make-it-you';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Make the form you');
    card.style.cssText = [
      'position:fixed', 'left:16px', 'bottom:16px', 'z-index:10', 'width:280px', 'max-width:calc(100vw - 32px)',
      'padding:14px 16px', 'border-radius:16px', 'background:rgba(28,24,20,0.88)', 'color:#f6efe2',
      'font:14px/1.4 "Helvetica Neue",Helvetica,Arial,sans-serif', 'box-shadow:0 8px 30px rgba(0,0,0,0.25)',
    ].join(';');
    card.innerHTML = `
      <div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#e2c27d">MAKE THE FORM YOU</div>
      <div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap">
        <label style="cursor:pointer;background:#e2c27d;color:#2b2118;font-weight:700;padding:7px 12px;border-radius:999px">
          Add your photo
          <input type="file" accept="image/*" capture="user" style="display:none">
        </label>
        <button type="button" data-remove style="cursor:pointer;background:transparent;color:#f6efe2;border:1px solid #6b5a44;padding:6px 12px;border-radius:999px">Remove photo</button>
      </div>
      <div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#bfb4a0;margin-top:4px">SKIN TONE</div>
      <div data-tones style="display:flex;gap:8px;margin:6px 0 8px"></div>
      <div data-status style="font-size:12px;color:#d8cfbf"></div>`;
    const tones = card.querySelector('[data-tones]')!;
    for (const t of SKIN_TONES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tone = t.key;
      b.title = t.name;
      b.setAttribute('aria-label', `${t.name} skin tone`);
      b.style.cssText = `width:30px;height:30px;border-radius:50%;border:2px solid #2b2118;cursor:pointer;background:${t.hex};outline-offset:2px`;
      b.addEventListener('click', () => this.setTone(t.key));
      tones.appendChild(b);
    }
    const input = card.querySelector<HTMLInputElement>('input[type=file]')!;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this.loadFile(file);
      input.value = '';
    });
    this.removeBtn = card.querySelector<HTMLButtonElement>('[data-remove]')!;
    this.removeBtn.addEventListener('click', () => this.removeFace());
    this.status = card.querySelector<HTMLDivElement>('[data-status]')!;
    document.body.appendChild(card);
    this.card = card;
    this.paintCard();
  }
}
