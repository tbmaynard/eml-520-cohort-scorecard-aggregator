import type { ParsedScorecard, Review } from './types';

/**
 * Reads one student scorecard CSV.
 *
 * The file starts with a few "key, value" lines, then a blank line, then the
 * score table. The parser only reads the keys it needs ("Challenge" and
 * "Reviewers cohort") from the top lines. Any other key, including
 * "Reviewer name", is skipped without its value ever being copied. The file
 * name is never passed in, so it cannot leak either.
 */

export const DEFAULT_MAX_PER_CRITERION = 5;

export class ScorecardError extends Error {}

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const META_KEYS_READ = new Set(['Challenge', 'Reviewers cohort']);

export function readScorecard(text: string, maxPerCriterion = DEFAULT_MAX_PER_CRITERION): ParsedScorecard {
  const rows = parseCsv(text);
  const meta: Record<string, string> = {};
  let header = -1;
  for (let i = 0; i < rows.length; i++) {
    const key = (rows[i][0] ?? '').trim();
    if (key === 'Cohort') { header = i; break; }
    // Allow-list: only these keys are read. Everything else, including the
    // reviewer's name, is never touched.
    if (META_KEYS_READ.has(key)) meta[key] = (rows[i][1] ?? '').trim();
  }
  if (header < 0) throw new ScorecardError('No score table found. The file needs a row that starts with "Cohort".');

  const head = rows[header].map((h) => h.trim());
  let critEnd = head.indexOf('Total (rated)');
  if (critEnd < 0) critEnd = head.indexOf('Criteria rated');
  if (critEnd < 0) critEnd = head.indexOf('Feedback');
  if (critEnd < 0) critEnd = head.length;
  const criteria = head.slice(1, critEnd).filter((c) => c !== '');
  if (criteria.length === 0) throw new ScorecardError('The score table has no criteria columns.');
  const feedbackCol = head.indexOf('Feedback');
  const reviewerCohort = meta['Reviewers cohort'] ?? '';

  const reviews: Review[] = [];
  let selfScoresDropped = 0;
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r];
    const cohort = (row[0] ?? '').trim();
    if (!cohort) continue;
    const scores = criteria.map((c, k) => {
      const raw = (row[k + 1] ?? '').trim();
      if (raw === '') return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > maxPerCriterion) {
        throw new ScorecardError(`${cohort}, ${c}: "${raw}" is not a score from 0 to ${maxPerCriterion}.`);
      }
      return n;
    });
    if (reviewerCohort && cohort === reviewerCohort) { selfScoresDropped++; continue; }
    // A row with nothing rated and no feedback carries no review.
    const feedback = feedbackCol >= 0 ? (row[feedbackCol] ?? '').trim() : '';
    if (scores.every((s) => s === null) && !feedback) continue;
    reviews.push({ cohort, scores, feedback });
  }

  const cohortsSeen = [...new Set([...reviews.map((x) => x.cohort), ...(reviewerCohort ? [reviewerCohort] : [])])];
  return { challenge: meta['Challenge'] ?? '', criteria, maxPerCriterion, reviews, selfScoresDropped, cohortsSeen };
}
