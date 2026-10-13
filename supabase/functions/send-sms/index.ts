// Supabase Edge Function — send-sms
// Uses CallMeBot (free, no cost) to send WhatsApp messages.
// Each recipient must first send "I allow callmebot to send messages" to +34 644 59 88 14
// Env vars: CALLMEBOT_DEFAULT_APIKEY (fallback)
// Body: { phone, message, apikey? }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { phone, message, apikey } = await req.json();
    if (!phone || !message) throw new Error('phone and message are required');

    let d = String(phone).replace(/\D/g, '');
    if (d.startsWith('0')) d = '254' + d.slice(1);

    const key = apikey || Deno.env.get('CALLMEBOT_DEFAULT_APIKEY') || '';
    if (!key) throw new Error('No CallMeBot API key. User must activate CallMeBot first.');

    const url = `https://api.callmebot.com/whatsapp.php?phone=${d}&text=${encodeURIComponent(message)}&apikey=${key}`;
    const res = await fetch(url);
    const txt = await res.text();
    return new Response(JSON.stringify({ ok: res.ok, response: txt.slice(0, 200) }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: CORS });
  }
});
