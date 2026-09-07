"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAtrium } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ThemeSync() {
  const theme = useAtrium((s) => s.theme);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const isLight = root.classList.contains("light");
    if (isLight === (theme === "light") && root.style.colorScheme === theme) return;
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
  }, [theme]);
  return null;
}

export function ThemeToggle({ compact = true }: { compact?: boolean }) {
  const theme = useAtrium((s) => s.theme);
  const setTheme = useAtrium((s) => s.setTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === "dark" : true;
  const label = isDark ? "Switch to light" : "Switch to dark";

  return (
    <Button
      variant="outline"
      size={compact ? "icon" : "default"}
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="relative size-4">
        <Sun
          className={cn(
            "absolute inset-0 size-4 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
            isDark ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-none",
          )}
        />
        <Moon
          className={cn(
            "size-4 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
            isDark ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        />
      </span>
      {compact ? null : <span>{isDark ? "Dark" : "Light"}</span>}
    </Button>
  );
}

export function AppearancePicker() {
  const theme = useAtrium((s) => s.theme);
  const setTheme = useAtrium((s) => s.setTheme);
  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          { id: "light" as const, label: "Light" },
          { id: "dark" as const, label: "Dark" },
        ]
      ).map((opt) => {
        const on = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={on}
            onClick={() => setTheme(opt.id)}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium",
              on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
