import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { CampaignDetail, ChangeOut, Interval } from "../api/types";
import CopyButton from "../components/CopyButton";
import { DnsStatus, OpenLink } from "../components/LinkStatus";
import StreamNode, { Connector } from "../components/StreamNode";
import { useToast } from "../components/Toast";
import {
  Alert, Badge, Button, Card, Dialog, EmptyState, ErrorState, IconButton, IconChevronRight, IconClock, IconLink, IconLock,
  IconMinus, IconPlus, IconRefresh, IconSearch, IconSliders, IconUndo, IconUnlock, IconUpload, IconX, PeriodSelect, Skeleton, StatCard, StatusPill,
  buttonCls, cx, fmtDate, fmtNum, fmtRelative, intervalLabel,
  IconAlert,
} from "../components/ui";

const AUTO_REFRESH_MS = 45_000;

const ACTIONS: Record<string, { label: string; icon: ReactNode; tone: string }> = {
  add: { label: "Добавлен оффер", icon: <IconPlus className="size-3.5" />, tone: "bg-ok-soft text-ok" },
  remove: { label: "Удалён оффер", icon: <IconMinus className="size-3.5" />, tone: "bg-danger-soft text-danger-strong" },
  restore: { label: "Возвращён оффер", icon: <IconUndo className="size-3.5" />, tone: "bg-ok-soft text-ok" },
  pin: { label: "Закреплена доля", icon: <IconLock className="size-3.5" />, tone: "bg-accent-soft text-accent-strong" },
  unpin: { label: "Откреплена доля", icon: <IconUnlock className="size-3.5" />, tone: "bg-fill text-ink-2" },
  set_shares: { label: "Доли изменены", icon: <IconSliders className="size-3.5" />, tone: "bg-accent-soft text-accent-strong" },
  publish: { label: "Опубликовано в Keitaro", icon: <IconUpload className="size-3.5" />, tone: "bg-info-soft text-info" },
  discard: { label: "Черновик отменён", icon: <IconX className="size-3.5" />, tone: "bg-warn-soft text-warn" },
  sync: { label: "Синхронизация", icon: <IconRefresh className="size-3.5" />, tone: "bg-info-soft text-info" },
};
const UNKNOWN_ACTION = { icon: <IconClock className="size-3.5" />, tone: "bg-fill text-ink-2" };

function Breadcrumb({ name }: { name?: string }) {
  return (
    <nav aria-label="Навигация" className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
      <Link to="/" className="shrink-0 rounded-sm font-medium transition hover:text-ink">Кампании</Link>
      <IconChevronRight className="size-3.5 text-ink-3" />
      {name ? <span aria-current="page" className="min-w-0 truncate text-ink">{name}</span> : <Skeleton className="h-4 w-40" />}
    </nav>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-5" aria-busy aria-label="Загрузка кампании">
      <Breadcrumb />
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <Skeleton className="h-7 w-3/5" />
            <Skeleton className="mt-3 h-4 w-4/5 max-w-md" />
          </div>
          <Skeleton className="h-10 w-52 rounded-control!" />
        </div>
        <Skeleton className="mt-5 h-11 w-full rounded-control!" />
      </Card>
      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        {[0, 1, 2].map((i) => <StatCard key={i} label={["Клики", "Уникальные", "Боты"][i]} value="" loading />)}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Skeleton className="h-9 w-40 rounded-full!" />
          <Connector />
          <Card className="p-5"><Skeleton className="h-5 w-32" /><Skeleton className="mt-3 h-[26px] w-44 rounded-full!" /><Skeleton className="mt-3 h-9 w-full rounded-xl!" /></Card>
          <Connector />
          <Card className="p-5">
            <Skeleton className="h-5 w-32" /><Skeleton className="mt-3 h-4 w-56" />
            {[0, 1].map((i) => <div key={i} className="mt-5"><Skeleton className="h-4 w-3/5" /><Skeleton className="mt-2.5 h-1.5 w-full rounded-full!" /></div>)}
          </Card>
        </div>
        <Card className="p-5"><Skeleton className="h-5 w-40" /><LogSkeleton /></Card>
      </div>
    </div>
  );
}

const LogSkeleton = () => (
  <div className="mt-4 space-y-4" aria-busy aria-label="Загрузка журнала">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex gap-3"><Skeleton className="size-7 shrink-0 rounded-full!" /><div className="flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /></div></div>
    ))}
  </div>
);

