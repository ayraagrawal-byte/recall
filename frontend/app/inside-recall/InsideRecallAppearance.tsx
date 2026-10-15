"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";
const KEY = "recall-appearance";
const modes: { value: Mode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
];

export default function InsideRecallAppearance() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      setMode(saved);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        mode === "system" ? (media.matches ? "dark" : "light") : mode;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mode]);

  function choose(value: Mode) {
    localStorage.setItem(KEY, value);
    setMode(value);
  }

  return (
    <div className="ir-appearance" role="group" aria-label="Appearance">
      {modes.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          className={mode === option.value ? "selected" : ""}
          onClick={() => choose(option.value)}
        >
          {option.label}
        </button>
      ))}
      <style jsx>{`
        .ir-appearance {
          display: flex;
          gap: 2px;
          align-items: center;
          border: 1px solid var(--border-soft);
          padding: 3px;
          margin-left: auto;
          flex-shrink: 0;
        }
        .ir-appearance button {
          appearance: none;
          border: 0;
          border-radius: 2px;
          background: transparent;
          color: var(--text-muted);
          font-size: 11px;
          padding: 7px 10px;
          cursor: pointer;
        }
        .ir-appearance button.selected {
          background: var(--accent-soft);
          color: var(--foreground);
          font-weight: 600;
        }
        .ir-appearance button:hover:not(.selected) {
          color: var(--foreground);
          background: var(--surface-soft);
        }
        .ir-appearance button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        @media (max-width: 560px) {
          .ir-appearance button { padding: 7px 6px; font-size: 10px; }
        }
      `}</style>
    </div>
  );
}
