/**
 * The season file: one per section, anonymized, published at data/section-N.json.
 *
 * Privacy rule: nothing in this file may identify a reviewer. It never holds a
 * reviewer name, a reviewer's cohort, a file name or a submission time.
 */
export const SEASON_FORMAT = 'eml520-cohort-scorecard';

export interface SeasonFile {
  format: typeof SEASON_FORMAT;
  version: 1;
  /** Section number as text, matches the file name: section-1.json is "1". */
  sectionId: string;
  sectionName: string;
  criteria: string[];
  maxPerCriterion: number;
  totalWeeks: number;
  /** Every cohort known to the season, so a cohort that misses a week scores zero. */
  cohorts: string[];
  /** True once the instructor ends the season: weeks then carry results only. */
  ended: boolean;
  weeks: Week[];
}

export interface Week {
  week: number;
  challenge: string;
  /** ISO date (yyyy-mm-dd) the week was built. */
  published: string;
  /** Anonymous reviews, shuffled. Absent after the season ends. */
  reviews?: Review[];
  /** Weekly scores only. Present after the season ends, in place of reviews. */
  results?: CohortResult[];
}

export interface Review {
  /** The cohort being scored. */
  cohort: string;
  /** One score per criterion, in season.criteria order. null means not rated. */
  scores: (number | null)[];
  /** Written feedback. Empty when none was given or the instructor hid it. */
  feedback: string;
}

export interface CohortResult {
  cohort: string;
  score: number;
  presented: boolean;
}

/** What the parser returns for one CSV. Deliberately has no name field. */
export interface ParsedScorecard {
  challenge: string;
  criteria: string[];
  maxPerCriterion: number;
  reviews: Review[];
  /** Rows dropped because the reviewer's cohort scored itself. */
  selfScoresDropped: number;
  /**
   * Cohort names seen in the file, including the reviewer's own cohort.
   * Used only to build the season's cohort list; never linked to a review.
   */
  cohortsSeen: string[];
}
