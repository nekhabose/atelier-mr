/**
 * Real local weather for the morning routine, from Open-Meteo (free, no key).
 * Only a rough location is sent: latitude and longitude rounded to 0.1 degree
 * (about 10 km). The forecast is cached on the device for the day.
 *
 * The mapping to the stylist's four kinds of weather is pure and tested.
 */
import type { Weather } from './stylist-contract.js';

export interface DayForecast {
  /** Local date, YYYY-MM-DD. */
  date: string;
  weather: Weather;
  /** Daily high and low, degrees C. */
  max: number;
  min: number;
  /** Highest chance of rain in the day, percent. */
  rain: number;
  /** WMO weather code. */
  code: number;
}

export interface Forecast {
  /** Local date the forecast was fetched. */
  fetched: string;
  days: DayForecast[];
}

/** WMO codes for drizzle, rain, showers and thunder. */
function isWet(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

/** WMO codes for snow. */
function isSnow(code: number): boolean {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

/**
 * Dress for the day's high, unless rain is likely: rain wins (a coat and
 * shoes that cope), snow counts as cold.
 */
export function weatherFor(code: number, max: number, rain: number): Weather {
  if (isSnow(code)) return 'cold';
  if (rain >= 55 || (isWet(code) && rain >= 35)) return 'rainy';
  if (max >= 22) return 'warm';
  if (max <= 12) return 'cold';
  return 'mild';
}

/** "9°C, rain likely" */
export function describeDay(d: DayForecast): string {
  const t = `${Math.round(d.max)}°C`;
  if (isSnow(d.code)) return `${t}, snow`;
  if (d.weather === 'rainy') return `${t}, rain likely`;
  if (d.rain >= 30) return `${t}, maybe showers`;
  if (d.code <= 1) return `${t}, clear`;
  if (d.code <= 3) return `${t}, some cloud`;
  return `${t}, dry`;
}

/** Open-Meteo request for a rounded location: a week of daily forecasts. */
export function forecastUrl(lat: number, lon: number): string {
  const r = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  return (
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${r(lat)}&longitude=${r(lon)}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=7'
  );
}

interface OpenMeteoDaily {
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
}

/** Parse an Open-Meteo response; days with missing values are skipped. */
export function parseForecast(json: unknown, fetched: string): Forecast | null {
  const d = (json as OpenMeteoDaily | null)?.daily;
  if (!d || !Array.isArray(d.time)) return null;
  const days: DayForecast[] = [];
  d.time.forEach((date, i) => {
    const code = d.weather_code?.[i];
    const max = d.temperature_2m_max?.[i];
    const min = d.temperature_2m_min?.[i];
    const rain = d.precipitation_probability_max?.[i] ?? 0;
    if (typeof date !== 'string' || typeof code !== 'number' || typeof max !== 'number' || typeof min !== 'number') return;
    days.push({ date, code, max, min, rain, weather: weatherFor(code, max, rain) });
  });
  return days.length > 0 ? { fetched, days } : null;
}

const KEY = 'atelier.weather.v1';

export function loadForecast(): Forecast | null {
  try {
    const f = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Forecast | null;
    return f && Array.isArray(f.days) ? f : null;
  } catch {
    return null;
  }
}

export function saveForecast(f: Forecast | null): void {
  try {
    if (f) localStorage.setItem(KEY, JSON.stringify(f));
    else localStorage.removeItem(KEY);
  } catch {
    /* fine for this visit */
  }
}

/** Ask the browser for a rough position (prompts the first time). */
export function roughPosition(timeoutMs = 10000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, maximumAge: 6 * 3600 * 1000, timeout: timeoutMs },
    );
  });
}

/** Fetch the week's forecast for a rough position. */
export async function fetchForecast(lat: number, lon: number, today: string): Promise<Forecast | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(forecastUrl(lat, lon), { signal: ctrl.signal });
    if (!res.ok) return null;
    return parseForecast(await res.json(), today);
  } finally {
    clearTimeout(timer);
  }
}
