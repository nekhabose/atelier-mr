/**
 * Free-form tailoring, on the device: turns plain words ("make the dress midi
 * with long sleeves", "red satin skirt", "sleeveless") into the same garment
 * edits the stylist uses. Anything it cannot read goes to the live AI tailor
 * (/api/stylist mode "tailor"); clear requests are applied instantly here.
 */
import { COLOR_KEYS, KEEP, LENGTHS, MATERIAL_KEYS, PieceEdit, RefineReply, SLEEVES, StylistItem } from './stylist-contract.js';

type Length = (typeof LENGTHS)[number];
type Sleeves = (typeof SLEEVES)[number];
type Kind = StylistItem['kind'];

const LENGTH_WORDS: [RegExp, Length][] = [
  [/\b(floor|maxi|full length|gown)\b/, 'floor'],
  [/\bankle\b/, 'ankle'],
  [/\b(midi|mid calf|calf)\b/, 'midi'],
  [/\b(knee|knee length)\b/, 'knee'],
  [/\bmini\b/, 'mini'],
  [/\b(crop|cropped)\b/, 'cropped'],
  [/\b(hip|hip length)\b/, 'hip'],
];
const SLEEVE_WORDS: [RegExp, Sleeves][] = [
  [/\b(sleeveless|no sleeves?|without sleeves|bare arms?|strapless)\b/, 'none'],
  [/\b(three quarter|3 4|elbow)( length)?( sleeves?)?\b/, 'elbow'],
  [/\b(short sleeves?|short sleeved|t shirt sleeves?)\b/, 'short'],
  [/\b(long sleeves?|long sleeved|full sleeves?)\b/, 'long'],
];
const COLOR_WORDS: Record<string, (typeof COLOR_KEYS)[number]> = {
  white: 'white', ivory: 'cream', cream: 'cream', beige: 'camel', camel: 'camel', tan: 'camel', brown: 'camel',
  pink: 'pink', blush: 'pink', rose: 'pink', red: 'red', burgundy: 'red', wine: 'red', scarlet: 'red',
  green: 'green', olive: 'green', emerald: 'green', sage: 'green', blue: 'blue', sky: 'blue', cobalt: 'blue',
  navy: 'navy', grey: 'grey', gray: 'grey', charcoal: 'grey', black: 'black',
};
const MATERIAL_WORDS: Record<string, (typeof MATERIAL_KEYS)[number]> = {
  cotton: 'cotton', linen: 'cotton', satin: 'satin', silk: 'satin', silky: 'satin', knit: 'knit', knitted: 'knit',
  sweater: 'knit', jumper: 'knit', wool: 'wool', woollen: 'wool', tweed: 'wool', denim: 'denim',
  jean: 'denim', jeans: 'denim', striped: 'stripe', stripes: 'stripe', stripe: 'stripe', check: 'check',
  checked: 'check', gingham: 'check', plaid: 'plaid', tartan: 'plaid', dots: 'dots', dotted: 'dots',
  polka: 'dots', floral: 'floral', flowers: 'floral', flowery: 'floral',
};
const KIND_WORDS: [RegExp, Kind][] = [
  [/\b(jacket|blazer|coat)\b/, 'jacket'],
  [/\bdress\b/, 'dress'],
  [/\bskirt\b/, 'skirt'],
  [/\b(trousers?|pants|jeans|slacks)\b/, 'trousers'],
  [/\b(top|shirt|blouse|tee|t shirt|sweater|jumper)\b/, 'top'],
];

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Edits for the instruction, or null when nothing in it is recognised (then
 * the live AI tailor is asked).
 */
export function planTailorOffline(instruction: string, outfit: StylistItem[]): RefineReply | null {
  const text = normalise(instruction);
  if (!text || outfit.length === 0) return null;
  const length = LENGTH_WORDS.find(([re]) => re.test(text))?.[1];
  const sleeves = SLEEVE_WORDS.find(([re]) => re.test(text))?.[1];
  const words = text.split(' ');
  const color = words.map((w) => COLOR_WORDS[w]).find(Boolean);
  const material = words.map((w) => MATERIAL_WORDS[w]).find((m) => m && !/^(jean|jeans|sweater|jumper)$/.test(m));
  const named = KIND_WORDS.find(([re]) => re.test(text))?.[1];
  if (!length && !sleeves && !color && !material) return null;

  const byKind = (k: Kind) => outfit.find((i) => i.kind === k);
  const main = byKind('dress') ?? byKind('top') ?? outfit[0];
  const bottom = byKind('dress') ?? byKind('skirt') ?? byKind('trousers');
  const sleeved = byKind('jacket') ?? byKind('top') ?? byKind('dress');
  const target = named ? byKind(named) : undefined;
  if (named && !target) return { summary: `There is no ${named} on the form to change.`, addItemId: '', edits: [] };

  const edits = new Map<string, PieceEdit>();
  const edit = (item: StylistItem | undefined): PieceEdit | undefined => {
    if (!item) return undefined;
    let e = edits.get(item.id);
    if (!e) {
      e = { piece: item.id, length: KEEP, sleeves: KEEP, material: KEEP, color: KEEP };
      edits.set(item.id, e);
    }
    return e;
  };
  const said: string[] = [];
  if (length) {
    const short = length === 'cropped' || length === 'hip';
    const item = target ?? (short ? byKind('top') ?? byKind('jacket') : bottom);
    const e = edit(item);
    if (e) {
      e.length = length;
      said.push(`${length} length on the ${item!.kind}`);
    }
  }
  if (sleeves) {
    const item = target && target.kind !== 'skirt' && target.kind !== 'trousers' ? target : sleeved;
    const e = edit(item);
    if (e) {
      e.sleeves = sleeves;
      said.push(sleeves === 'none' ? `no sleeves on the ${item!.kind}` : `${sleeves} sleeves on the ${item!.kind}`);
    }
  }
  if (color || material) {
    const item = target ?? main;
    const e = edit(item);
    if (e) {
      if (color) e.color = color;
      if (material) e.material = material;
      said.push(`${[color, material].filter(Boolean).join(' ')} for the ${item!.kind}`);
    }
  }
  if (edits.size === 0) return null;
  return {
    summary: `Tailored: ${said.join(', ')}.`,
    addItemId: '',
    edits: [...edits.values()],
  };
}
