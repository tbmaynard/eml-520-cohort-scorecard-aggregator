import { sanitizeSeason, sectionFileName } from '../core/season';
import type { SeasonFile } from '../core/types';

/** Sections are found by trying section-1.json up to section-MAX_SECTIONS.json. */
export const MAX_SECTIONS = 6;

export async function fetchSeason(sectionId: string): Promise<SeasonFile | null> {
  try {
    // The time stamp skips cached copies so a new week shows up as soon as Pages deploys it.
    const res = await fetch(`${import.meta.env.BASE_URL}data/${sectionFileName(sectionId)}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return sanitizeSeason(await res.json());
  } catch {
    return null;
  }
}
