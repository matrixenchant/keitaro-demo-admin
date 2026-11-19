import type * as T from "./types";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function formatDetail(d: unknown): string {
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((e: { loc?: unknown[]; msg?: string }) => {
        const field = (e.loc ?? []).filter((x) => x !== "body").join(".");
        return field ? `${field}: ${e.msg}` : String(e.msg);
      })
      .join("; ");
  }
  return d ? JSON.stringify(d) : "Неизвестная ошибка";
}

async function req<R>(path: string, init?: RequestInit): Promise<R> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError("Нет соединения с сервером");
  }
  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try { msg = formatDetail((await res.json()).detail); } catch { /* not json */ }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<R>;
}

const qs = (o: Record<string, string | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? "?" + s : "";
};
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  defaults: () => req<T.Defaults>("/refs/defaults"),
  domains: () => req<T.Ref[]>("/refs/domains"),
  groups: () => req<T.Ref[]>("/refs/groups"),
  sources: () => req<T.Ref[]>("/refs/sources"),
  countries: () => req<T.Country[]>("/refs/countries"),
  offers: (q: string) => req<T.OfferRef[]>("/refs/offers" + qs({ q })),
  offerById: (id: number) => req<{ id: number; name: string | null; accessible: boolean }>(`/refs/offers/${id}`),
  createCampaign: (b: T.CampaignCreate) => req<T.CampaignCreated>("/campaigns", json("POST", b)),
  health: () => req<{ status: string }>("/health"),
  status: () => req<{ ok: boolean; host: string; latency_ms: number | null; error: string | null }>("/status"),
  config: () => req<{ name_prefix: string }>("/config"),
  /** refresh — перечитать потоки кампаний мимо серверного кэша */
  campaigns: async (interval: T.Interval, refresh = false) =>
    // значения по умолчанию — на случай бэкенда старой версии без обогащённых полей
    (await req<T.CampaignListItem[]>("/campaigns" + qs({ interval, refresh }))).map((c) => ({
      ...c, geo: c.geo ?? [], offers: c.offers ?? [], streams_count: c.streams_count ?? null,
      stats: c.stats ?? { clicks: 0, unique: 0, bots: 0 },
    })),
  history: () => req<T.HistoryItem[]>("/campaigns/history"),
  detail: (id: number, interval: T.Interval) => req<T.CampaignDetail>(`/campaigns/${id}` + qs({ interval })),
  changes: (id: number) => req<T.ChangeOut[]>(`/campaigns/${id}/changes`),
  addOffer: (id: number, sid: number, offer_id: number, interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/streams/${sid}/offers` + qs({ interval }), json("POST", { offer_id })),
  restoreOffer: (id: number, sid: number, offer_id: number, interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/streams/${sid}/offers/${offer_id}/restore` + qs({ interval }), { method: "POST" }),
  pinOffer: (id: number, sid: number, offer_id: number, pinned: boolean, interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/streams/${sid}/offers/${offer_id}` + qs({ interval }), json("PATCH", { pinned })),
  publish: (id: number, sid: number, interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/streams/${sid}/publish` + qs({ interval }), { method: "POST" }),
  discard: (id: number, sid: number, interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/streams/${sid}/discard` + qs({ interval }), { method: "POST" }),
  sync: (id: number, force: boolean, interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/sync` + qs({ force, interval }), { method: "POST" }),
  removeOffer: (id: number, sid: number, offer_id: number, interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/streams/${sid}/offers/${offer_id}` + qs({ interval }), { method: "DELETE" }),
  setShares: (id: number, sid: number, shares: { offer_id: number; share: number }[], pinned: number[], interval: T.Interval) =>
    req<T.CampaignDetail>(`/campaigns/${id}/streams/${sid}/offers` + qs({ interval }), json("PUT", { shares, pinned })),
};
