import {
  forwardRef, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { INTERVALS, type Interval } from "../api/types";

/* ---------- утилиты ---------- */

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const nf = new Intl.NumberFormat("ru-RU");
export const fmtNum = (n: number) => nf.format(n);

/** Keitaro и бэкенд отдают время без зоны — считаем его UTC. */
const parseDate = (s: string) => new Date(s.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
export const fmtDate = (s: string | null) =>
  s ? parseDate(s).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

let rtf: Intl.RelativeTimeFormat | null = null;
try { rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" }); } catch { /* старый браузер */ }
export function fmtRelative(s: string): string {
  const diff = (parseDate(s).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (!rtf || Number.isNaN(diff) || abs >= 7 * 86400) return fmtDate(s);
  if (abs < 45) return "только что";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  return b === 1 ? forms[0] : forms[2];
}

let regionNames: Intl.DisplayNames | null = null;
try { regionNames = new Intl.DisplayNames(["ru"], { type: "region" }); } catch { /* старый браузер */ }
export function countryName(code: string): string {
  try { return regionNames?.of(code) ?? code; } catch { return code; }
}

export const intervalLabel = (i: Interval) => INTERVALS.find(([v]) => v === i)?.[1] ?? i;

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- иконки (stroke 1.75) ---------- */

type IconProps = { className?: string };
const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const icon = (children: ReactNode) => ({ className = "" }: IconProps) => <svg {...svg} className={`shrink-0 ${className}`}>{children}</svg>;

export const IconX = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const IconCheck = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconMinus = icon(<path d="M5 12h14" />);
export const IconSearch = icon(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const IconChevron = icon(<path d="M6 9l6 6 6-6" />);
export const IconChevronRight = icon(<path d="M9 6l6 6-6 6" />);
export const IconArrowRight = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconUnlock = icon(<><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 7.700-1.500" /></>);
export const IconLock = icon(<><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconCopy = icon(<><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.500 4H15" /></>);
export const IconRefresh = icon(<path d="M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7" />);
export const IconUndo = icon(<path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" />);
export const IconUpload = icon(<path d="M12 16V4M7 9l5-5 5 5M5 20h14" />);
export const IconGrid = icon(<><rect x="4" y="4" width="7" height="7" rx="1.75" /><rect x="13" y="4" width="7" height="7" rx="1.75" /><rect x="4" y="13" width="7" height="7" rx="1.75" /><rect x="13" y="13" width="7" height="7" rx="1.75" /></>);
export const IconList = icon(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />);
export const IconLayers = icon(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>);
export const IconGlobe = icon(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.800 15 0 18M12 3c-2.800 3-2.800 15 0 18" /></>);
export const IconTag = icon(<><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" /><path d="M8 8h.01" /></>);
export const IconLink = icon(<><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" /></>);
export const IconAlert = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7.500v5.500M12 16.500h.01" /></>);
export const IconTrash = icon(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />);
export const IconSliders = icon(<path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4" />);
export const IconCursor = icon(<path d="M5 4l5.500 15 2.300-6.200L19 10.500 5 4z" />);
export const IconExternal = icon(<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />);
export const IconClock = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);

export function Spinner({ className = "size-4" }: IconProps) {
  return (
    <svg className={`shrink-0 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- кнопки ---------- */

const variants = {
  primary: "bg-primary font-semibold text-white hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-bg",
  ghost: "text-ink-2 hover:bg-fill hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
};
const sizes = { sm: "h-8 gap-1.5 px-3 text-[13px]", md: "h-10 gap-2 px-4 text-sm", lg: "h-11 gap-2 px-5 text-[15px]" };
type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

export const buttonCls = (variant: Variant = "primary", size: Size = "md") =>
  `inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-medium transition duration-150 ` +
  `active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]}`;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };
export function Button({ variant = "primary", size = "md", loading = false, className = "", children, disabled, ...p }: ButtonProps) {
  return (
    <button type="button" {...p} disabled={disabled || loading} aria-busy={loading || undefined} className={cx(buttonCls(variant, size), className)}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

const iconSizes = { sm: "size-8", md: "size-10" };
type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string; variant?: "ghost" | "secondary" | "danger"; size?: keyof typeof iconSizes;
};
export function IconButton({ label, variant = "ghost", size = "md", className = "", children, ...p }: IconButtonProps) {
  const tone = variant === "danger" ? "text-ink-3 hover:bg-danger-soft hover:text-danger" : variants[variant];
  return (
    <button
      type="button" title={label} {...p} aria-label={label}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-control transition duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-40", tone, iconSizes[size], className)}
    >
      {children}
    </button>
  );
}

/* ---------- поля ---------- */

export const inputCls =
  "h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-base text-ink transition duration-150 md:text-sm " +
  "placeholder:text-ink-3 hover:border-black/25 focus:border-accent disabled:cursor-not-allowed disabled:bg-bg disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-danger/15";

/** Выпадающая панель и её пункты — общие для всех комбобоксов. */
export const popCls = "absolute z-30 mt-1.5 origin-top animate-pop rounded-2xl border border-line bg-surface p-1 shadow-pop";
export const optionCls = (active: boolean) => cx("flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm", active && "bg-fill");

export function Select({ className = "", children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative min-w-0", className)}>
      <select {...p} className={`${inputCls} appearance-none pr-9`}>{children}</select>
      <IconChevron className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

/** Подпись, подсказка и ошибка поля. id подсказки/ошибки: `${htmlFor}-hint` / `${htmlFor}-err`. */
export function Field({ label, htmlFor, required, help, error, children }: { label: string; htmlFor: string; required?: boolean; help?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] text-danger">
          <IconAlert className="size-3.5" />{error}
        </p>
      ) : help ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-[13px] text-ink-2">{help}</p>
      ) : null}
    </div>
  );
}

/* ---------- поверхности и бейджи ---------- */

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card({ className = "", ...p }, ref) {
  return <div ref={ref} {...p} className={cx("rounded-card bg-surface shadow-card", className)} />;
});

const tones = {
  gray: "bg-fill text-ink-2",
  accent: "bg-accent-soft text-accent-strong",
  blue: "bg-info-soft text-info",
  green: "bg-ok-soft text-ok",
  red: "bg-danger-soft text-danger-strong",
  amber: "bg-warn-soft text-warn",
};
export function Badge({ children, tone = "gray", title, className = "" }: { children: ReactNode; tone?: keyof typeof tones; title?: string; className?: string }) {
  return (
    <span title={title} className={cx("inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export const StatusDot = ({ state, className = "" }: { state: string | null; className?: string }) => (
  <span aria-hidden className={cx("inline-block size-1.5 shrink-0 rounded-full", state === "active" ? "bg-ok-dot" : state === "deleted" ? "bg-danger" : "bg-ink-3", className)} />
);

const STATE_LABEL: Record<string, string> = { active: "Активна", disabled: "Выключена", deleted: "Удалена" };
export const StatusPill = ({ state }: { state: string | null }) =>
  state ? (
    <Badge tone={state === "active" ? "green" : state === "deleted" ? "red" : "gray"}>
      <StatusDot state={state} />
      {STATE_LABEL[state] ?? state}
    </Badge>
  ) : null;

export function GeoChip({ code }: { code: string }) {
  return (
    <span title={countryName(code)} className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-fill px-2 font-mono text-[11px] font-medium text-ink">
      {code}
    </span>
  );
}

/* ---------- переключатели ---------- */

interface SegmentedProps<T extends string> {
  options: readonly (readonly [T, ReactNode, string?])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}
/** iOS-подобный сегментированный переключатель (radio-группа: стрелки работают из коробки). */
export function Segmented<T extends string>({ options, value, onChange, label, className = "" }: SegmentedProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex h-10 max-w-full shrink-0 items-stretch rounded-control bg-fill p-[3px]", className)}>
      {options.map(([v, l, title]) => (
        <label
          key={v} title={title}
          className={cx(
            "flex flex-1 items-center justify-center whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium transition duration-150",
            v === value ? "bg-surface text-ink shadow-seg" : "text-ink-2 hover:text-ink",
          )}
        >
          <input type="radio" name={name} className="sr-only" checked={v === value} onChange={() => onChange(v)} aria-label={title} />
          {l}
        </label>
      ))}
    </div>
  );
}

/** Период отчёта: сегменты на широком экране, обычный список — на узком. */
export function PeriodSelect({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <>
      <div className="hidden xl:block">
        <Segmented label="Период" options={INTERVALS} value={value} onChange={onChange} />
      </div>
      <Select aria-label="Период" value={value} onChange={(e) => onChange(e.target.value as Interval)} className="w-40 shrink-0 xl:hidden">
        {INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
    </>
  );
}

export function Switch({ checked, onChange, children, className = "" }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <label className={cx("inline-flex h-10 select-none items-center gap-2.5 text-[13px] font-medium text-ink", className)}>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-black/15 transition duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgb(0_0_0/0.25)] after:transition after:duration-200 peer-checked:bg-accent peer-checked:after:translate-x-4"
      />
      {children}
    </label>
  );
}

/* ---------- состояния ---------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function EmptyState({ icon, title, text, children, className = "" }: { icon?: ReactNode; title: string; text?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-fill text-ink-2">{icon}</span>}
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-2">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = "Не удалось загрузить данные", error, onRetry, retrying, children, className = "" }: { title?: string; error: unknown; onRetry?: () => void; retrying?: boolean; children?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger"><IconAlert className="size-6" /></span>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="mt-1 max-w-md break-words text-sm text-ink-2">{errorText(error)}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry && <Button variant="secondary" loading={retrying} onClick={onRetry}>Повторить</Button>}
        {children}
      </div>
    </div>
  );
}

/** Компактная ошибка внутри карточки или формы. */
export function Alert({ title, error, onRetry, retrying, className = "" }: { title?: string; error: unknown; onRetry?: () => void; retrying?: boolean; className?: string }) {
  return (
    <div role="alert" className={cx("flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] text-danger-strong", className)}>
      <IconAlert className="mt-px size-4" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <p className="break-words">{errorText(error)}</p>
      </div>
      {onRetry && (
        <button type="button" disabled={retrying} onClick={onRetry} className="shrink-0 rounded-md font-semibold underline-offset-2 hover:underline disabled:opacity-50">
          {retrying ? "Загрузка…" : "Повторить"}
        </button>
      )}
    </div>
  );
}

/* ---------- статистика ---------- */

export function StatCard({ label, value, hint, loading, dim, dark, icon }: { label: string; value: ReactNode; hint?: ReactNode; loading?: boolean; dim?: boolean; dark?: boolean; icon?: ReactNode }) {
  return (
    <div className={cx("relative flex min-h-[112px] min-w-0 flex-col overflow-hidden rounded-card p-3.5 shadow-card sm:p-5", dark ? "bg-ink text-white" : "bg-surface")}>
      {dark && (
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-[radial-gradient(closest-side,rgb(90_165_95/0.22),transparent)] blur-xl" />
      )}
      <div className={cx("relative flex items-center justify-between gap-2 text-[13px] font-medium", dark ? "text-white/70" : "text-ink-2")}>
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <div className={cx("relative mt-auto pt-3 transition-opacity duration-200", dim && "opacity-40")}>
        {loading ? (
          <Skeleton className={cx("h-8 w-20", dark && "opacity-30")} />
        ) : (
          <div className="truncate text-2xl font-semibold leading-8 tracking-tight sm:text-[32px]">{value}</div>
        )}
        {hint != null && <div className={cx("mt-1 truncate text-xs", dark ? "text-white/60" : "text-ink-2")}>{loading ? " " : hint}</div>}
      </div>
    </div>
  );
}

/* ---------- диалог и подсказка ---------- */

const FOCUSABLE = 'button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Модальное окно: фон, Esc, простая ловушка фокуса, возврат фокуса при закрытии. */
export function Dialog({ open, onClose, title, children, footer, size = "sm" }: { open: boolean; onClose: () => void; title: string; children?: ReactNode; footer?: ReactNode; size?: "sm" | "lg" }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab") return;
      const f = items();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], cur = document.activeElement;
      if (!el.contains(cur)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 animate-fade bg-black/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx("relative flex max-h-[calc(100dvh-2rem)] w-full animate-rise flex-col rounded-card bg-surface p-5 shadow-pop outline-none sm:p-6", size === "lg" ? "max-w-xl" : "max-w-sm")}>
        <h2 id={titleId} className="text-[17px] font-semibold">{title}</h2>
        {children && <div className="-mx-1 mt-2 min-h-0 overflow-y-auto px-1 text-sm text-ink-2">{children}</div>}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Подсказка на чистом CSS: показывается по наведению и по фокусу внутри. */
export function Tooltip({ text, children, className = "", align = "end" }: { text: string; children: ReactNode; className?: string; align?: "start" | "end" }) {
  return (
    <span className={cx("group/tt relative inline-flex", className)}>
      {children}
      <span role="tooltip" className={cx("pointer-events-none absolute bottom-full z-30 mb-1.5", align === "start" ? "left-0" : "right-0", " w-max max-w-56 rounded-lg bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 transition duration-150 group-focus-within/tt:opacity-100 group-hover/tt:opacity-100")}>
        {text}
      </span>
    </span>
  );
}
