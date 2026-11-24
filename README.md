# EML 520 Cohort Scorecard

A weekly results dashboard for the EML 520 cohort challenges. Students score each other's presentations in a CSV scorecard. The instructor drops every CSV onto a builder page, and the dashboard shows the week's winner, the scores, anonymous comments and a season leaderboard.

- Dashboard (share this with students): https://tbmaynard.github.io/eml-520-cohort-scorecard-aggregator/
- Sample data: https://tbmaynard.github.io/eml-520-cohort-scorecard-aggregator/?example
- Builder (instructor): https://tbmaynard.github.io/eml-520-cohort-scorecard-aggregator/build.html

No database, accounts or server. Everything runs in the browser.

## Weekly routine

1. Download every student's scorecard CSV for the week into one folder.
2. Open the **builder**. It loads the section's current season file from the live site.
3. Drop all the CSVs onto it. Check the warnings, set the challenge title, and hide any comment you don't want shown.
4. Click **Save section-1.json**. Keep that file in a folder for the class: it is your backup.
5. Open the [upload page for the data folder](https://github.com/tbmaynard/eml-520-cohort-scorecard-aggregator/upload/main/data), drag the file in and commit. A file with the same name is replaced. The dashboard updates in a minute or two.

To redo a week, drop the files again with the same week number; saving replaces that week. To remove a week, use **Remove** in step 1 of the builder, then save and upload.

If the live file is ever wrong, use **Load a saved season file** in the builder to start from your last backup.

## Anonymity

- The parser reads only the "Challenge" and "Reviewers cohort" lines from the top of each CSV, then the score table. The "Reviewer name" line is skipped and its value is never copied.
- File names are shown in the builder to point out problems, and are never saved.
- The reviewer's cohort is used once, to drop any row where a cohort scored itself, and is not saved.
- Reviews are shuffled when a week is built, so their order means nothing.
- The season file holds only: section name, criteria, cohort names, and for each week the challenge title, date and anonymous reviews (cohort scored, scores, feedback).
- `.gitignore` blocks `*.csv`, the build copies only `.json` from `data/`, and the deploy fails if a CSV is ever in the build.
- Tests fail if a reviewer name or file name appears in a saved file.

## Scoring

- **Weekly score**: average total out of 20. Each criterion is averaged over the reviews that rated it (blank is skipped, 0 counts), and the weekly score is the sum of the criterion averages. Averages, not sums, because cohorts receive different numbers of reviews.
- **Winner**: highest weekly score. Scores equal to one decimal place share the win.
- **Did not present**: a cohort with no reviews in a week scores 0 that week.
- **Leaderboard**: sum of weekly scores (out of 100 over five weeks), with wins and movement since last week.
- **Outliers**: plain average. The spread of reviews is shown so outliers are visible.

## Sections

Each section has its own file (`data/section-2.json`, and so on) and link (`?section=2`). The section picker appears only when more than one file exists.

## End of term

In the builder, open **End the season** and save the final file. It keeps each cohort's weekly scores, totals and wins, and removes every review and comment. Upload it in place of the season file. To take the page down entirely, delete the file from `data/`.

Old versions remain in the repo's history. They are anonymized; to erase them, squash the history or recreate the repo.

## Development

```bash
npm install
npm run dev       # http://localhost:5281/eml-520-cohort-scorecard-aggregator/
npm test          # parser, scoring, season file and privacy tests
npm run build     # type check and build to dist/
npm run preview   # http://localhost:4281/eml-520-cohort-scorecard-aggregator/
```

Every push to `main` runs the tests, builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`). A failing test blocks the deploy.

### Layout

- `src/core/` is pure TypeScript with no UI: `parse.ts` (CSV reading), `scoring.ts` (averages, ranks, leaderboard), `season.ts` (building, sanitizing and ending season files), `sample.ts` (invented demo data).
- `src/ui/dashboard.ts` renders the dashboard for both the public page and the builder preview.
- `src/main.ts` is the public page; `src/builder.ts` is the builder page.
- `data/` holds the published season files.
