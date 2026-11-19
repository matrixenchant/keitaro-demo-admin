import { useState, type MouseEvent } from "react";
import { Button, IconButton, IconCheck, IconCopy } from "./ui";

interface Props { text: string; variant?: "icon" | "button"; size?: "sm" | "md"; label?: string; className?: string }

export default function CopyButton({ text, variant = "icon", size = "sm", label = "Скопировать ссылку", className = "" }: Props) {
  const [done, setDone] = useState(false);
  const copy = async (e: MouseEvent) => {
    // кнопка часто лежит внутри кликабельной карточки или строки
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  const glyph = done ? <IconCheck className="size-4 text-ok" /> : <IconCopy className="size-4" />;
  return (
    <>
      {variant === "icon" ? (
        <IconButton label={done ? "Скопировано" : label} size={size} onClick={copy} className={className}>{glyph}</IconButton>
      ) : (
        <Button variant="secondary" size={size} onClick={copy} className={className}>
          {glyph}
          {done ? "Скопировано" : "Копировать"}
        </Button>
      )}
      <span className="sr-only" role="status">{done ? "Ссылка скопирована" : ""}</span>
    </>
  );
}
