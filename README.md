# Portfolio

A planning tool for a research cluster: who works on which project, who is paid from what, and how many days were actually worked. One timeline grid, read in three ways.

## What it does

**Three tabs**

- **Projects**: one bar per project. Expand a project to allocate people per quarter and to set the effort promised in the proposal.
- **People**: one row per person with their load per quarter. Expand a person to see the projects behind it.
- **PhDs**: a track per PhD with milestones to tick off and dissertation chapters.

**Three lenses on the same grid**

| Lens | The number | Answers |
|---|---|---|
| Plan | Person-months someone will work on a project, per quarter | Is everyone's time filled and not overfilled? Does the team's effort meet what the proposal promised? |
| Funding | Person-months of salary a project pays, per quarter | Is everyone's salary covered, and until when? |
| Actuals | Days really worked, per month | What do I report this month? |

Funding follows the plan until you type something else, so only exceptions need entering. A small dot marks cells where the two differ.

## Working with it

- **Entering effort:** click a cell and type. Drag across cells first to fill several at once. Arrow keys, Tab and Delete work; Ctrl+Z undoes any change.
- **Units:** one person-month (PM) is 17.5 working days, and a full-time quarter is 3 PM. A toggle switches the display between months and days. You can always type `9d` for days, `1.5pm` for months or `50%` for half a quarter.
- **Rescheduling:** drag a project or PhD bar to move it, or drag its edges to change the start or end. Effort and milestones move along.
- **Reading a number:** hover or select a cell and the bottom bar spells it out, for example "1.5 PM = 26 days (50% of full time)".
- **Switching sides:** click a person inside a project to jump to their workload, and the other way round.

## Concepts

- **Promised effort.** Each project has a "Promised" row: the PM per quarter in the proposal. The bar shows `planned/promised` in red where the team's effort falls short.
- **Contract, faculty share, teaching.** A person has a contract (PM per quarter), a share paid by the faculty (salary that needs no project funding) and a teaching load per quarter that repeats every year. Teaching takes time away in Plan; the faculty share takes salary away in Funding.
- **Overlapping effort.** The layers button on a row marks effort that already counts elsewhere (for example PhD research that feeds a project). It counts for the project but is not added to the person's load, and the project does not pay for it by default.
- **Hide and put away.** The eye button hides a project, person or PhD for you only (remembered in your browser). The box button puts it away for everyone: projects are *archived*, people become *alumni*, PhDs are marked *completed*. Each record is in exactly one list (active, hidden, or put away; put away wins), and the two counters at the top of a list open the other two. Nothing is deleted and the effort still counts in loads, totals and reports.
- **Actuals.** The grid switches to months and days. Dashed numbers are planned but not reported yet. "Fill from plan" pre-fills a month; "Month report" gives a table to copy into Excel or an e-mail.
- **House styles.** UGent and imec, switchable in the top bar. No official logos are included.

## Running it

Requires [Node.js](https://nodejs.org/) 20 or later.

```
npm install
npm run dev
```

Open http://localhost:5180. Without further setup the app starts with fictional demo data and saves in the browser only.

| Command | Does |
|---|---|
| `npm run dev` | Starts the app locally on port 5180 |
| `npm run build` | Type-checks and writes the static site to `dist/` |
| `npm run typecheck` | Type-checks only |
| `npm run deploy` | Builds and copies the site to the webshare folder set in `.env.local` |

## Shared database (Supabase)

To share one dataset with a team, connect a [Supabase](https://supabase.com/) project. Access is by one shared team password.

1. Create a Supabase project.
2. Under Authentication → Users, add one user and tick "Auto Confirm User". Its e-mail is the team login and its password is the shared team password.
3. Open `supabase/schema.sql`, replace the address on the last line with that e-mail, and run the file in the SQL editor.
4. Copy `.env.example` to `.env.local` and fill in the project URL, the anon key and the team e-mail. Never put the password in a file.
5. Restart the app. It now asks for the team password, loads from the database, saves every change and follows changes made by others.

Only the listed e-mail can read or write; the rule is in `supabase/schema.sql`. With a database configured, nothing is stored in the browser except personal preferences (house style, unit, hidden items). When two people edit the same row at the same moment, the last save wins.

## Hosting

The app is a static site that talks to Supabase from the visitor's browser, so any web server that serves files will do. Nothing runs on the server.

1. `npm run build`
2. Copy `dist/index.html` and the `dist/assets` folder into a folder on the server. The build works from any folder name.
3. When updating, delete the old `assets` folder first: its file names change with every build.

The Supabase project URL, the anon key and the team e-mail from `.env.local` are built into the page and readable by anyone. That is how Supabase is meant to be used: the data is protected by the access rule and the team password, not by hiding these values.

For the UGent webshare, including the `npm run deploy` shortcut, see [docs/hosting.md](docs/hosting.md).

## Importing the Excel sheet

`scripts/import_gantt.py` converts the "General GANTT" sheet into the app's format. It needs only Python's standard library and lists everything it had to interpret.

```
python scripts/import_gantt.py "path/to/General GANTT.xlsx" data/real.json
```

Then use "Import data" in the app's bottom bar. The `data/` folder is ignored by git because the output contains real names. "Export" in the same bar downloads a backup in the same format.

## Code map

| File | What is in it |
|---|---|
| `src/store.ts` | Data model, units, lenses, lists, derived numbers, all actions, undo |
| `src/sync.ts` | Supabase: unlock, load, save, live updates |
| `src/seed.ts` | Fictional demo data |
| `src/components/Timeline.vue` | The grid: rows, cells, editing, dragging, readout |
| `src/components/LoadCell.vue` | One quarter or month of a person's load |
| `src/components/Drawer.vue` | Editors for projects, people and PhDs |
| `src/components/MonthReport.vue` | The monthly days table |
| `src/components/Gate.vue` | Team password screen |
| `src/style.css` | All styling; the two house styles are blocks of variables at the top |
| `supabase/schema.sql` | Tables, access rule and live updates for the shared database |
| `scripts/import_gantt.py` | Excel sheet to app data |
| `scripts/deploy.mjs` | Copies a build to the webshare |
| `docs/hosting.md` | Hosting on the UGent webshare |

## Known limits

- The overlapping mark applies to a person on a project for its whole run, not per quarter.
- Reported months cannot be locked.
- Projects have no euro budget; promised effort is in person-months only.
- The shared password cannot tell people apart, and hidden items do not follow you to another browser.
- Alumni still count as capacity until their "Until" quarter is set.
- Live updates between two browsers have not been tested, and there are no automated tests.
