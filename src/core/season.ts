import { cohortSort, weekStats } from './scoring';
import { SEASON_FORMAT, type ParsedScorecard, type Review, type SeasonFile, type Week } from './types';

export const DEFAULT_TOTAL_WEEKS = 5;

export function sectionFileName(sectionId: string): string {
  return `section-${sectionId}.json`;
}

export function newSeason(sectionId: string, criteria: string[], maxPerCriterion: number): SeasonFile {
  return {
    format: SEASON_FORMAT,
    version: 1,
    sectionId,
    sectionName: `Section ${sectionId}`,
    criteria: [...criteria],
    maxPerCriterion,
    totalWeeks: DEFAULT_TOTAL_WEEKS,
    cohorts: [],
    ended: false,
    weeks: [],
  };
}

export class SeasonError extends Error {}

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string') throw new SeasonError(`${what} is missing or not text.`);
  return v;
};
const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SeasonError(`${what} is missing or not a number.`);
  return v;
};

/**
 * Checks a season file and rebuilds it with only the allowed fields. Anything
 * else in the file (for example a field someone added by hand) is dropped, so
 * a saved or published file can only ever hold anonymous data.
 */
export function sanitizeSeason(raw: unknown): SeasonFile {
  if (!raw || typeof raw !== 'object') throw new SeasonError('This is not a season file.');
  const o = raw as Record<string, unknown>;
  if (o.format !== SEASON_FORMAT) throw new SeasonError('This is not a Cohort Scorecard season file.');
  if (o.version !== 1) throw new SeasonError(`Season file version ${String(o.version)} is not supported.`);
  const criteria = Array.isArray(o.criteria) ? o.criteria.map((c, i) => str(c, `Criterion ${i + 1}`)) : [];
  if (!criteria.length) throw new SeasonError('The season file lists no criteria.');
  const weeksRaw = Array.isArray(o.weeks) ? o.weeks : [];
  const weeks: Week[] = weeksRaw.map((w: Record<string, unknown>, i) => {
    const week: Week = {
      week: num(w.week, `Week ${i + 1} number`),
      challenge: typeof w.challenge === 'string' ? w.challenge : '',
      published: typeof w.published === 'string' ? w.published : '',
    };
    if (Array.isArray(w.reviews)) {
      week.reviews = w.reviews.map((r: Record<string, unknown>): Review => ({
        cohort: str(r.cohort, `A review in week ${week.week}`),
        scores: Array.isArray(r.scores) ? r.scores.map((s) => (typeof s === 'number' && Number.isFinite(s) ? s : null)) : [],
        feedback: typeof r.feedback === 'string' ? r.feedback : '',
      }));
    }
    if (Array.isArray(w.results)) {
      week.results = w.results.map((r: Record<string, unknown>) => ({
        cohort: str(r.cohort, `A result in week ${week.week}`),
        score: num(r.score, `A result score in week ${week.week}`),
        presented: r.presented !== false,
      }));
    }
    if (!week.reviews && !week.results) week.reviews = [];
    return week;
  });
  return {
    format: SEASON_FORMAT,
    version: 1,
    sectionId: str(o.sectionId, 'Section number'),
    sectionName: typeof o.sectionName === 'string' && o.sectionName ? o.sectionName : `Section ${String(o.sectionId)}`,
    criteria,
    maxPerCriterion: typeof o.maxPerCriterion === 'number' ? o.maxPerCriterion : 5,
    totalWeeks: typeof o.totalWeeks === 'number' ? o.totalWeeks : DEFAULT_TOTAL_WEEKS,
    cohorts: Array.isArray(o.cohorts) ? o.cohorts.filter((c): c is string => typeof c === 'string') : [],
    ended: o.ended === true,
    weeks: weeks.sort((a, b) => a.week - b.week),
  };
}

export interface IncomingFile {
  /** Shown to the instructor in the builder to locate problems. Never stored. */
  label: string;
  parsed?: ParsedScorecard;
  error?: string;
}

export interface WeekDraft {
  criteria: string[];
  maxPerCriterion: number;
  challengeFromFiles: string;
  /** Combined reviews, grouped by cohort. Not yet shuffled. */
  reviews: Review[];
  cohortsSeen: string[];
  filesRead: number;
  duplicatesDropped: number;
  selfScoresDropped: number;
  partialReviews: number;
  problems: string[];
}

