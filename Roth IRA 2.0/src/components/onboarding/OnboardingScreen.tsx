import { useState } from 'react';
import { ExperienceLevel } from '../../types';
import { LEVELS } from '../../lib/level';
import { cn } from '../../lib/utils';
import { APP_NAME } from '../layout/AppHeader';

const WHAT_CHANGES: Record<ExperienceLevel, string> = {
  BEGINNER: 'Terms are explained as you go, indicators come with a plain-language summary, and practice trades are explained before they go through.',
  INTERMEDIATE: 'Explanations are a hover away, and practice warns you only when a trade would put too much in one place.',
  ADVANCED: 'Just the numbers and tools — no explanations or prompts.',
};

interface OnboardingScreenProps {
  onChoose: (level: ExperienceLevel) => void;
}

/** First-launch question: how much the app should explain. */
export function OnboardingScreen({ onChoose }: OnboardingScreenProps) {
  const [selected, setSelected] = useState<ExperienceLevel | null>(null);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12 sm:px-6">
      <p className="font-mono text-[15px] font-medium tracking-tight">{APP_NAME}</p>
      <h1 className="mt-6 text-[28px] font-medium leading-tight tracking-tight">Welcome. How much do you know about investing?</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        Track the investments you already own — no money moves through this app — and practice trading with play
        money. Your answer decides how much the app explains. You can change it any time in Settings.
      </p>

      <fieldset className="mt-8">
        <legend className="sr-only">Your experience level</legend>
        <div className="flex flex-col gap-3">
          {LEVELS.map(level => {
            const active = selected === level.id;
            return (
              <label
                key={level.id}
                className={cn(
                  'flex cursor-pointer items-start gap-4 rounded-lg border px-5 py-4 transition-colors',
                  active ? 'border-accent bg-accent-tint' : 'border-line hover:border-edge hover:bg-surface',
                )}
              >
                <input
                  type="radio"
                  name="experience-level"
                  value={level.id}
                  checked={active}
                  onChange={() => setSelected(level.id)}
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-base font-semibold">{level.label}</span>
                  <span className="mt-0.5 block text-sm text-ink-2">{level.description}</span>
                  {active && <span className="mt-2 block text-sm text-muted">{WHAT_CHANGES[level.id]}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => selected && onChoose(selected)}
        disabled={!selected}
        className="mt-8 h-11 self-start rounded-full bg-accent px-6 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-50"
      >
        Continue
      </button>
    </main>
  );
}
