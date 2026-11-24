import { describe, expect, it } from 'vitest';
import { readScorecard } from '../parse';
import { leaderboard } from '../scoring';
import { addWeek, draftWeek, endSeason, sanitizeSeason, serializeSeason, type IncomingFile } from '../season';
import { SAMPLE } from './fixtures';

const NAMES = ['Zelda Quokkaworth', 'Barnaby Thistlewhite', 'Ingrid Pemberly-Osei'];

function scorecard(name: string, reviewerCohort: string, rows: [string, number[], string][]): string {
  return [
    `"Reviewer name","${name}"`,
    '"Challenge","Pricing the product"',
    `"Reviewers cohort","${reviewerCohort}"`,
    '',
    '"Cohort","Execution","Strength","Credibility","Ownership","Total (rated)","Criteria rated","Feedback"',
    ...rows.map(([c, s, f]) => `"${c}",${s.map((v) => `"${v}"`).join(',')},"${s.reduce((a, b) => a + b, 0)}","4/4","${f}"`),
  ].join('\n');
}

const files = (): IncomingFile[] => [
  { label: `challenge-scorecard ${NAMES[0]}.csv`, parsed: readScorecard(SAMPLE) },
  { label: `${NAMES[1]}.csv`, parsed: readScorecard(scorecard(NAMES[1], 'Cohort 1', [['Cohort 2', [3, 3, 3, 3], 'ok'], ['Cohort 3', [4, 4, 4, 4], 'good'], ['Cohort 1', [5, 5, 5, 5], 'us!']])) },
  { label: `${NAMES[2]}.csv`, parsed: readScorecard(scorecard(NAMES[2], 'Cohort 1', [['Cohort 2', [3, 3, 3, 3], 'ok'], ['Cohort 3', [4, 4, 4, 4], 'good'], ['Cohort 1', [5, 5, 5, 5], 'us!']])) },
];

describe('building a week', () => {
  it('drops identical files and self scores, and finds the challenge title', () => {
    const d = draftWeek(files(), null);
    expect(d.filesRead).toBe(2);
    expect(d.duplicatesDropped).toBe(1);
    expect(d.selfScoresDropped).toBe(1);
    expect(d.reviews).toHaveLength(7);
    expect(d.challengeFromFiles).toBe('Pricing the product');
    expect(d.cohortsSeen).toEqual(['Cohort 1', 'Cohort 2', 'Cohort 3', 'Cohort 4', 'Cohort 5', 'Cohort 6']);
  });

  it('reports files with different criteria and leaves them out', () => {
    const odd = readScorecard('"Cohort","Speed","Total (rated)"\n"Cohort 1","3","3"');
    const d = draftWeek([...files(), { label: 'odd.csv', parsed: odd }], null);
    expect(d.problems.some((p) => p.startsWith('odd.csv'))).toBe(true);
    expect(d.filesRead).toBe(2);
  });

  it('hides chosen comments but keeps their scores', () => {
    const d = draftWeek(files(), null);
    const awful = d.reviews.findIndex((r) => r.feedback === 'awful');
    const s = addWeek(null, d, { sectionId: '1', week: 1, challenge: 'Pricing', hidden: new Set([awful]), today: '2026-01-14' });
    const reviews = s.weeks[0].reviews!;
    expect(reviews.some((r) => r.feedback === 'awful')).toBe(false);
    expect(reviews.filter((r) => r.cohort === 'Cohort 3')).toHaveLength(2);
    expect(reviews).toHaveLength(7);
  });

  it('replaces a week with the same number', () => {
    const d = draftWeek(files(), null);
    let s = addWeek(null, d, { sectionId: '1', week: 1, challenge: 'First', hidden: new Set() });
    s = addWeek(s, d, { sectionId: '1', week: 2, challenge: 'Second', hidden: new Set() });
    s = addWeek(s, d, { sectionId: '1', week: 1, challenge: 'First again', hidden: new Set() });
    expect(s.weeks.map((w) => [w.week, w.challenge])).toEqual([[1, 'First again'], [2, 'Second']]);
  });
});

describe('privacy of the saved file', () => {
  it('never contains a reviewer name, a file name or the reviewer cohort field', () => {
    const d = draftWeek(files(), null);
    const s = addWeek(null, d, { sectionId: '1', week: 1, challenge: '', hidden: new Set() });
    const out = serializeSeason(s);
    for (const n of NAMES) for (const part of n.split(/[\s-]/)) expect(out).not.toContain(part);
    expect(out).not.toContain('.csv');
    expect(out).not.toMatch(/reviewer/i);
    expect(out).not.toContain('challenge-scorecard');
  });

  it('strips unknown fields from a loaded file', () => {
    const d = draftWeek(files(), null);
    const s = addWeek(null, d, { sectionId: '1', week: 1, challenge: '', hidden: new Set() });
    const tampered = JSON.parse(serializeSeason(s));
    tampered.reviewerNames = ['Zelda'];
    tampered.weeks[0].reviews[0].reviewer = 'Zelda';
    tampered.weeks[0].reviews[0].reviewerCohort = 'Cohort 2';
    const clean = serializeSeason(sanitizeSeason(tampered));
    expect(clean).not.toContain('Zelda');
    expect(clean).not.toContain('reviewerCohort');
  });
});

describe('ending the season', () => {
  it('removes every review and comment but keeps the leaderboard', () => {
    const d = draftWeek(files(), null);
    let s = addWeek(null, d, { sectionId: '1', week: 1, challenge: '', hidden: new Set() });
    s = addWeek(s, d, { sectionId: '1', week: 2, challenge: '', hidden: new Set() });
    const before = leaderboard(s).map((r) => [r.cohort, Math.round(r.total * 100) / 100]);
    const ended = endSeason(s);
    const out = serializeSeason(ended);
    expect(out).not.toContain('Not bad');
    expect(out).not.toContain('"reviews"');
    expect(ended.ended).toBe(true);
    expect(leaderboard(sanitizeSeason(JSON.parse(out))).map((r) => [r.cohort, Math.round(r.total * 100) / 100])).toEqual(before);
  });

  it('refuses to add weeks after the end', () => {
    const d = draftWeek(files(), null);
    const s = endSeason(addWeek(null, d, { sectionId: '1', week: 1, challenge: '', hidden: new Set() }));
    expect(() => addWeek(s, d, { sectionId: '1', week: 2, challenge: '', hidden: new Set() })).toThrow(/ended/);
  });
});
