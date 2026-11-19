import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { INTERVALS, type CampaignListItem, type Interval } from "../api/types";
import CampaignCard, { CampaignCardSkeleton, CampaignTable, CampaignTableSkeleton } from "../components/CampaignCard";
import PickList, { type PickOption } from "../components/PickList";
import {
  Alert, Button, Card, EmptyState, ErrorState, IconButton, IconGlobe, IconGrid, IconLayers, IconList, IconPlus, IconRefresh,
  IconSearch, IconTag, IconX, PeriodSelect, Segmented, Spinner, StatCard, Switch,
  buttonCls, countryName, cx, fmtNum, inputCls, intervalLabel, plural,
} from "../components/ui";

const STATES = [["", "Все"], ["active", "Активные"], ["disabled", "Выключенные"]] as const;
type StateFilter = (typeof STATES)[number][0];
const isInterval = (v: string | null): v is Interval => INTERVALS.some(([i]) => i === v);
const PAGE = 24;
const CAMPAIGN_FORMS: [string, string, string] = ["кампания", "кампании", "кампаний"];

type View = "grid" | "list";
const VIEW_KEY = "keitaro-admin:view";
const VIEWS = [
  ["grid", <IconGrid key="g" className="size-4" />, "Сетка"],
  ["list", <IconList key="l" className="size-4" />, "Список"],
] as const;
function loadView(): View {
  try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; }
}

/** Варианты фильтра из самих кампаний, самые частые — первыми. */
function countOptions<K extends string | number>(items: CampaignListItem[], pick: (c: CampaignListItem) => { key: K; label: string; code?: string }[]): PickOption[] {
  const m = new Map<K, PickOption>();
  for (const c of items)
    for (const { key, label, code } of pick(c)) {
      const o = m.get(key);
      if (o) o.count = (o.count ?? 0) + 1;
      else m.set(key, { value: String(key), label, code, count: 1 });
    }
  return [...m.values()].sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label, "ru"));
}

// Фильтры и период запоминаем в браузере: при возврате на главную без параметров — восстанавливаем
const FILTERS_KEY = "keitaro-admin.campaign-filters";
function readSaved(): string {
  try { return localStorage.getItem(FILTERS_KEY) ?? ""; } catch { return ""; }
}
function writeSaved(search: string) {
  try { if (search) localStorage.setItem(FILTERS_KEY, search); else localStorage.removeItem(FILTERS_KEY); } catch { /* приватный режим */ }
}

export default function CampaignsPage() {
  const loc = useLocation();
  const saved = loc.search ? "" : readSaved();
  if (saved) return <Navigate replace to={{ pathname: loc.pathname, search: `?${saved}` }} />;
  return <CampaignsView />;
}

