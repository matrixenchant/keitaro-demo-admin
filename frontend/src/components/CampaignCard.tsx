import { Link, useNavigate } from "react-router-dom";
import type { CampaignListItem, Stats } from "../api/types";
import CopyButton from "./CopyButton";
import { DnsStatus, OpenLink } from "./LinkStatus";
import { Badge, GeoChip, IconTag, Skeleton, StatusDot, StatusPill, cx, fmtNum } from "./ui";

interface Props { campaign: CampaignListItem; statsStale?: boolean }

const STATS: [keyof Stats, string][] = [["clicks", "Клики"], ["unique", "Уник."], ["bots", "Боты"]];
const shortUrl = (u: string) => u.replace(/^https?:\/\//, "");

function GeoChips({ c, max }: { c: CampaignListItem; max: number }) {
  if (c.streams_count === null) return <span className="text-xs text-ink-2">Потоки не загрузились</span>;
  if (!c.geo.length) return <span className="text-xs text-ink-2">Без гео-фильтра</span>;
  return (
    <>
      {c.geo.slice(0, max).map((g) => <GeoChip key={g} code={g} />)}
      {c.geo.length > max && <span className="text-xs font-medium text-ink-2" title={c.geo.slice(max).join(", ")}>+{c.geo.length - max}</span>}
    </>
  );
}

function OfferLine({ c }: { c: CampaignListItem }) {
  if (!c.offers.length) return <span className="truncate text-ink-2">{c.streams_count === null ? "—" : "Нет офферов"}</span>;
  return (
    <>
      <span className="min-w-0 truncate text-ink" title={c.offers.map((o) => o.name).join("\n")}>{c.offers[0].name}</span>
      {c.offers.length > 1 && <span className="shrink-0 text-xs font-medium text-ink-2">+{c.offers.length - 1}</span>}
    </>
  );
}

/** Компактная карточка кампании: вся карточка — ссылка в редактор (растянутая), кнопка копирования — поверх. */
export default function CampaignCard({ campaign: c, statsStale }: Props) {
  return (
    <article className="group relative flex min-w-0 flex-col rounded-card hover:z-20 focus-within:z-20 bg-surface p-4 shadow-card transition duration-200 focus-within:shadow-card-hover hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">
          <Link to={`/campaigns/${c.id}`} className="line-clamp-2 rounded-sm outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:after:outline-3 focus-visible:after:outline-accent/30">
            {c.name}
          </Link>
        </h3>
        <StatusPill state={c.state} />
      </div>

      <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-2">#{c.id}</span>
        {c.created_here && <Badge tone="accent">создана здесь</Badge>}
        {c.has_draft && <Badge tone="amber" title="Есть неопубликованные изменения в потоках">черновик</Badge>}
      </div>

      <div className="mt-3 flex h-[22px] items-center gap-1 overflow-hidden"><GeoChips c={c} max={4} /></div>

      <div className="mt-2 flex items-center gap-1.5 text-[13px]">
        <IconTag className="size-3.5 text-ink-3" />
        <OfferLine c={c} />
      </div>

      <dl className={cx("mt-auto grid grid-cols-3 gap-2 pt-3.5 transition-opacity duration-200", statsStale && "opacity-40")}>
        {STATS.map(([k, label]) => (
          <div key={k} className="min-w-0 rounded-xl bg-bg px-2.5 py-1.5">
            <dt className="truncate text-[11px] text-ink-2">{label}</dt>
            <dd className="truncate text-[15px] font-semibold leading-5" title={fmtNum(c.stats[k])}>{fmtNum(c.stats[k])}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex h-8 items-center gap-2 border-t border-line pt-2.5">
        {c.tracking_url ? (
          <>
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2" title={c.tracking_url}>{shortUrl(c.tracking_url)}</code>
            <span className="relative z-10 flex items-center"><DnsStatus status={c.domain_status} /></span>
            <CopyButton text={c.tracking_url} className="relative z-10" />
            <span className="-mr-1.5"><OpenLink trackingUrl={c.tracking_url} workingUrl={c.working_url} dns={c.domain_status} compact /></span>
          </>
        ) : (
          <span className="truncate text-xs text-ink-2">Нет ссылки: у кампании не задан домен</span>
        )}
      </div>
    </article>
  );
}

export function CampaignCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-start gap-2"><Skeleton className="h-5 flex-1" /><Skeleton className="h-[22px] w-20 rounded-full!" /></div>
      <Skeleton className="mt-2 h-4 w-16" />
      <div className="mt-3.5 flex gap-1"><Skeleton className="h-[22px] w-9 rounded-full!" /><Skeleton className="h-[22px] w-9 rounded-full!" /><Skeleton className="h-[22px] w-9 rounded-full!" /></div>
      <Skeleton className="mt-2.5 h-4 w-3/5" />
      <div className="mt-4 grid grid-cols-3 gap-2"><Skeleton className="h-[46px] rounded-xl!" /><Skeleton className="h-[46px] rounded-xl!" /><Skeleton className="h-[46px] rounded-xl!" /></div>
      <div className="mt-3 flex h-8 items-center gap-2 border-t border-line pt-2.5"><Skeleton className="h-3.5 flex-1" /><Skeleton className="size-6" /></div>
    </div>
  );
}

/* ---------- вид «список» ---------- */

const th = "sticky top-[var(--list-top,0px)] z-10 border-b border-line bg-surface/90 px-3 py-2.5 text-left text-xs font-medium text-ink-2 backdrop-blur first:rounded-tl-card first:pl-4 last:rounded-tr-card last:pr-3 sm:first:pl-5";
const td = "px-3 py-2.5 align-middle first:pl-4 last:pr-3 sm:first:pl-5";
const num = "text-right";

function Cols() {
  return (
    <colgroup>
      <col />
      <col className="hidden w-32 md:table-column" />
      <col className="hidden w-40 xl:table-column" />
      <col className="hidden w-52 2xl:table-column" />
      <col className="w-20 sm:w-24" />
      <col className="hidden w-24 sm:table-column" />
      <col className="hidden w-20 md:table-column" />
      <col className="w-12" />
    </colgroup>
  );
}

function Head() {
  return (
    <thead>
      <tr>
        <th scope="col" className={th}>Кампания</th>
        <th scope="col" className={cx(th, "hidden md:table-cell")}>Статус</th>
        <th scope="col" className={cx(th, "hidden xl:table-cell")}>Гео</th>
        <th scope="col" className={cx(th, "hidden 2xl:table-cell")}>Оффер</th>
        <th scope="col" className={cx(th, num)}>Клики</th>
        <th scope="col" className={cx(th, num, "hidden sm:table-cell")}>Уник.</th>
        <th scope="col" className={cx(th, num, "hidden md:table-cell")}>Боты</th>
        <th scope="col" className={th}><span className="sr-only">Ссылка</span></th>
      </tr>
    </thead>
  );
}

export function CampaignTable({ items, statsStale }: { items: CampaignListItem[]; statsStale?: boolean }) {
  const navigate = useNavigate();
  const dim = cx("transition-opacity duration-200", statsStale && "opacity-40");
  return (
    <div className="rounded-card bg-surface shadow-card">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <Cols />
        <Head />
        <tbody>
          {items.map((c) => (
            <tr
              key={c.id}
              onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) navigate(`/campaigns/${c.id}`); }}
              className="group cursor-pointer transition-colors duration-150 hover:bg-bg/70 [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-line [&:last-child>td:first-child]:rounded-bl-card [&:last-child>td:last-child]:rounded-br-card"
            >
              <td className={td}>
                <div className="flex min-w-0 items-center gap-2">
                  <StatusDot state={c.state} className="md:hidden" />
                  <Link to={`/campaigns/${c.id}`} className="min-w-0 truncate rounded-sm font-medium group-hover:text-accent-strong" title={c.name}>{c.name}</Link>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-2">#{c.id}</span>
                  {c.created_here && <Badge tone="accent" className="h-[18px]! px-1.5! text-[11px]!">создана здесь</Badge>}
                  {c.has_draft && <Badge tone="amber" className="h-[18px]! px-1.5! text-[11px]!">черновик</Badge>}
                </div>
              </td>
              <td className={cx(td, "hidden md:table-cell")}><StatusPill state={c.state} /></td>
              <td className={cx(td, "hidden xl:table-cell")}><div className="flex h-[22px] items-center gap-1 overflow-hidden"><GeoChips c={c} max={3} /></div></td>
              <td className={cx(td, "hidden 2xl:table-cell")}><div className="flex min-w-0 items-center gap-1.5 text-[13px]"><OfferLine c={c} /></div></td>
              <td className={cx(td, num, "font-semibold")}><span className={dim}>{fmtNum(c.stats.clicks)}</span></td>
              <td className={cx(td, num, "hidden sm:table-cell")}><span className={dim}>{fmtNum(c.stats.unique)}</span></td>
              <td className={cx(td, num, "hidden text-ink-2 md:table-cell")}><span className={dim}>{fmtNum(c.stats.bots)}</span></td>
              <td className={cx(td, "text-right")}>
                {c.tracking_url ? <CopyButton text={c.tracking_url} /> : <span className="pr-2 text-ink-3" title="У кампании не задан домен">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CampaignTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden className="rounded-card bg-surface shadow-card">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <Cols />
        <Head />
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="[&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-line">
              <td className={td}><Skeleton className="h-4 w-4/5 max-w-64" /><Skeleton className="mt-1.5 h-3 w-14" /></td>
              <td className={cx(td, "hidden md:table-cell")}><Skeleton className="h-[22px] w-20 rounded-full!" /></td>
              <td className={cx(td, "hidden xl:table-cell")}><div className="flex gap-1"><Skeleton className="h-[22px] w-9 rounded-full!" /><Skeleton className="h-[22px] w-9 rounded-full!" /></div></td>
              <td className={cx(td, "hidden 2xl:table-cell")}><Skeleton className="h-4 w-36" /></td>
              <td className={td}><Skeleton className="ml-auto h-4 w-10" /></td>
              <td className={cx(td, "hidden sm:table-cell")}><Skeleton className="ml-auto h-4 w-10" /></td>
              <td className={cx(td, "hidden md:table-cell")}><Skeleton className="ml-auto h-4 w-8" /></td>
              <td className={td}><Skeleton className="ml-auto size-6" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
