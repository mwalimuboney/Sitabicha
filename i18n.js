'use strict';
/* ============================================================
   i18n.js — English ↔ Kiswahili UI translation
   Usage: T('Save') returns translated string
   Toggle: I18n.setLang('sw') or I18n.setLang('en')
   ============================================================ */
const I18n = (() => {
  const LS = 'sr_lang';
  let lang = localStorage.getItem(LS) || 'en';

  const SW = {
    // Navigation
    'Home':'Nyumbani','Students':'Wanafunzi','Marks':'Alama','Reports':'Ripoti','More':'Zaidi',
    // Actions
    'Save':'Hifadhi','Cancel':'Ghairi','Delete':'Futa','Edit':'Hariri','Add':'Ongeza',
    'Submit':'Wasilisha','Approve':'Idhinisha','Reject':'Kataa','Search':'Tafuta',
    'Back':'Rudi','Close':'Funga','Print':'Chapa','Download':'Pakua','Upload':'Pakia',
    // Common labels
    'Name':'Jina','Class':'Darasa','Subject':'Somo','Teacher':'Mwalimu','Student':'Mwanafunzi',
    'Parent':'Mzazi','Admin':'Msimamizi','School':'Shule','Date':'Tarehe','Year':'Mwaka',
    'Term':'Muhula','Exam':'Mtihani','Score':'Alama','Grade':'Daraja','Average':'Wastani',
    'Position':'Nafasi','Total':'Jumla','Present':'Aliyopo','Absent':'Hayupo','Late':'Amechelewa',
    // Messages
    'Saved.':'Imehifadhiwa.','Deleted.':'Imefutwa.','Loading…':'Inapakia…',
    'No data yet.':'Hakuna data bado.','Sign in':'Ingia','Sign out':'Toka',
    'Enter marks':'Ingiza alama','Report card':'Kadi ya ripoti',
    'Enter first and last name.':'Ingiza jina la kwanza na la mwisho.',
    'Wrong username or password.':'Jina la mtumiaji au neno la siri si sahihi.',
    'Too many attempts.':'Majaribio mengi sana.',
    // Departments
    'Academics':'Masomo','Sports & Games':'Michezo','Library':'Maktaba',
    'Welfare & Guidance':'Ustawi','Finance':'Fedha','Administration':'Utawala',
    'ICT Department':'Teknolojia','Sciences':'Sayansi','Languages':'Lugha',
    'Arts, Music & Culture':'Sanaa na Muziki',
    // Attendance
    'Attendance':'Mahudhurio','Mark attendance':'Weka mahudhurio',
    'Period':'Kipindi','All present':'Wote wamefika',
    // Marks
    'Enter marks':'Ingiza alama','Voice entry':'Ingiza kwa sauti',
    'Marks for':'Alama za','in':'katika',
    // Quiz
    'Quiz Builder':'Tengeneza Jaribio','Join Quiz':'Jiunge na Jaribio',
    'Launch':'Anzisha','Room code':'Msimbo wa chumba',
    // Notes
    'Notes Bank':'Benki ya Maelezo','Read':'Soma','Topic':'Mada','Subtopic':'Mada ndogo',
    // Fees
    'Fees':'Ada','Payment':'Malipo','Balance':'Baki','Receipt':'Risiti',
    // People
    'Staff':'Wafanyakazi','Department':'Idara','HOD':'Mkuu wa Idara',
    'Leave':'Likizo','Duties':'Wajibu','Rights':'Haki',
    // Security
    'PIN Lock':'Kufunga PIN','Locked':'Imefungwa','Unlock':'Fungua',
    // Misc
    'Settings':'Mipangilio','Notifications':'Arifa','Announcements':'Matangazo',
    'Timetable':'Ratiba','Assignments':'Kazi za Nyumbani','Library':'Maktaba',
    'Discussion':'Majadiliano','Dashboard':'Dashibodi','Profile':'Wasifu',
    'Password':'Neno la Siri','Username':'Jina la Mtumiaji',
    'Admission No':'Nambari ya Udahili','Gender':'Jinsia','Male':'Mwanaume','Female':'Mwanamke',
    'Active':'Amewashwa','Inactive':'Imezimwa','Pending':'Inasubiri',
    'Approved':'Imeidhinishwa','Rejected':'Imekataliwa',
    'No students found.':'Hakuna wanafunzi waliopatikana.',
    'Add subject':'Ongeza somo','No class':'Hakuna darasa',
    'Mark entry is open to you':'Unaweza kuingiza alama',
    'Mark entry is locked':'Uingizaji wa alama umefungwa',
  };

  const T = (str) => {
    if (lang === 'en') return str;
    return SW[str] || str;
  };

  const setLang = (l) => {
    lang = l;
    localStorage.setItem(LS, l);
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = T(key);
    });
    // Rebuild current page
    if (window.route) route();
  };

  const getLang = () => lang;

  // Inject language toggle into More page
  const toggleHtml = () => `
    <div class="row" style="gap:8px;padding:10px 0;border-bottom:1px solid var(--bd)">
      <div class="grow"><b data-i18n="Language">Language / Lugha</b><div class="small muted">App display language</div></div>
      <button class="btn sm ${lang==='en'?'pri':''}" onclick="I18n.setLang('en')">EN</button>
      <button class="btn sm ${lang==='sw'?'pri':''}" onclick="I18n.setLang('sw')">SW</button>
    </div>`;

  PluginLoader.register({
    id:'i18n', name:'Language Switcher', icon:'🌍',
    description:'Switch UI between English and Kiswahili.',
    stores:[], routes:{}, menuItems:[]
  });

  return { T, setLang, getLang, toggleHtml };
})();

// Global shorthand
const T = (s) => I18n.T(s);
