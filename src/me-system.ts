/**
 * MeSystem – "make the form you".
 *
 * Before entering the studio (the flat page, on Quest or desktop) a card lets
 * you take or upload a FULL-LENGTH photo of yourself. The photo is checked on
 * the device (one person, head to feet, facing the camera); anything less is
 * refused with a plain reason, and nothing changes. A good photo turns the
 * porcelain form into you:
 *  - your head and hair, cut out of the background, on the form's head;
 *  - your skin tone on the whole body, your hair colour and length;
 *  - your proportions (shoulder and hip width) and, if you give it, your
 *    height; the clothes and tailoring pins reshape with the body.
 * Privacy: everything is read in the browser and kept only on this device
 * (localStorage). The photo is never uploaded or sent to the stylist.
 *
 * The card hides inside the immersive session; the form stays you.
 */
import {
  CanvasTexture,
  Color,
  createSystem,
  DoubleSide,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  VisibilityState,
} from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { BODY } from './atelier/body.js';
import { HairLength } from './atelier/body-scan.js';
import type { BodyProfile } from './atelier/pose.js';

const PROFILE_KEY = 'atelier.me.v2';
const OLD_FACE_KEY = 'atelier.face.v1';
const TONE_KEY = 'atelier.tone.v1';
const HEIGHT_RANGE = [145, 200] as const;
/** The standard form is 172 cm tall. */
const FORM_CM = 172;
/** Head ellipsoid half-sizes (match the scene asset). */
const HEAD_HALF = { x: 0.082, y: 0.108 } as const;
/** Planar UV for the head photo: the crop spans the head's height (pose.ts HEAD_FILL). */
const UV_Y = 0.47;
const UV_X = (UV_Y * HEAD_HALF.x) / HEAD_HALF.y;

export const SKIN_TONES = [
  { key: 'porcelain', name: 'Porcelain', hex: '#ede8e2' },
  { key: 'ivory', name: 'Ivory', hex: '#efd6c0' },
  { key: 'sand', name: 'Sand', hex: '#d8b08a' },
  { key: 'honey', name: 'Honey', hex: '#b9835a' },
  { key: 'cocoa', name: 'Cocoa', hex: '#86563a' },
  { key: 'ebony', name: 'Ebony', hex: '#56382a' },
] as const;

interface MeProfile extends BodyProfile {
  v: 2;
  heightCm: number | null;
  /** A skin swatch chosen over the photo's tone, if any. */
  tone: string | null;
}

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

/** Back half of the hair: from the crown down the back of the head. */
function hairLathe(length: HairLength): LatheGeometry | null {
  if (length === 'short') return null;
  const y0 = BODY.headCenterY;
  const pts =
    length === 'shoulder'
      ? [[0.088, y0], [0.1, 1.55], [0.122, 1.47], [0.142, 1.41]]
      : [[0.088, y0], [0.1, 1.55], [0.13, 1.45], [0.16, 1.36], [0.172, 1.27], [0.17, 1.2]];
  // Lathe sweeps around Y; centre the open side on the back (-Z).
  return new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    28,
    Math.PI - 1.0,
    2.0,
  );
}

export class MeSystem extends createSystem({}) {
  /** Whether the form is you (a full-length photo was accepted). */
  hasFace = false;
  tone = 'porcelain';
  /** The last photo check (for scripted checks). */
  lastCheck: { ok: boolean; problem?: string; message: string } | null = null;
  profile: MeProfile | null = null;
  private atelier!: AtelierSystem;
  private head?: Mesh;
  private shell?: Mesh;
  private body?: Group;
  private porcelain?: Material;
  private skinMat = new MeshPhysicalMaterial({
    color: '#d8b08a',
    roughness: 0.6,
    sheen: 0.35,
    sheenRoughness: 0.75,
    sheenColor: new Color('#ffcfb8'),
  });
  private hairMat = new MeshStandardMaterial({ color: '#3a2a20', roughness: 0.78, side: DoubleSide });
  private faceMat = new MeshStandardMaterial({ transparent: true, roughness: 0.6, alphaTest: 0.04 });
  private faceMesh?: Mesh;
  private hairCap?: Mesh;
  private hairBack?: Mesh;
  private shoes: Mesh[] = [];
  private card?: HTMLDivElement;
  private status?: HTMLDivElement;
  private youRow?: HTMLDivElement;
  private removeBtn?: HTMLButtonElement;
  private heightInput?: HTMLInputElement;
  private cam?: { root: HTMLDivElement; stream: MediaStream | null; stop: () => void };
  private busy = false;

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    const form = this.world.getSceneObject('dress-form');
    this.body = form?.getObjectByName('mannequin-body') as Group | undefined;
    this.head = form?.getObjectByName('mannequin-head') as Mesh | undefined;
    this.shell = form?.getObjectByName('mannequin-shell') as Mesh | undefined;
    if (this.head && this.body) this.buildParts(this.head, this.body);

