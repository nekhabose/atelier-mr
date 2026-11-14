/**
 * Small text labels rendered to a canvas texture on a plane (runtime only).
 */
import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

export interface LabelStyle {
  /** Plane width in meters; height follows the canvas aspect. */
  width: number;
  fontSize?: number;
  color?: string;
  background?: string;
  weight?: number;
  letterSpacing?: number;
  pill?: boolean;
  /**
   * Paper shapes: 'tag' is a hang tag (punched hole, string), 'card' a paper
   * label held by a brass pin. Both use `background` as the paper colour.
   */
  shape?: 'tag' | 'card';
  /** CSS font family (default: a clean sans). */
  font?: string;
}

/** A hang tag: tapered left end, a punched hole and a loop of string. */
function drawTag(ctx: CanvasRenderingContext2D, W: number, H: number, paper: string): number {
  const top = 10;
  const bottom = H - 10;
  const left = 58;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(W - 12, top);
    ctx.lineTo(W - 12, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left - 22, H / 2);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  // Soft shadow, then the card with a slightly darker deckled edge.
  ctx.save();
  ctx.translate(2, 3);
  path();
  ctx.fillStyle = 'rgba(40,30,20,0.18)';
  ctx.fill();
  ctx.restore();
  path();
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(120,100,70,0.45)';
  ctx.stroke();
  // Punched hole with a reinforcing ring.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(left - 4, H / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(left - 4, H / 2, 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(150,128,96,0.7)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // String looping off to the garment.
  ctx.beginPath();
  ctx.moveTo(left - 4, H / 2);
  ctx.bezierCurveTo(left - 30, H / 2 - 4, 18, 8, 0, 2);
  ctx.strokeStyle = '#8a7a66';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  return (left + W - 12) / 2;
}

/** A paper card held by a brass pin on its left. */
function drawCard(ctx: CanvasRenderingContext2D, W: number, H: number, paper: string): number {
  ctx.fillStyle = 'rgba(40,30,20,0.18)';
  ctx.beginPath();
  ctx.roundRect(8, 9, W - 14, H - 14, 6);
  ctx.fill();
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.roundRect(5, 5, W - 14, H - 14, 6);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(120,100,70,0.4)';
  ctx.stroke();
  const g = ctx.createRadialGradient(30, H / 2 - 4, 1, 32, H / 2, 10);
  g.addColorStop(0, '#f6e3a8');
  g.addColorStop(1, '#8a6a2f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, H / 2 - 2, 9, 0, Math.PI * 2);
  ctx.fill();
  return (44 + W - 14) / 2;
}

export function makeLabel(text: string, style: LabelStyle): Mesh {
  const W = 512;
  const H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  let cx = W / 2;
  if (style.shape === 'tag') {
    cx = drawTag(ctx, W, H, style.background ?? '#f7f0e2');
  } else if (style.shape === 'card') {
    cx = drawCard(ctx, W, H, style.background ?? '#f7f0e2');
  } else if (style.background) {
    ctx.fillStyle = style.background;
    const r = style.pill ? H / 2 : 12;
    ctx.beginPath();
    ctx.roundRect(4, 4, W - 8, H - 8, r);
    ctx.fill();
  }
  ctx.fillStyle = style.color ?? '#2b2118';
  ctx.font = `${style.weight ?? 700} ${style.fontSize ?? 46}px ${style.font ?? '"Helvetica Neue", Helvetica, Arial, sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (style.letterSpacing) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${style.letterSpacing}px`;
  }
  // Shrink long text to fit the paper.
  const room = style.shape ? W - 120 : W - 40;
  const measured = ctx.measureText(text).width;
  if (measured > room) {
    const size = Math.floor((style.fontSize ?? 46) * (room / measured));
    ctx.font = `${style.weight ?? 700} ${size}px ${style.font ?? '"Helvetica Neue", Helvetica, Arial, sans-serif'}`;
  }
  ctx.fillText(text, cx, H / 2 + 2);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(new PlaneGeometry(style.width, (style.width * H) / W), mat);
  mesh.name = `label-${text}`;
  mesh.renderOrder = 10;
  return mesh;
}

/**
 * Many small captions drawn on one transparent plane (one draw call), e.g.
 * the fabric names under every swatch. Coordinates are in metres relative to
 * the sheet centre; the sheet is `width` x `height` metres.
 */
export function makeTextSheet(
  width: number,
  height: number,
  items: { text: string; x: number; y: number }[],
  style: { textHeight: number; color: string; weight?: number },
): Mesh {
  const W = 1024;
  const H = Math.max(8, Math.round((W * height) / width));
  const pxPerM = W / width;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = style.color;
  ctx.font = `${style.weight ?? 700} ${Math.round(style.textHeight * pxPerM)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const it of items) {
    ctx.fillText(it.text, W / 2 + it.x * pxPerM, H / 2 - it.y * pxPerM);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new Mesh(new PlaneGeometry(width, height), mat);
  mesh.name = 'label-sheet';
  mesh.renderOrder = 10;
  mesh.raycast = () => {};
  return mesh;
}
