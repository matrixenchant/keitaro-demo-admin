/** Целые доли, в сумме ровно 100: остаток раздаём первым (3 → 34/33/33). */
export function evenSplit(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n), rest = 100 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Делит `total` на целые части по весам методом наибольшего остатка (сумма = total). */
function apportion(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  const w = sumW > 0 ? weights : weights.map(() => 1); // все веса нулевые → поровну
  const s = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (total * x) / s);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/** Максимум, который можно выставить оферу `idx`: всё, что не занято закреплёнными. */
export function maxFor(shares: number[], idx: number, locked: boolean[]): number {
  const lockedSum = shares.reduce((a, s, j) => (j !== idx && locked[j] ? a + s : a), 0);
  return 100 - lockedSum;
}

/**
 * Выставляет офферу `idx` долю `value`, остальные незакреплённые
 * пересчитываются пропорционально своим текущим долям. Сумма всегда 100.
 */
export function rebalance(shares: number[], idx: number, value: number, locked: boolean[]): number[] {
  const free = shares.map((_, j) => j).filter((j) => j !== idx && !locked[j]);
  const cap = maxFor(shares, idx, locked);
  // некуда перераспределять — доля этого оффера фиксирована остальными
  const v = free.length ? Math.max(0, Math.min(cap, Math.round(value))) : cap;
  const parts = apportion(cap - v, free.map((j) => shares[j]));
  const next = [...shares];
  next[idx] = v;
  free.forEach((j, k) => (next[j] = parts[k]));
  return next;
}
