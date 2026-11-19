export interface Ref { id: number; name: string | null }
export interface OfferRef { id: number; name: string; state: string | null; country: string[] }
export interface Country { code: string; name: string }
export interface Defaults { domain: Ref; group: Ref; source: Ref }
export interface CampaignCreate {
  name: string; geo: string[]; offer_id: number;
  domain_id?: number | null; group_id?: number | null; traffic_source_id?: number | null;
}
export interface Stats { clicks: number; unique: number; bots: number }
export interface DomainStatus { host: string; resolves: boolean; error: string | null; checked_at: string }
export interface CampaignOut {
  id: number; name: string; alias: string | null; state: string | null; group: string | null;
  domain: string | null; tracking_url: string | null; working_url: string | null; domain_status: DomainStatus | null; created_here: boolean; created_at: string | null;
}
export interface OfferBrief { id: number; name: string; accessible: boolean }
export interface CampaignListItem extends CampaignOut {
  geo: string[]; offers: OfferBrief[];
  /** null — потоки кампании не удалось загрузить */
  streams_count: number | null; stats: Stats; has_draft?: boolean;
}
export interface FilterOut { name: string; mode: string | null; payload: unknown }
export type OfferPending = "added" | "removed" | "changed" | null;
export interface StreamOfferOut {
  offer_id: number; name: string; accessible: boolean; share: number; state: string | null; stats: Stats;
  pinned: boolean; status: "active" | "removed"; pending: OfferPending;
  /** есть в Keitaro по последней синхронизации / публикации */
  published: boolean; published_share: number | null;
}
export interface StreamOut {
  id: number; name: string; type: string; schema: string; position: number | null; state: string | null;
  action_payload: string | null; filters: FilterOut[]; editable: boolean; has_offers: boolean; dirty: boolean; synced_at: string | null; kt_drift: boolean;
  stats: Stats; offers: StreamOfferOut[];
}
export interface CampaignDetail { campaign: CampaignOut; streams: StreamOut[]; totals: Stats; dirty: boolean; synced_at: string | null; kt_drift: boolean }
export interface CampaignCreated { campaign: CampaignOut; streams: StreamOut[]; tracking_url: string; working_url: string | null }
export interface HistoryItem {
  id: number; keitaro_campaign_id: number; name: string; alias: string; geo: string[]; offer_id: number;
  domain_id: number; group_id: number; traffic_source_id: number; geo_stream_id: number;
  offers_stream_id: number; tracking_url: string; created_at: string;
}
export interface ChangeOut {
  id: number; keitaro_campaign_id: number; stream_id: number; action: string; offer_id: number | null;
  shares_before: Record<string, number>; shares_after: Record<string, number>; summary: string | null; created_at: string;
}
export const INTERVALS = [
  ["today", "Сегодня"], ["yesterday", "Вчера"], ["7_days_ago", "7 дней"],
  ["1_month_ago", "Месяц"], ["all_time", "Всё время"],
] as const;
export type Interval = (typeof INTERVALS)[number][0];
