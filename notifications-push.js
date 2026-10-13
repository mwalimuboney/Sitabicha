'use strict';
/* ============================================================
   notifications-push.js
   • Web Push subscription (VAPID via Supabase Edge Function)
   • In-app class alarm: 10 min warning + class-ending alert
   • Google Calendar sync: writes each teacher's timetable
   ============================================================ */

const PushManager = (() => {
  const SUB_KEY = 'sr_push_sub';

  /* ---- Subscribe / unsubscribe ---- */
  async function subscribe(vapidPublicKey) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push not supported on this device.');
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
    localStorage.setItem(SUB_KEY, JSON.stringify(sub));
    // Save subscription to Supabase via Edge Function
    await saveSubToCloud(sub);
    return sub;
  }

  async function unsubscribe() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await sub.unsubscribe(); localStorage.removeItem(SUB_KEY); }
  }

  async function saveSubToCloud(sub) {
    if (!window.Cloud || !Cloud.enabled()) return;
    try {
      await Cloud.adminUsers({ action: 'save_push_sub', subscription: sub.toJSON(), user_id: window.ME?.id });
    } catch (e) {}
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  /* ---- Class alarm scheduler ---- */
  // Reads timetable store; sets two alarms per period: 10-min warning + ending alert
  const alarmTimers = [];

  function clearAlarms() { alarmTimers.forEach(t => clearTimeout(t)); alarmTimers.length = 0; }

  function scheduleAlarmsForToday() {
    clearAlarms();
    if (!window.Store || !window.ME) return;
    const today   = new Date();
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
    const myClass = window.ME.role === 'teacher' ? null : null; // teachers see their own periods

    // Period start times (configurable later via settings)
    const PERIOD_TIMES = {
      'Period 1': '07:30', 'Period 2': '08:25', 'Period 3': '09:20',
      'Period 4': '10:15', 'Period 5': '11:10', 'Period 6': '12:05',
      'Period 7': '13:30', 'Period 8': '14:25'
    };
    const PERIOD_DURATION_MIN = 40;

    const myEntries = Store.all('timetable').filter(r => {
      if (r.day !== dayName) return false;
      if (window.ME.role === 'teacher') return r.teacher_id === window.ME.id;
      return true;
    });

    myEntries.forEach(entry => {
      const startStr = PERIOD_TIMES[entry.period];
      if (!startStr) return;
      const [h, m]    = startStr.split(':').map(Number);
      const startMs   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0).getTime();
      const endMs     = startMs + PERIOD_DURATION_MIN * 60 * 1000;
      const warnMs    = startMs - 10 * 60 * 1000;
      const now       = Date.now();
      const sub       = window.Store.get('subjects', entry.subject_id);
      const cls       = window.Store.get('classes', entry.class_id);
      const subName   = sub ? sub.name : 'Class';
      const clsName   = cls ? cls.name : '';

      if (warnMs > now) {
        alarmTimers.push(setTimeout(() => {
          fireLocalNotification(`⏰ 10 min to ${subName}`, `${clsName} starts at ${startStr}. Get ready!`);
        }, warnMs - now));
      }
      if (endMs > now) {
        alarmTimers.push(setTimeout(() => {
          fireLocalNotification(`🔔 Class ending`, `${subName} (${clsName}) ends in 5 minutes.`);
        }, endMs - 5 * 60 * 1000 - now));
      }
    });
  }

  function fireLocalNotification(title, body) {
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'class-alarm', renotify: true, vibrate: [200, 100, 200] }));
    } else if (window.toast) {
      toast(`${title}: ${body}`, 6000);
    }
  }

  async function requestPermission() {
    if (!('Notification' in window)) return 'not-supported';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  }

  /* ---- Google Calendar sync (writes to teacher's calendar) ---- */
  async function syncToGoogleCalendar(accessToken) {
    if (!accessToken || !window.ME) return;
    const today    = new Date();
    const dayName  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
    const entries  = Store.all('timetable').filter(r => r.teacher_id === window.ME.id);

    const PERIOD_TIMES = {
      'Period 1': '07:30', 'Period 2': '08:25', 'Period 3': '09:20',
      'Period 4': '10:15', 'Period 5': '11:10', 'Period 6': '12:05',
      'Period 7': '13:30', 'Period 8': '14:25'
    };
    const DURATION = 40;
    const CALENDAR_ID = 'primary';

    for (const e of entries) {
      const startStr = PERIOD_TIMES[e.period];
      if (!startStr) continue;
      const [h, m] = startStr.split(':').map(Number);
      // Build ISO strings for the next occurrence of the correct weekday
      const dayIdx = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(e.day);
      const diff   = (dayIdx - today.getDay() + 7) % 7 || 7;
      const date   = new Date(today); date.setDate(date.getDate() + (diff === 7 && e.day === dayName ? 0 : diff));
      const start  = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
      const end    = new Date(start.getTime() + DURATION * 60000);
      const sub    = Store.get('subjects', e.subject_id);
      const cls    = Store.get('classes', e.class_id);

      try {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: `${sub ? sub.name : 'Class'} — ${cls ? cls.name : ''}`,
            description: `Room: ${e.room || '—'} | Period: ${e.period}`,
            start:  { dateTime: start.toISOString(), timeZone: 'Africa/Nairobi' },
            end:    { dateTime: end.toISOString(),   timeZone: 'Africa/Nairobi' },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${e.day.slice(0,2).toUpperCase()}`],
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] }
          })
        });
      } catch (err) {}
    }
    toast('Timetable synced to Google Calendar ✅');
  }

  /* ---- Settings panel for push + calendar ---- */
  function pageNotificationSettings() {
    view('Notification Settings', `
      <div class="card"><h2>🔔 Push Notifications</h2>
        <p class="muted small">Receive alerts on your phone even when the app is closed.</p>
        <button class="btn pri full" id="pn-enable">Enable push notifications</button>
        <button class="btn full" id="pn-test" style="margin-top:8px">Send test notification</button>
        <button class="btn bad full" id="pn-disable" style="margin-top:8px">Disable</button>
      </div>
      <div class="card"><h2>⏰ Class Alarms</h2>
        <p class="muted small">Get alerted 10 minutes before your class starts and when it's ending. Runs while the app is open.</p>
        <button class="btn pri full" id="al-start">Start today's alarms</button>
        <button class="btn full" id="al-stop" style="margin-top:8px">Stop alarms</button>
      </div>
      <div class="card"><h2>📅 Google Calendar</h2>
        <p class="muted small">Sync your timetable as recurring weekly events with 10-min reminders.</p>
        <label>Google access token (from OAuth)</label>
        <input id="gc-token" type="password" placeholder="ya29.xxxx">
        <button class="btn pri full" id="gc-sync" style="margin-top:8px">Sync my timetable</button>
        <p class="muted small" style="margin-top:6px">Get a token at <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener">OAuth Playground</a> with Calendar scope.</p>
      </div>
    `, { back: '#/more', tab: 'more' });

    document.getElementById('pn-enable').onclick  = async () => {
      const perm = await requestPermission();
      if (perm !== 'granted') return toast('Permission denied. Enable notifications in browser settings.');
      try {
        const vapid = window.SET?.vapid_public_key || '';
        if (!vapid) return toast('VAPID key not set. Ask superadmin to add it in Settings.');
        await subscribe(vapid);
        toast('Push notifications enabled ✅');
      } catch (e) { toast(e.message); }
    };
    document.getElementById('pn-test').onclick    = () => fireLocalNotification('Test 🔔', 'Push notifications are working!');
    document.getElementById('pn-disable').onclick = () => { unsubscribe(); toast('Push notifications disabled.'); };
    document.getElementById('al-start').onclick   = () => { scheduleAlarmsForToday(); toast('Class alarms set for today ✅'); };
    document.getElementById('al-stop').onclick    = () => { clearAlarms(); toast('Alarms cleared.'); };
    document.getElementById('gc-sync').onclick    = async () => {
      const tok = document.getElementById('gc-token').value.trim();
      if (!tok) return toast('Enter your Google access token.');
      await syncToGoogleCalendar(tok);
    };
  }

  return { subscribe, unsubscribe, scheduleAlarmsForToday, clearAlarms, requestPermission, pageNotificationSettings, fireLocalNotification };
})();
