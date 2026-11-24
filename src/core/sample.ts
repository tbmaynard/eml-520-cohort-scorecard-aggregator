import { SEASON_FORMAT, type Review, type SeasonFile } from './types';

/**
 * Invented sample season for ?example and the builder preview before real
 * data exists. Seeded, so it looks the same on every load. Not real results.
 */
const CRITERIA = ['Execution', 'Strength', 'Credibility', 'Ownership'];
const COHORTS = ['Cohort 1', 'Cohort 2', 'Cohort 3', 'Cohort 4', 'Cohort 5', 'Cohort 6'];
const CHALLENGES = ['Customer discovery', 'Pricing the product', 'Competitive landscape'];

const FEEDBACK = {
  high: ['Clear story from problem to ask. The customer interviews made it credible.', 'Best pitch of the night. Every claim had a number behind it.', 'Strong ownership of the numbers, they answered every question directly.', 'Loved the demo. Pricing logic was easy to follow.', 'Tight, confident, and the market sizing was realistic.', 'Really well rehearsed. Clear roles for each presenter.'],
  mid: ['Good idea, but the revenue assumptions felt optimistic.', 'Solid structure. Needed more evidence for the customer pain.', 'Slides were busy. The core point got lost in the middle.', 'Strong opening, weaker finish. The ask was unclear.', 'Credible team, but competition was waved away too fast.', 'Decent work. I wanted to hear more about the go-to-market.', ''],
  low: ['Hard to tell what problem they were solving.', 'Ran out of time before the financials.', 'Numbers did not match between slides.', 'Needed a clearer recommendation at the end.', ''],
};

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleSeason(): SeasonFile {
  const base: Record<string, number> = { 'Cohort 1': 3.7, 'Cohort 2': 3.2, 'Cohort 3': 2.7, 'Cohort 4': 3.9, 'Cohort 5': 3.4, 'Cohort 6': 2.9 };
  const shifts = [[0, 0, 0, 0, 0, 0], [0.3, -0.2, 0.5, -0.3, 0.1, 0.4], [-0.1, 0.5, 0.2, 0.1, -0.2, 0.3]];
  const bias: Record<string, number[]> = { 'Cohort 1': [0.3, 0, 0.2, -0.2], 'Cohort 2': [0, 0.3, -0.3, 0.2], 'Cohort 3': [-0.2, 0.2, 0, 0.1], 'Cohort 4': [0.2, 0.1, 0.2, 0.3], 'Cohort 5': [0, -0.2, 0.3, 0], 'Cohort 6': [0.2, 0, -0.3, 0.2] };
  const weeks = CHALLENGES.map((challenge, wi) => {
    const r = rng(1000 + (wi + 1) * 97);
    const normal = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const reviews: Review[] = [];
    COHORTS.forEach((c, ci) => {
      const n = 18 + Math.floor(r() * 7);
      const m = base[c] + shifts[wi][ci];
      for (let i = 0; i < n; i++) {
        const rater = normal() * 0.45 + (r() < 0.06 ? -2.2 : 0);
        const scores: (number | null)[] = CRITERIA.map((_, k) => Math.max(0, Math.min(5, Math.round(m + bias[c][k] + rater + normal() * 0.55))));
        if (r() < 0.04) scores[3] = null;
        const tot = scores.reduce<number>((a, b) => a + (b ?? 0), 0);
        const pool = tot >= 16 ? FEEDBACK.high : tot >= 11 ? FEEDBACK.mid : FEEDBACK.low;
        reviews.push({ cohort: c, scores, feedback: pool[Math.floor(r() * pool.length)] });
      }
    });
    for (let j = reviews.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [reviews[j], reviews[k]] = [reviews[k], reviews[j]]; }
    return { week: wi + 1, challenge, published: `2026-01-${String(14 + wi * 7).padStart(2, '0')}`, reviews };
  });
  return {
    format: SEASON_FORMAT, version: 1, sectionId: '1', sectionName: 'Sample section',
    criteria: CRITERIA, maxPerCriterion: 5, totalWeeks: 5, cohorts: COHORTS, ended: false, weeks,
  };
}
