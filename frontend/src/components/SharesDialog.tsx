import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { StreamOut } from "../api/types";
import { evenSplit, maxFor, rebalance } from "../lib/shares";
import { Button, Dialog, IconButton, IconLock, IconUnlock, cx } from "./ui";

// Различимые цвета сегментов; по кругу, если офферов больше
const COLORS = ["#4b9a51", "#3d87c7", "#8cc590", "#86b6e0", "#2f6f34", "#28608f"];
const colorAt = (i: number) => COLORS[i % COLORS.length];

interface Props {
  open: boolean;
  stream: StreamOut;
  busy: boolean;
  onClose: () => void;
  onSave: (shares: { offer_id: number; share: number }[], pinned: number[]) => void;
}

/** Модалка распределения трафика: слайдеры с автоматическим пропорциональным пересчётом. */
export default function SharesDialog({ open, stream, busy, onClose, onSave }: Props) {
  const offers = useMemo(() => stream.offers.filter((o) => o.status === "active"), [stream.offers]);
  const initial = offers.map((o) => o.share);
  const [shares, setShares] = useState<number[]>(initial);
  const [locked, setLocked] = useState<boolean[]>(() => offers.map((o) => o.pinned));

  // каждое открытие начинаем с актуальных долей потока
  useEffect(() => {
    if (open) {
      setShares(offers.map((o) => o.share));
      setLocked(offers.map((o) => o.pinned));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (i: number, v: number) => setShares((cur) => rebalance(cur, i, v, locked));
  const toggleLock = (i: number) => setLocked((cur) => cur.map((x, j) => (j === i ? !x : x)));
  const changed = shares.some((s, i) => s !== initial[i]) || locked.some((l, i) => l !== offers[i].pinned);
  const freeCount = locked.filter((l) => !l).length;

  return (
    <Dialog
      open={open} onClose={onClose} size="lg" title="Распределение трафика"
      footer={
        <>
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setShares(evenSplit(offers.length))}>Поровну</Button>
          <Button variant="ghost" size="sm" disabled={!changed} onClick={() => { setShares(initial); setLocked(offers.map((o) => o.pinned)); }}>Сбросить</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Отмена</Button>
          <Button
            size="sm" disabled={!changed} loading={busy}
            onClick={() => onSave(offers.map((o, i) => ({ offer_id: o.offer_id, share: shares[i] })), offers.filter((_, i) => locked[i]).map((o) => o.offer_id))}
          >Сохранить</Button>
        </>
      }
    >
      <p>Двигайте слайдер — остальные офферы пересчитаются пропорционально. Замок закрепляет долю оффера. Изменения сохраняются как черновик — в Keitaro они уйдут после публикации.</p>

      {/* Сводная полоса: сумма всегда 100% */}
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-fill" role="img" aria-label={offers.map((o, i) => `${o.name}: ${shares[i]}%`).join(", ")}>
        {offers.map((o, i) => (
          <div
            key={o.offer_id} title={`${o.name}: ${shares[i]}%`}
            className="h-full transition-[width] duration-150 first:rounded-l-full last:rounded-r-full"
            style={{ width: `${shares[i]}%`, background: colorAt(i) }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-right text-xs font-medium text-ok">Сумма 100%</p>

      <ul className="mt-2 divide-y divide-line">
        {offers.map((o, i) => {
          const cap = maxFor(shares, i, locked);
          const fixed = locked[i] || freeCount <= 1;
          return (
            <li key={o.offer_id} className="py-3.5">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: colorAt(i) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={o.name}>{o.name}</p>
                  <p className="text-xs text-ink-3">
                    <span className="font-mono">#{o.offer_id}</span>
                    {shares[i] !== initial[i] && <> · было {initial[i]}%</>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number" inputMode="numeric" min={0} max={cap} step={1}
                    aria-label={`Доля оффера ${o.name}, %`} disabled={fixed}
                    className="no-spin h-8 w-14 rounded-control border border-line-strong bg-surface text-center text-sm font-semibold text-ink tabular-nums focus:border-accent disabled:bg-bg disabled:text-ink-2"
                    value={shares[i]}
                    onChange={(e) => e.target.value !== "" && set(i, Number(e.target.value))}
                  />
                  <span className="w-3 text-sm text-ink-2">%</span>
                </div>
                <IconButton
                  label={locked[i] ? "Открепить долю" : "Закрепить долю"} size="sm" variant="ghost"
                  aria-pressed={locked[i]} onClick={() => toggleLock(i)}
                  className={cx(locked[i] && "bg-accent-soft text-accent-strong hover:bg-accent-soft hover:text-accent-strong")}
                >
                  {locked[i] ? <IconLock className="size-4" /> : <IconUnlock className="size-4" />}
                </IconButton>
              </div>
              <input
                type="range" min={0} max={100} step={1} value={shares[i]} disabled={fixed}
                aria-label={`Слайдер доли оффера ${o.name}`} aria-valuetext={`${shares[i]}%`}
                onChange={(e) => set(i, Number(e.target.value))}
                className="share-range mt-3 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                style={{ "--c": colorAt(i), "--p": `${shares[i]}%` } as CSSProperties}
              />
            </li>
          );
        })}
      </ul>
      {freeCount <= 1 && offers.length > 1 && (
        <p className="mt-1 text-xs text-warn">Открепите хотя бы два оффера, чтобы перераспределять доли.</p>
      )}
    </Dialog>
  );
}
