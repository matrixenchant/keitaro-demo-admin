import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { OfferRef } from "../api/types";
import { Badge, IconSearch, IconTag, IconX, Spinner, inputCls, optionCls, popCls, useDebounced } from "./ui";

interface Props {
  value: OfferRef | null;
  onChange: (o: OfferRef | null) => void;
  exclude?: number[];
  autoFocus?: boolean;
  placeholder?: string;
  inputId?: string;
  invalid?: boolean;
  describedBy?: string;
}

export default function OfferAutocomplete({ value, onChange, exclude = [], autoFocus, placeholder, inputId, invalid, describedBy }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const q = useDebounced(text.trim());
  const { data, isFetching, error } = useQuery({
    queryKey: ["offers", q],
    queryFn: () => api.offers(q),
    enabled: open,
    staleTime: 30_000,
  });
  const list = (data ?? []).filter((o) => !exclude.includes(o.id));
  // Оффер может существовать, но не читаться ключом — тогда в списке его нет, добавляем по ID
  const idQuery = /^[1-9]\d*$/.test(q) ? Number(q) : null;
  const byId = idQuery != null && !exclude.includes(idQuery) && !(data ?? []).some((o) => o.id === idQuery) ? idQuery : null;
  // Перед тем как предложить ID, проверяем, что такой оффер вообще есть в Keitaro
  const lookup = useQuery({
    queryKey: ["offer-by-id", byId],
    queryFn: () => api.offerById(byId!),
    enabled: open && byId != null,
    staleTime: 60_000,
    retry: false,
  });
  const notFound = lookup.error instanceof ApiError && lookup.error.status === 404;
  const found = byId != null && lookup.data?.id === byId ? lookup.data : null;
  const count = list.length + (found ? 1 : 0);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);
  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const byIdRef: OfferRef | null = found ? { id: found.id, name: found.name ?? `Оффер #${found.id}`, state: null, country: [] } : null;
  const pick = (o: OfferRef) => {
    onChange(o);
    setText("");
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, count - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open && hi < count) { e.preventDefault(); pick(hi < list.length ? list[hi] : byIdRef!); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      {value ? (
        <div className="flex h-10 items-center gap-2 rounded-control border border-line-strong bg-surface pl-3 pr-1 text-sm has-[:disabled]:bg-bg has-[:disabled]:opacity-60">
          <IconTag className="size-4 text-accent" />
          <span className="min-w-0 flex-1 truncate font-medium" title={value.name}>{value.name}</span>
          <span className="shrink-0 font-mono text-xs text-ink-2">#{value.id}</span>
          <button type="button" id={inputId} aria-label={`Сбросить оффер ${value.name}`} className="rounded-lg p-1.5 text-ink-3 transition hover:bg-fill hover:text-ink" onClick={() => onChange(null)}>
            <IconX className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            className={`${inputCls} pl-9 pr-9`}
            value={text}
            autoFocus={autoFocus}
            placeholder={placeholder ?? "Поиск оффера по названию или ID"}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
          />
          {isFetching && open && <Spinner className="absolute right-3 top-1/2 -mt-2 size-4 text-ink-3" />}
        </div>
      )}
      {open && !value && (
        <ul ref={listRef} role="listbox" className={`${popCls} max-h-64 w-full overflow-auto`}>
          {error ? <li role="alert" className="px-2.5 py-2 text-sm text-danger">{(error as Error).message}</li> : null}
          {isFetching && !count && !error && <li className="px-2.5 py-2 text-sm text-ink-2">Загрузка офферов…</li>}
          {!isFetching && !error && !count && byId == null && <li className="px-2.5 py-2 text-sm text-ink-2">Ничего не найдено</li>}
          {byId != null && lookup.isFetching && (
            <li className="flex items-center gap-2 px-2.5 py-2 text-sm text-ink-2"><Spinner className="size-3.5" /> Проверяем оффер #{byId}…</li>
          )}
          {byId != null && !lookup.isFetching && notFound && (
            <li role="alert" className="px-2.5 py-2 text-sm text-danger">Оффер #{byId} не найден</li>
          )}
          {byId != null && !lookup.isFetching && lookup.error && !notFound && (
            <li role="alert" className="px-2.5 py-2 text-sm text-danger">{(lookup.error as Error).message}</li>
          )}
          {list.map((o, i) => (
            <li
              key={o.id}
              data-i={i}
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={optionCls(i === hi)}
            >
              <span className="min-w-0 flex-1 truncate" title={o.name}>{o.name}</span>
              {o.state && o.state !== "active" && <Badge tone="amber">{o.state}</Badge>}
              <span className="shrink-0 font-mono text-xs text-ink-2">#{o.id}</span>
            </li>
          ))}
          {byIdRef && (
            <li
              data-i={list.length}
              role="option"
              aria-selected={list.length === hi}
              onMouseEnter={() => setHi(list.length)}
              onMouseDown={(e) => { e.preventDefault(); pick(byIdRef); }}
              className={optionCls(list.length === hi)}
            >
              <span className="min-w-0 flex-1 truncate" title={byIdRef.name}>{found?.name ?? "Оффер"}</span>
              <span className="shrink-0 font-mono text-xs text-ink-2">#{byIdRef.id}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
