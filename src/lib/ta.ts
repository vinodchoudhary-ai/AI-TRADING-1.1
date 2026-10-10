import { atr, ema, type Candle } from "./indicators";

const nan = (n: number) => new Array<number>(n).fill(NaN);

export function sma(v: number[], p: number): number[] {
  const out = nan(v.length);
  let sum = 0;
  let bad = 0; // NaNs currently inside the window
  for (let i = 0; i < v.length; i++) {
    if (Number.isNaN(v[i])) bad++; else sum += v[i];
    if (i >= p) {
      if (Number.isNaN(v[i - p])) bad--; else sum -= v[i - p];
    }
    if (i >= p - 1 && bad === 0) out[i] = sum / p;
  }
  return out;
}

export function macd(v: number[], fast = 12, slow = 26, signalP = 9) {
  const ef = ema(v, fast);
  const es = ema(v, slow);
  const line = v.map((_, i) => ef[i] - es[i]);
  const first = line.findIndex((x) => !Number.isNaN(x));
  const signal = nan(v.length);
  if (first >= 0) {
    const s = ema(line.slice(first), signalP);
    s.forEach((x, j) => (signal[first + j] = x));
  }
  const hist = line.map((x, i) => x - signal[i]);
  return { line, signal, hist };
}

export function bollinger(v: number[], p = 20, k = 2) {
  const mid = sma(v, p);
  const upper = nan(v.length);
  const lower = nan(v.length);
  for (let i = p - 1; i < v.length; i++) {
    if (Number.isNaN(mid[i])) continue;
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / p);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}

/** Wilder's ADX with +DI / -DI. */
export function adx(c: Candle[], p = 14) {
  const n = c.length;
  const out = { adx: nan(n), plusDI: nan(n), minusDI: nan(n) };
  if (n <= 2 * p) return out;
  const tr = nan(n), pdm = nan(n), mdm = nan(n);
  for (let i = 1; i < n; i++) {
    const up = c[i].high - c[i - 1].high;
    const down = c[i - 1].low - c[i].low;
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
  }
  let sTr = 0, sP = 0, sM = 0;
  for (let i = 1; i <= p; i++) { sTr += tr[i]; sP += pdm[i]; sM += mdm[i]; }
  const dx = nan(n);
  const setDi = (i: number) => {
    const pi = sTr === 0 ? 0 : (100 * sP) / sTr;
    const mi = sTr === 0 ? 0 : (100 * sM) / sTr;
    out.plusDI[i] = pi;
    out.minusDI[i] = mi;
    dx[i] = pi + mi === 0 ? 0 : (100 * Math.abs(pi - mi)) / (pi + mi);
  };
  setDi(p);
  for (let i = p + 1; i < n; i++) {
    sTr = sTr - sTr / p + tr[i];
    sP = sP - sP / p + pdm[i];
    sM = sM - sM / p + mdm[i];
    setDi(i);
  }
  let a = 0;
  for (let i = p; i < 2 * p; i++) a += dx[i];
  a /= p;
  out.adx[2 * p - 1] = a;
  for (let i = 2 * p; i < n; i++) {
    a = (a * (p - 1) + dx[i]) / p;
    out.adx[i] = a;
  }
  return out;
}

export function stochastic(c: Candle[], kP = 14, dP = 3) {
  const k = nan(c.length);
  for (let i = kP - 1; i < c.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kP + 1; j <= i; j++) { hh = Math.max(hh, c[j].high); ll = Math.min(ll, c[j].low); }
    k[i] = hh === ll ? 50 : (100 * (c[i].close - ll)) / (hh - ll);
  }
  return { k, d: sma(k, dP) };
}

/** dir: 1 = up-trend (line is support below price), -1 = down-trend. */
export function supertrend(c: Candle[], p = 10, mult = 3) {
  const n = c.length;
  const a = atr(c, p);
  const line = nan(n);
  const dir = new Array<number>(n).fill(0);
  let fu = NaN, fl = NaN;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(a[i])) continue;
    const mid = (c[i].high + c[i].low) / 2;
    const bu = mid + mult * a[i];
    const bl = mid - mult * a[i];
    const prevClose = i > 0 ? c[i - 1].close : c[i].close;
    const prevDir = i > 0 ? dir[i - 1] : 0;
    const nfu = Number.isNaN(fu) || bu < fu || prevClose > fu ? bu : fu;
    const nfl = Number.isNaN(fl) || bl > fl || prevClose < fl ? bl : fl;
    let d = prevDir;
    if (d === 0) d = c[i].close >= mid ? 1 : -1;
    else if (c[i].close > fu) d = 1;
    else if (c[i].close < fl) d = -1;
    fu = nfu;
    fl = nfl;
    dir[i] = d;
    line[i] = d === 1 ? fl : fu;
  }
  return { line, dir };
}

export function obv(c: Candle[]): number[] {
  const out = nan(c.length);
  let acc = 0;
  for (let i = 0; i < c.length; i++) {
    if (i > 0) acc += c[i].close > c[i - 1].close ? c[i].volume : c[i].close < c[i - 1].close ? -c[i].volume : 0;
    out[i] = acc;
  }
  return out;
}

export const hasVolume = (c: Candle[]) => c.some((x) => x.volume > 0);

/** Session VWAP, restarting each UTC day. With no volume data it is a time-weighted average price. */
export function vwapDaily(c: Candle[]): number[] {
  const useVol = hasVolume(c);
  const out = nan(c.length);
  let day = -1, pv = 0, vv = 0;
  for (let i = 0; i < c.length; i++) {
    const d = Math.floor(c[i].time / 86400);
    if (d !== day) { day = d; pv = 0; vv = 0; }
    const w = useVol ? c[i].volume : 1;
    pv += ((c[i].high + c[i].low + c[i].close) / 3) * w;
    vv += w;
    out[i] = vv > 0 ? pv / vv : c[i].close;
  }
  return out;
}

/** Per-candle buy minus sell volume (needs a feed that reports taker-buy volume, e.g. Binance). */
export function volumeDelta(c: Candle[]): number[] {
  return c.map((x) => (x.buyVolume === undefined ? NaN : x.buyVolume - (x.volume - x.buyVolume)));
}
