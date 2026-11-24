import './ui/styles.css';
import { sampleSeason } from './core/sample';
import type { SeasonFile } from './core/types';
import { mountDashboard } from './ui/dashboard';
import { fetchSeason, MAX_SECTIONS } from './ui/data';

async function start() {
  const root = document.getElementById('app')!;
  const params = new URLSearchParams(location.search);
  const example = params.has('example');
  let seasons: SeasonFile[];
  if (example) {
    seasons = [sampleSeason()];
  } else {
    const ids = Array.from({ length: MAX_SECTIONS }, (_, i) => String(i + 1));
    seasons = (await Promise.all(ids.map(fetchSeason))).filter((s): s is SeasonFile => s !== null);
  }
  mountDashboard(root, {
    seasons,
    syncUrl: true,
    initialSection: params.get('section') ?? undefined,
    initialView: params.get('view') ?? undefined,
    banner: example ? 'Sample data. These cohorts and scores are invented to show how the page works.' : undefined,
  });
  const foot = document.createElement('p');
  foot.className = 'foot wrap';
  foot.textContent = 'Scores are averages of anonymous peer reviews. Reviewer names are never collected.';
  root.after(foot);
}

start();
