import type { Review, SeasonFile, Week } from './types';

/**
 * Scoring rules (agreed with the instructor):
 * - A cohort's weekly score is the average total across the reviews it received.
 *   Each criterion is averaged over the reviews that rated it (blank is skipped,
 *   0 counts), and the weekly score is the sum of those criterion averages.
 * - The winner has the highest weekly score. Scores equal to one decimal place share the rank.
 * - A cohort with no reviews in a week did not present and scores 0.
 * - The leaderboard is the sum of weekly scores.
 */

export interface CohortWeekStats {
  cohort: string;
  presented: boolean;
  reviewCount: number;
  /** Average per criterion, season.criteria order. null when no review rated it. */
  criteria: (number | null)[];
  score: number;
  /** Each review's total (sum of rated scores). */
  totals: number[];
  min: number;
  max: number;
  rank: number;
  win: boolean;
  reviews: Review[];
}

export const round1 = (x: number): number => Math.round(x * 10 + 1e-9) / 10;
export const fmt1 = (x: number): string => round1(x).toFixed(1);

export function reviewTotal(r: Review): number {
  return r.scores.reduce<number>((s, v) => s + (v ?? 0), 0);
}

export function maxTotal(season: Pick<SeasonFile, 'criteria' | 'maxPerCriterion'>): number {
  return season.criteria.length * season.maxPerCriterion;
}

/** Assigns shared ranks (1, 1, 3, ...) on scores rounded to one decimal place. */
function rankInPlace(list: { score: number; rank: number; win: boolean; presented: boolean }[]): void {
  list.sort((a, b) => b.score - a.score);
  list.forEach((s, i) => {
    s.rank = i > 0 && round1(s.score) === round1(list[i - 1].score) ? list[i - 1].rank : i + 1;
  });
  const anyPresented = list.some((s) => s.presented);
  list.forEach((s) => { s.win = anyPresented && s.presented && s.rank === 1; });
}

export function weekStats(season: SeasonFile, week: Week): CohortWeekStats[] {
  const n = season.criteria.length;
  const cohorts = [...new Set([...season.cohorts, ...(week.reviews ?? []).map((r) => r.cohort), ...(week.results ?? []).map((r) => r.cohort)])];
  const out: CohortWeekStats[] = cohorts.map((cohort) => {
    if (!week.reviews) {
      const res = week.results?.find((r) => r.cohort === cohort);
      return {
        cohort, presented: res?.presented ?? false, reviewCount: 0, criteria: Array(n).fill(null),
        score: res?.score ?? 0, totals: [], min: 0, max: 0, rank: 0, win: false, reviews: [],
      };
    }
    const reviews = week.reviews.filter((r) => r.cohort === cohort);
    const criteria = Array.from({ length: n }, (_, k) => {
      const rated = reviews.map((r) => r.scores[k]).filter((v): v is number => v !== null && v !== undefined);
      return rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
    });
    const totals = reviews.map(reviewTotal);
    return {
      cohort,
      presented: reviews.length > 0,
      reviewCount: reviews.length,
      criteria,
      score: criteria.reduce<number>((s, v) => s + (v ?? 0), 0),
      totals,
      min: totals.length ? Math.min(...totals) : 0,
      max: totals.length ? Math.max(...totals) : 0,
      rank: 0,
      win: false,
      reviews,
    };
  });
  rankInPlace(out);
  return out;
}

export interface LeaderRow {
  cohort: string;
  weekly: { week: number; score: number; presented: boolean; win: boolean }[];
  total: number;
  wins: number;
  rank: number;
  /** Positive means the cohort moved up since the previous week. null in week 1. */
  movement: number | null;
}

export function leaderboard(season: SeasonFile): LeaderRow[] {
  const weeks = [...season.weeks].sort((a, b) => a.week - b.week);
  const stats = weeks.map((w) => weekStats(season, w));
  const cohorts = [...new Set([...season.cohorts, ...stats.flatMap((s) => s.map((x) => x.cohort))])];

  const build = (upTo: number) => cohorts.map((cohort) => {
    const weekly = weeks.slice(0, upTo).map((w, i) => {
      const s = stats[i].find((x) => x.cohort === cohort);
      return { week: w.week, score: s?.score ?? 0, presented: s?.presented ?? false, win: s?.win ?? false };
    });
    return {
      cohort, weekly,
      total: weekly.reduce((a, w) => a + w.score, 0),
      wins: weekly.filter((w) => w.win).length,
      rank: 0, win: false, presented: true, score: 0, movement: null as number | null,
    };
  });

  const rank = (rows: ReturnType<typeof build>) => {
    rows.forEach((r) => { r.score = r.total; });
    rankInPlace(rows);
    return rows;
  };

  const now = rank(build(weeks.length));
  if (weeks.length > 1) {
    const before = rank(build(weeks.length - 1));
    now.forEach((r) => {
      const prev = before.find((b) => b.cohort === r.cohort);
      r.movement = prev ? prev.rank - r.rank : null;
    });
  }
  return now.map(({ cohort, weekly, total, wins, rank: rk, movement }) => ({ cohort, weekly, total, wins, rank: rk, movement }));
}

/** Natural sort so "Cohort 10" follows "Cohort 9". */
export function cohortSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
