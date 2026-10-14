/* =====================================================================
   cloud-config.js — one shared Supabase connection for EVERYONE who opens this site.

   Fill in the two values below, commit this file to GitHub, and every visitor to your
   GitHub Pages link goes straight to the sign-in / create-account screen
   (no one has to paste a URL or key).

   SAFE to publish:   Project URL  and  anon (public) key
                      -> Supabase Dashboard > Project Settings > API
   NEVER put here:    the "service_role" key, the database password, or any "secret" key.

   Your data stays protected by the Row Level Security rules in supabase/schema.sql,
   not by hiding the anon key (it is designed to be public).
   ===================================================================== */
window.SR_DEFAULT_CLOUD = {
  url:    '',                      // e.g. 'https://abcdxyz.supabase.co'
  anon:   '',                      // e.g. 'eyJhbGciOi...' (the long anon / public key)
  domain: 'school-records.app'     // keep the same value you used in SETUP_SUPABASE.md
};
