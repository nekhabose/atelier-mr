/**
 * On-device body reading with MediaPipe Pose (Apache-2.0). The model and its
 * WebAssembly runtime are served from this site and loaded only when you add
 * a photo; the photo itself never leaves the device.
 *
 * scanPhoto(canvas): checks the photo is one person, head to feet, then reads
 * your proportions, skin and hair colour, hair length, and cuts your head and
 * hair out of the background (the person mask) for the form's face.
 */
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import {
  bodyWidth,
  checkFullBody,
  HairLength,
  hairLengthFrom,
  LM,
  medianColor,
  Pt,
  Rgb,
  ScanCheck,
  toHex,
} from './body-scan.js';

const MODEL = 'models/pose_landmarker_lite.task';
/** Longest side of the image the reading works on. */
export const SCAN_PX = 960;
const HEAD_PX = 512;
/** Head texture: the crop spans the head ellipsoid's height with this margin. */
const HEAD_FILL = 0.94;

let loading: Promise<PoseLandmarker> | null = null;
let mode: 'IMAGE' | 'VIDEO' = 'IMAGE';

/** Load (once) the pose model. Rejects when it cannot be loaded. */
export function loadPose(): Promise<PoseLandmarker> {
  loading ??= (async () => {
    const { PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = { wasmLoaderPath, wasmBinaryPath };
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: new URL(MODEL, document.baseURI).href, delegate },
      runningMode: 'IMAGE' as const,
      numPoses: 2,
      outputSegmentationMasks: true,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
    });
    mode = 'IMAGE';
    try {
      return await PoseLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      return await PoseLandmarker.createFromOptions(fileset, options('CPU'));
    }
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

async function useMode(pose: PoseLandmarker, next: 'IMAGE' | 'VIDEO'): Promise<void> {
  if (mode === next) return;
  await pose.setOptions({ runningMode: next, outputSegmentationMasks: next === 'IMAGE' });
  mode = next;
}

/** Live check of one camera frame (no mask): for the camera guide. */
export async function checkFrame(video: HTMLVideoElement, now: number): Promise<ScanCheck> {
  const pose = await loadPose();
  await useMode(pose, 'VIDEO');
  const res = pose.detectForVideo(video, now);
  const check = checkFullBody(res.landmarks as Pt[][], video.videoWidth / Math.max(1, video.videoHeight));
  res.close();
  return check;
}

export interface BodyProfile {
  /** Your head and hair cut out of the photo (data URL, transparent around). */
  head: string;
  skin: string;
  hair: string;
  hairLength: HairLength;
  /** Width scale for the form (1 = standard). */
  width: number;
}

export interface Scan {
  check: ScanCheck;
  profile?: BodyProfile;
}

/** Draw any image into a working canvas no larger than SCAN_PX. */
export function toScanCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const k = Math.min(1, SCAN_PX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Check and read a full-length photo. */
export async function scanPhoto(canvas: HTMLCanvasElement): Promise<Scan> {
  const pose = await loadPose();
  await useMode(pose, 'IMAGE');
  const res: PoseLandmarkerResult = pose.detect(canvas);
  try {
    const W = canvas.width;
    const H = canvas.height;
    const check = checkFullBody(res.landmarks as Pt[][], W / H);
    if (!check.ok) return { check };
    const lm = (res.landmarks[0] as Pt[]).map((p) => ({ ...p, x: p.x * W, y: p.y * H }));
    const maskObj = res.segmentationMasks?.[0];
    let mask: Float32Array | null = null;
    if (maskObj && maskObj.width === W && maskObj.height === H) mask = maskObj.getAsFloat32Array().slice();
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = ctx.getImageData(0, 0, W, H).data;

    const eyeL = lm[LM.leftEye];
    const eyeR = lm[LM.rightEye];
    const eyes = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 };
    const mouth = { x: (lm[LM.mouthLeft].x + lm[LM.mouthRight].x) / 2, y: (lm[LM.mouthLeft].y + lm[LM.mouthRight].y) / 2 };
    const nose = lm[LM.nose];
    const d = Math.max(3, mouth.y - eyes.y);
    const chinY = eyes.y + d * 1.75;
    const centerX = (nose.x + eyes.x) / 2;
    const shoulderY = (lm[LM.leftShoulder].y + lm[LM.rightShoulder].y) / 2;
    const eyeSpan = Math.max(4, Math.abs(eyeL.x - eyeR.x));
    const earSpan = Math.abs(lm[LM.leftEar].x - lm[LM.rightEar].x);
    const halfHead = Math.max(eyeSpan * 1.2, earSpan * 0.6);

    // Top of the hair: walk up the person mask above the eyes.
    let headTop = Math.max(0, eyes.y - d * 2.6);
    if (mask) {
      const cols = [-0.4, 0, 0.4].map((f) => Math.round(centerX + f * halfHead));
      let top = Math.round(eyes.y);
      for (let y = Math.round(eyes.y); y >= 0; y--) {
        if (cols.some((x) => x >= 0 && x < W && mask![y * W + x] >= 0.5)) top = y;
        else if (top - y > 3) break;
      }
      headTop = top;
      if (headTop <= 1) {
        return { check: { ok: false, problem: 'head-cut', message: 'The top of your head is cut off. Leave a little space above your head and include your feet.' } };
      }
    }

    // Skin: cheeks and nose bridge, between the eyes and the mouth.
    const skin =
      medianColor(rgba, W, H, { x: centerX - eyeSpan * 0.9, y: eyes.y + d * 0.25, w: eyeSpan * 1.8, h: d * 0.55 }, mask) ??
      ([214, 176, 138] as Rgb);
    // Hair: a band just under the top of the head.
    const hair =
      medianColor(rgba, W, H, { x: centerX - halfHead * 0.5, y: headTop + 2, w: halfHead, h: Math.max(3, (eyes.y - headTop) * 0.3) }, mask) ??
      skin;
    const hairLength = hairLengthFrom(rgba, W, H, mask, hair, skin, { centerX, chinY, shoulderY, halfHead });

    const head = cutHead(canvas, mask, { centerX, headTop, chinY });
    const width = bodyWidth((res.worldLandmarks[0] ?? []) as Pt[]);
    return { check, profile: { head, skin: toHex(skin), hair: toHex(hair), hairLength, width } };
  } finally {
    res.close();
  }
}

/**
 * Square crop of your head and hair, background removed (person mask), faded
 * out below the chin. The crop's height matches the form's head, top to chin.
 */
function cutHead(
  canvas: HTMLCanvasElement,
  mask: Float32Array | null,
  at: { centerX: number; headTop: number; chinY: number },
): string {
  const side = (at.chinY - at.headTop) / HEAD_FILL;
  const sx = at.centerX - side / 2;
  const sy = at.headTop - side * ((1 - HEAD_FILL) / 2);
  const out = document.createElement('canvas');
  out.width = HEAD_PX;
  out.height = HEAD_PX;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, sx, sy, side, side, 0, 0, HEAD_PX, HEAD_PX);
  if (mask) {
    const m = document.createElement('canvas');
    m.width = canvas.width;
    m.height = canvas.height;
    const mctx = m.getContext('2d')!;
    const img = mctx.createImageData(m.width, m.height);
    for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (mask[i] - 0.25) / 0.5)) * 255);
    mctx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(m, sx, sy, side, side, 0, 0, HEAD_PX, HEAD_PX);
  }
  // Fade out the neck and shoulders below the chin.
  ctx.globalCompositeOperation = 'destination-in';
  const chin = ((at.chinY - sy) / side) * HEAD_PX;
  const fade = ctx.createLinearGradient(0, chin - HEAD_PX * 0.03, 0, chin + HEAD_PX * 0.04);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, HEAD_PX, HEAD_PX);
  ctx.globalCompositeOperation = 'source-over';
  const webp = out.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : out.toDataURL('image/png');
}
