/**
 * What the user's experience level changes, in one place (DESIGN.md, "What
 * the level changes"). Screens ask these functions rather than checking the
 * level themselves, so the rules stay consistent and easy to adjust.
 *
 * Guidance explains; it never recommends. Every level sees the same numbers —
 * the level only changes how much is explained around them.
 */

import { ExperienceLevel } from '../types';

export const LEVELS: { id: ExperienceLevel; label: string; description: string }[] = [
  {
    id: 'BEGINNER',
    label: 'Beginner',
    description: 'I’ve never bought a stock, or I’m not sure what a P/E ratio or an ETF is.',
  },
  {
    id: 'INTERMEDIATE',
    label: 'Intermediate',
    description: 'I have a brokerage account and know the basics. I want to get better.',
  },
  {
    id: 'ADVANCED',
    label: 'Advanced',
    description: 'I’m comfortable with indicators and position sizing. I want the tools, not the lessons.',
  },
];

export const levelLabel = (level: ExperienceLevel) => LEVELS.find(l => l.id === level)!.label;

/**
 * How financial terms are explained: written out under each one, available
 * on hover, or not at all. Screens may still offer a manual toggle.
 */
export type ExplainMode = 'inline' | 'hover' | 'off';

export const explainMode = (level: ExperienceLevel): ExplainMode =>
  level === 'BEGINNER' ? 'inline' : level === 'INTERMEDIATE' ? 'hover' : 'off';

/** Beginners get a plain-language summary above the indicator numbers. */
export const showsPlainSummary = (level: ExperienceLevel) => level === 'BEGINNER';

/**
 * Beginners start on a simpler Home: no market strip or market news, practice
 * at the top, and fewer holdings columns. One click shows the full dashboard.
 */
export const showsSimplifiedHome = (level: ExperienceLevel) => level === 'BEGINNER';

/** Context notes (practice market notes, the portfolio-weight tip) start visible. */
export const showsContextNotes = (level: ExperienceLevel) => level !== 'ADVANCED';

/**
 * Whether a practice order should stop for confirmation first.
 * Beginners confirm every order; intermediates only when a buy would push the
 * position past the risk limit; advanced users never.
 */
export const needsOrderConfirmation = (
  level: ExperienceLevel,
  order: { side: 'BUY' | 'SELL'; weightAfter: number },
  riskLimit: number,
) => {
  if (level === 'BEGINNER') return true;
  if (level === 'INTERMEDIATE') return order.side === 'BUY' && order.weightAfter > riskLimit;
  return false;
};

/** A line for the AI's system prompt so its writing fits the reader. */
export const readingLevelInstruction = (level: ExperienceLevel | undefined) =>
  level === 'BEGINNER'
    ? 'The reader is new to investing: use plain language and briefly explain any financial term you use.'
    : level === 'ADVANCED'
      ? 'The reader is an experienced investor: be concise and use standard financial terms without defining them.'
      : '';
