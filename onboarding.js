'use strict';
/* Role-specific onboarding tour using Driver.js if available, fallback slides */
const Onboarding = (() => {
  const LS='sr_onboarded';
  function hasOnboarded(role){ return localStorage.getItem(LS+'_'+role); }
  function markOnboarded(role){ localStorage.setItem(LS+'_'+role,'1'); }

  const TOURS = {
    superadmin:[
      {title:'👋 Welcome, Super Admin!',body:'You have full control of this school management system. Let\'s take a quick tour.'},
      {title:'🏠 Home Tab',body:'Your dashboard shows key stats — students, marks, attendance rate.'},
      {title:'👥 Students Tab',body:'Register, search and manage all student records with photos.'},
      {title:'📝 Marks Tab',body:'Enter exam scores per subject, class, term and exam.'},
      {title:'🔌 Plugins',body:'Go to More → Plugins to enable/disable features like Library, Courses, Quiz Builder.'},
      {title:'⚙️ Settings',body:'Add your Groq API key for AI features, CallMeBot key for WhatsApp SMS.'},
      {title:'✅ You\'re ready!',body:'Explore the app freely. Every feature has help hints built in.'},
    ],
    teacher:[
      {title:'👋 Welcome, Teacher!',body:'This app helps you manage marks, attendance, and learning materials.'},
      {title:'📝 Enter Marks',body:'Go to Marks tab → select class, subject, term and exam → enter scores.'},
      {title:'📋 Attendance',body:'Go to More → Attendance → select class and date → mark each student.'},
      {title:'🎯 Quiz Builder',body:'More → Quiz Builder → create quizzes → launch live sessions for students.'},
      {title:'📝 Notes Bank',body:'More → Notes Bank → upload PDF notes or type rich text notes by topic.'},
      {title:'✨ AI Tools',body:'Use AI Exam Generator and AI Report Comments to save hours of work.'},
      {title:'✅ Ready!',body:'Check out the Discussion forums and Courses too!'},
    ],
    student:[
      {title:'👋 Welcome, Student!',body:'This is your school portal — marks, courses, notes and more.'},
      {title:'🏠 Home',body:'See your latest marks, average score and class position on the home screen.'},
      {title:'📚 Notes Bank',body:'More → Notes Bank → read structured notes by subject and topic.'},
      {title:'📖 Courses',body:'More → Courses → enroll and study at your own pace.'},
      {title:'🎯 Join a Quiz',body:'More → Join Quiz → enter the room code your teacher gives you.'},
      {title:'💬 Discussion',body:'More → Discussion → ask questions in subject forums or message a teacher.'},
      {title:'✅ Good luck!',body:'Your teachers are here to help. Use the app every day to track your progress.'},
    ],
    parent:[
      {title:'👋 Welcome, Parent!',body:'View your child\'s academic progress, attendance and school updates.'},
      {title:'🏠 Portal',body:'Your home screen shows your child\'s marks, average, position and attendance.'},
      {title:'📊 Reports',body:'Go to Reports tab to download your child\'s full report card as PDF.'},
      {title:'📢 Announcements',body:'School notices appear in the Notifications bell at the top.'},
      {title:'💬 Discussion',body:'More → Discussion → send a direct message to a teacher.'},
      {title:'✅ You\'re connected!',body:'You\'ll receive WhatsApp updates when important events happen.'},
    ]
  };

  function show(role) {
    const steps=TOURS[role]||TOURS['student'];
    let i=0;
    const render=()=>{
      const s=steps[i];
      const overlay=document.createElement('div');
      overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML=`<div style="background:#fff;border-radius:20px;padding:28px;max-width:380px;width:100%;text-align:center">
        <div style="font-size:42px;margin-bottom:12px">${s.title.split(' ')[0]}</div>
        <h2 style="margin:0 0 12px;font-size:20px">${s.title.slice(s.title.indexOf(' ')+1)}</h2>
        <p style="color:#5f6f6e;line-height:1.6;margin:0 0 20px">${s.body}</p>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          ${steps.map((_,j)=>`<div style="height:6px;flex:1;border-radius:3px;background:${j===i?'var(--p)':'#e2e8f0'}"></div>`).join('')}
        </div>
        <div style="display:flex;gap:10px">
          <button id="ob-skip" style="flex:1;padding:12px;border-radius:12px;border:1px solid var(--bd);background:#fff;font:inherit;cursor:pointer">Skip tour</button>
          <button id="ob-next" style="flex:2;padding:12px;border-radius:12px;background:var(--p);color:#fff;border:none;font:600 16px inherit;cursor:pointer">${i===steps.length-1?'Get started!':'Next →'}</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#ob-skip').onclick=()=>{overlay.remove();markOnboarded(role);};
      overlay.querySelector('#ob-next').onclick=()=>{overlay.remove();if(i<steps.length-1){i++;render();}else markOnboarded(role);};
    };
    render();
  }

  function checkAndShow() {
    if(!window.ME) return;
    const role=ME.role||'student';
    if(!hasOnboarded(role)) setTimeout(()=>show(role),1000);
  }

  function resetOnboarding() { Object.keys(localStorage).filter(k=>k.startsWith(LS)).forEach(k=>localStorage.removeItem(k)); toast('Onboarding reset. Reload to see tour.'); }

  PluginLoader.register({id:'onboarding',name:'Onboarding Tour',icon:'🎓',
    description:'Role-specific welcome tour for new users.',
    stores:[],routes:{},menuItems:[],onInit:checkAndShow});
  return {show,checkAndShow,resetOnboarding};
})();
