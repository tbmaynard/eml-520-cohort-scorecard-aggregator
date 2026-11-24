import { fmt1, leaderboard, maxTotal, reviewTotal, weekStats, type CohortWeekStats } from '../core/scoring';
import type { SeasonFile, Week } from '../core/types';

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const WEEK_COLORS = ['var(--w1)', 'var(--w2)', 'var(--w3)', 'var(--w4)', 'var(--w5)'];
const weekColor = (i: number) => WEEK_COLORS[i % WEEK_COLORS.length];

export interface DashboardOptions {
  seasons: SeasonFile[];
  /** Keep ?section= and ?view= in the address bar so links can be shared. */
  syncUrl: boolean;
  initialSection?: string;
  initialView?: string;
  /** Shown above the tabs, for sample data or the builder preview. */
  banner?: string;
}

type SortMode = 'mixed' | 'high' | 'low';

export function mountDashboard(root: HTMLElement, opts: DashboardOptions) {
  let seasons = opts.seasons;
  let sectionId = opts.initialSection && seasons.some((s) => s.sectionId === opts.initialSection) ? opts.initialSection : seasons[0]?.sectionId;
  let view = opts.initialView ?? '';
  let sort: SortMode = 'mixed';
  let openCohort: string | null = null;
  let returnFocus: HTMLElement | null = null;

  const season = () => seasons.find((s) => s.sectionId === sectionId) ?? seasons[0];
  const weeks = () => [...season().weeks].sort((a, b) => a.week - b.week);
  const latestView = () => {
    const s = season();
    if (s.ended || !s.weeks.length) return 'leaderboard';
    return `week-${weeks()[weeks().length - 1].week}`;
  };
  const validView = (v: string) => {
    if (v === 'leaderboard') return true;
    const m = /^week-(\d+)$/.exec(v);
    return !!m && !season().ended && season().weeks.some((w) => w.week === +m[1]);
  };
  const currentWeek = (): Week | undefined => {
    const m = /^week-(\d+)$/.exec(view);
    return m ? season().weeks.find((w) => w.week === +m[1]) : undefined;
  };

  function syncUrl() {
    if (!opts.syncUrl) return;
    const p = new URLSearchParams(location.search);
    if (seasons.length > 1 || sectionId !== '1') p.set('section', sectionId); else p.delete('section');
    p.set('view', view);
    history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`);
  }

  function render() {
    if (!seasons.length) {
      root.innerHTML = `<div class="card empty-state"><h2>No results yet</h2><p>Results will appear here after the first challenge.</p></div>`;
      return;
    }
    if (!validView(view)) view = latestView();
    syncUrl();
    const s = season();
    const played = weeks();
    const total = Math.max(s.totalWeeks, played.length ? played[played.length - 1].week : 0);
    const heading = view === 'leaderboard' ? (s.ended ? 'Final standings' : 'Season leaderboard') : `Week ${currentWeek()!.week} results`;

    let tabs = '';
    if (!s.ended) {
      for (let w = 1; w <= total; w++) {
        const has = played.some((x) => x.week === w);
        tabs += `<button class="tab" role="tab" aria-selected="${view === `week-${w}`}" ${has ? `data-view="week-${w}"` : 'disabled title="Not played yet"'}>Week ${w}</button>`;
      }
    }
    tabs += `<button class="tab tab-lead" role="tab" data-view="leaderboard" aria-selected="${view === 'leaderboard'}"><span class="pip"></span>${s.ended ? 'Final standings' : 'Leaderboard'}</button>`;

    const picker = seasons.length > 1
      ? `<label class="section-pick" for="sectionSel">Section <select id="sectionSel">${seasons.map((x) => `<option value="${esc(x.sectionId)}"${x.sectionId === sectionId ? ' selected' : ''}>${esc(x.sectionName)}</option>`).join('')}</select></label>`
      : '';

    root.innerHTML = `
      <header class="top">
        <div><div class="eyebrow">EML 520 · Cohort Challenges${seasons.length > 1 || s.sectionName !== 'Section 1' ? ` · ${esc(s.sectionName)}` : ''}</div><h1>${esc(heading)}</h1></div>
        ${picker}
      </header>
      ${opts.banner ? `<div class="banner">${esc(opts.banner)}</div>` : ''}
      ${s.ended ? `<div class="banner info">This season is over. Weekly reviews and comments have been removed; the final standings remain.</div>` : ''}
      <div class="tabs" role="tablist">${tabs}</div>
      <div class="view">${view === 'leaderboard' ? leaderboardHtml(s) : weekHtml(s, currentWeek()!)}</div>`;
    countUp(root);
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const v = t.closest<HTMLElement>('[data-view]');
    if (v) { view = v.dataset.view!; render(); return; }
    const o = t.closest<HTMLElement>('[data-open]');
    if (o) { returnFocus = o; sort = 'mixed'; openSheet(o.dataset.open!); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'sectionSel') { sectionId = (t as HTMLSelectElement).value; view = ''; render(); }
  });

  // ---------- Drill-down ----------
  const host = document.createElement('div');
  document.body.appendChild(host);

  function openSheet(cohort: string) {
    const s = season();
    const wk = currentWeek();
    if (!wk) return;
    const stats = weekStats(s, wk);
    const o = stats.find((x) => x.cohort === cohort);
    if (!o || !o.presented) return;
    openCohort = cohort;
    host.innerHTML = sheetHtml(s, wk, stats, o, sort);
    document.body.classList.add('locked');
    host.querySelector<HTMLElement>('.x')?.focus();
  }
  function closeSheet() {
    if (!openCohort) return;
    openCohort = null;
    host.innerHTML = '';
    document.body.classList.remove('locked');
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    else root.querySelector<HTMLElement>(`[data-open]`)?.focus();
  }
  host.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('sheet-back') || t.closest('.x')) { closeSheet(); return; }
    const b = t.closest<HTMLElement>('[data-sort]');
    if (b && openCohort) {
      sort = b.dataset.sort as SortMode;
      const scrollTop = host.querySelector('.sheet')?.scrollTop ?? 0;
      openSheet(openCohort);
      host.querySelector('.sheet')!.scrollTop = scrollTop;
      host.querySelector<HTMLElement>(`[data-sort="${sort}"]`)?.focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    if (e.key === 'Tab' && openCohort) {
      // Keep focus inside the open sheet.
      const f = [...host.querySelectorAll<HTMLElement>('button')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  render();
  return {
    update(next: SeasonFile[], banner?: string) {
      seasons = next;
      if (banner !== undefined) opts.banner = banner;
      if (!seasons.some((s) => s.sectionId === sectionId)) sectionId = seasons[0]?.sectionId;
      closeSheet();
      render();
    },
    showView(v: string) { view = v; render(); },
  };
}

// ---------- Week ----------
function weekHtml(s: SeasonFile, wk: Week): string {
  const stats = weekStats(s, wk);
  const max = maxTotal(s);
  const winners = stats.filter((x) => x.win);
  const presented = stats.filter((x) => x.presented);
  const title = `Week ${wk.week}${wk.challenge ? ` · ${esc(wk.challenge)}` : ''}`;

  let winnerCard: string;
  if (!winners.length) {
    winnerCard = `<div class="card winner"><div class="eyebrow">${title}</div><p class="muted" style="margin-top:12px">No reviews were recorded this week.</p></div>`;
  } else {
    const w = winners[0];
    const runner = stats.find((x) => !x.win && x.presented);
    const bestCrit = s.criteria.filter((_, k) => w.criteria[k] !== null && stats.every((o) => (o.criteria[k] ?? -1) <= (w.criteria[k] as number) + 1e-9));
    const names = winners.map((x) => esc(x.cohort)).join(' &amp; ');
    winnerCard = `<div class="card winner">
      <div class="eyebrow">${winners.length > 1 ? 'Shared win' : 'Winner'} · ${title}</div>
      <div class="winner-row"><div class="medal" aria-hidden="true">1</div><div class="winner-name">${names}</div></div>
      <div class="winner-score"><span class="stat" data-count="${fmt1(w.score)}">${fmt1(w.score)}</span><span>average out of ${max}${winners.length === 1 ? ` from ${w.reviewCount} reviews` : ''}</span></div>
      <div class="winner-notes">
        ${runner ? `<span class="chip">Ahead of ${esc(runner.cohort)} by <b>${fmt1(w.score - runner.score)}</b></span>` : ''}
        ${winners.length === 1 && bestCrit.length ? `<span class="chip">Top in <b>${bestCrit.map(esc).join(', ')}</b></span>` : ''}
      </div>
      <div class="open">${winners.map((x) => `<button class="btn" type="button" data-open="${esc(x.cohort)}">See ${winners.length > 1 ? esc(x.cohort) + "'s" : 'their'} reviews</button>`).join(' ')}</div>
      ${podium(stats)}
    </div>`;
  }

  const rows = stats.map((o) => o.presented
    ? `<button type="button" class="rank-row${o.win ? ' first' : ''}" data-open="${esc(o.cohort)}" aria-label="${esc(o.cohort)}, place ${o.rank}, ${fmt1(o.score)} out of ${max}. Open reviews.">
        <span class="rank-n">${o.rank}</span><span class="rank-name">${esc(o.cohort)}</span>
        <span class="track"><span class="fill" style="width:${(o.score / max) * 100}%"></span><span class="spread" style="left:${(o.min / max) * 100}%;width:${((o.max - o.min) / max) * 100}%"></span></span>
        <span class="rank-val">${fmt1(o.score)}<small>${o.reviewCount} review${o.reviewCount === 1 ? '' : 's'}</small></span></button>`
    : `<div class="rank-row absent"><span class="rank-n">${o.rank}</span><span class="rank-name">${esc(o.cohort)}</span>
        <span class="track"><span class="note">Did not present</span></span><span class="rank-val">0.0<small>no reviews</small></span></div>`).join('');

  const colMax = s.criteria.map((_, k) => Math.max(...presented.map((o) => o.criteria[k] ?? -1)));
  const allV = presented.flatMap((o) => o.criteria.filter((v): v is number => v !== null));
  const loV = Math.min(...allV), hiV = Math.max(...allV);
  const heatRows = presented.map((o) => `<tr><td class="name">${esc(o.cohort)}</td>${o.criteria.map((v, k) => {
    if (v === null) return `<td class="none">n/r</td>`;
    // Shade relative to this week's range so small differences are visible.
    const p = Math.round(14 + 86 * (hiV > loV ? (v - loV) / (hiV - loV) : 1));
    return `<td class="${Math.abs(v - colMax[k]) < 1e-9 ? 'best' : ''}" style="background:color-mix(in oklab, var(--c-blue) ${p}%, var(--panel));color:${p > 55 ? '#fff' : 'var(--text)'}">${fmt1(v)}</td>`;
  }).join('')}<td style="background:var(--raised)">${fmt1(o.score)}</td></tr>`).join('');

  return `<div class="week-grid">${winnerCard}
    <div class="card"><div class="card-h"><h2>Standings</h2><small>Select a cohort to read its reviews</small></div><div class="card-b">
      <div class="rank-list">${rows}</div>
      <div class="axis" aria-hidden="true"><span></span><span></span><div>${[0, 0.25, 0.5, 0.75, 1].map((f) => `<span>${Math.round(max * f)}</span>`).join('')}</div><span></span></div>
      <div class="legend-line"><span>Bar: average total</span><span>Light line: lowest to highest single review</span></div>
    </div></div></div>
    ${presented.length ? `<div class="card mt16"><div class="card-h"><h2>By criterion</h2><small>Average out of ${s.maxPerCriterion}</small></div><div class="card-b">
      <div class="heat-wrap"><table class="heat"><thead><tr><th>Cohort</th>${s.criteria.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${heatRows}</tbody></table></div>
      <div class="heat-foot"><span class="heat-scale">Lower<i></i>Higher</span><span><span class="ring"></span>Best in criterion</span></div>
    </div></div>` : ''}`;
}

function podium(stats: CohortWeekStats[]): string {
  const next = stats.filter((x) => x.presented && !x.win).slice(0, 2);
  if (!next.length) return '';
  return `<div class="podium">${next.map((x) => `<button type="button" class="pod" data-open="${esc(x.cohort)}"><span class="pod-n">${x.rank}</span><span>${esc(x.cohort)}</span><b>${fmt1(x.score)}</b></button>`).join('')}</div>`;
}

// ---------- Leaderboard ----------
function leaderboardHtml(s: SeasonFile): string {
  const rows = leaderboard(s);
  const played = [...s.weeks].sort((a, b) => a.week - b.week);
  const max = maxTotal(s);
  // A finished season is scored over the weeks actually played.
  const span = s.ended ? played.length : Math.max(s.totalWeeks, played.length);
  const full = max * span;
  if (!played.length) return `<div class="card empty-state"><h2>No weeks played yet</h2><p>The leaderboard starts after the first challenge.</p></div>`;

  const legend = Array.from({ length: span }, (_, i) => {
    const has = played.some((w) => w.week === i + 1);
    return `<span><i class="${has ? '' : 'empty'}" style="${has ? `background:${weekColor(i)}` : ''}"></i>Week ${i + 1}</span>`;
  }).join('');

  const lines = rows.map((r) => {
    const mv = r.movement;
    const mvHtml = mv === null ? '<span class="move same" aria-label="first week">·</span>'
      : mv > 0 ? `<span class="move up" aria-label="up ${mv}">▲${mv}</span>`
      : mv < 0 ? `<span class="move down" aria-label="down ${-mv}">▼${-mv}</span>`
      : '<span class="move same" aria-label="no change">–</span>';
    const missed = r.weekly.filter((w) => !w.presented).map((w) => w.week);
    const segs = r.weekly.map((w) => `<div style="width:${(w.score / full) * 100}%;background:${weekColor(w.week - 1)}" title="Week ${w.week}: ${w.presented ? fmt1(w.score) : 'did not present'}"></div>`).join('');
    return `<div class="card lb-row${r.rank === 1 ? ' lead' : ''}">
      <span class="lb-rank">${r.rank}</span>${mvHtml}<span class="rank-name">${esc(r.cohort)}</span>
      <div style="min-width:0"><div class="stack" role="img" aria-label="${r.weekly.map((w) => `Week ${w.week} ${w.presented ? fmt1(w.score) : 'did not present'}`).join(', ')}">${segs}</div>
        ${missed.length ? `<div class="dnp">Did not present: week ${missed.join(', ')}</div>` : ''}</div>
      <span class="lb-total">${fmt1(r.total)}<small>of ${full}</small></span>
      <span class="wins" aria-label="${r.wins} weekly win${r.wins === 1 ? '' : 's'}">${r.wins ? '<i></i>'.repeat(r.wins) : '<em>none</em>'}</span>
    </div>`;
  }).join('');

  const table = `<div class="card lb-weeks"><table class="weeks"><thead><tr><th>Cohort</th>${played.map((w) => `<th title="${esc(w.challenge)}">Week ${w.week}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.cohort)}</td>${r.weekly.map((w) => `<td class="${w.win ? 'win' : !w.presented ? 'absent' : ''}">${w.presented ? fmt1(w.score) : 'DNP'}</td>`).join('')}<td><b>${fmt1(r.total)}</b></td></tr>`).join('')}
  </tbody></table></div>`;

  return `<div class="lb-head"><p>${s.ended ? `Final standings after ${played.length} week${played.length === 1 ? '' : 's'}.` : `After ${played.length} of ${span} weeks.`} Each segment is one week's average score out of ${max}. The total is the sum of weekly scores.</p><div class="legend">${legend}</div></div>
    <div class="lb-cols" aria-hidden="true"><div>#</div><div>Move</div><div>Cohort</div><div>Weekly scores</div><div>Total</div><div>Wins</div></div>
    <div class="lb">${lines}</div>
    <div class="sec-title" style="margin-top:28px">Week by week</div>${table}
    <div class="legend-line"><span><b style="color:var(--yarrow)">Gold</b>: weekly winner</span><span>DNP: did not present, scored 0</span></div>`;
}

// ---------- Drill-down sheet ----------
function sheetHtml(s: SeasonFile, wk: Week, stats: CohortWeekStats[], o: CohortWeekStats, sort: SortMode): string {
  const max = maxTotal(s);
  const presented = stats.filter((x) => x.presented);
  const classAvg = s.criteria.map((_, k) => {
    const v = presented.map((x) => x.criteria[k]).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  });
  const reviews = [...o.reviews];
  if (sort === 'high') reviews.sort((a, b) => reviewTotal(b) - reviewTotal(a));
  if (sort === 'low') reviews.sort((a, b) => reviewTotal(a) - reviewTotal(b));
  const written = o.reviews.filter((r) => r.feedback).length;

  return `<div class="sheet-back"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <div class="sheet-top"><div><div class="eyebrow">Week ${wk.week}${wk.challenge ? ` · ${esc(wk.challenge)}` : ''}</div><h2 id="sheetTitle">${esc(o.cohort)}</h2>
      <p>All reviews are anonymous. "As submitted" order is shuffled and means nothing.</p></div>
      <button class="x" type="button" aria-label="Close">×</button></div>
    <div class="kpis">
      <div class="card kpi"><small>Place</small><div class="stat"${o.win ? ' style="color:var(--yarrow)"' : ''}>${o.rank}<span> of ${stats.length}</span></div></div>
      <div class="card kpi"><small>Average</small><div class="stat">${fmt1(o.score)}<span> / ${max}</span></div></div>
      <div class="card kpi"><small>Reviews</small><div class="stat">${o.reviewCount}</div></div>
    </div>
    <div class="sec-title">Criteria</div>
    <div class="crit">${s.criteria.map((c, k) => `<div class="crit-row"><span>${esc(c)}</span><span class="track"><span class="fill" style="width:${((o.criteria[k] ?? 0) / s.maxPerCriterion) * 100}%"></span><span class="class-avg" style="left:${(classAvg[k] / s.maxPerCriterion) * 100}%"></span></span><span style="text-align:right;font-weight:600">${o.criteria[k] === null ? 'n/r' : fmt1(o.criteria[k]!)}</span></div>`).join('')}</div>
    <div class="crit-note"><i></i>Average across all cohorts this week</div>
    <div class="sec-title">Spread of review totals</div>
    <div class="card dotplot">${dotPlot(o.totals, max)}</div>
    <div class="sec-title"><span>${o.reviewCount} reviews · ${written} with comments</span><span class="sort" role="group" aria-label="Sort reviews">
      ${([['mixed', 'As submitted'], ['high', 'Highest first'], ['low', 'Lowest first']] as const).map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${sort === k}">${l}</button>`).join('')}
    </span></div>
    <div class="comments">${reviews.map((r) => {
      const rated = r.scores.filter((v) => v !== null).length;
      return `<div class="card cmt"><p class="${r.feedback ? '' : 'none'}">${r.feedback ? esc(r.feedback) : 'No written feedback'}</p>
        <div class="tot">${reviewTotal(r)}<small> / ${max}</small></div>
        <div class="scores">${s.criteria.map((c, k) => `<span>${esc(c)} ${r.scores[k] === null || r.scores[k] === undefined ? 'n/r' : r.scores[k]}</span>`).join('')}${rated < s.criteria.length ? `<span>${rated} of ${s.criteria.length} rated</span>` : ''}</div></div>`;
    }).join('')}</div>
  </div></div>`;
}

function dotPlot(totals: number[], max: number): string {
  const W = 520, H = 130, pad = 18;
  const bins = new Map<number, number>();
  totals.forEach((t) => { const k = Math.round(t); bins.set(k, (bins.get(k) ?? 0) + 1); });
  const tallest = Math.max(1, ...bins.values());
  const r = Math.min(7, (H - 36) / tallest / 2);
  const x = (v: number) => pad + (v / max) * (W - pad * 2);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Review totals: ${[...totals].sort((a, b) => a - b).join(', ')}">`;
  svg += `<line x1="${pad}" x2="${W - pad}" y1="${H - 22}" y2="${H - 22}" stroke="var(--line)" />`;
  ticks.forEach((v) => { svg += `<text x="${x(v)}" y="${H - 6}" fill="var(--faint)" font-size="11" text-anchor="middle" font-family="Sofia Sans, sans-serif">${v}</text>`; });
  bins.forEach((n, k) => { for (let i = 0; i < n; i++) svg += `<circle cx="${x(k)}" cy="${H - 22 - r - 1 - i * r * 2}" r="${Math.max(1.5, r - 0.8)}" fill="var(--c-blue)" />`; });
  return svg + '</svg>';
}

function countUp(root: HTMLElement) {
  const el = root.querySelector<HTMLElement>('[data-count]');
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const end = parseFloat(el.dataset.count!);
  const t0 = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / 700);
    el.textContent = fmt1(end * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
