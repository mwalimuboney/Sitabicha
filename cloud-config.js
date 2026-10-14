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
  url:    'https://kscxrtbxbimoyfyysroi.supabase.co',                      
  anon:   'sb_publishable_wEUAGatR3Bts9soh4xewMQ_v3-yzlZv',                      
  domain: 'sitabicha.schooly.live'     
};
