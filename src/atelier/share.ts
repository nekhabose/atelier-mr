/**
 * Share a look as a link: the outfit is packed into the URL fragment
 * (#look=...), so nothing is uploaded and no server is involved. Opening the
 * link dresses the form in the shared look.
 *
 * Shared links are untrusted input: decoding validates every field, clamps
 * every measurement to the garment's legal range and drops anything unknown.
 */
import qrcode from 'qrcode-generator';
import { GarmentPiece, PieceKind, RANGES, TailorParam } from './garments.js';

const KINDS: PieceKind[] = ['dress', 'top', 'skirt', 'trousers', 'jacket'];
const NUMS: (TailorParam | 'flare')[] = ['hem', 'neck', 'sleeve', 'fit', 'flare'];
const MAX_PIECES = 5;
const MAX_NAME = 40;
const HASH_KEY = 'look';

export interface SharedLook {
  name: string;
  pieces: GarmentPiece[];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** The modern details of a piece, compact (only those set). */
function styleOf(p: GarmentPiece): Record<string, string | number | boolean> | undefined {
  const st: Record<string, string | number | boolean> = {};
  if (p.straps) st.s = p.straps;
  if (p.neckline) st.n = p.neckline;
  for (const [k, v] of [['b', p.back], ['l', p.slit], ['t', p.tiers], ['d', p.drape], ['u', p.buttons], ['h', p.shoulders], ['f', p.fringe]] as const) {
    if (typeof v === 'number' && v > 0) st[k] = round(v);
  }
  if (p.corset) st.c = true;
  return Object.keys(st).length ? st : undefined;
}

const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : undefined);

/** Read the modern details back, keeping only known values in range. */
function applyStyle(piece: GarmentPiece, raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const st = raw as Record<string, unknown>;
  if (st.s === 'slip' || st.s === 'halter') piece.straps = st.s;
  if (st.n === 'v' || st.n === 'sweetheart' || st.n === 'square' || st.n === 'cowl') piece.neckline = st.n;
  const set = <K extends 'back' | 'slit' | 'tiers' | 'drape' | 'buttons' | 'shoulders' | 'fringe'>(key: K, v: unknown, max: number) => {
    const n = num(v, max);
    if (n) piece[key] = n as GarmentPiece[K];
  };
  set('back', st.b, 0.4);
  set('slit', st.l, 0.5);
  set('tiers', st.t, 3);
  set('drape', st.d, 1);
  set('buttons', st.u, 8);
  set('shoulders', st.h, 1);
  set('fringe', st.f, 0.2);
  if (st.c === true) piece.corset = true;
}

export function encodeLook(name: string, pieces: GarmentPiece[]): string {
  const p = pieces.slice(0, MAX_PIECES).map((piece) => [
    KINDS.indexOf(piece.kind),
    piece.fabric,
    ...NUMS.map((k) => round(piece[k] ?? 0)),
    piece.strapless ? 1 : 0,
    ...(styleOf(piece) ? [styleOf(piece)] : []),
  ]);
  return toBase64Url(JSON.stringify({ v: 1, n: name.slice(0, MAX_NAME), p }));
}

/** Decode and validate; null when the data is not a usable look. */
export function decodeLook(data: string): SharedLook | null {
  if (!data || data.length > 4000) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(data));
  } catch {
    return null;
  }
  const obj = raw as { v?: unknown; n?: unknown; p?: unknown };
  if (!obj || obj.v !== 1 || !Array.isArray(obj.p)) return null;
  const pieces: GarmentPiece[] = [];
  for (const row of obj.p.slice(0, MAX_PIECES)) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const kind = KINDS[row[0] as number];
    const fabric = row[1];
    if (!kind || typeof fabric !== 'string' || !/^[a-z0-9:#._-]{1,48}$/i.test(fabric)) continue;
    const piece: GarmentPiece = { kind, fabric, hem: 0, neck: 0, sleeve: 0, fit: 0, flare: 0 };
    let ok = true;
    NUMS.forEach((k, i) => {
      const v = row[2 + i];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        ok = false;
        return;
      }
      const r = RANGES[kind][k];
      piece[k] = r ? Math.min(r.max, Math.max(r.min, v)) : Math.min(2, Math.max(0, v));
    });
    if (!ok) continue;
    if (row[7] === 1) piece.strapless = true;
    applyStyle(piece, row[8]);
    pieces.push(piece);
  }
  if (pieces.length === 0) return null;
  const name =
    typeof obj.n === 'string' ? obj.n.replace(/[^\p{L}\p{N} '&.,-]/gu, '').trim().slice(0, MAX_NAME) : '';
  return { name: name || 'A shared look', pieces };
}

/** The shareable URL for a look (this page, with the look in the fragment). */
export function shareUrl(name: string, pieces: GarmentPiece[]): string {
  const base = location.href.split('#')[0].split('?')[0];
  return `${base}#${HASH_KEY}=${encodeLook(name, pieces)}`;
}

/** The look in the current URL, if any. */
export function lookFromLocation(): SharedLook | null {
  const m = /[#&]look=([A-Za-z0-9_-]+)/.exec(location.hash);
  return m ? decodeLook(m[1]) : null;
}

/** Remove the look from the address bar (so a reload does not re-apply it). */
export function clearLookFromLocation(): void {
  try {
    history.replaceState(null, '', location.href.split('#')[0]);
  } catch {
    /* ignore */
  }
}

/** A QR code for text, drawn as an SVG string (for the 2D page). */
export function qrSvg(text: string, cell = 4): string {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