function CampaignsView() {
  const [sp, setSp] = useSearchParams();
  const spString = sp.toString();
  useEffect(() => writeSaved(spString), [spString]); // в т.ч. если открыли ссылку с фильтрами
  const q = sp.get("q") ?? "";
  const offer = sp.get("offer") ?? "";
  const geoParam = sp.get("geo") ?? "";
  const geo = useMemo(() => geoParam.split(",").filter(Boolean), [geoParam]);
  const state: StateFilter = sp.get("state") === "active" ? "active" : sp.get("state") === "disabled" ? "disabled" : "";
  const mine = sp.get("mine") === "1";
  const period: Interval = isInterval(sp.get("period")) ? (sp.get("period") as Interval) : "today";

  const patch = (o: Record<string, string | null>) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(o)) v ? n.set(k, v) : n.delete(k);
      writeSaved(n.toString()); // сразу, чтобы «Сбросить» не восстановило старые фильтры
      return n;
    }, { replace: true });

  // Поле поиска живёт локально (мгновенный отклик), в URL уходит с задержкой
  const [text, setText] = useState(q);
  const pushed = useRef(q);
  useEffect(() => {
    if (q !== pushed.current) { pushed.current = q; setText(q); }
  }, [q]);
  useEffect(() => {
    const v = text.trim();
    if (v === pushed.current) return;
    const t = setTimeout(() => { pushed.current = v; patch({ q: v || null }); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* приватный режим */ }
  };

  // Кнопка «Обновить» просит бэкенд перечитать потоки мимо кэша
  const force = useRef(false);
  const list = useQuery({
    queryKey: ["campaigns", period],
    queryFn: () => {
      const refresh = force.current;
      force.current = false;
      return api.campaigns(period, refresh);
    },
    placeholderData: keepPreviousData,
  });
  const refresh = () => { force.current = true; list.refetch(); };
  const all = list.data;
  const statsStale = list.isPlaceholderData;

  const offerOptions = useMemo(() => countOptions(all ?? [], (c) => c.offers.map((o) => ({ key: o.id, label: o.name, code: String(o.id) }))), [all]);
  const geoOptions = useMemo(() => countOptions(all ?? [], (c) => c.geo.map((g) => ({ key: g, label: countryName(g), code: g }))), [all]);

  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (all ?? []).filter((c) => {
      if (mine && !c.created_here) return false;
      if (state === "active" && c.state !== "active") return false;
      if (state === "disabled" && c.state === "active") return false;
      if (offer && !c.offers.some((o) => String(o.id) === offer)) return false;
      if (geo.length && !geo.some((g) => c.geo.includes(g))) return false;
      return !t || c.name.toLowerCase().includes(t) || String(c.id).includes(t) || (c.alias ?? "").toLowerCase().includes(t);
    });
  }, [all, text, mine, state, offer, geo]);

  const totals = useMemo(
    () => shown.reduce(
      (a, c) => ({ clicks: a.clicks + c.stats.clicks, unique: a.unique + c.stats.unique, bots: a.bots + c.stats.bots, here: a.here + (c.created_here ? 1 : 0) }),
      { clicks: 0, unique: 0, bots: 0, here: 0 },
    ),
    [shown],
  );

  // Порционный вывод: 24 штуки и «Показать ещё»; при смене фильтров — снова с начала
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [text, mine, state, offer, geoParam]);
  const visible = useMemo(() => shown.slice(0, limit), [shown, limit]);
  const rest = shown.length - visible.length;

  const filtered = Boolean(text.trim() || offer || geo.length || state || mine);
  const reset = () => {
    pushed.current = "";
    setText("");
    patch({ q: null, offer: null, geo: null, state: null, mine: null });
  };

  // Высота липкой панели фильтров — под неё встаёт липкая шапка таблицы
  const toolbar = useRef<HTMLDivElement>(null);
  const [listTop, setListTop] = useState(0);
  useEffect(() => {
    const el = toolbar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setListTop(getComputedStyle(el).position === "sticky" ? el.offsetHeight + 8 : 0);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const loading = list.isPending;
  const failed = list.isError && !all;
  const refetching = list.isFetching && !loading;
  const val = (n: number) => (failed ? "—" : fmtNum(n));

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* ---------- заголовок ---------- */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight">Кампании</h1>
          <p className="text-sm text-ink-2">
            {loading ? "Загружаем кампании из Keitaro…" : all ? `${fmtNum(all.length)} ${plural(all.length, CAMPAIGN_FORMS)} в Keitaro` : "Нет данных"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelect value={period} onChange={(v) => patch({ period: v === "today" ? null : v })} />
          <IconButton label="Обновить данные" variant="secondary" disabled={loading} aria-busy={refetching || undefined} onClick={refresh}>
            <IconRefresh className={cx("size-[18px]", list.isFetching && "animate-spin")} />
          </IconButton>
          <Link to="/new" className={cx(buttonCls("primary"), "hidden lg:inline-flex")}>
            <IconPlus className="size-4" /> Новая кампания
          </Link>
        </div>
      </header>

      {/* ---------- сводка ---------- */}
      <section aria-label={`Сводка за период: ${intervalLabel(period)}`} className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
        <StatCard
          dark label="Кампании" loading={loading} value={val(shown.length)} icon={<IconLayers className="size-[18px]" />}
          hint={failed ? "" : `${filtered && all ? `из ${fmtNum(all.length)} · ` : "из них "}созданы здесь ${fmtNum(totals.here)}`}
        />
        <StatCard label="Клики" loading={loading} dim={statsStale} value={val(totals.clicks)} hint={intervalLabel(period)} />
        <StatCard label="Уникальные" loading={loading} dim={statsStale} value={val(totals.unique)} hint={totals.clicks ? `${Math.round((totals.unique / totals.clicks) * 100)}% от кликов` : " "} />
        <StatCard label="Боты" loading={loading} dim={statsStale} value={val(totals.bots)} hint={totals.clicks ? `${Math.round((totals.bots / totals.clicks) * 100)}% от кликов` : " "} />
      </section>

      {/* ---------- фильтры ---------- */}
      <Card
        ref={toolbar} role="search" aria-label="Фильтры"
        className="z-20 flex flex-wrap items-center gap-2 p-2.5 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:bg-bg md:sticky md:top-2 max-md:relative"
      >
        <div className="relative min-w-0 flex-1 basis-full xl:basis-56">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search" autoComplete="off" aria-label="Поиск по названию, ID или алиасу" className={`${inputCls} pl-9 pr-9`}
            placeholder="Название, ID или алиас" value={text} onChange={(e) => setText(e.target.value)}
          />
          {text && (
            <button type="button" aria-label="Очистить поиск" onClick={() => setText("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-3 transition hover:bg-fill hover:text-ink">
              <IconX className="size-4" />
            </button>
          )}
        </div>
        <PickList className="w-full sm:w-auto" label="Оффер" icon={<IconTag className="size-4" />} options={offerOptions} selected={offer ? [offer] : []} onChange={(v) => patch({ offer: v[0] ?? null })} searchPlaceholder="Название или ID оффера" disabled={!all} />
        <PickList className="w-full sm:w-auto" label="Гео" icon={<IconGlobe className="size-4" />} multi options={geoOptions} selected={geo} onChange={(v) => patch({ geo: v.join(",") || null })} searchPlaceholder="Страна или код" disabled={!all} />
        <Segmented label="Статус" options={STATES} value={state} onChange={(v) => patch({ state: v || null })} className="w-full sm:w-auto" />
        <Switch checked={mine} onChange={(v) => patch({ mine: v ? "1" : null })} className="px-1.5">Только созданные здесь</Switch>
        {filtered && <Button variant="ghost" size="sm" onClick={reset} className="text-accent-strong!">Сбросить</Button>}

        <div className="ml-auto flex items-center gap-3 pl-1">
          <p className="flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-2" role="status" aria-live="polite">
            {refetching && <Spinner className="size-3.5" />}
            {loading ? "Загрузка…" : all ? (filtered ? `Найдено ${fmtNum(shown.length)} из ${fmtNum(all.length)}` : `Всего ${fmtNum(all.length)}`) : ""}
          </p>
          <Segmented label="Вид" options={VIEWS} value={view} onChange={setView} className="[&>label]:px-2.5" />
        </div>
      </Card>

      {/* ---------- список ---------- */}
      <section aria-label="Список кампаний" aria-busy={loading || undefined} style={{ "--list-top": `${listTop}px` } as CSSProperties}>
        {list.isError && all && (
          <Alert className="mb-4" title="Не удалось обновить данные — показана прошлая версия" error={list.error} onRetry={refresh} retrying={list.isFetching} />
        )}

        {failed ? (
          <Card><ErrorState title="Не удалось загрузить кампании" error={list.error} onRetry={refresh} retrying={list.isFetching} /></Card>
        ) : loading ? (
          view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => <CampaignCardSkeleton key={i} />)}
            </div>
          ) : (
            <CampaignTableSkeleton />
          )
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconSearch className="size-6" />}
              title={filtered ? "Ничего не найдено" : "Кампаний пока нет"}
              text={filtered ? "Под выбранные фильтры не подошла ни одна кампания. Смягчите условия или сбросьте их." : "Создайте первую кампанию — она появится здесь."}
            >
              {filtered && <Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}
              <Link to="/new" className={buttonCls("primary")}><IconPlus className="size-4" /> Новая кампания</Link>
            </EmptyState>
          </Card>
        ) : (
          <>
            {view === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                {visible.map((c) => <CampaignCard key={c.id} campaign={c} statsStale={statsStale} />)}
              </div>
            ) : (
              <CampaignTable items={visible} statsStale={statsStale} />
            )}
            <div className="mt-5 flex flex-col items-center gap-2">
              {rest > 0 && (
                <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                  Показать ещё {Math.min(PAGE, rest)}
                </Button>
              )}
              <p className="text-xs text-ink-2">Показано {fmtNum(visible.length)} из {fmtNum(shown.length)}</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
