import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { IconX, countryName, optionCls, popCls } from "./ui";

interface Props { value: string[]; onChange: (codes: string[]) => void; inputId?: string; invalid?: boolean; describedBy?: string }

export default function CountryMultiSelect({ value, onChange, inputId, invalid, describedBy }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { data: countries = [] } = useQuery({ queryKey: ["countries"], queryFn: api.countries, staleTime: Infinity });

  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const t = text.trim().toLowerCase();
  const list = countries
    .filter((c) => !value.includes(c.code) && (!t || c.code.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)))
    .slice(0, 50);
  useEffect(() => setHi(0), [t]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const add = (codes: string[]) => onChange([...new Set([...value, ...codes])]);
  const remove = (c: string) => onChange(value.filter((x) => x !== c));

  // "MX,AU RO" -> коды; неизвестные оставляем в поле
  const parseText = (raw: string): boolean => {
    const parts = raw.split(/[\s,;]+/).filter(Boolean).map((p) => p.toUpperCase());
    if (!parts.length) return false;
    const known = new Set(countries.map((c) => c.code));
    const ok = parts.filter((p) => known.has(p));
    const bad = parts.filter((p) => !known.has(p));
    if (!ok.length) return false;
    add(ok);
    setText(bad.join(","));
    setOpen(false);
    return true;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" || e.key === ",") {
      if (/[\s,;]/.test(text.trim()) || (e.key === "," && text.trim())) {
        e.preventDefault();
        parseText(text);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const exact = countries.find((c) => c.code === text.trim().toUpperCase());
        const pick = exact && !value.includes(exact.code) ? exact : list[hi];
        if (pick) { add([pick.code]); setText(""); }
      }
    } else if (e.key === "Backspace" && !text && value.length) remove(value[value.length - 1]);
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <div
        className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border bg-surface px-2 py-[7px] transition duration-150 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/30 has-[:disabled]:bg-bg has-[:disabled]:opacity-60 ${
          invalid ? "border-danger ring-3 ring-danger/15" : "border-line-strong hover:border-black/25"
        }`}
      >
        {value.map((c) => (
          <span key={c} title={countryName(c)} className="inline-flex h-6 items-center gap-0.5 rounded-full bg-accent-soft pl-2.5 pr-1 font-mono text-xs font-medium text-accent-strong">
            {c}
            <button type="button" aria-label={`Убрать ${c}`} onClick={() => remove(c)} className="rounded-full p-0.5 text-accent-strong/60 transition hover:bg-accent/15 hover:text-accent-strong">
              <IconX className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          className="h-6 min-w-32 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-ink-3 md:text-sm"
          value={text}
          placeholder={value.length ? "Ещё страна…" : "Поиск страны или MX, AU, RO"}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            setOpen(true);
            if (/[\s,;]$/.test(v) && v.trim()) parseText(v);
          }}
          onPaste={(e) => {
            const p = e.clipboardData.getData("text");
            if (/[\s,;]/.test(p.trim())) { e.preventDefault(); parseText(p); }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
      </div>
      {open && list.length > 0 && (
        <ul ref={listRef} role="listbox" className={`${popCls} max-h-64 w-full overflow-auto`}>
          {list.map((c, i) => (
            <li
              key={c.code}
              data-i={i}
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); add([c.code]); setText(""); }}
              className={optionCls(i === hi)}
            >
              <span className="w-7 shrink-0 font-mono text-xs font-medium text-accent-strong">{c.code}</span>
              <span className="min-w-0 truncate">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
