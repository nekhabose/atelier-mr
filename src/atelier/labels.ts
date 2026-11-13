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
  /** CSS font family (default: a clean sans). */
  font?: string;
}

export function makeLabel(text: string, style: LabelStyle): Mesh {
  const W = 512;
  const H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (style.background) {
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
  ctx.fillText(text, W / 2, H / 2 + 2);
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
