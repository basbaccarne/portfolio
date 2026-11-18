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

**Details worth knowing**

- One person-month is 17.5 working days; a full-time quarter is 3 person-months. A toggle switches the display between months and days.
- A person has a contract, a share paid by the faculty (salary that needs no project funding) and a teaching load per quarter that repeats every year.
- Effort can be marked as *overlapping* (the layers button on a row): it counts for the project but is not added to the person's load, for work that already counts elsewhere.
- A project, person or PhD can be *hidden* (the eye button on its row): this is personal, remembered in your browser only. It can also be put away for everyone: projects are *archived*, people become *alumni*, PhDs are marked *completed* (the box button on the row, or in the editor). Neither deletes anything, and the effort still counts in loads, totals and reports. Every record is in exactly one list (active, hidden, or put away; put away wins); the two counters at the top of each list open the other two.
- In Actuals, "Fill from plan" pre-fills a month and "Month report" gives a table to copy into Excel or an e-mail.
- Every change can be undone with Ctrl+Z.
- Two house styles, UGent and imec, switchable in the top bar. No official logos are included.

## Running it

Requires [Node.js](https://nodejs.org/) 20 or later.

```
npm install
npm run dev
```

Open http://localhost:5180. Without further setup the app starts with fictional demo data and saves in the browser only.

`npm run build` type-checks and writes a static site to `dist/`.

## Shared database (Supabase)

To share one dataset with a team, connect a [Supabase](https://supabase.com/) project. Access is by one shared team password.

1. Create a Supabase project.
2. Under Authentication → Users, add one user and tick "Auto Confirm User". Its e-mail is the team login and its password is the shared team password.
3. Open `supabase/schema.sql`, replace the address on the last line with that e-mail, and run the file in the SQL editor.
4. Copy `.env.example` to `.env.local` and fill in the project URL, the anon key and the team e-mail. Never put the password in a file.
5. Restart the app. It now asks for the team password, loads from the database, saves every change and follows changes made by others.

Only the listed e-mail can read or write; the rule is in `supabase/schema.sql`. With a database configured, nothing is stored in the browser. When two people edit the same row at the same moment, the last save wins.

## Importing the Excel sheet

`scripts/import_gantt.py` converts the "General GANTT" sheet into the app's format. It needs only Python's standard library and lists everything it had to interpret.

```
python scripts/import_gantt.py "path/to/General GANTT.xlsx" data/real.json
```

Then use "Import data" in the app's bottom bar. The `data/` folder is ignored by git because the output contains real names. "Export" in the same bar downloads a backup in the same format.

## Code map

| File | What is in it |
|---|---|
| `src/store.ts` | Data model, units, lenses, derived numbers, all actions, undo |
| `src/sync.ts` | Supabase: unlock, load, save, live updates |
| `src/seed.ts` | Fictional demo data |
| `src/components/Timeline.vue` | The grid: rows, cells, editing, dragging, readout |
| `src/components/LoadCell.vue` | One quarter or month of a person's load |
| `src/components/Drawer.vue` | Editors for projects, people and PhDs |
| `src/components/MonthReport.vue` | The monthly days table |
| `src/components/Gate.vue` | Team password screen |
| `src/style.css` | All styling; the two house styles are blocks of variables at the top |

## Known limits

- The overlapping mark applies to a person on a project for its whole run, not per quarter.
- Reported months cannot be locked.
- Projects have no euro budget; promised effort is in person-months only.
- The shared password cannot tell people apart.
