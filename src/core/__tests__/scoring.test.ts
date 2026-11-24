import { describe, expect, it } from 'vitest';
import { leaderboard, weekStats } from '../scoring';
import { newSeason } from '../season';
import type { Review, SeasonFile } from '../types';

const CRIT = ['A', 'B', 'C', 'D'];
const rv = (cohort: string, scores: (number | null)[], feedback = ''): Review => ({ cohort, scores, feedback });

function season(weeks: Review[][], cohorts = ['Cohort 1', 'Cohort 2', 'Cohort 3']): SeasonFile {
  const s = newSeason('1', CRIT, 5);
  s.cohorts = cohorts;
  s.weeks = weeks.map((reviews, i) => ({ week: i + 1, challenge: '', published: '', reviews }));
  return s;
}

describe('weekStats', () => {
  it('averages each criterion over the reviews that rated it', () => {
    // Cohort 1: A = (4+2)/2 = 3, B = (5+3)/2 = 4, C = 4 (one blank), D = (0+2)/2 = 1. Score = 12.
    const s = season([[rv('Cohort 1', [4, 5, null, 0]), rv('Cohort 1', [2, 3, 4, 2])]]);
    const c1 = weekStats(s, s.weeks[0]).find((x) => x.cohort === 'Cohort 1')!;
    expect(c1.criteria).toEqual([3, 4, 4, 1]);
    expect(c1.score).toBe(12);
    expect(c1.totals).toEqual([9, 11]);
    expect(c1.min).toBe(9);
    expect(c1.max).toBe(11);
  });

  it('averages, so a cohort with fewer reviews is not penalized', () => {
    const s = season([[
      rv('Cohort 1', [4, 4, 4, 4]), rv('Cohort 1', [4, 4, 4, 4]), rv('Cohort 1', [4, 4, 4, 4]),
      rv('Cohort 2', [5, 5, 5, 5]),
    ]]);
    const st = weekStats(s, s.weeks[0]);
    expect(st[0].cohort).toBe('Cohort 2');
    expect(st[0].win).toBe(true);
    expect(st[0].score).toBe(20);
  });

  it('shares the win when scores match to one decimal', () => {
    const s = season([[rv('Cohort 1', [4, 4, 4, 4]), rv('Cohort 2', [4, 4, 4, 4]), rv('Cohort 3', [1, 1, 1, 1])]]);
    const st = weekStats(s, s.weeks[0]);
    expect(st.filter((x) => x.win).map((x) => x.cohort).sort()).toEqual(['Cohort 1', 'Cohort 2']);
    expect(st.map((x) => x.rank)).toEqual([1, 1, 3]);
  });

  it('scores a cohort with no reviews as zero and not presented', () => {
    const s = season([[rv('Cohort 1', [4, 4, 4, 4])]]);
    const c3 = weekStats(s, s.weeks[0]).find((x) => x.cohort === 'Cohort 3')!;
    expect(c3.presented).toBe(false);
    expect(c3.score).toBe(0);
    expect(c3.win).toBe(false);
  });
});

describe('leaderboard', () => {
  it('sums weekly scores, counts wins and reports movement', () => {
    const s = season([
      [rv('Cohort 1', [5, 5, 5, 5]), rv('Cohort 2', [3, 3, 3, 3]), rv('Cohort 3', [2, 2, 2, 2])],
      [rv('Cohort 1', [1, 1, 1, 1]), rv('Cohort 2', [5, 5, 5, 5]), rv('Cohort 3', [5, 5, 4, 5])],
    ]);
    const lb = leaderboard(s);
    // Totals: C1 = 20 + 4 = 24, C2 = 12 + 20 = 32, C3 = 8 + 19 = 27.
    expect(lb.map((r) => [r.cohort, r.total])).toEqual([['Cohort 2', 32], ['Cohort 3', 27], ['Cohort 1', 24]]);
    expect(lb.find((r) => r.cohort === 'Cohort 1')!.wins).toBe(1);
    expect(lb.find((r) => r.cohort === 'Cohort 2')!.wins).toBe(1);
    // Week 1 order: C1, C2, C3. Week 2 order: C2, C3, C1.
    expect(lb.map((r) => r.movement)).toEqual([1, 1, -2]);
  });

  it('gives zero for a missed week', () => {
    const s = season([
      [rv('Cohort 1', [5, 5, 5, 5]), rv('Cohort 2', [5, 5, 5, 5])],
      [rv('Cohort 1', [5, 5, 5, 5])],
    ], ['Cohort 1', 'Cohort 2']);
    const c2 = leaderboard(s).find((r) => r.cohort === 'Cohort 2')!;
    expect(c2.total).toBe(20);
    expect(c2.weekly[1]).toMatchObject({ presented: false, score: 0 });
  });

  it('has no movement after one week', () => {
    const s = season([[rv('Cohort 1', [5, 5, 5, 5])]]);
    expect(leaderboard(s).every((r) => r.movement === null)).toBe(true);
  });
});
