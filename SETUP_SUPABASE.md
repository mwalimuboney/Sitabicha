# Setting up cloud sync (about 20 minutes, once)

You need a free Supabase account (supabase.com). One Supabase project = one school.

## 1. Create the project
New project -> choose a name, a strong database password (save it) and the region closest to you.

## 2. Create the tables and rules
Dashboard -> **SQL Editor** -> New query -> paste everything from `supabase/schema.sql` -> **Run**.
It should finish with "Success". Run it only once.

## 3. Authentication settings
Dashboard -> **Authentication**
- Providers -> **Email**: turn **Confirm email OFF** (accounts are created by your super admin, not by email).
- Sign In / Providers settings (or "Settings"): turn **"Allow new users to sign up" OFF**.

## 4. Create the first super admin
Authentication -> **Users** -> **Add user** -> *Create new user*
- Email: `boss@school-records.app`  (that is  <username>@school-records.app  — pick your own username)
- Password: your password; tick **Auto Confirm User**.

Then SQL Editor -> run (use YOUR email, username and name):

    select public.bootstrap_superadmin('boss@school-records.app', 'boss', 'Your Full Name');

## 5. Deploy the account function
Dashboard -> **Edge Functions** -> create a function named `admin-users` and paste in `supabase/functions/admin-users/index.ts`
(or with the CLI:  `supabase functions deploy admin-users`).
It uses the secret service key automatically — that key must NEVER be typed into the app.
If you changed the login domain, add a function secret `LOGIN_DOMAIN` with the same value.

## 6. Connect the app
Project Settings -> **API**: copy the **Project URL** and the **anon public** key.
On the super admin's phone: open the app -> **Connect to my school's cloud** (first screen) or More -> Cloud sync.
Paste URL + anon key, keep the login domain `school-records.app`, then sign in as your super admin.
If that phone already holds data from the phone-only version: More -> Cloud sync -> **Upload this phone's data**.

## 7. Add people
More -> **Users & roles** -> Add user. Share the app link and their temporary password; they choose their own at first sign-in.
Teachers sign in once with internet; after that the app also works offline and syncs when online.

## Good to know
- Phones sync when the app is open: about every 20 seconds, when you return to the app, and a few seconds after each change. There is no push alert while the app is closed.
- The server enforces roles and the exam-entry lock. A teacher with a tampered phone is still refused.
- The server does NOT hide data from reading: every signed-in teacher's phone receives student records (including photos and medical notes; the app only hides them in the screens).
- Profile *views* are logged by the app on each phone, not by the server.
- Check Supabase's current free-plan limits (storage, and whether unused projects pause). Photos are the biggest data.
- Keep making backups (More -> Backup & data) — cloud sync is not a backup if someone deletes data.
- Student data is personal data about children; check your obligations under Kenya's Data Protection Act with your school's lawyer or the ODPC.