    const tone = read(TONE_KEY);
    if (tone) this.setTone(tone, false);
    let migrated = false;
    if (read(OLD_FACE_KEY)) {
      // Face-only photos are no longer enough to make the form you.
      write(OLD_FACE_KEY, null);
      migrated = true;
    }
    try {
      const saved = JSON.parse(read(PROFILE_KEY) ?? 'null') as MeProfile | null;
      if (saved?.v === 2 && typeof saved.head === 'string') this.applyProfile(saved, false);
    } catch {
      /* start as the form */
    }
    this.buildCard();
    if (migrated && !this.hasFace) {
      this.say('The form now needs a full-length photo of you, head to feet. Take or upload one to see clothes on you.');
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (this.card) this.card.style.display = state === VisibilityState.NonImmersive ? 'block' : 'none';
        if (state !== VisibilityState.NonImmersive) this.closeCamera();
      }),
      () => this.card?.remove(),
      () => this.closeCamera(),
    );
  }

  // ------------------------------------------------------------------ 3D

  private buildParts(head: Mesh, body: Group): void {
    this.porcelain = head.material as Material;
    // Front half of the head: your photo, projected straight on (front view).
    const geo = new SphereGeometry(1.012, 48, 32, 0, Math.PI, 0, Math.PI);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) * UV_X, 0.5 + pos.getY(i) * UV_Y);
    uv.needsUpdate = true;
    this.faceMesh = new Mesh(geo, this.faceMat);
    this.faceMesh.name = 'you-face';
    // Back of the head: hair, overlapping the photo's edges a little.
    this.hairCap = new Mesh(new SphereGeometry(1.035, 36, 20, Math.PI - 0.38, Math.PI + 0.76, 0, 2.1), this.hairMat);
    this.hairCap.name = 'you-hair';
    for (const m of [this.faceMesh, this.hairCap]) {
      m.visible = false;
      m.raycast = () => {};
      head.add(m);
    }
    this.hairBack = new Mesh(undefined, this.hairMat);
    this.hairBack.name = 'you-hair-length';
    this.hairBack.position.z = 0.006;
    // Shoes: a simple leather pair over the form's feet.
    const leather = new MeshStandardMaterial({ color: '#2b2420', roughness: 0.42, metalness: 0.05 });
    const shoeGeo = new SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
    for (const side of [1, -1]) {
      const shoe = new Mesh(shoeGeo, leather);
      shoe.name = 'you-shoe';
      shoe.scale.set(0.042, 0.04, 0.108);
      shoe.position.set(side * BODY.ankleX, 0.026, 0.047);
      this.shoes.push(shoe);
    }
    for (const m of [this.hairBack, ...this.shoes]) {
      m.visible = false;
      m.raycast = () => {};
      m.castShadow = true;
      body.add(m);
    }
  }

  setTone(key: string, save = true): void {
    const t = SKIN_TONES.find((s) => s.key === key);
    if (!t) return;
    this.tone = t.key;
    if (this.profile) {
      this.profile.tone = t.key;
      this.skinMat.color.set(t.hex);
      this.saveProfile();
    } else if (this.porcelain && 'color' in this.porcelain) {
      (this.porcelain as MeshStandardMaterial).color = new Color(t.hex);
    }
    if (save) write(TONE_KEY, t.key);
    this.paintCard();
  }

  /** Use the skin tone read from your photo again. */
  usePhotoTone(): void {
    if (!this.profile) return;
    this.profile.tone = null;
    this.skinMat.color.set(this.profile.skin);
    this.saveProfile();
    this.paintCard();
  }

  /** Turn the form into you. */
  applyProfile(p: MeProfile, save = true): void {
    if (!this.head || !this.shell) return;
    this.profile = p;
    const img = new Image();
    img.onload = () => {
      const tex = new CanvasTexture(img as unknown as HTMLCanvasElement);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      this.faceMat.map?.dispose();
      this.faceMat.map = tex;
      this.faceMat.needsUpdate = true;
      this.faceMesh!.visible = this.hasFace;
    };
    img.src = p.head;
    const tone = p.tone ? SKIN_TONES.find((s) => s.key === p.tone) : undefined;
    this.skinMat.color.set(tone?.hex ?? p.skin);
    this.hairMat.color.set(p.hair);
    this.head.material = this.skinMat;
    this.shell.material = this.skinMat;
    this.hairCap!.visible = true;
    this.setHairLength(p.hairLength, false);
    for (const s of this.shoes) s.visible = true;
    this.hasFace = true;
    if (this.faceMat.map) this.faceMesh!.visible = true;
    this.applyScale();
    this.atelier.refreshOcclusion();
    if (save) this.saveProfile();
    this.paintCard();
  }

  setHairLength(length: HairLength, save = true): void {
    if (!this.profile || !this.hairBack) return;
    this.profile.hairLength = length;
    this.hairBack.geometry.dispose();
    const geo = hairLathe(length);
    if (geo) this.hairBack.geometry = geo;
    this.hairBack.visible = !!geo;
    if (save) {
      this.saveProfile();
      this.atelier.refreshOcclusion();
    }
    this.paintCard();
  }

  /** Your height in cm (null: the standard form height). */
  setHeight(cm: number | null): void {
    if (!this.profile) return;
    this.profile.heightCm =
      cm === null || !Number.isFinite(cm) ? null : Math.round(Math.min(HEIGHT_RANGE[1], Math.max(HEIGHT_RANGE[0], cm)));
    this.applyScale();
    this.saveProfile();
    this.paintCard();
  }

  private applyScale(): void {
    const p = this.profile;
    this.atelier.setBodyScale(p ? p.width : 1, p?.heightCm ? p.heightCm / FORM_CM : 1);
  }

  /** Back to the porcelain form; your photo data is deleted from the device. */
  removeFace(): void {
    write(PROFILE_KEY, null);
    this.profile = null;
    this.hasFace = false;
    if (this.head && this.shell && this.porcelain) {
      this.head.material = this.porcelain;
      this.shell.material = this.porcelain;
    }
    for (const m of [this.faceMesh, this.hairCap, this.hairBack, ...this.shoes]) if (m) m.visible = false;
    this.faceMat.map?.dispose();
    this.faceMat.map = null;
    this.atelier.setBodyScale(1, 1);
    const tone = SKIN_TONES.find((s) => s.key === this.tone);
    if (tone && this.porcelain && 'color' in this.porcelain) (this.porcelain as MeshStandardMaterial).color = new Color(tone.hex);
    this.paintCard();
  }

  private saveProfile(): void {
    if (this.profile && !write(PROFILE_KEY, JSON.stringify(this.profile))) {
      this.say('Could not save on this device, but the form is you for this visit.');
    }
  }

  // ------------------------------------------------------------------ photo

  /** Check a photo (file, blob or canvas) and, if it is full length, use it. */
  async addPhoto(source: Blob | HTMLCanvasElement): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.say('Checking your photo on this device...');
    try {
      const pose = await import('./atelier/pose.js');
      let canvas: HTMLCanvasElement;
      if (source instanceof HTMLCanvasElement) {
        canvas = pose.toScanCanvas(source, source.width, source.height);
      } else {
        let bitmap: ImageBitmap;
        try {
          bitmap = await createImageBitmap(source);
        } catch {
          this.fail('That file could not be read. Try a JPG or PNG photo.');
          return false;
        }
        canvas = pose.toScanCanvas(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
      }
      let scan;
      try {
        scan = await pose.scanPhoto(canvas);
      } catch (err) {
        console.warn('[atelier] body check unavailable', err);
        this.fail('The full-length check could not load (it needs a connection the first time). Your photo was not used.');
        return false;
      }
      this.lastCheck = scan.check;
      if (!scan.check.ok || !scan.profile) {
        this.fail(`Photo not used. ${scan.check.message}`);
        return false;
      }
      const keep = this.profile;
      this.applyProfile({
        v: 2,
        ...scan.profile,
        heightCm: keep?.heightCm ?? null,
        tone: null,
      });
      this.say(
        `This is you. Skin, hair and proportions are from your photo. ` +
          'Add your height for the right length. It stays on this device.',
      );
      return true;
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------ camera

  /** Live camera with a head-to-feet guide; takes the photo when you fit. */
  async openCamera(): Promise<void> {
    if (this.cam) return;
    const root = document.createElement('div');
    root.id = 'me-camera';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Take a full-length photo');
    root.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#120f0c;color:#f6efe2;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:12px;padding:16px;font:15px/1.4 "Helvetica Neue",Helvetica,Arial,sans-serif';
    root.innerHTML = `
      <div style="position:relative;height:min(70vh,640px);aspect-ratio:3/4;max-width:92vw;border-radius:18px;overflow:hidden;background:#000">
        <video playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>
        <svg viewBox="0 0 300 400" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">
          <g data-guide fill="none" stroke="#e2c27d" stroke-width="3" stroke-dasharray="9 7" opacity="0.9">
            <ellipse cx="150" cy="52" rx="22" ry="27"/>
            <path d="M150 80 L150 86 M112 98 Q150 86 188 98 L196 205 M104 98 L96 205 M120 205 L128 380 M180 205 L172 380 M118 100 L122 210 L178 210 L182 100"/>
          </g>
        </svg>
        <div data-count style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:120px;font-weight:700;color:#fff;text-shadow:0 4px 20px rgba(0,0,0,.6)"></div>
      </div>
      <div data-cam-status aria-live="polite" style="max-width:min(92vw,520px);text-align:center;min-height:42px">Starting the camera...</div>
      <div style="display:flex;gap:10px">
        <button type="button" data-shoot style="cursor:pointer;border:none;border-radius:999px;background:#e2c27d;color:#2b2118;font-weight:700;padding:10px 18px">Take it in 5 s</button>
        <button type="button" data-cancel style="cursor:pointer;border-radius:999px;background:transparent;color:#f6efe2;border:1px solid #6b5a44;padding:9px 18px">Cancel</button>
      </div>`;
    document.body.appendChild(root);
    const video = root.querySelector('video')!;
    const statusEl = root.querySelector<HTMLDivElement>('[data-cam-status]')!;
    const countEl = root.querySelector<HTMLDivElement>('[data-count]')!;
    const guide = root.querySelector<SVGGElement>('[data-guide]')!;
    let timer = 0;
    let stopped = false;
    let countdown = -1;
    let countdownEnd = 0;
    let readySince = 0;
    const cam = {
      root,
      stream: null as MediaStream | null,
      stop: () => {
        stopped = true;
        clearTimeout(timer);
        cam.stream?.getTracks().forEach((t) => t.stop());
        root.remove();
      },
    };
    this.cam = cam;
    root.querySelector('[data-cancel]')!.addEventListener('click', () => this.closeCamera());
    root.querySelector('[data-shoot]')!.addEventListener('click', () => {
      countdown = 5;
      countdownEnd = performance.now() + 5000;
    });

    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
    } catch {
      statusEl.textContent = 'The camera is not available or was blocked. Upload a full-length photo instead.';
      return;
    }
    if (stopped) {
      cam.stream.getTracks().forEach((t) => t.stop());
      return;
    }
    video.srcObject = cam.stream;
    await video.play().catch(() => {});
    statusEl.textContent = 'Prop up your device, step back and stand inside the outline, head to feet.';
    const pose = await import('./atelier/pose.js');

    const shoot = async () => {
      const shot = document.createElement('canvas');
      shot.width = video.videoWidth;
      shot.height = video.videoHeight;
      shot.getContext('2d')!.drawImage(video, 0, 0);
      this.closeCamera();
      await this.addPhoto(shot);
    };

    const tick = async () => {
      if (stopped) return;
      const now = performance.now();
      if (countdown > 0) {
        const left = Math.ceil((countdownEnd - now) / 1000);
        countEl.textContent = left > 0 ? String(left) : '';
        if (left <= 0) {
          await shoot();
          return;
        }
      }
      if (video.readyState >= 2) {
        try {
          const check = await pose.checkFrame(video, now);
          if (stopped) return;
          guide.setAttribute('stroke', check.ok ? '#8fd18b' : '#e2c27d');
          if (check.ok) {
            readySince ||= now;
            if (countdown < 0 && now - readySince > 800) {
              countdown = 3;
              countdownEnd = now + 3000;
            }
            statusEl.textContent = countdown > 0 ? 'Perfect. Hold still...' : check.message;
          } else {
            readySince = 0;
            // Lost the pose during an automatic countdown: start over.
            if (countdown === 3) {
              countdown = -1;
              countEl.textContent = '';
            }
            statusEl.textContent = check.message;
          }
        } catch {
          statusEl.textContent = 'The full-length check could not load. Use "Take it in 5 s", or upload a photo.';
        }
      }
      timer = window.setTimeout(tick, 200);
    };
    void tick();
  }

  closeCamera(): void {
    this.cam?.stop();
    this.cam = undefined;
  }

  // ------------------------------------------------------------------ card

  private say(text: string, error = false): void {
    if (!this.status) return;
    this.status.textContent = text;
    this.status.style.color = error ? '#ffb4a2' : '#d8cfbf';
  }

  private fail(text: string): void {
    this.say(text, true);
  }

  private paintCard(): void {
    if (!this.card) return;
    const photoTone = !!this.profile && !this.profile.tone;
    for (const b of this.card.querySelectorAll<HTMLButtonElement>('[data-tone]')) {
      const on = b.dataset.tone === 'photo' ? photoTone : !photoTone && b.dataset.tone === this.tone;
      b.style.outline = on ? '3px solid #e2c27d' : 'none';
      if (b.dataset.tone === 'photo') {
        b.style.display = this.profile ? 'inline-block' : 'none';
        if (this.profile) b.style.background = this.profile.skin;
      }
    }
    if (this.removeBtn) this.removeBtn.style.display = this.hasFace ? 'inline-block' : 'none';
    if (this.youRow) this.youRow.style.display = this.profile ? 'flex' : 'none';
    for (const b of this.card.querySelectorAll<HTMLButtonElement>('[data-hair]')) {
      const on = this.profile?.hairLength === b.dataset.hair;
      b.style.background = on ? '#e2c27d' : 'transparent';
      b.style.color = on ? '#2b2118' : '#f6efe2';
    }
    if (this.heightInput && document.activeElement !== this.heightInput) {
      this.heightInput.value = this.profile?.heightCm ? String(this.profile.heightCm) : '';
    }
    if (!this.busy) {
      this.say(
        this.hasFace
          ? 'The form is you, from your full-length photo. It stays on this device only.'
          : 'Take or upload a full-length photo (head to feet, facing the camera) to see clothes on you. It stays on this device.',
      );
    }
  }

  private buildCard(): void {
    const card = document.createElement('div');
    card.id = 'make-it-you';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Make the form you');
    card.style.cssText = [
      'position:fixed', 'left:16px', 'bottom:16px', 'z-index:10', 'width:300px', 'max-width:calc(100vw - 32px)',
      'padding:14px 16px', 'border-radius:16px', 'background:rgba(28,24,20,0.9)', 'color:#f6efe2',
      'font:14px/1.4 "Helvetica Neue",Helvetica,Arial,sans-serif', 'box-shadow:0 8px 30px rgba(0,0,0,0.25)',
    ].join(';');
    const chip =
      'cursor:pointer;border:1px solid #6b5a44;border-radius:999px;padding:3px 9px;font:12px inherit;background:transparent;color:#f6efe2';
    card.innerHTML = `
      <div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#e2c27d">MAKE THE FORM YOU</div>
      <div style="margin:8px 0 4px;display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-camera style="cursor:pointer;border:none;background:#e2c27d;color:#2b2118;font-weight:700;padding:7px 12px;border-radius:999px">Take a photo</button>
        <label style="cursor:pointer;border:1px solid #8a7656;font-weight:700;padding:6px 12px;border-radius:999px">
          Upload
          <input type="file" accept="image/*" style="display:none">
        </label>
        <button type="button" data-remove style="cursor:pointer;background:transparent;color:#f6efe2;border:1px solid #6b5a44;padding:6px 12px;border-radius:999px">Back to the form</button>
      </div>
      <div style="font-size:11px;color:#bfb4a0">Full length: head to feet, facing the camera, just you.</div>
      <div data-you style="display:none;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px">
        <label style="font-size:11px;letter-spacing:1px;font-weight:700;color:#bfb4a0">HEIGHT
          <input type="number" data-height min="${HEIGHT_RANGE[0]}" max="${HEIGHT_RANGE[1]}" step="1" placeholder="cm" aria-label="Your height in centimetres"
            style="width:58px;margin-left:4px;border-radius:8px;border:1px solid #6b5a44;background:#1c1814;color:#f6efe2;padding:3px 6px;font:13px inherit">
        </label>
        <span style="font-size:11px;letter-spacing:1px;font-weight:700;color:#bfb4a0;margin-left:4px">HAIR</span>
        <button type="button" data-hair="short" style="${chip}">short</button>
        <button type="button" data-hair="shoulder" style="${chip}">shoulder</button>
        <button type="button" data-hair="long" style="${chip}">long</button>
      </div>
      <div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#bfb4a0;margin-top:8px">SKIN TONE</div>
      <div data-tones style="display:flex;gap:7px;margin:6px 0 8px;flex-wrap:wrap"></div>
      <div data-status aria-live="polite" style="font-size:12px;color:#d8cfbf"></div>`;
    const tones = card.querySelector('[data-tones]')!;
    const photoTone = document.createElement('button');
    photoTone.type = 'button';
    photoTone.dataset.tone = 'photo';
    photoTone.title = 'From your photo';
    photoTone.setAttribute('aria-label', 'Skin tone from your photo');
    photoTone.style.cssText =
      'width:28px;height:28px;border-radius:50%;border:2px dashed #e2c27d;cursor:pointer;outline-offset:2px;display:none';
    photoTone.addEventListener('click', () => this.usePhotoTone());
    tones.appendChild(photoTone);
    for (const t of SKIN_TONES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tone = t.key;
      b.title = t.name;
      b.setAttribute('aria-label', `${t.name} skin tone`);
      b.style.cssText = `width:28px;height:28px;border-radius:50%;border:2px solid #2b2118;cursor:pointer;background:${t.hex};outline-offset:2px`;
      b.addEventListener('click', () => this.setTone(t.key));
      tones.appendChild(b);
    }
    const input = card.querySelector<HTMLInputElement>('input[type=file]')!;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.addPhoto(file);
      input.value = '';
    });
    card.querySelector('[data-camera]')!.addEventListener('click', () => void this.openCamera());
    this.removeBtn = card.querySelector<HTMLButtonElement>('[data-remove]')!;
    this.removeBtn.addEventListener('click', () => this.removeFace());
    this.youRow = card.querySelector<HTMLDivElement>('[data-you]')!;
    this.heightInput = card.querySelector<HTMLInputElement>('[data-height]')!;
    this.heightInput.addEventListener('change', () => {
      const v = this.heightInput!.value.trim();
      this.setHeight(v ? Number(v) : null);
    });
    for (const b of card.querySelectorAll<HTMLButtonElement>('[data-hair]')) {
      b.addEventListener('click', () => this.setHairLength(b.dataset.hair as HairLength));
    }
    this.status = card.querySelector<HTMLDivElement>('[data-status]')!;
    document.body.appendChild(card);
    this.card = card;
    this.paintCard();
  }
}
