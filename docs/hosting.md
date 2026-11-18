# Hosting on the UGent webshare

The app runs at https://imagineering.ugent.be/portfolio/, from the `portfolio` folder on the `imagineering` webshare.

It is a static site that talks to Supabase from the visitor's browser, so the webshare only has to serve files. Nothing runs on the server.

| | |
|---|---|
| Page | `index.html` and an `assets/` folder, copied to a folder on the share |
| Data, sign-in, live updates | Supabase, called directly from the browser |
| Updating | `npm run deploy` |

## Deploying

1. Mount the webshare.
2. Once: add the destination folder to `.env.local`, for example
   `WEBSHARE_DIR=Z:\www\shares\imagineering\portfolio`. The folder name becomes the last part
   of the address. Map the drive by server name (`\\files.ugent.be\...`), not by numeric address:
   the webshare folders are links that only open that way.
3. Run `npm run deploy`. It type-checks, builds, and copies `index.html` and `assets/` into that folder.

The script only writes those two things. It never touches the share's own `.htaccess` or `.default.html`.

## Things to know

- **The Supabase settings are built into the page.** The project URL, the anon key and the team e-mail from `.env.local` end up readable in the JavaScript. That is how Supabase is meant to be used: the data is protected by the access rule in `supabase/schema.sql` and the team password, not by hiding these values. The password itself is never in a file.
- **The build works from any folder** (`base: './'` in `vite.config.ts`), so renaming the folder on the share needs no rebuild.
- **No server-side code is needed**, which matters because the webshare cannot make outgoing requests.
- **After a deploy**, people with the page open keep the old version until they reload.
