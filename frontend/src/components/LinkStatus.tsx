import type { DomainStatus } from "../api/types";
import type { MouseEvent } from "react";
import { buttonCls, IconAlert, IconCheck, IconExternal, Tooltip } from "./ui";

/** Иконка состояния DNS домена кампании: красная при ошибке, спокойная галочка при норме. */
export function DnsStatus({ status }: { status: DomainStatus | null }) {
  if (!status) return null;
  const text = status.resolves
    ? "DNS в порядке"
    : `Домен ${status.host} недоступен (нет DNS-записи)`;
  return (
    <Tooltip text={text} align="start">
      <span tabIndex={0} role="img" aria-label={text} className={status.resolves ? "text-ok" : "text-danger"}>
        {status.resolves ? <IconCheck className="size-4" /> : <IconAlert className="size-4" />}
      </span>
    </Tooltip>
  );
}

/**
 * «Открыть» — основная трекинг-ссылка; если домен кампании не резолвится,
 * открываем ту же кампанию по алиасу на сервере Keitaro.
 */
export function OpenLink({ trackingUrl, workingUrl, dns, compact }: {
  trackingUrl: string | null; workingUrl: string | null; dns: DomainStatus | null; compact?: boolean;
}) {
  const fallback = !trackingUrl || dns?.resolves === false;
  const url = fallback ? workingUrl : trackingUrl;
  const host = workingUrl ? new URL(workingUrl).host : "сервер Keitaro";
  const hint = fallback ? `Домен недоступен — откроется через ${host}` : "Открыть трекинг-ссылку";
  if (!url) return null;
  const stop = (e: MouseEvent) => e.stopPropagation(); // кнопка может лежать внутри кликабельной карточки
  return (
    <Tooltip text={hint}>
      <a
        href={url} target="_blank" rel="noopener noreferrer" onClick={stop} aria-label={`Открыть кампанию: ${url}`}
        className={compact
          ? "relative z-10 inline-flex size-8 items-center justify-center rounded-control text-ink-2 transition duration-150 hover:bg-fill hover:text-ink"
          : buttonCls("secondary", "sm")}
      >
        <IconExternal className="size-4" />
        {!compact && "Открыть"}
      </a>
    </Tooltip>
  );
}
