'use strict';
/* ============================================================
   dictionary.js — English Dictionary, Kamusi, Grammar Checker,
   TTS Reader, Dictation, Auto-save, Word lookup on double-tap
   ============================================================ */
const Dictionary = (() => {
  // ── English Dictionary (dictionaryapi.dev — free, no key) ──
  async function lookupEnglish(word) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[0] || null;
    } catch(e) { return null; }
  }

  // ── Offline Kiswahili mini-kamusi (common words) ──
  const KAMUSI = {
    'shule':'Mahali ambapo wanafunzi wanajifunza; taasisi ya elimu.',
    'mwalimu':'Mtu anayefundisha; mwelimishaji.',
    'mwanafunzi':'Mtu anayejifunza; mtu aliyeandikishwa shuleni.',
    'alama':'Ishara au nambari inayoonyesha matokeo ya mtihani.',
    'mtihani':'Tathmini ya maarifa au ujuzi wa mtu.',
    'maktaba':'Jengo au chumba chenye vitabu kwa kusomwa.',
    'darasa':'Kundi la wanafunzi wanaosoma pamoja; chumba cha masomo.',
    'somo':'Mada inayofundishwa shuleni kama Hisabati, Kiswahili.',
    'ratiba':'Mpangilio wa wakati wa masomo au shughuli.',
    'likizo':'Muda wa mapumziko kutoka shuleni au kazini.',
    'ada':'Pesa inayolipwa kwa huduma ya masomo.',
    'ripoti':'Waraka unaoonyesha matokeo ya mwanafunzi.',
    'mahudhurio':'Hali ya kuwepo shuleni au madarasani.',
    'muhula':'Sehemu ya mwaka wa shule; kuna muhula wa kwanza, pili na tatu.',
    'mkurugenzi':'Mtu mkuu anayesimamia taasisi au idara.',
    'faharasa':'Orodha ya maneno na maana yake; kamusi.',
    'insha':'Uandishi wa ubunifu; tungo ya maneno kwa mada fulani.',
    'hesabu':'Sayansi ya nambari; hisabati.',
    'jiografia':'Somo la ardhi, mito, milima na mazingira.',
    'historia':'Somo la matukio ya zamani; kumbukumbu za wakati uliopita.',
    'biolojia':'Sayansi ya viumbe hai — mimea na wanyama.',
    'kemia':'Sayansi ya vitu na muundo wao wa atomu.',
    'fizikia':'Sayansi ya nguvu, mwanga, joto na mwendo.',
    'sanaa':'Ubunifu wa kuchora, kuimba au kucheza.',
    'muziki':'Sauti za kupendeza zilizopangwa kwa mpangilio.',
  };

  async function lookupKiswahili(word) {
    const w = word.trim().toLowerCase();
    if (KAMUSI[w]) return { word: w, meaning: KAMUSI[w], lang: 'sw' };
    // Try online if available
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
      if (res.ok) { const d = await res.json(); return d[0] ? { word: w, meaning: d[0]?.meanings?.[0]?.definitions?.[0]?.definition || '', lang: 'en' } : null; }
    } catch(e) {}
    return null;
  }

  // ── Grammar Checker (LanguageTool free API) ──
  async function checkGrammar(text, lang = 'en-US') {
    try {
      const res = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `text=${encodeURIComponent(text)}&language=${lang}`
      });
      const j = await res.json();
      return j.matches || [];
    } catch(e) { return []; }
  }

  // ── Text-to-Speech (Web Speech API) ──
  function speak(text, lang = 'en-US') {
    if (!window.speechSynthesis) return toast('TTS not supported on this browser.');
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 0.85; u.pitch = 1;
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }

  // ── Speech-to-Text Dictation ──
  let dictRecog = null;
  function startDictation(targetEl, lang = 'en-US', onResult) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Dictation not supported. Use Chrome.'); return; }
    if (dictRecog) { try { dictRecog.stop(); } catch(e) {} }
    dictRecog = new SR();
    dictRecog.lang = lang; dictRecog.continuous = true; dictRecog.interimResults = true;
    dictRecog.onresult = (e) => {
      let final = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (targetEl) targetEl.value = (targetEl.value || '') + final;
      if (onResult) onResult(final, interim);
    };
    dictRecog.onerror = () => toast('Dictation stopped.');
    dictRecog.start();
    toast('🎤 Dictation started. Speak now...');
  }

  function stopDictation() { if (dictRecog) { try { dictRecog.stop(); } catch(e) {} dictRecog = null; toast('Dictation stopped.'); } }

  // ── Auto-save drafts ──
  const draftTimers = new Map();
  function autosave(key, getValue, interval = 30000) {
    if (draftTimers.has(key)) clearInterval(draftTimers.get(key));
    const t = setInterval(() => {
      const val = getValue();
      if (val) {
        localStorage.setItem('sr_draft_' + key, JSON.stringify({ val, ts: Date.now() }));
      }
    }, interval);
    draftTimers.set(key, t);
  }
  function getDraft(key) {
    try { return JSON.parse(localStorage.getItem('sr_draft_' + key) || 'null'); } catch(e) { return null; }
  }
  function clearDraft(key) { localStorage.removeItem('sr_draft_' + key); if (draftTimers.has(key)) clearInterval(draftTimers.get(key)); }

  // ── Dictionary UI page ──
  function pageDictionary() {
    const curLang = I18n.getLang();
    view('📖 Dictionary / Kamusi', `
      <div class="card" style="background:linear-gradient(135deg,#f0fdfa,#eff8ff)">
        <div class="row">
          <button class="btn sm ${curLang==='en'?'pri':''}" id="dict-en">🇬🇧 English</button>
          <button class="btn sm ${curLang==='sw'?'pri':''}" id="dict-sw">🇰🇪 Kiswahili</button>
          <div class="grow"></div>
          <button class="btn sm" id="dict-grammar">✏️ Grammar Check</button>
        </div>
      </div>
      <div class="card">
        <div class="row" style="gap:8px">
          <input id="dict-input" placeholder="${curLang==='sw'?'Tafuta neno...':'Search a word...'}" style="flex:1;font-size:18px">
          <button class="btn sm pri" id="dict-search">Search</button>
        </div>
        <div id="dict-result" style="margin-top:14px"></div>
      </div>
      <div class="card" id="tts-card">
        <h2>🔊 Text-to-Speech Reader</h2>
        <textarea id="tts-text" placeholder="Paste or type any text to read aloud..." style="min-height:80px"></textarea>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn sm pri grow" id="tts-read-en">▶ Read (English)</button>
          <button class="btn sm grow" id="tts-read-sw">▶ Soma (Kiswahili)</button>
          <button class="btn sm bad" id="tts-stop">⏹</button>
        </div>
      </div>
      <div class="card" id="dictation-card">
        <h2>🎤 Dictation (Speech → Text)</h2>
        <textarea id="dict-target" placeholder="Your speech will appear here..." style="min-height:80px"></textarea>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn sm pri grow" id="dict-start-en">🎤 Dictate (EN)</button>
          <button class="btn sm grow" id="dict-start-sw">🎤 Imla (SW)</button>
          <button class="btn sm bad" id="dict-stop-btn">⏹ Stop</button>
        </div>
      </div>
    `, { back: '#/more', tab: 'more' });

    const inp = document.getElementById('dict-input');
    const search = async () => {
      const w = inp.value.trim(); if (!w) return;
      document.getElementById('dict-result').innerHTML = '<p class="muted small">Looking up...</p>';
      const isKiswahili = curLang === 'sw' || /[aeiou]{2,}/i.test(w);
      let html = '';
      if (curLang === 'sw') {
        const r = await lookupKiswahili(w);
        if (r) {
          html = `<div style="margin-bottom:14px">
            <div style="font-size:22px;font-weight:800;color:var(--p)">${esc(r.word)}</div>
            <div style="margin-top:8px;line-height:1.8">${esc(r.meaning)}</div>
            <button class="btn sm" onclick="Dictionary.speak('${esc(r.word+': '+r.meaning)}','sw')" style="margin-top:8px">🔊 Soma</button>
          </div>`;
        } else {
          html = `<div class="msg warn">Neno "<b>${esc(w)}</b>" halipatikani kwenye kamusi.</div>`;
        }
      } else {
        const r = await lookupEnglish(w);
        if (r) {
          html = `<div>
            <div class="row" style="align-items:flex-end;gap:12px;margin-bottom:10px">
              <span style="font-size:26px;font-weight:800;color:var(--p)">${esc(r.word)}</span>
              ${r.phonetic?`<span class="muted">${esc(r.phonetic)}</span>`:''}
              <button class="btn sm" onclick="Dictionary.speak('${esc(r.word)}','en-US')">🔊 Hear</button>
            </div>
            ${(r.meanings||[]).map(m=>`
              <div style="margin-bottom:12px">
                <span class="badge">${esc(m.partOfSpeech)}</span>
                ${(m.definitions||[]).slice(0,3).map((d,i)=>`
                  <div style="padding:8px 0;border-bottom:1px solid var(--bd)">
                    <div style="font-weight:600;margin-bottom:3px">${i+1}. ${esc(d.definition)}</div>
                    ${d.example?`<div class="small muted" style="font-style:italic">"${esc(d.example)}"</div>`:''}
                    ${d.synonyms?.length?`<div class="small" style="margin-top:4px">Synonyms: ${d.synonyms.slice(0,4).map(s=>`<span onclick="document.getElementById('dict-input').value='${s}';document.getElementById('dict-search').click()" style="color:var(--p);cursor:pointer;margin-right:6px">${esc(s)}</span>`).join('')}</div>`:''}
                  </div>`).join('')}
              </div>`).join('')}
          </div>`;
        } else {
          html = `<div class="msg warn">Word "<b>${esc(w)}</b>" not found. Check spelling.</div>`;
        }
      }
      document.getElementById('dict-result').innerHTML = html;
    };
    document.getElementById('dict-search').onclick = search;
    inp.onkeydown = e => { if (e.key === 'Enter') search(); };
    document.getElementById('dict-en').onclick = () => { I18n.setLang('en'); pageDictionary(); };
    document.getElementById('dict-sw').onclick = () => { I18n.setLang('sw'); pageDictionary(); };
    document.getElementById('dict-grammar').onclick = () => pageGrammarChecker();
    document.getElementById('tts-read-en').onclick = () => speak(document.getElementById('tts-text').value, 'en-US');
    document.getElementById('tts-read-sw').onclick = () => speak(document.getElementById('tts-text').value, 'sw');
    document.getElementById('tts-stop').onclick = stopSpeaking;
    document.getElementById('dict-start-en').onclick = () => startDictation(document.getElementById('dict-target'), 'en-US');
    document.getElementById('dict-start-sw').onclick = () => startDictation(document.getElementById('dict-target'), 'sw');
    document.getElementById('dict-stop-btn').onclick = stopDictation;
  }

  // ── Grammar Checker page ──
  function pageGrammarChecker() {
    view('✏️ Grammar Checker', `
      <div class="card">
        <h2>English Grammar Check</h2>
        <textarea id="gc-text" placeholder="Type or paste your essay, note or announcement here..." style="min-height:150px"></textarea>
        <button class="btn pri full" id="gc-check" style="margin-top:10px">Check Grammar</button>
        <div id="gc-result" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <h2>🤖 AI Kiswahili Sarufi</h2>
        <p class="muted small">Powered by Groq (add groq_api_key in Settings).</p>
        <textarea id="sw-text" placeholder="Andika insha au sentensi yako hapa..." style="min-height:100px"></textarea>
        <button class="btn full" id="sw-check" style="margin-top:8px">Angalia Sarufi (AI)</button>
        <div id="sw-result" style="margin-top:10px"></div>
      </div>
    `, { back: '#/dictionary', tab: 'more' });

    document.getElementById('gc-check').onclick = async () => {
      const text = document.getElementById('gc-text').value.trim();
      if (!text) return toast('Enter some text first.');
      document.getElementById('gc-result').innerHTML = '<p class="muted small">Checking...</p>';
      const matches = await checkGrammar(text, 'en-US');
      if (!matches.length) {
        document.getElementById('gc-result').innerHTML = '<div class="msg good">✅ No grammar issues found!</div>';
        return;
      }
      document.getElementById('gc-result').innerHTML = `
        <div class="msg warn" style="margin-bottom:8px">${matches.length} issue${matches.length>1?'s':''} found:</div>
        ${matches.map(m=>`<div style="border:1px solid var(--bd);border-radius:10px;padding:12px;margin-bottom:8px">
          <div style="font-weight:700;color:var(--bad)">${esc(m.message)}</div>
          <div class="small muted" style="margin:4px 0">Context: "...${esc(m.context?.text||'')}..."</div>
          ${m.replacements?.length?`<div class="small">Suggestions: ${m.replacements.slice(0,3).map(r=>`<span style="background:#ecfdf3;padding:2px 8px;border-radius:6px;margin-right:4px;color:var(--good)">${esc(r.value)}</span>`).join('')}</div>`:''}
        </div>`).join('')}`;
    };

    document.getElementById('sw-check').onclick = async () => {
      const text = document.getElementById('sw-text').value.trim();
      if (!text) return toast('Andika maandishi kwanza.');
      const key = SET.groq_api_key || '';
      if (!key) return toast('Ongeza groq_api_key katika Mipangilio.');
      document.getElementById('sw-result').innerHTML = '<p class="muted small">AI inangalia sarufi...</p>';
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method:'POST', headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
          body: JSON.stringify({ model:'llama3-8b-8192', messages:[{role:'user', content:`Angalia sarufi ya sentensi hii ya Kiswahili. Toa maelezo mafupi ya makosa (kama yako) na ushauri wa kusahihisha. Jibu kwa Kiswahili:\n\n"${text}"`}], max_tokens:400 })
        });
        const j = await res.json();
        document.getElementById('sw-result').innerHTML = `<div class="card" style="background:#f0fdfa">${esc(j.choices?.[0]?.message?.content||'Hakuna jibu.')}</div>`;
      } catch(e) { document.getElementById('sw-result').innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; }
    };
  }

  // ── Double-tap word lookup ──
  function enableWordLookup(containerEl) {
    if (!containerEl) return;
    containerEl.addEventListener('dblclick', async (e) => {
      const selection = window.getSelection();
      if (!selection || !selection.toString().trim()) return;
      const word = selection.toString().trim().split(/\s+/)[0];
      if (!word || word.length < 2) return;
      const lang = I18n.getLang();
      const r = lang === 'sw' ? await lookupKiswahili(word) : await lookupEnglish(word);
      if (!r) return;
      const def = lang === 'sw' ? r.meaning : (r.meanings?.[0]?.definitions?.[0]?.definition || '');
      // Show floating tooltip
      const existing = document.getElementById('word-tooltip');
      if (existing) existing.remove();
      const tip = document.createElement('div');
      tip.id = 'word-tooltip';
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      tip.style.cssText = `position:fixed;left:${Math.min(rect.left,window.innerWidth-220)}px;top:${rect.bottom+8}px;background:#14201f;color:#fff;padding:10px 14px;border-radius:12px;max-width:220px;z-index:99;font-size:13px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.3)`;
      tip.innerHTML = `<b>${esc(word)}</b><br>${esc(def.slice(0,120))}${def.length>120?'...':''}<div style="margin-top:6px;opacity:.7;font-size:11px">Double-tap to close</div>`;
      document.body.appendChild(tip);
      tip.ondblclick = () => tip.remove();
      setTimeout(() => tip.remove(), 6000);
    });
  }

  PluginLoader.register({
    id:'dictionary', name:'Dictionary & Grammar', icon:'📖',
    description:'English dictionary, Kamusi ya Kiswahili, grammar checker, TTS, dictation, auto-save.',
    stores:[], routes:{ 'dictionary':pageDictionary, 'grammar-check':pageGrammarChecker },
    menuItems:[{hash:'#/dictionary', icon:'📖', title:'Dictionary / Kamusi', sub:'Words, grammar, speech', role:'guest'}]
  });

  return { lookupEnglish, lookupKiswahili, checkGrammar, speak, stopSpeaking, startDictation, stopDictation, autosave, getDraft, clearDraft, pageDictionary, enableWordLookup };
})();
