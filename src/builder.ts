import './ui/styles.css';
import './ui/builder.css';
import { readScorecard } from './core/parse';
import { cohortSort, reviewTotal } from './core/scoring';
import {
  addWeek, draftWeek, endSeason, removeWeek, sanitizeSeason, sectionFileName, serializeSeason,
  type IncomingFile, type WeekDraft,
} from './core/season';
import type { SeasonFile } from './core/types';
import { esc, mountDashboard } from './ui/dashboard';
import { fetchSeason, MAX_SECTIONS } from './ui/data';

/**
 * Instructor builder. Runs entirely in the browser: CSVs are read here and
 * never uploaded. File names are shown only on this screen to locate problems
 * and are never written to the season file.
 */

const REPO = 'https://github.com/tbmaynard/eml-520-cohort-scorecard-aggregator';

type Source = 'loading' | 'live' | 'file' | 'new';
const state = {
  sectionId: '1',
  base: null as SeasonFile | null,
  source: 'loading' as Source,
  sourceNote: '',
  files: [] as IncomingFile[],
  week: 1,
  weekTouched: false,
  challenge: '',
  sectionName: '',
  /** Hidden comments, keyed by cohort and text so the choice survives adding more files. */
  hidden: new Set<string>(),
  savedFor: '',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hideKey = (cohort: string, feedback: string) => `${cohort}\u0000${feedback}`;

function draft(): WeekDraft | null {
  return state.files.length ? draftWeek(state.files, state.base) : null;
}

function nextWeek(): number {
  const w = state.base?.weeks.map((x) => x.week) ?? [];
  return w.length ? Math.max(...w) + 1 : 1;
}

/** The season as it will be saved: the base plus the drafted week, if any. */
function result(): SeasonFile | null {
  const d = draft();
  let s = state.base;
  if (d && d.reviews.length) {
    const hidden = new Set<number>();
    d.reviews.forEach((r, i) => { if (state.hidden.has(hideKey(r.cohort, r.feedback))) hidden.add(i); });
    s = addWeek(s, d, { sectionId: state.sectionId, week: state.week, challenge: state.challenge, hidden });
  }
  if (s && state.sectionName.trim()) s = { ...s, sectionName: state.sectionName.trim() };
  return s;
}

// ---------- Layout ----------
const root = $('builder');
root.innerHTML = `
  <header class="top">
    <div><div class="eyebrow">EML 520 · Instructor only</div><h1>Scorecard builder</h1>
      <p class="sub">Everything on this page happens in your browser. Student files are never uploaded, and reviewer names are never read.</p></div>
    <a class="btn" href="./" target="_blank" rel="noopener">Open the dashboard</a>
  </header>

  <div class="steps">
    <section class="card step">
      <div class="step-h"><span class="step-n">1</span><div><h2>Season</h2><p>Pick the section. The builder loads its season file from the live site.</p></div></div>
      <div class="row">
        <label class="field" for="sectionSel">Section<select id="sectionSel">${Array.from({ length: MAX_SECTIONS }, (_, i) => `<option value="${i + 1}">Section ${i + 1}</option>`).join('')}</select></label>
        <label class="field grow" for="sectionName">Name shown on the dashboard<input type="text" id="sectionName" placeholder="Section 1"></label>
      </div>
      <div id="seasonStatus" class="status"></div>
      <div class="row actions">
        <label class="btn" for="seasonIn">Load a saved season file<input type="file" id="seasonIn" accept=".json,application/json" hidden></label>
        <button class="btn" type="button" id="startNew">Start a new season</button>
      </div>
    </section>

    <section class="card step">
      <div class="step-h"><span class="step-n">2</span><div><h2>This week's scorecards</h2><p>Drop every student CSV for the week. You can add more files at any time.</p></div></div>
      <div class="row">
        <label class="field" for="weekNo">Week<input type="number" id="weekNo" min="1" max="20" step="1"></label>
        <label class="field grow" for="challenge">Challenge title<input type="text" id="challenge" placeholder="For example: Pricing the product"></label>
      </div>
      <label class="dropzone" id="drop" for="csvIn">
        <input type="file" id="csvIn" accept=".csv,text/csv" multiple>
        <b>Drop scorecard CSVs here</b><span>or click to choose files</span>
      </label>
      <div id="checks"></div>
    </section>

    <section class="card step" id="commentsStep">
      <div class="step-h"><span class="step-n">3</span><div><h2>Comments</h2><p>Every comment goes on a public page. Hide any you don't want shown. Hidden comments are removed from the file; their scores still count.</p></div></div>
      <div id="comments"></div>
    </section>

    <section class="card step">
      <div class="step-h"><span class="step-n">4</span><div><h2>Save and publish</h2><p>Save the season file, keep it as your backup, then upload the same file to GitHub.</p></div></div>
      <div id="save"></div>
    </section>
  </div>

  <details class="card step end">
    <summary><h2>End the season</h2><span>At the end of term: keep the final standings, remove every review and comment.</span></summary>
    <div id="endBox"></div>
  </details>

  <div class="sec-title" style="margin-top:40px">Preview of the dashboard</div>`;

let dash: ReturnType<typeof mountDashboard> | null = null;
let lastPreviewWeek = -1;

// ---------- Renderers ----------
function renderStatus() {
  const s = state.base;
  let html = '';
  if (state.source === 'loading') html = `<p class="muted">Looking for ${sectionFileName(state.sectionId)} on the live site…</p>`;
  else if (!s) html = `<p><b>New season.</b> <span class="muted">${esc(state.sourceNote || `No ${sectionFileName(state.sectionId)} on the live site yet. Saving will create it.`)}</span></p>`;
  else {
    html = `<p><b>${s.ended ? 'Ended season' : `${s.weeks.length} week${s.weeks.length === 1 ? '' : 's'} played`}</b> <span class="muted">· ${esc(state.sourceNote)}</span></p>`;
    if (s.weeks.length) {
      html += `<ul class="weeks-list">${s.weeks.map((w) => `<li><span><b>Week ${w.week}</b>${w.challenge ? ` · ${esc(w.challenge)}` : ''} <span class="faint">${w.reviews ? `${w.reviews.length} reviews` : 'scores only'}${w.published ? ` · ${esc(w.published)}` : ''}</span></span>${s.ended ? '' : `<button class="link" type="button" data-remove="${w.week}">Remove</button>`}</li>`).join('')}</ul>`;
    }
    html += `<p class="faint small">Criteria: ${s.criteria.map(esc).join(', ')} · ${s.cohorts.length} cohorts</p>`;
  }
  $('seasonStatus').innerHTML = html;
}

function renderChecks() {
  const d = draft();
  const box = $('checks');
  if (!d) { box.innerHTML = ''; return; }
  const items: [string, string][] = [];
  const byCohort = new Map<string, number>();
  d.reviews.forEach((r) => byCohort.set(r.cohort, (byCohort.get(r.cohort) ?? 0) + 1));
  const known = [...new Set([...(state.base?.cohorts ?? []), ...d.cohortsSeen, ...byCohort.keys()])].sort(cohortSort);

  items.push(['ok', `${d.filesRead} file${d.filesRead === 1 ? '' : 's'} read, ${d.reviews.length} reviews, ${byCohort.size} cohorts scored`]);
  d.problems.forEach((p) => items.push(['bad', p]));
  if (d.duplicatesDropped) items.push(['warn', `${d.duplicatesDropped} file${d.duplicatesDropped === 1 ? ' was' : 's were'} identical to another file. One copy was kept.`]);
  if (d.selfScoresDropped) items.push(['warn', `${d.selfScoresDropped} row${d.selfScoresDropped === 1 ? '' : 's'} scored the reviewer's own cohort and ${d.selfScoresDropped === 1 ? 'was' : 'were'} left out.`]);
  if (d.partialReviews) items.push(['warn', `${d.partialReviews} review${d.partialReviews === 1 ? '' : 's'} left some criteria blank. Blank criteria are skipped, not counted as zero.`]);
  known.filter((c) => !byCohort.has(c)).forEach((c) => items.push(['warn', `${c} has no reviews this week and will show as "Did not present" with 0.`]));
  if (state.base?.weeks.some((w) => w.week === state.week)) items.push(['warn', `Week ${state.week} is already in the season file. Saving replaces it.`]);
  if (state.base?.ended) items.push(['bad', 'The loaded season has ended. Start a new season to add weeks.']);
  if (!state.challenge.trim()) items.push(['warn', 'No challenge title yet. It is optional, but it labels the week on the dashboard.']);

  box.innerHTML = `<div class="checks">${items.map(([k, t]) => `<div class="${k}"><span>${k === 'ok' ? '✓' : k === 'bad' ? '✕' : '!'}</span><span>${esc(t)}</span></div>`).join('')}</div>
    <div class="counts">${[...byCohort.entries()].sort((a, b) => cohortSort(a[0], b[0])).map(([c, n]) => `<span class="chip">${esc(c)} <b>${n}</b></span>`).join('')}</div>
    <div class="row actions"><button class="btn" type="button" id="clearFiles">Clear files</button></div>`;
}

function renderComments() {
  const d = draft();
  const box = $('comments');
  if (!d) { box.innerHTML = `<p class="faint">Comments appear here after you drop the files.</p>`; return; }
  const withText = d.reviews.filter((r) => r.feedback);
  const hiddenCount = withText.filter((r) => state.hidden.has(hideKey(r.cohort, r.feedback))).length;
  const groups = new Map<string, typeof withText>();
  withText.forEach((r) => { if (!groups.has(r.cohort)) groups.set(r.cohort, []); groups.get(r.cohort)!.push(r); });
  let i = 0;
  box.innerHTML = `<p class="muted small">${withText.length} comments · <b>${hiddenCount} hidden</b></p>
    ${[...groups.entries()].map(([c, list]) => `<div class="cgroup"><h3>${esc(c)}</h3>${list.sort((a, b) => reviewTotal(a) - reviewTotal(b)).map((r) => {
      const key = hideKey(r.cohort, r.feedback);
      const id = `hide-${i++}`;
      const on = state.hidden.has(key);
      return `<label class="crow${on ? ' off' : ''}" for="${id}"><input type="checkbox" id="${id}" data-key="${esc(key)}"${on ? ' checked' : ''}><span class="ctext">${esc(r.feedback)}</span><span class="faint">${reviewTotal(r)}</span><span class="hide-l">${on ? 'Hidden' : 'Hide'}</span></label>`;
    }).join('')}</div>`).join('')}`;
}

function renderSave() {
  const s = result();
  const d = draft();
  const name = sectionFileName(state.sectionId);
  const blocked = !s || !!state.base?.ended && !!d || (d?.reviews.length === 0);
  $('save').innerHTML = `
    <div class="row actions">
      <button class="btn primary" type="button" id="saveBtn"${blocked ? ' disabled' : ''}>Save ${name}</button>
      ${state.base ? `<button class="btn" type="button" id="backupBtn">Download the current file unchanged</button>` : ''}
    </div>
    ${state.savedFor ? `<div class="banner info">Saved ${esc(state.savedFor)}. Keep it in a folder for this class as your backup.</div>` : ''}
    <ol class="how">
      <li>Open the <a href="${REPO}/upload/main/data" target="_blank" rel="noopener">upload page for the data folder</a> on GitHub.</li>
      <li>Drag <b>${name}</b> onto it. A file with the same name is replaced. If your browser saved it as <b>${name.replace('.json', ' (1).json')}</b>, rename it to <b>${name}</b> first.</li>
      <li>Click <b>Commit changes</b>. The dashboard updates in a minute or two.</li>
    </ol>
    <p class="faint small">Only upload the .json file. The repo refuses .csv files, and the site never publishes them.</p>`;
}

function renderEnd() {
  const s = state.base;
  $('endBox').innerHTML = !s
    ? `<p class="faint">Load the season file first.</p>`
    : state.files.length
      ? `<p class="muted">You have scorecards loaded that aren't saved yet. Save this week first, or clear the files.</p>`
    : s.ended
      ? `<p class="muted">This season has already ended.</p>`
      : `<p class="muted">This saves a final <b>${sectionFileName(state.sectionId)}</b> that keeps each cohort's weekly scores, totals and wins, with every review and comment removed. Upload it in place of the current file. The weekly pages then show only the final standings.</p>
        <label class="confirm" for="endConfirm"><input type="checkbox" id="endConfirm"> I've kept a backup of the full season file.</label>
        <div class="row actions"><button class="btn danger" type="button" id="endBtn" disabled>Save the final file</button></div>`;
}

function renderPreview() {
  const s = result();
  const host = $('preview');
  if (!s) { host.innerHTML = `<p class="faint">The preview appears once there is a season to show.</p>`; dash = null; return; }
  const banner = 'Preview. Students see this after you upload the file.';
  if (!dash) { host.innerHTML = ''; dash = mountDashboard(host, { seasons: [s], syncUrl: false, banner, animate: false }); }
  else dash.update([s], banner);
  if (draft() && state.week !== lastPreviewWeek) { dash.showView(`week-${state.week}`); lastPreviewWeek = state.week; }
}

function renderAll() {
  renderStatus();
  renderChecks();
  renderComments();
  renderSave();
  renderEnd();
  renderPreview();
}

function syncFields() {
  if (!state.weekTouched) state.week = nextWeek();
  $<HTMLSelectElement>('sectionSel').value = state.sectionId;
  $<HTMLInputElement>('weekNo').value = String(state.week);
  $<HTMLInputElement>('sectionName').value = state.sectionName;
  $<HTMLInputElement>('sectionName').placeholder = `Section ${state.sectionId}`;
}

// ---------- Actions ----------
async function loadSection(id: string) {
  state.sectionId = id;
  state.source = 'loading';
  state.base = null;
  state.savedFor = '';
  renderStatus();
  const s = await fetchSeason(id);
  if (state.sectionId !== id) return;
  state.base = s;
  state.source = s ? 'live' : 'new';
  state.sourceNote = s ? 'Loaded from the live site.' : '';
  state.sectionName = s?.sectionName ?? '';
  syncFields();
  renderAll();
}

async function loadSeasonFile(file: File) {
  try {
    const s = sanitizeSeason(JSON.parse(await file.text()));
    state.base = s;
    state.sectionId = s.sectionId;
    state.source = 'file';
    state.sourceNote = `Loaded from ${file.name} on your computer.`;
    state.sectionName = s.sectionName;
    state.weekTouched = false;
    syncFields();
    renderAll();
  } catch (e) {
    state.sourceNote = `${file.name} could not be read: ${(e as Error).message}`;
    renderStatus();
    $('seasonStatus').insertAdjacentHTML('beforeend', `<p class="bad-text">${esc(state.sourceNote)}</p>`);
  }
}

async function addFiles(list: FileList | File[]) {
  const files = [...list];
  const json = files.filter((f) => /\.json$/i.test(f.name));
  if (json.length) await loadSeasonFile(json[0]);
  const csv = files.filter((f) => !/\.json$/i.test(f.name));
  const read = await Promise.all(csv.map(async (f): Promise<IncomingFile> => {
    try { return { label: f.name, parsed: readScorecard(await f.text()) }; }
    catch (e) { return { label: f.name, error: (e as Error).message }; }
  }));
  state.files.push(...read);
  const d = draft();
  if (!state.challenge && d?.challengeFromFiles) {
    state.challenge = d.challengeFromFiles;
    $<HTMLInputElement>('challenge').value = state.challenge;
  }
  state.savedFor = '';
  renderAll();
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'sectionSel') { state.weekTouched = false; loadSection(t.value); }
  else if (t.id === 'seasonIn' && t.files?.[0]) { loadSeasonFile(t.files[0]); t.value = ''; }
  else if (t.id === 'csvIn' && t.files) { addFiles(t.files); t.value = ''; }
  else if (t.id === 'endConfirm') { $<HTMLButtonElement>('endBtn').disabled = !t.checked; }
  else if (t.dataset.key !== undefined) {
    if (t.checked) state.hidden.add(t.dataset.key); else state.hidden.delete(t.dataset.key);
    const label = t.closest('label')!;
    label.classList.toggle('off', t.checked);
    label.querySelector('.hide-l')!.textContent = t.checked ? 'Hidden' : 'Hide';
    const d = draft()!;
    const withText = d.reviews.filter((r) => r.feedback);
    $('comments').querySelector('p b')!.textContent = `${withText.filter((r) => state.hidden.has(hideKey(r.cohort, r.feedback))).length} hidden`;
    state.savedFor = '';
    renderSave();
    renderPreview();
  }
});

