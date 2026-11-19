import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api } from "../api/client";
import type { CampaignCreated, OfferRef, Ref } from "../api/types";
import CopyButton from "../components/CopyButton";
import { DnsStatus, OpenLink } from "../components/LinkStatus";
import CountryMultiSelect from "../components/CountryMultiSelect";
import OfferAutocomplete from "../components/OfferAutocomplete";
import {
  Alert, Badge, Button, Card, Field, GeoChip, IconArrowRight, IconCheck, IconChevron, IconClock, IconLink, IconLock, Select, Skeleton,
  buttonCls, cx, fmtDate, fmtRelative,
} from "../components/ui";

type FieldKey = "name" | "geo" | "offer";
const FIELD_ID: Record<FieldKey, string> = { name: "c-name", geo: "c-geo", offer: "c-offer" };

function RefSelect({ id, label, value, onChange, query }: { id: string; label: string; value: number | ""; onChange: (v: number) => void; query: UseQueryResult<Ref[]> }) {
  const options = query.data ?? [];
  return (
    <Field
      label={label} htmlFor={id}
      help={query.isError && (
        <span className="text-danger">
          Справочник недоступен — подставится значение по умолчанию.{" "}
          <button type="button" className="font-medium underline" onClick={() => query.refetch()}>Повторить</button>
        </span>
      )}
    >
      <Select id={id} value={value} disabled={!options.length} onChange={(e) => onChange(Number(e.target.value))}>
        {(value === "" || !options.length) && <option value="">{query.isError ? "Не загрузилось" : query.isPending ? "Загрузка…" : "По умолчанию"}</option>}
        {/* значение по умолчанию может отсутствовать в справочнике */}
        {value !== "" && options.length > 0 && !options.some((o) => o.id === value) && <option value={value}>[{value}]</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.id}</option>)}
      </Select>
    </Field>
  );
}

/* ---------- превью: что будет создано ---------- */

function PreviewNode({ title, badge, locked, ready = true, children }: { title: string; badge?: string; locked?: boolean; ready?: boolean; children: ReactNode }) {
  return (
    <div className={cx("rounded-2xl border px-3.5 py-3 transition-colors duration-200", ready ? "border-line bg-bg/60" : "border-dashed border-line-strong")}>
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-semibold">{title}</p>
        {badge && <Badge>{badge}</Badge>}
        {locked && <IconLock className="ml-auto size-3.5 text-ink-3" />}
      </div>
      <div className="mt-1.5 min-w-0 text-[13px] text-ink-2">{children}</div>
    </div>
  );
}
const PreviewLine = () => <div aria-hidden className="ml-6 h-4 w-px bg-black/15" />;

function Preview({ name, geo, offer, domain }: { name: string; geo: string[]; offer: OfferRef | null; domain: string | null }) {
  return (
    <Card className="p-4 sm:p-5" aria-label="Что будет создано">
      <h2 className="text-[17px] font-semibold">Что будет создано</h2>
      <p className="mt-0.5 truncate text-[13px] text-ink-2" title={name.trim() || undefined}>{name.trim() || "Кампания с двумя потоками"}</p>
      <div className="mt-4">
        <div className="flex items-center gap-2.5 rounded-2xl bg-ink px-3.5 py-3 text-white">
          <IconLink className="size-4 text-white/70" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Ссылка кампании</p>
            <p className="truncate font-mono text-xs text-white/70">{domain ? `${domain}/` : "домен/"}<span className="text-white/40">алиас</span></p>
          </div>
        </div>
        <PreviewLine />
        <PreviewNode title="Flow 1" badge="regular" locked ready={geo.length > 0}>
          {geo.length ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5">Страны:</span>
              {geo.map((g) => <GeoChip key={g} code={g} />)}
            </div>
          ) : (
            <p>Страны: выберите гео в форме</p>
          )}
          <p className="mt-1.5 flex items-center gap-1.5"><IconArrowRight className="size-3.5" /> безопасный редирект</p>
        </PreviewNode>
        <PreviewLine />
        <PreviewNode title="Flow 2" badge="regular" ready={!!offer}>
          <p>Весь остальной трафик</p>
          {offer ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-ink">
              <IconArrowRight className="size-3.5 text-ink-2" />
              <span className="min-w-0 truncate" title={offer.name}><span className="font-mono text-xs text-ink-2">[{offer.id}]</span> {offer.name}</span>
              <span className="shrink-0 font-semibold">· 100%</span>
            </p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1.5"><IconArrowRight className="size-3.5" /> оффер: выберите в форме</p>
          )}
        </PreviewNode>
      </div>
      <p className="mt-3 text-xs text-ink-2">Офферы и доли Flow 2 потом меняются в редакторе.</p>
    </Card>
  );
}

