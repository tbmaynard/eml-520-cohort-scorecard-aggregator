# CLAUDE.md

Context for Claude Code sessions in this repository.

## What this is

A weekly peer-review results dashboard for EML 520 (graduate technology entrepreneurship, University of San Diego). Trevor Maynard is the instructor. Cohorts present a challenge each week for five weeks; students score the other cohorts in a CSV scorecard; Trevor builds each week with `build.html` and uploads one anonymized season file per section to `data/`. README.md covers the routine, scoring rules and layout.

- Live: https://tbmaynard.github.io/eml-520-cohort-scorecard-aggregator/ (`?example` shows invented sample data, `build.html` is the builder)
- Deploys automatically: every push to `main` runs the tests, builds and publishes to GitHub Pages. A failing test blocks the deploy.

## Commands

```bash
npm run dev       # http://localhost:5281/eml-520-cohort-scorecard-aggregator/
npm test
npm run build
npm run preview   # http://localhost:4281/eml-520-cohort-scorecard-aggregator/
```

**Never use ports 5173 or 8000** (other local projects) or 5280/4280 (the financial model).

## Hard rule: anonymity

The "Reviewer name" field must never be read, stored or shown. The parser uses an allow-list of top-of-file keys; keep it that way. Never save file names or the reviewer's cohort in the season file. `sanitizeSeason` rebuilds files with only allowed fields. The privacy tests in `src/core/__tests__/` must keep passing; extend them when the file format changes. Never commit CSVs.

## Decisions already made

- Weekly score = average total (sum of per-criterion averages; blank skipped, 0 counts). Ties to one decimal share the win. A cohort with no reviews = "Did not present", 0. Leaderboard = sum of weekly scores. No outlier trimming.
- Comment moderation in the builder: hiding removes the text, scores still count.
- Ending a season replaces reviews with per-week cohort scores only.
- Sections are discovered by probing `data/section-1.json` to `section-6.json`.
- Plain TypeScript and Vite, no framework. Dark mode only, USD palette and fonts matching usd-eml520-financial-model (Sofia Sans, Sofia Sans Extra Condensed for numbers, Spectral for prose and comments).

## Writing style (Trevor's preferences)

- No em dashes anywhere: chat, code comments, UI copy, docs.
- American spelling.
- No monospace fonts in the UI; numbers use tabular figures.
- Plain language.
