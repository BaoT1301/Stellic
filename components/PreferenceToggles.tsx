"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Preferences } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * CLAUDE.md §13: "a single row of toggles and a regenerate button. That is the
 * entire 'talk to it' experience, and it's enough." §5 closed the free-form chat
 * interface — structured controls are faster to build, cannot break in a live
 * demo, and look more finished on video.
 *
 * §15's cut order singles out "no morning classes" as the one to keep if the
 * row has to shrink, because it makes regenerate visibly change something on
 * camera. Keep it first in the row for that reason.
 */

const TOGGLES: {
  key: keyof Preferences;
  label: string;
  hint: string;
}[] = [
  {
    key: "noMornings",
    label: "No morning classes",
    hint: "Nothing starting before 10:00",
  },
  {
    key: "lighterWorkload",
    label: "Lighter workload",
    hint: "Target 12 credits instead of 15",
  },
  {
    key: "inPersonOnly",
    label: "In person only",
    hint: "Drop online and asynchronous sections",
  },
];

export interface PreferenceTogglesProps {
  preferences: Preferences;
  onChange: (next: Preferences) => void;
  onRegenerate: () => void;
  /** True while the three options are being rebuilt. */
  isWorking?: boolean;
  /** True when the toggles no longer match what produced the cards on screen. */
  dirty?: boolean;
}

export function PreferenceToggles({
  preferences,
  onChange,
  onRegenerate,
  isWorking = false,
  dirty = false,
}: PreferenceTogglesProps) {
  const set = (key: keyof Preferences, value: boolean) =>
    onChange({ ...preferences, [key]: value });

  return (
    <div className="flex flex-col gap-4 rounded-md border border-rule bg-card px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2 lg:w-44 lg:shrink-0">
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Adjust and rebuild</p>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-3">
        {TOGGLES.map((toggle) => {
          const on = preferences[toggle.key];
          return (
            <div key={toggle.key} className="flex items-center gap-2.5">
              <Switch
                checked={on}
                onCheckedChange={(checked) => set(toggle.key, checked)}
                aria-label={`${toggle.label}. ${toggle.hint}.`}
                disabled={isWorking}
              />
              <button
                type="button"
                onClick={() => set(toggle.key, !on)}
                disabled={isWorking}
                className="text-left"
              >
                <span
                  className={cn(
                    "block text-sm leading-tight transition-colors",
                    on ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {toggle.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {toggle.hint}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <Button
        onClick={onRegenerate}
        disabled={isWorking}
        variant={dirty ? "default" : "outline"}
        size="lg"
        className="shrink-0"
      >
        <RotateCcw className={cn(isWorking && "animate-spin")} aria-hidden />
        {isWorking ? "Rebuilding…" : "Regenerate"}
      </Button>
    </div>
  );
}
