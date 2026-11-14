/**
 * Speech in and out, both optional and feature-detected.
 *
 * Read aloud uses speechSynthesis. Voice commands use the browser's speech
 * recognition (webkitSpeechRecognition / SpeechRecognition). Neither is
 * guaranteed on every browser or headset, so callers check `canSpeak` /
 * `canListen` and the UI says so when a feature is missing.
 */
import { access } from './access.js';

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

const g = globalThis as unknown as {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export const canSpeak = !!g.speechSynthesis && !!g.SpeechSynthesisUtterance;
const RecognitionCtor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
export const canListen = !!RecognitionCtor;

let pending = '';
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSpoken = '';

/**
 * Queue text to be read aloud (when Read aloud is on). Several updates in the
 * same moment (title, note, hint) are joined into one utterance.
 */
export function say(text: string, opts: { force?: boolean } = {}): void {
  if (!canSpeak || (!access.settings.readAloud && !opts.force)) return;
  const clean = text.replace(/\s*\|\s*/g, '. ').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  pending = pending ? `${pending}. ${clean}` : clean;
  clearTimeout(timer);
  timer = setTimeout(flush, 220);
}

function flush(): void {
  const text = pending;
  pending = '';
  if (!text || text === lastSpoken || !g.speechSynthesis || !g.SpeechSynthesisUtterance) return;
  lastSpoken = text;
  try {
    g.speechSynthesis.cancel();
    const u = new g.SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    g.speechSynthesis.speak(u);
  } catch {
    /* speech unavailable */
  }
}

export function stopSpeaking(): void {
  pending = '';
  clearTimeout(timer);
  try {
    g.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

/** A spoken command and what it does. */
export interface VoiceCommand {
  /** Words or phrases that trigger it (lower case). */
  phrases: string[];
  run: () => void;
}

/**
 * Continuous listening that matches each final phrase against the commands.
 * Restarts itself when the browser ends recognition, until stopped.
 */
export class VoiceControl {
  private rec?: Recognition;
  private active = false;
  heard = '';

  constructor(
    private commands: VoiceCommand[],
    private onHeard: (phrase: string, matched: boolean) => void,
  ) {}

  get listening(): boolean {
    return this.active;
  }

  start(): boolean {
    if (!RecognitionCtor || this.active) return this.active;
    try {
      const rec = new RecognitionCtor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) this.handle(r[0].transcript);
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.stop();
      };
      rec.onend = () => {
        if (!this.active) return;
        try {
          rec.start();
        } catch {
          this.active = false;
        }
      };
      rec.start();
      this.rec = rec;
      this.active = true;
    } catch {
      this.active = false;
    }
    return this.active;
  }

  stop(): void {
    this.active = false;
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    this.rec = undefined;
  }

  /** Match a phrase (exposed for scripted checks). */
  handle(transcript: string): boolean {
    const text = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    this.heard = text;
    // Longest phrase first, so "style me" wins over "me".
    let best: { cmd: VoiceCommand; len: number } | null = null;
    for (const cmd of this.commands) {
      for (const p of cmd.phrases) {
        if ((` ${text} `).includes(` ${p} `) && (!best || p.length > best.len)) best = { cmd, len: p.length };
      }
    }
    this.onHeard(text, !!best);
    best?.cmd.run();
    return !!best;
  }
}
