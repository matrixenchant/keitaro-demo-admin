import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import CreatePage from "./pages/CreatePage";
import CampaignsPage from "./pages/CampaignsPage";
import EditorPage from "./pages/EditorPage";
import { EmptyState, IconLayers, IconPlus, IconSearch, buttonCls, cx } from "./components/ui";

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Keitaro Admin — к кампаниям">
      <span className="bg-brand flex size-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-[0_2px_8px_rgb(75_154_81/0.35)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 4v16M17 4l-10 8.500L17 20" />
        </svg>
      </span>
      <span className={cx("text-[15px] font-semibold tracking-tight", compact && "hidden sm:inline")}>Keitaro Admin</span>
    </Link>
  );
}

const NAV = [
  { to: "/", label: "Кампании", icon: <IconLayers className="size-[18px]" /> },
  { to: "/new", label: "Новая кампания", icon: <IconPlus className="size-[18px]" /> },
] as const;

/** Жив ли сервер Keitaro (через наш бэкенд). */
function Connection() {
  const st = useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 30_000, refetchOnWindowFocus: true, retry: false });
  const backendDown = st.isError;
  const ok = st.data?.ok === true;
  const label = st.isPending ? "Проверяем Keitaro…" : backendDown ? "Бэкенд недоступен" : ok ? "Keitaro онлайн" : "Keitaro недоступен";
  const detail = backendDown
    ? "Нет ответа от API приложения"
    : st.data ? (ok ? `${st.data.host} · ${st.data.latency_ms} мс` : `${st.data.host} · ${st.data.error ?? "ошибка"}`) : "…";
  return (
    <div className="rounded-2xl bg-bg px-3 py-2.5" role="status">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <span aria-hidden className={cx("size-2 shrink-0 rounded-full", st.isPending ? "bg-ink-3" : ok ? "bg-ok-dot" : "bg-danger")} />
        {label}
      </p>
      <p className="mt-0.5 truncate pl-4 font-mono text-[11px] text-ink-2" title="Сервер трекера Keitaro">{detail}</p>
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState className="py-24" icon={<IconSearch className="size-6" />} title="Страница не найдена" text="Возможно, ссылка устарела или в адресе опечатка.">
      <Link to="/" className={buttonCls("primary")}>К кампаниям</Link>
    </EmptyState>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const isActive = (to: string) => (to === "/" ? pathname === "/" || pathname.startsWith("/campaigns") : pathname.startsWith(to));

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        К содержимому
      </a>

      {/* боковая панель — от lg */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 p-3 pr-0 lg:block">
        <div className="flex h-full flex-col rounded-card bg-surface p-3 shadow-card">
          <div className="px-2 pb-5 pt-2"><Logo /></div>
          <nav className="flex flex-col gap-1" aria-label="Основная навигация">
            {NAV.map((n) => {
              const on = isActive(n.to);
              return (
                <Link
                  key={n.to} to={n.to} aria-current={on ? "page" : undefined}
                  className={cx("flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition duration-150", on ? "bg-ink text-white" : "text-ink-2 hover:bg-fill hover:text-ink")}
                >
                  {n.icon}{n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto"><Connection /></div>
        </div>
      </aside>

      {/* компактная шапка — до lg */}
      <header className="border-b border-line bg-surface/80 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
          <Logo compact />
          <nav className="ml-auto flex items-center gap-1.5" aria-label="Основная навигация">
            <Link to="/" aria-current={isActive("/") ? "page" : undefined} className={cx("flex h-9 items-center rounded-control px-3 text-sm font-medium transition", isActive("/") ? "bg-ink text-white" : "text-ink-2 hover:bg-fill hover:text-ink")}>
              Кампании
            </Link>
            <Link to="/new" aria-current={isActive("/new") ? "page" : undefined} className={cx(buttonCls("primary", "sm"), "h-9!")}>
              <IconPlus className="size-4" /> Новая<span className="hidden sm:inline">кампания</span>
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 [overflow-x:clip]">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <Routes>
            <Route path="/" element={<CampaignsPage />} />
            <Route path="/new" element={<CreatePage />} />
            <Route path="/campaigns" element={<Navigate to="/" replace />} />
            <Route path="/campaigns/:id" element={<EditorPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
