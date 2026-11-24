import { describe, expect, it } from 'vitest';
import { parseCsv, readScorecard, ScorecardError } from '../parse';
import { SAMPLE } from './fixtures';

describe('parseCsv', () => {
  it('handles quotes, commas inside quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('"a","b, c"\r\n"say ""hi""",x')).toEqual([['a', 'b, c'], ['say "hi"', 'x']]);
  });
  it('keeps line breaks inside quoted cells', () => {
    expect(parseCsv('"one\ntwo",3')).toEqual([['one\ntwo', '3']]);
  });
});

describe('readScorecard', () => {
  it('reads the sample file', () => {
    const p = readScorecard(SAMPLE);
    expect(p.criteria).toEqual(['Execution', 'Strength', 'Credibility', 'Ownership']);
    expect(p.reviews).toHaveLength(5);
    expect(p.reviews[0]).toEqual({ cohort: 'Cohort 1', scores: [4, 5, 3, 4], feedback: 'Not bad' });
    expect(p.reviews[2].feedback).toBe('pretty, pretty, pretty good');
    expect(p.reviews[1].scores).toEqual([0, 0, 0, 0]);
    expect(p.cohortsSeen).toContain('Cohort 2');
  });

  it('never carries the reviewer name anywhere in its output', () => {
    const p = readScorecard(SAMPLE);
    const out = JSON.stringify(p);
    expect(out).not.toContain('Zelda');
    expect(out).not.toContain('Quokkaworth');
    expect(out).not.toContain('Reviewer name');
    expect(Object.keys(p).sort()).toEqual(['challenge', 'cohortsSeen', 'criteria', 'maxPerCriterion', 'reviews', 'selfScoresDropped']);
    p.reviews.forEach((r) => expect(Object.keys(r).sort()).toEqual(['cohort', 'feedback', 'scores']));
  });

  it('ignores the name even if the top lines are reordered', () => {
    const moved = '"Reviewers cohort","Cohort 2"\n"Challenge","Pricing"\n"Reviewer name","Zelda Quokkaworth"\n\n' + SAMPLE.split('\r\n').slice(4).join('\n');
    const p = readScorecard(moved);
    expect(JSON.stringify(p)).not.toContain('Zelda');
    expect(p.challenge).toBe('Pricing');
  });

  it('drops a row where the reviewer scored their own cohort', () => {
    const p = readScorecard(SAMPLE + '\r\n"Cohort 2","5","5","5","5","20","4/4","we were great"');
    expect(p.selfScoresDropped).toBe(1);
    expect(p.reviews.find((r) => r.cohort === 'Cohort 2')).toBeUndefined();
  });

  it('treats a blank score as not rated and 0 as a real zero', () => {
    const p = readScorecard(SAMPLE.replace('"Cohort 5","4","3","4","3"', '"Cohort 5","4","","4",""'));
    expect(p.reviews.find((r) => r.cohort === 'Cohort 5')!.scores).toEqual([4, null, 4, null]);
    expect(p.reviews.find((r) => r.cohort === 'Cohort 3')!.scores).toEqual([0, 0, 0, 0]);
  });

  it('skips rows with nothing rated and no feedback', () => {
    const p = readScorecard(SAMPLE + '\n"Cohort 7","","","","","0","0/4",""');
    expect(p.reviews.find((r) => r.cohort === 'Cohort 7')).toBeUndefined();
  });

  it('rejects scores outside 0 to 5', () => {
    expect(() => readScorecard(SAMPLE.replace('"Cohort 1","4"', '"Cohort 1","9"'))).toThrow(ScorecardError);
  });

  it('rejects a file with no score table', () => {
    expect(() => readScorecard('"Reviewer name","x"\n"hello","world"')).toThrow(/No score table/);
  });
});
