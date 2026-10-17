import { useEffect, useMemo, useRef, useState } from "react";
import { searchPlayers } from "../lib/engine";
import type { Dataset } from "../lib/types";

interface Props {
  ds: Dataset;
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

/** Guess box with player autocomplete (keyboard + mouse). */
export function GuessInput({ ds, disabled, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => (open ? searchPlayers(ds, value, 8) : []), [ds, value, open]);

  useEffect(() => setActive(-1), [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && suggestions[active]) submit(suggestions[active].name);
      else submit(value);
    }
  };

  return (
    <div className="guessbar" ref={wrap}>
      <input
        ref={input}
        type="text"
        value={value}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Type a player name…"
        aria-label="Guess a player"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        enterKeyHint="send"
      />
      <button className="btn primary" disabled={disabled || !value.trim()} onClick={() => submit(value)}>
        Guess
      </button>

      {open && suggestions.length > 0 && (
        <div className="suggest" role="listbox">
          {suggestions.map((s, i) => (
            <button
              key={s.pid}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => submit(s.name)}
            >
              <span>{s.name}</span>
              <span className="yrs">{ds.players.debut[s.pid] || ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
