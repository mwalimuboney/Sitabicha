# School Records — phone app (PWA)
Works offline. Installs from the browser to the home screen with its own icon. Data is stored on the phone.

## Put it online ONCE (free) — teachers then just open a link
The app must be served over HTTPS so phones can install it. Pick one:
1. **Netlify Drop** (easiest): go to app.netlify.com/drop, drag this whole folder onto the page. You get a link.
2. **GitHub Pages**: upload the files to a repo, Settings → Pages → deploy from main branch.
3. **Cloudflare Pages**: create a Pages project and upload the folder.

## Each teacher
1. Open the link in **Chrome** on Android (or Safari on iPhone).
2. Tap **Install app** on the Home screen of the app (or browser menu ⋮ → Install app / Add to Home screen).
3. An icon appears on the home screen. After that it opens like a normal app, with or without internet.

## Notes
- Files opened straight from storage (file://) cannot install; it has to come from the link.
- Updating: upload the new files to the same place, bump `VERSION` in `sw.js`; phones update next time they are online.
- Every record already has id / updated_at / deleted_at so Supabase sync can be added later without converting data.
- Backups: More → Backup & data. Restore works across phones.