/* ---------- страница ---------- */

export default function CreatePage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [geo, setGeo] = useState<string[]>([]);
  const [offer, setOffer] = useState<OfferRef | null>(null);
  const [domain, setDomain] = useState<number | "">("");
  const [group, setGroup] = useState<number | "">("");
  const [source, setSource] = useState<number | "">("");
  const [adv, setAdv] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [created, setCreated] = useState<CampaignCreated | null>(null);
  const errorBanner = useRef<HTMLDivElement>(null);

  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const prefix = config.data?.name_prefix ?? "";
  // Пользователь вводит только окончание; префикс из вставленного полного имени срезаем
  const setNameSafe = (v: string) => setName(prefix && v.startsWith(prefix) ? v.slice(prefix.length) : v);
  const fullName = name.trim() ? prefix + name.trim() : "";
  const defaults = useQuery({ queryKey: ["defaults"], queryFn: api.defaults, staleTime: 5 * 60_000 });
  const domains = useQuery({ queryKey: ["domains"], queryFn: api.domains, staleTime: 5 * 60_000 });
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.groups, staleTime: 5 * 60_000 });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources, staleTime: 5 * 60_000 });
  const history = useQuery({ queryKey: ["history"], queryFn: api.history });

  useEffect(() => {
    const d = defaults.data;
    if (d) {
      setDomain((v) => (v === "" ? d.domain.id : v));
      setGroup((v) => (v === "" ? d.group.id : v));
      setSource((v) => (v === "" ? d.source.id : v));
    }
  }, [defaults.data]);

  const create = useMutation({
    mutationFn: api.createCampaign,
    onSuccess: (r) => {
      setCreated(r);
      window.scrollTo({ top: 0 });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: () => requestAnimationFrame(() => errorBanner.current?.scrollIntoView({ block: "center" })),
  });

  const clearError = (k: FieldKey) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    const er: Partial<Record<FieldKey, string>> = {};
    if (!name.trim()) er.name = "Введите название кампании";
    if (!geo.length) er.geo = "Выберите хотя бы одну страну";
    if (!offer) er.offer = "Выберите оффер из списка";
    setErrors(er);
    const first = (["name", "geo", "offer"] as const).find((k) => er[k]);
    if (first) {
      document.getElementById(FIELD_ID[first])?.focus();
      return;
    }
    setCreated(null);
    create.mutate({
      name: fullName, geo, offer_id: offer!.id,
      domain_id: domain || null, group_id: group || null, traffic_source_id: source || null,
    });
  };

  const reset = () => { setName(""); setGeo([]); setOffer(null); setErrors({}); setCreated(null); create.reset(); };
  const describe = (k: FieldKey) => `${FIELD_ID[k]}-${errors[k] ? "err" : "hint"}`;
  const refName = (q: UseQueryResult<Ref[]>, id: number | "", fallback?: Ref) =>
    id === "" ? null : q.data?.find((o) => o.id === id)?.name ?? (fallback?.id === id ? fallback.name : null) ?? `#${id}`;
  const domainName = refName(domains, domain, defaults.data?.domain);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight">Новая кампания</h1>
        <p className="text-sm text-ink-2">Название, гео и оффер — кампания с двумя потоками и готовой ссылкой появится в Keitaro.</p>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5 xl:grid-cols-[minmax(0,640px)_minmax(320px,400px)]">
        <div className="min-w-0">
          {created ? (
            /* ---------- успех ---------- */
            <Card className="animate-rise p-5 sm:p-6" role="status">
              <span className="flex size-12 items-center justify-center rounded-full bg-ok-soft text-ok"><IconCheck className="size-6" /></span>
              <h2 className="mt-4 text-xl font-semibold">Кампания создана</h2>
              <p className="mt-1 text-sm text-ink-2 [overflow-wrap:anywhere]">
                <span className="font-medium text-ink">{created.campaign.name}</span> <span className="font-mono text-xs">#{created.campaign.id}</span> уже в Keitaro и активна.
              </p>

              <p className="mb-1.5 mt-5 flex items-center gap-1.5 text-[13px] font-medium">Трекинг-ссылка <DnsStatus status={created.campaign.domain_status} /></p>
              {created.tracking_url ? (
                <div className="flex items-center gap-2 rounded-control border border-line-strong bg-bg py-1 pl-3 pr-1">
                  <IconLink className="size-4 text-ink-3" />
                  <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{created.tracking_url}</code>
                  <OpenLink trackingUrl={created.tracking_url} workingUrl={created.working_url} dns={created.campaign.domain_status} />
                  <CopyButton text={created.tracking_url} variant="button" />
                </div>
              ) : (
                <p className="text-sm text-ink-2">Ссылка недоступна: у кампании нет домена.</p>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <Link to={`/campaigns/${created.campaign.id}`} className={buttonCls("primary")}>Открыть кампанию <IconArrowRight className="size-4" /></Link>
                <Button variant="secondary" onClick={reset}>Создать ещё</Button>
              </div>
            </Card>
          ) : (
            /* ---------- форма ---------- */
            <Card>
              <form onSubmit={submit} noValidate aria-busy={create.isPending}>
                <fieldset disabled={create.isPending} className="min-w-0 space-y-5 p-5 sm:p-6">
                  <legend className="sr-only">Параметры кампании</legend>

                  {create.error && (
                    <div ref={errorBanner}><Alert title="Кампания не создана" error={create.error} /></div>
                  )}

                  <Field
                    label="Название" htmlFor={FIELD_ID.name} required error={errors.name}
                    help={prefix ? undefined : "Так кампания будет называться в Keitaro."}
                  >
                    <div
                      className={
                        "flex h-10 min-w-0 items-stretch overflow-hidden rounded-control border bg-surface transition duration-150 hover:border-black/25 " +
                        "focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/30 " +
                        (errors.name ? "border-danger ring-3 ring-danger/15" : "border-line-strong")
                      }
                    >
                      {prefix && (
                        <span className="flex shrink-0 select-none items-center border-r border-line-strong bg-fill px-3 font-mono text-[13px] text-ink-2" aria-hidden>
                          {prefix}
                        </span>
                      )}
                      <input
                        id={FIELD_ID.name} value={name} maxLength={200 - prefix.length} autoComplete="off" autoFocus
                        className="min-w-0 flex-1 bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none md:text-sm"
                        placeholder={prefix ? "campaign1" : "Например, MX Casino 01"}
                        aria-label={prefix ? `Название (после префикса ${prefix})` : undefined}
                        aria-invalid={!!errors.name || undefined} aria-describedby={describe("name")} aria-required
                        onChange={(e) => { setNameSafe(e.target.value); clearError("name"); }}
                      />
                    </div>
                  </Field>

                  <Field label="Гео" htmlFor={FIELD_ID.geo} required help="Страны для Flow 1. Ищите по названию или вставьте коды списком: MX, AU, RO." error={errors.geo}>
                    <CountryMultiSelect value={geo} onChange={(v) => { setGeo(v); clearError("geo"); }} inputId={FIELD_ID.geo} invalid={!!errors.geo} describedBy={describe("geo")} />
                  </Field>

                  <Field label="Оффер" htmlFor={FIELD_ID.offer} required help="Куда пойдёт остальной трафик — со 100% долей." error={errors.offer}>
                    <OfferAutocomplete value={offer} onChange={(o) => { setOffer(o); clearError("offer"); }} inputId={FIELD_ID.offer} invalid={!!errors.offer} describedBy={describe("offer")} />
                  </Field>

                  <div className="rounded-2xl border border-line">
                    <button
                      type="button" aria-expanded={adv} aria-controls="c-adv" onClick={() => setAdv(!adv)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition hover:bg-bg/70"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Дополнительно</span>
                        {!adv && (
                          defaults.isPending ? (
                            <Skeleton className="mt-1.5 h-3.5 w-56 max-w-full" />
                          ) : (
                            <span className="mt-0.5 block truncate text-[13px] text-ink-2">
                              {[["домен", domainName], ["группа", refName(groups, group, defaults.data?.group)], ["источник", refName(sources, source, defaults.data?.source)]]
                                .map(([l, v]) => `${l} ${v ?? "по умолчанию"}`).join(" · ")}
                            </span>
                          )
                        )}
                      </span>
                      <IconChevron className={cx("size-4 text-ink-2 transition-transform duration-200", adv && "rotate-180")} />
                    </button>
                    {adv && (
                      <div id="c-adv" className="grid grid-cols-1 gap-4 border-t border-line p-3.5 sm:grid-cols-3">
                        {defaults.isPending ? (
                          [0, 1, 2].map((i) => <div key={i}><Skeleton className="mb-2 h-4 w-16" /><Skeleton className="h-10 w-full rounded-control!" /></div>)
                        ) : (
                          <>
                            <RefSelect id="c-domain" label="Домен" value={domain} onChange={setDomain} query={domains} />
                            <RefSelect id="c-group" label="Группа" value={group} onChange={setGroup} query={groups} />
                            <RefSelect id="c-source" label="Источник" value={source} onChange={setSource} query={sources} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {defaults.isError && <Alert title="Не удалось получить значения по умолчанию" error={defaults.error} onRetry={() => defaults.refetch()} retrying={defaults.isFetching} />}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5">
                    <Button type="submit" size="lg" loading={create.isPending} className="w-full sm:w-auto">
                      {create.isPending ? "Создаём кампанию…" : "Создать кампанию"}
                    </Button>
                    <p className="min-w-0 flex-1 basis-48 text-[13px] text-ink-2" role="status" aria-live="polite">
                      {create.isPending ? "Создаём кампанию и два потока в Keitaro — не закрывайте страницу." : "Кампания сразу создаётся в Keitaro в статусе «активна»."}
                    </p>
                  </div>
                </fieldset>
              </form>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:space-y-5">
          <Preview name={fullName} geo={geo} offer={offer} domain={domainName} />

          {/* ---------- история ---------- */}
          <Card className="p-4 sm:p-5" aria-label="Недавно созданные">
            <h2 className="text-[17px] font-semibold">Недавно созданные</h2>
            {history.isPending ? (
              <div className="mt-3 space-y-3" aria-busy aria-label="Загрузка истории">
                {[0, 1, 2].map((i) => <div key={i}><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-1.5 h-3 w-1/3" /></div>)}
              </div>
            ) : history.error ? (
              <Alert className="mt-3" error={history.error} onRetry={() => history.refetch()} retrying={history.isFetching} />
            ) : !history.data?.length ? (
              <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-2"><IconClock className="size-4 text-ink-3" /> Пока пусто — первая кампания появится здесь.</p>
            ) : (
              <ul className="-mx-2 mt-2">
                {history.data.slice(0, 6).map((h) => (
                  <li key={h.id}>
                    <Link to={`/campaigns/${h.keitaro_campaign_id}`} className="block rounded-xl px-2 py-2 transition hover:bg-bg">
                      <span className="block truncate text-sm font-medium" title={h.name}>{h.name}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
                        <span className="font-mono">#{h.keitaro_campaign_id}</span>
                        <span className="min-w-0 truncate">{h.geo.join(", ")}</span>
                        <time className="ml-auto shrink-0" dateTime={h.created_at} title={fmtDate(h.created_at)}>{fmtRelative(h.created_at)}</time>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
