import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconChevron, IconSearch, cx, optionCls, popCls } from "./ui";

export interface PickOption { value: string; label: string; code?: string; count?: number }

interface Props {
  label: string;
  icon?: ReactNode;
  options: PickOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  multi?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Фильтр-комбобокс с поиском: одиночный или множественный выбор, управляется с клавиатуры. */
export default function PickList({ label, icon, options, selected, onChange, multi = false, searchPlaceholder = "Поиск", disabled, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const t = text.trim().toLowerCase();
  const list = t
    ? options.filter((o) => o.label.toLowerCase().includes(t) || (o.code ?? o.value).toLowerCase().includes(t))
    : options;

  useEffect(() => setHi(0), [t]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    setText("");
    if (refocus) trigger.current?.focus();
  };
  const toggle = (v: string) => {
    if (multi) onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    else { onChange(selected.includes(v) ? [] : [v]); close(true); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (list[hi]) toggle(list[hi].value); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  const active = selected.length > 0;
  const single = !multi && active ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : null;
  const summary = !active ? "все" : multi ? `выбрано ${selected.length}` : single!;

  return (
    <div ref={box} className={cx("relative min-w-0", className)}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${summary}`}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}
        className={cx(
          "flex h-10 w-full items-center gap-2 rounded-control border px-3 text-left text-[13px] font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-50",
          active ? "border-accent/30 bg-accent-soft text-accent-strong" : "border-line-strong bg-surface text-ink hover:border-black/25",
        )}
      >
        {icon && <span className={active ? "" : "text-ink-3"}>{icon}</span>}
        <span className="min-w-0 flex-1 truncate sm:max-w-44">{single ?? label}</span>
        {multi && active && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{selected.length}</span>
        )}
        <IconChevron className={cx("size-4 transition-transform duration-150", open && "rotate-180", !active && "text-ink-3")} />
      </button>

      {open && (
        <div className={`${popCls} left-0 w-full min-w-[min(19rem,calc(100vw-2rem))]`}>
          <div className="relative mb-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-label={searchPlaceholder}
              autoComplete="off"
              className="h-9 w-full rounded-[10px] bg-fill pl-8 pr-2.5 text-base outline-none placeholder:text-ink-3 md:text-sm"
              placeholder={searchPlaceholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label={label} aria-multiselectable={multi || undefined} className="max-h-64 overflow-auto">
            {list.length === 0 && <li className="px-2.5 py-2 text-sm text-ink-2">Ничего не найдено</li>}
            {list.map((o, i) => {
              const on = selected.includes(o.value);
              return (
                <li
                  key={o.value}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => { e.preventDefault(); toggle(o.value); }}
                  className={optionCls(i === hi)}
                >
                  <span className={cx("flex size-4 shrink-0 items-center justify-center border transition", multi ? "rounded-[5px]" : "rounded-full", on ? "border-accent bg-accent text-white" : "border-line-strong")}>
                    {on && <IconCheck className="size-3" />}
                  </span>
                  {multi && o.code && <span className="w-7 shrink-0 font-mono text-xs font-medium text-accent-strong">{o.code}</span>}
                  <span className="min-w-0 flex-1 truncate" title={o.label}>{o.label}</span>
                  {!multi && o.code && <span className="shrink-0 font-mono text-xs text-ink-2">#{o.code}</span>}
                  {o.count != null && <span className="w-6 shrink-0 text-right text-xs text-ink-2">{o.count}</span>}
                </li>
              );
            })}
          </ul>
          {active && (
            <button type="button" onClick={() => { onChange([]); close(true); }} className="mt-1 w-full rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium text-accent-strong hover:bg-accent-soft">
              Сбросить выбор
            </button>
          )}
        </div>
      )}
    </div>
  );
}
