# School Records v3 (phone app / PWA) — with cloud sync
- Works fully offline and phone-only (v2 behaviour) OR connected to Supabase for shared multi-user data.
- See SETUP_SUPABASE.md for the one-time cloud setup (supabase/schema.sql + supabase/functions/admin-users).
- Upgrading from v2: upload these files over the old ones; bump nothing else. Existing data is kept.

Files: index.html, app.js (screens), core.js (rules, grading, PDF), store.js (local DB), sync.js (cloud engine), sw.js (offline cache), manifest, icons, supabase/.
Host over HTTPS (Netlify Drop / GitHub Pages / Cloudflare Pages). Bump VERSION in sw.js when you change files.
