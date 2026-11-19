import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconX } from "./ui";

type Kind = "success" | "error";
interface Item { id: number; kind: Kind; text: string }
const Ctx = createContext<(kind: Kind, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const close = useCallback((id: number) => setItems((s) => s.filter((i) => i.id !== id)), []);
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => close(id), kind === "error" ? 7000 : 3500);
  }, [close]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[22rem]">
        {items.map((i) => (
          <div
            key={i.id}
            role={i.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full animate-rise items-start gap-3 rounded-2xl bg-ink py-3 pl-3.5 pr-2 text-white shadow-pop"
          >
            <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${i.kind === "error" ? "bg-danger" : "bg-ok-dot"}`}>
              {i.kind === "error" ? <IconAlert className="size-3.5" /> : <IconCheck className="size-3.5" />}
            </span>
            <p className="min-w-0 flex-1 break-words py-0.5 text-[13px] leading-snug">
              <span className="sr-only">{i.kind === "error" ? "Ошибка: " : "Готово: "}</span>
              {i.text}
            </p>
            <button type="button" aria-label="Закрыть" onClick={() => close(i.id)} className="rounded-lg p-1 text-white/60 transition hover:bg-white/10 hover:text-white">
              <IconX className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