document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'weekNo') {
    const n = Math.round(Number(t.value));
    if (n >= 1) { state.week = n; state.weekTouched = true; }
  } else if (t.id === 'challenge') state.challenge = t.value;
  else if (t.id === 'sectionName') state.sectionName = t.value;
  else return;
  state.savedFor = '';
  renderChecks();
  renderSave();
  renderPreview();
});

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'startNew') {
    state.base = null; state.source = 'new'; state.weekTouched = false; state.sectionName = '';
    state.sourceNote = `Starting fresh. Saving creates a new ${sectionFileName(state.sectionId)}.`;
    syncFields(); renderAll();
  } else if (t.id === 'clearFiles') {
    state.files = []; state.hidden.clear(); state.challenge = '';
    $<HTMLInputElement>('challenge').value = '';
    renderAll();
  } else if (t.dataset.remove && state.base) {
    state.base = removeWeek(state.base, +t.dataset.remove);
    state.sourceNote = `Week ${t.dataset.remove} removed. Save and upload to make it final.`;
    state.weekTouched = false; syncFields(); renderAll();
  } else if (t.id === 'saveBtn') {
    const s = result();
    if (!s) return;
    const name = sectionFileName(s.sectionId);
    download(name, serializeSeason(s));
    // The saved file becomes the new starting point, so the next step (or End season) builds on it.
    state.base = s;
    state.source = 'file';
    state.sourceNote = `Saved ${name} on your computer. Upload it to GitHub to publish.`;
    state.files = [];
    state.hidden.clear();
    state.challenge = '';
    state.weekTouched = false;
    $<HTMLInputElement>('challenge').value = '';
    syncFields();
    renderAll();
    state.savedFor = `${name} with ${s.weeks.length} week${s.weeks.length === 1 ? '' : 's'}`;
    renderSave();
  } else if (t.id === 'backupBtn' && state.base) {
    download(sectionFileName(state.base.sectionId), serializeSeason(state.base));
  } else if (t.id === 'endBtn' && state.base) {
    const ended = endSeason(state.sectionName.trim() ? { ...state.base, sectionName: state.sectionName.trim() } : state.base);
    download(sectionFileName(ended.sectionId), serializeSeason(ended));
    state.base = ended; state.files = []; state.hidden.clear();
    state.sourceNote = 'Final file saved. Upload it to replace the current one.';
    renderAll();
  }
});

const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = (e as DragEvent).dataTransfer?.files; if (f) addFiles(f); });
// Stop a file dropped beside the drop zone from opening in the browser tab.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

syncFields();
renderAll();
loadSection('1');
