"use client";

import { useEffect, useState } from "react";

type Appearance = "light" | "dark" | "system";

const STORAGE_KEY = "recall-appearance";

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
];

function isAppearance(value: string | null): value is Appearance {
  return value === "light" || value === "dark" || value === "system";
}

export default function AppearanceSwitcher() {
  const [appearance, setAppearance] = useState<Appearance>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isAppearance(saved)) {
      setAppearance(saved);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const resolved =
        appearance === "system"
          ? (media.matches ? "dark" : "light")
          : appearance;

      document.documentElement.dataset.theme = resolved;
    };

    apply();
    media.addEventListener("change", apply);

    return () => media.removeEventListener("change", apply);
  }, [appearance]);

  function selectAppearance(value: Appearance) {
    setAppearance(value);
    window.localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <div
      aria-label="Appearance settings"
      className="rounded-xl border border-white/15 bg-white/5 p-1"
    >
      <div className="grid grid-cols-3 gap-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={appearance === option.value}
            onClick={() => selectAppearance(option.value)}
            className={
              "rounded-lg px-2 py-2 text-xs font-medium transition-colors " +
              (appearance === option.value
                ? "bg-[#e7e2d9] text-[#242b29]"
                : "text-[#c5d8c8] hover:bg-white/10 hover:text-white")
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