/** Доли до → после по каждому офферу, затронутому правкой. */
function SharesDiff({ ch, names }: { ch: ChangeOut; names: Map<string, string> }) {
  const ids = [...new Set([...Object.keys(ch.shares_before), ...Object.keys(ch.shares_after)])];
  const changed = ids.filter((id) => ch.shares_before[id] !== ch.shares_after[id]);
  const pct = (v: number | undefined) => (v == null ? "—" : `${v}%`);
  if (!changed.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs text-ink-2">
      {changed.map((id) => (
        <li key={id} className="flex items-center gap-2">
          <span className="min-w-0 truncate font-mono" title={names.get(id)}>#{id}</span>
          <span className="ml-auto shrink-0 whitespace-nowrap">
            {pct(ch.shares_before[id])} <span aria-label="стало">→</span> <b className="font-semibold text-ink">{pct(ch.shares_after[id])}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function EditorPage() {
  const id = Number(useParams().id);
  const validId = Number.isInteger(id) && id > 0;
  const qc = useQueryClient();
  const toast = useToast();
  const [interval, setIntervalV] = useState<Interval>("today");
  const [confirmSync, setConfirmSync] = useState(false);
  const detailKey = ["campaign", id, interval];

  // автообновление: при возврате на вкладку и раз в 45 с, но не во время сохранения
  const mutating = useIsMutating() > 0;
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => api.detail(id, interval),
    enabled: validId,
    refetchOnWindowFocus: !mutating,
    refetchInterval: mutating ? false : AUTO_REFRESH_MS,
    // при смене периода оставляем прежнюю схему на экране (но не данные другой кампании)
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === id ? prev : undefined),
  });
  const changes = useQuery({
    queryKey: ["changes", id], queryFn: () => api.changes(id), enabled: validId,
    refetchOnWindowFocus: !mutating, refetchInterval: mutating ? false : AUTO_REFRESH_MS,
  });

  const onDone = (msg: string) => (d: CampaignDetail) => {
    qc.setQueryData(detailKey, d);
    qc.invalidateQueries({ queryKey: ["changes", id] });
    qc.invalidateQueries({ queryKey: ["campaigns"] }); // карточки на главной показывают офферы
    toast("success", msg);
  };
  const onErr = (e: Error) => toast("error", e.message);

  type SO = { sid: number; offer: number };
  const add = useMutation({
    mutationFn: (v: SO) => api.addOffer(id, v.sid, v.offer, interval),
    onSuccess: onDone("Оффер добавлен в черновик"), onError: onErr,
  });
  const remove = useMutation({
    mutationFn: (v: SO) => api.removeOffer(id, v.sid, v.offer, interval),
    onSuccess: onDone("Оффер убран в черновике"), onError: onErr,
  });
  const restore = useMutation({
    mutationFn: (v: SO) => api.restoreOffer(id, v.sid, v.offer, interval),
    onSuccess: onDone("Оффер возвращён в черновик"), onError: onErr,
  });
  const pin = useMutation({
    mutationFn: (v: SO & { pinned: boolean }) => api.pinOffer(id, v.sid, v.offer, v.pinned, interval),
    onSuccess: onDone("Доля обновлена"), onError: onErr,
  });
  const shares = useMutation({
    mutationFn: (v: { sid: number; shares: { offer_id: number; share: number }[]; pinned: number[] }) => api.setShares(id, v.sid, v.shares, v.pinned, interval),
    onSuccess: onDone("Доли сохранены в черновике"), onError: onErr,
  });
  const publish = useMutation({
    mutationFn: (sid: number) => api.publish(id, sid, interval),
    onSuccess: onDone("Опубликовано в Keitaro"), onError: onErr,
  });
  const discard = useMutation({
    mutationFn: (sid: number) => api.discard(id, sid, interval),
    onSuccess: onDone("Изменения отменены"), onError: onErr,
  });
  const sync = useMutation({
    mutationFn: (force: boolean) => api.sync(id, force, interval),
    onSuccess: onDone("Данные подтянуты из Keitaro"), onError: onErr,
  });
  const busy = [add, remove, restore, pin, shares, publish, discard, sync].some((m) => m.isPending);

  const offerNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of detail.data?.streams ?? []) for (const o of s.offers) m.set(String(o.offer_id), o.name);
    return m;
  }, [detail.data]);

  if (validId && detail.isPending) return <EditorSkeleton />;
  if (!validId || !detail.data) {
    const notFound = !validId || (detail.error instanceof ApiError && detail.error.status === 404);
    return (
      <div className="space-y-4">
        <Breadcrumb name={validId ? `#${id}` : "Не найдено"} />
        <Card>
          {notFound ? (
            <EmptyState className="py-16" icon={<IconSearch className="size-6" />} title="Кампания не найдена" text={validId ? `Кампании #${id} нет в Keitaro — возможно, её удалили.` : "Некорректный номер кампании в адресе."}>
              <Link to="/" className={buttonCls("primary")}>К списку кампаний</Link>
            </EmptyState>
          ) : (
            <ErrorState className="py-16" title="Не удалось открыть кампанию" error={detail.error ?? "Неизвестная ошибка"} onRetry={() => detail.refetch()} retrying={detail.isFetching}>
              <Link to="/" className={buttonCls("ghost")}>К списку кампаний</Link>
            </ErrorState>
          )}
        </Card>
      </div>
    );
  }

  const { campaign: c, streams, totals } = detail.data;
  const stale = detail.isPlaceholderData;
  const meta: [string, string | null][] = [["Группа", c.group], ["Домен", c.domain?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null], ["Создана", c.created_at && fmtDate(c.created_at)]];

  return (
    // запас снизу: схема потоков не упирается в край окна, под ней место для подписей в демо
    <div className="space-y-4 pb-40 lg:space-y-5 lg:pb-[40vh]">
      <Breadcrumb name={c.name} />

      {/* ---------- шапка ---------- */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="min-w-0 text-2xl font-semibold leading-8 tracking-tight [overflow-wrap:anywhere]">{c.name}</h1>
              <StatusPill state={c.state} />
              {c.created_here && <Badge tone="accent">создана здесь</Badge>}
            </div>
            <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <div><dt className="sr-only">ID</dt><dd className="font-mono text-xs">#{c.id}</dd></div>
              {meta.map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-1.5"><dt>{k}:</dt><dd className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{v || "—"}</dd></div>
              ))}
            </dl>
            {detail.data.synced_at && (
              <p className="mt-1.5 text-xs text-ink-2">
                Синхронизировано <time dateTime={detail.data.synced_at} title={fmtDate(detail.data.synced_at)}>{fmtRelative(detail.data.synced_at)}</time>
                {detail.data.dirty && <span className="ml-2 font-medium text-warn">· есть неопубликованные изменения</span>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary" loading={sync.isPending} disabled={busy}
              onClick={() => (detail.data.dirty ? setConfirmSync(true) : sync.mutate(false))}
            >{!sync.isPending && <IconRefresh className="size-[18px]" />} Подтянуть из Keitaro</Button>
            <PeriodSelect value={interval} onChange={setIntervalV} />
            <IconButton label="Обновить статистику" variant="secondary" aria-busy={detail.isFetching || undefined} onClick={() => detail.refetch()}>
              <IconRefresh className={cx("size-[18px]", detail.isFetching && "animate-spin")} />
            </IconButton>
          </div>
        </div>

        {detail.data.kt_drift && (
          <div role="status" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
            <IconAlert className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              В Keitaro есть изменения, которых здесь нет.
              {detail.data.dirty && " Публикация черновика будет заблокирована, пока вы их не подтянете."}
            </span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => (detail.data.dirty ? setConfirmSync(true) : sync.mutate(false))}>
              Подтянуть
            </Button>
          </div>
        )}

        <div className="mt-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium"><span id="e-url">Трекинг-ссылка</span><DnsStatus status={c.domain_status} /></p>
          {c.tracking_url ? (
            <div className="flex items-center gap-2 rounded-control border border-line-strong bg-bg py-1 pl-3 pr-1">
              <IconLink className="size-4 text-ink-3" />
              <code aria-labelledby="e-url" className="min-w-0 flex-1 truncate font-mono text-[13px]" title={c.tracking_url}>{c.tracking_url}</code>
              <OpenLink trackingUrl={c.tracking_url} workingUrl={c.working_url} dns={c.domain_status} />
              <CopyButton text={c.tracking_url} variant="button" />
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">Ссылка недоступна: у кампании не задан домен.</p>
          )}
        </div>

        {detail.isError && (
          <Alert className="mt-4" title="Не удалось обновить данные — показана прошлая версия" error={detail.error} onRetry={() => detail.refetch()} retrying={detail.isFetching} />
        )}
      </Card>

      {/* ---------- статистика ---------- */}
      <section aria-label={`Статистика за период: ${intervalLabel(interval)}`} className="grid grid-cols-3 gap-3 lg:gap-4">
        <StatCard label="Клики" value={fmtNum(totals.clicks)} dim={stale} />
        <StatCard label="Уникальные" value={fmtNum(totals.unique)} dim={stale} />
        <StatCard label="Боты" value={fmtNum(totals.bots)} dim={stale} />
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-5 xl:grid-cols-3">
        {/* ---------- схема потоков ---------- */}
        <section aria-label="Схема потоков" className="min-w-0 xl:col-span-2">
          <div>
            <h2 className="text-[17px] font-semibold">Маршрут трафика</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">Посетитель попадает в первый поток, условия которого ему подходят. Потоки проверяются сверху вниз.</p>
          </div>
          {streams.length === 0 && (
            <>
              <Connector />
              <Card><EmptyState className="py-10" title="У кампании нет потоков" text="Потоки создаются вместе с кампанией или в самом Keitaro." /></Card>
            </>
          )}
          {streams.map((s) => (
            <div key={s.id}>
              <Connector />
              <StreamNode
                stream={s} busy={busy} statsStale={stale}
                onAdd={(offer) => add.mutate({ sid: s.id, offer })}
                onRemove={(offer) => remove.mutate({ sid: s.id, offer })}
                onRestore={(offer) => restore.mutate({ sid: s.id, offer })}
                onPin={(offer, pinned) => pin.mutate({ sid: s.id, offer, pinned })}
                onSaveShares={(sh, pinned) => shares.mutate({ sid: s.id, shares: sh, pinned })}
                onPublish={() => publish.mutate(s.id)}
                onDiscard={() => discard.mutate(s.id)}
              />
            </div>
          ))}
        </section>

        {/* ---------- журнал ---------- */}
        <Card className="min-w-0 p-4 sm:p-5 lg:sticky lg:top-6" aria-label="Журнал изменений">
          <h2 className="text-[17px] font-semibold">Журнал изменений</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">Правки офферов и долей, сделанные здесь.</p>
          {changes.isPending ? (
            <LogSkeleton />
          ) : changes.error ? (
            <Alert className="mt-3" error={changes.error} onRetry={() => changes.refetch()} retrying={changes.isFetching} />
          ) : !changes.data?.length ? (
            <EmptyState className="px-0! py-8" icon={<IconClock className="size-5" />} title="Изменений пока нет" text="Добавьте оффер или измените доли — запись появится здесь." />
          ) : (
            <ol className="mt-4 max-h-[60vh] overflow-y-auto pr-1 lg:max-h-[calc(100vh-14rem)]">
              {changes.data.map((ch, i, arr) => {
                const a = ACTIONS[ch.action];
                return (
                  <li key={ch.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < arr.length - 1 && <span aria-hidden className="absolute bottom-0 left-[13.5px] top-8 w-px bg-line-strong" />}
                    <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full", (a ?? UNKNOWN_ACTION).tone)}>{(a ?? UNKNOWN_ACTION).icon}</span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-[13px] font-medium leading-5">{a?.label ?? ch.action}</p>
                      {ch.offer_id != null && (
                        <p className="truncate text-[13px] text-ink-2" title={offerNames.get(String(ch.offer_id))}>
                          {offerNames.get(String(ch.offer_id)) ?? "Оффер"} <span className="font-mono text-xs">#{ch.offer_id}</span>
                        </p>
                      )}
                      {ch.summary && <p className="text-[13px] text-ink-2">{ch.summary}</p>}
                      <SharesDiff ch={ch} names={offerNames} />
                      <time className="mt-1 block text-xs text-ink-2" dateTime={ch.created_at} title={fmtDate(ch.created_at)}>{fmtRelative(ch.created_at)}</time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <Dialog
        open={confirmSync} onClose={() => setConfirmSync(false)} title="Черновик будет сброшен"
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setConfirmSync(false)}>Отмена</Button>
            <Button variant="danger" onClick={() => { setConfirmSync(false); sync.mutate(true); }}>Подтянуть и сбросить</Button>
          </>
        }
      >
        Неопубликованные изменения будут потеряны: потоки заново загрузятся из Keitaro.
      </Dialog>
    </div>
  );
}