/**
 * Combines the parsed files for one week. Identical files (same scores and
 * comments) are kept once. Files whose criteria differ from the season's are
 * left out with a problem message.
 */
export function draftWeek(files: IncomingFile[], season: SeasonFile | null): WeekDraft {
  const problems: string[] = [];
  const ok = files.filter((f) => {
    if (f.error) problems.push(`${f.label}: ${f.error}`);
    return !!f.parsed;
  });
  const criteria = season?.criteria ?? ok[0]?.parsed?.criteria ?? [];
  const maxPerCriterion = season?.maxPerCriterion ?? ok[0]?.parsed?.maxPerCriterion ?? 5;
  const seen = new Set<string>();
  const reviews: Review[] = [];
  const cohortsSeen = new Set<string>();
  let duplicatesDropped = 0;
  let selfScoresDropped = 0;
  let filesRead = 0;
  const challenges = new Map<string, number>();

  for (const f of ok) {
    const p = f.parsed!;
    if (p.criteria.join('|') !== criteria.join('|')) {
      problems.push(`${f.label}: its criteria (${p.criteria.join(', ')}) do not match this season (${criteria.join(', ')}). File left out.`);
      continue;
    }
    const key = JSON.stringify(p.reviews);
    if (seen.has(key)) { duplicatesDropped++; continue; }
    seen.add(key);
    filesRead++;
    selfScoresDropped += p.selfScoresDropped;
    p.cohortsSeen.forEach((c) => cohortsSeen.add(c));
    p.reviews.forEach((r) => reviews.push({ cohort: r.cohort, scores: [...r.scores], feedback: r.feedback }));
    if (p.challenge) challenges.set(p.challenge, (challenges.get(p.challenge) ?? 0) + 1);
  }
  reviews.sort((a, b) => cohortSort(a.cohort, b.cohort));
  const challengeFromFiles = [...challenges.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return {
    criteria, maxPerCriterion, challengeFromFiles, reviews,
    cohortsSeen: [...cohortsSeen].sort(cohortSort),
    filesRead, duplicatesDropped, selfScoresDropped,
    partialReviews: reviews.filter((r) => r.scores.some((s) => s === null)).length,
    problems,
  };
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  const rand = (n: number) => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface AddWeekOptions {
  sectionId: string;
  week: number;
  challenge: string;
  /** Indexes into draft.reviews whose feedback text is removed. Scores still count. */
  hidden: Set<number>;
  today?: string;
}

/** Adds the drafted week to the season (replacing a week with the same number) and returns a new season. */
export function addWeek(season: SeasonFile | null, draft: WeekDraft, opt: AddWeekOptions): SeasonFile {
  const base = season ? sanitizeSeason(season) : newSeason(opt.sectionId, draft.criteria, draft.maxPerCriterion);
  if (base.ended) throw new SeasonError('This season has ended. Start a new season file to add weeks.');
  const reviews = shuffle(draft.reviews.map((r, i) => ({
    cohort: r.cohort,
    scores: [...r.scores],
    feedback: opt.hidden.has(i) ? '' : r.feedback,
  })));
  const week: Week = {
    week: opt.week,
    challenge: opt.challenge.trim(),
    published: opt.today ?? new Date().toISOString().slice(0, 10),
    reviews,
  };
  const weeks = base.weeks.filter((w) => w.week !== opt.week);
  weeks.push(week);
  weeks.sort((a, b) => a.week - b.week);
  const cohorts = [...new Set([...base.cohorts, ...draft.cohortsSeen])].sort(cohortSort);
  return { ...base, cohorts, weeks, totalWeeks: Math.max(base.totalWeeks, opt.week) };
}

export function removeWeek(season: SeasonFile, week: number): SeasonFile {
  return { ...season, weeks: season.weeks.filter((w) => w.week !== week) };
}

/**
 * Ends the season: every review and comment is removed and each week keeps only
 * its cohort scores, so the final leaderboard still adds up.
 */
export function endSeason(season: SeasonFile): SeasonFile {
  const s = sanitizeSeason(season);
  return {
    ...s,
    ended: true,
    weeks: s.weeks.map((w) => ({
      week: w.week,
      challenge: w.challenge,
      published: w.published,
      results: weekStats(s, w).map((x) => ({ cohort: x.cohort, score: Math.round(x.score * 1000) / 1000, presented: x.presented })),
    })),
  };
}

export function serializeSeason(season: SeasonFile): string {
  return JSON.stringify(sanitizeSeason(season), null, 1) + '\n';
}
