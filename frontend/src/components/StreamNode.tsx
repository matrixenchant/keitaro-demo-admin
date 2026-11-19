import { useState } from "react";
import type { FilterOut, OfferRef, Stats, StreamOfferOut, StreamOut } from "../api/types";
import OfferAutocomplete from "./OfferAutocomplete";
import SharesDialog from "./SharesDialog";
import {
  Badge, Button, Dialog, IconArrowRight, IconButton, IconChevron, IconLock, IconPlus, IconSliders, IconTrash, IconUndo,
  IconUnlock, Tooltip, countryName, cx, fmtNum, plural,
} from "./ui";

const FILTER_LABEL: Record<string, string> = { country: "Страна", device_type: "Устройство", ip: "IP", user_agent: "User-Agent" };

export function describeFilter(f: FilterOut): string {
  const label = FILTER_LABEL[f.name] ?? f.name;
  const v = Array.isArray(f.payload) ? f.payload.join(", ") : f.payload == null ? "" : typeof f.payload === "object" ? JSON.stringify(f.payload) : String(f.payload);
  return f.mode === "reject" ? `${label} — кроме: ${v}` : `${label}: ${v}`;
}

/** «Страна: AU, MX» — у каждого кода подсказка с названием страны. */
function CountryFilter({ f }: { f: FilterOut }) {
  const codes = (f.payload as unknown[]).map(String);
  return (
    <>
      {FILTER_LABEL.country}{f.mode === "reject" ? " — кроме" : ""}:&nbsp;
      {codes.map((c, i) => (
        <span key={c} className="inline-flex">
          <Tooltip text={countryName(c)} align="start">
            <span tabIndex={0} aria-label={countryName(c)} className="cursor-help underline decoration-dotted decoration-ink-3 underline-offset-2">{c}</span>
          </Tooltip>
          {i < codes.length - 1 && <span className="mr-1">,</span>}
        </span>
      ))}
    </>
  );
}

const STAT_LABELS: [keyof Stats, string][] = [["clicks", "клики"], ["unique", "уник."], ["bots", "боты"]];
export const StatsLine = ({ s, className = "" }: { s: Stats; className?: string }) => (
  <span className={cx("inline-flex flex-wrap gap-x-3 text-xs text-ink-2", className)}>
    {STAT_LABELS.map(([k, l]) => (
      <span key={k} className="whitespace-nowrap">{l} <b className="font-semibold text-ink">{fmtNum(s[k])}</b></span>
    ))}
  </span>
);

interface Props {
  stream: StreamOut;
  busy: boolean;
  onAdd: (offerId: number) => void;
  onRemove: (offerId: number) => void;
  onRestore: (offerId: number) => void;
  onPin: (offerId: number, pinned: boolean) => void;
  onSaveShares: (shares: { offer_id: number; share: number }[], pinned: number[]) => void;
  onPublish: () => void;
  onDiscard: () => void;
  /** статистика устарела (идёт загрузка другого периода) */
  statsStale?: boolean;
}

/** Строка списка изменений в окне публикации. */
function changeLine(o: StreamOfferOut): { sign: string; text: string; cls: string } | null {
  if (o.pending === "added") return { sign: "+", text: `${o.name} — ${o.share}%`, cls: "text-ok" };
  if (o.pending === "removed") return { sign: "−", text: o.name, cls: "text-danger" };
  if (o.pending === "changed") return { sign: "~", text: `${o.name}: ${o.published_share}% → ${o.share}%`, cls: "text-ink" };
  return null;
}

export default function StreamNode({ stream: s, busy, onAdd, onRemove, onRestore, onPin, onSaveShares, onPublish, onDiscard, statsStale }: Props) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<OfferRef | null>(null);
  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const dim = statsStale ? "opacity-40" : "";
  const active = s.offers.filter((o) => o.status === "active");
  // активные и «удалены в черновике, но ещё есть в Keitaro»
  const visible = s.offers.filter((o) => o.status === "active" || o.published);
  const archived = s.offers.filter((o) => o.status === "removed" && !o.published);
  const changes = s.offers.map(changeLine).filter((x): x is NonNullable<typeof x> => x !== null);
  const dirty = s.dirty;

  return (
    <section
      className={cx("rounded-card bg-surface shadow-card", dirty && "ring-2 ring-amber-300 shadow-[inset_4px_0_0_0_#f59e0b]")}
      aria-label={`Поток ${s.name || s.id}`}
    >
      <header className={cx("p-4 sm:p-5", dirty && "rounded-t-card bg-warn-soft/60")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <h3 className="min-w-0 text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">{s.name || `Поток ${s.id}`}</h3>
          <Badge>{s.type}</Badge>
          {s.state && s.state !== "active" && <Badge tone="amber">{s.state}</Badge>}
          {dirty && <Badge tone="amber">Не опубликовано</Badge>}
          {s.kt_drift && <Badge tone="blue" title="Офферы или доли этого потока изменились прямо в Keitaro">изменён в Keitaro</Badge>}
          {!s.editable && (
            <Tooltip text="Этот поток здесь не редактируется" className="ml-auto">
              <span tabIndex={0} role="img" aria-label="Только чтение" className="flex size-7 items-center justify-center rounded-full bg-fill text-ink-2">
                <IconLock className="size-3.5" />
              </span>
            </Tooltip>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {s.filters.length === 0 ? (
            <span className="text-[13px] text-ink-2">Без фильтров — весь остальной трафик</span>
          ) : (
            s.filters.map((f, i) => (
              <span key={i} className={cx("inline-flex min-h-[26px] items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium [overflow-wrap:anywhere]", f.mode === "reject" ? "bg-danger-soft text-danger-strong" : "bg-fill text-ink")}>
                {f.name === "country" && Array.isArray(f.payload) ? <CountryFilter f={f} /> : describeFilter(f)}
              </span>
            ))
          )}
        </div>

        {!s.editable && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-bg px-3 py-2 text-[13px] text-ink-2">
            <IconArrowRight className="mt-0.5 size-4" />
            <span className="min-w-0">
              {s.action_payload ? <>Редирект на <span className="break-all font-mono text-xs font-medium text-ink">{s.action_payload}</span></> : s.schema || "—"}
            </span>
          </p>
        )}

        <StatsLine s={s.stats} className={cx("mt-3 transition-opacity duration-200", dim)} />
      </header>

      {s.editable && (
        <div className="border-t border-line">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
            <p className="text-[13px] font-medium text-ink-2">Офферы и доли трафика</p>
            <p className="text-xs text-ink-2">{active.length} шт.</p>
          </div>

          {visible.length === 0 && <p className="px-4 py-4 text-sm text-ink-2 sm:px-5">В потоке пока нет офферов.</p>}

          <ul className="divide-y divide-line px-4 sm:px-5">
            {visible.map((o) => {
              const gone = o.status === "removed";
              return (
                <li key={o.offer_id} className="py-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="flex min-w-0 items-center gap-2">
                        <span className={cx("truncate text-sm font-medium", gone && "text-ink-3 line-through")} title={o.name}>{o.name}</span>
                        {o.pending === "added" && <Badge tone="green" className="h-[18px]! px-1.5! text-[11px]!">новый</Badge>}
                        {o.pending === "changed" && <Badge tone="amber" className="h-[18px]! px-1.5! text-[11px]!">изменено</Badge>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-2">
                        <span className="font-mono">#{o.offer_id}</span>
                        {o.pending === "changed" && <span>было {o.published_share}%</span>}
                        {gone && <span>уйдёт из Keitaro при публикации</span>}
                        {!o.accessible && (
                          <Tooltip text="Оффер существует в Keitaro, но API-ключ не может прочитать его данные — название неизвестно" align="start">
                            <span tabIndex={0}><Badge className="h-[18px]! px-1.5! text-[11px]!">нет доступа</Badge></span>
                          </Tooltip>
                        )}
                        {o.state && o.state !== "active" && <span className="text-warn">{o.state}</span>}
                        <StatsLine s={o.stats} className={cx("transition-opacity duration-200", dim)} />
                      </p>
                    </div>
                    <span className={cx("w-12 text-right text-[15px] font-semibold", gone && "text-ink-3")}>{o.share}%</span>
                    {gone ? (
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRestore(o.offer_id)}><IconUndo className="size-4" /> Вернуть</Button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Tooltip text="Закрепить долю — при пересчёте не изменится">
                          <IconButton
                            label={o.pinned ? `Открепить долю оффера ${o.name}` : `Закрепить долю оффера ${o.name}`} title="" variant="ghost" size="sm"
                            aria-pressed={o.pinned} disabled={busy} onClick={() => onPin(o.offer_id, !o.pinned)}
                            className={cx(o.pinned && "bg-accent-soft text-accent-strong hover:bg-accent-soft hover:text-accent-strong")}
                          >{o.pinned ? <IconLock className="size-4" /> : <IconUnlock className="size-4" />}</IconButton>
                        </Tooltip>
                        <Tooltip text={active.length <= 1 ? "Нельзя удалить последний оффер" : "Удалить оффер"}>
                          <IconButton
                            label={`Удалить оффер ${o.name}`} title="" variant="danger" size="sm"
                            disabled={busy || active.length <= 1} onClick={() => onRemove(o.offer_id)}
                          ><IconTrash className="size-4" /></IconButton>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-fill" role="img" aria-label={`Доля ${o.share}%`}>
                    <div className={cx("h-full rounded-full transition-[width] duration-300", gone ? "bg-ink-3/40" : "bg-brand-soft")} style={{ width: `${o.share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          {archived.length > 0 && (
            <div className="border-t border-line px-4 py-2 sm:px-5">
              <button
                type="button" aria-expanded={archiveOpen} onClick={() => setArchiveOpen((v) => !v)}
                className="flex h-8 items-center gap-1.5 rounded-lg text-[13px] font-medium text-ink-2 transition hover:text-ink"
              >
                <IconChevron className={cx("size-4 transition-transform", !archiveOpen && "-rotate-90")} /> Архив ({archived.length})
              </button>
              {archiveOpen && (
                <ul className="divide-y divide-line">
                  {archived.map((o) => (
                    <li key={o.offer_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-sm font-medium text-ink-3" title={o.name}>{o.name}</p>
                        <p className="mt-0.5 flex items-center gap-x-3 text-xs text-ink-3"><span className="font-mono">#{o.offer_id}</span><span>Удалён</span></p>
                      </div>
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRestore(o.offer_id)}><IconUndo className="size-4" /> Вернуть</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {dirty && (
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-amber-200 bg-warn-soft/95 px-4 py-3 backdrop-blur sm:px-5">
              <Button size="sm" disabled={busy} onClick={() => setPublishing(true)}>Опубликовать в Keitaro</Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={onDiscard}>Отменить изменения</Button>
              <span className="text-xs text-warn">{changes.length} {plural(changes.length, ["изменение", "изменения", "изменений"])}</span>
            </div>
          )}

          {adding ? (
            <div className="flex flex-wrap items-start gap-2 rounded-b-card border-t border-line bg-bg/60 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 basis-56">
                <OfferAutocomplete autoFocus value={picked} onChange={setPicked} exclude={active.map((o) => o.offer_id)} />
              </div>
              <Button disabled={!picked || busy} onClick={() => { onAdd(picked!.id); setPicked(null); setAdding(false); }}>Добавить</Button>
              <Button variant="secondary" onClick={() => { setAdding(false); setPicked(null); }}>Отмена</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-b-card border-t border-line bg-bg/60 px-4 py-3 sm:px-5">
              <Button variant="secondary" size="sm" loading={busy} onClick={() => setAdding(true)}>{!busy && <IconPlus className="size-4" />} Добавить оффер</Button>
              <Button variant="ghost" size="sm" disabled={busy || !active.length} onClick={() => setEditing(true)}><IconSliders className="size-4" /> Изменить доли</Button>
              <p className="basis-full text-xs text-ink-2 sm:ml-auto sm:max-w-xs sm:basis-auto sm:text-right">Изменения сохраняются как черновик и уходят в Keitaro только после публикации.</p>
            </div>
          )}
          <SharesDialog
            open={editing} stream={s} busy={busy} onClose={() => setEditing(false)}
            onSave={(shares, pinned) => { onSaveShares(shares, pinned); setEditing(false); }}
          />
          <Dialog
            open={publishing} onClose={() => setPublishing(false)} title="Опубликовать изменения в Keitaro?"
            footer={
              <>
                <Button variant="secondary" onClick={() => setPublishing(false)}>Отмена</Button>
                <Button data-autofocus onClick={() => { setPublishing(false); onPublish(); }}>Опубликовать</Button>
              </>
            }
          >
            <p>Поток «{s.name || s.id}» будет обновлён в Keitaro:</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {changes.map((c, i) => (
                <li key={i} className={cx("flex gap-2", c.cls)}>
                  <span className="w-3 shrink-0 text-center font-semibold">{c.sign}</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{c.text}</span>
                </li>
              ))}
            </ul>
          </Dialog>
        </div>
      )}
    </section>
  );
}

/** Тонкая соединительная линия между блоками схемы. */
export const Connector = () => <div aria-hidden className="ml-7 h-5 w-px bg-black/15" />;
