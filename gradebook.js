'use strict';
/* Grade Book — running averages across all terms, trend charts via Chart.js */
const GradeBook = (() => {
  function pageGradeBook() {
    if (!atLeast('teacher')) { view('Grade Book','<p class="pad muted">Teachers only.</p>',{tab:'more'}); return; }
    const cl = classes();
    if (!cl.length) return;
    window._gb = window._gb || { cls: cl[0].id };
    const S = window._gb;
    const studs = classStudents(S.cls);
    const subs  = activeSubsFor(sysOfClass(S.cls));
    const allMarks = Store.all('marks');
    const termList = list(SET.terms);

    // Build grade book table: rows=students, cols=subjects+average
    const rows = studs.map(s => {
      const subAvgs = subs.map(sub => {
        const mks = allMarks.filter(m => m.student_id===s.id && m.subject_id===sub.id);
        const avg = mks.length ? Math.round(mks.reduce((a,m)=>a+m.score,0)/mks.length) : null;
        return avg;
      });
      const valid = subAvgs.filter(v=>v!==null);
      const overall = valid.length ? Math.round(valid.reduce((a,b)=>a+b,0)/valid.length) : null;
      return { s, subAvgs, overall };
    }).sort((a,b) => (b.overall||0)-(a.overall||0));

    // Trend data per student (avg per term)
    const trendData = studs.slice(0,5).map(s => ({
      name: stuName(s),
      data: termList.map(t => {
        const mks = allMarks.filter(m => m.student_id===s.id && m.term===t);
        return mks.length ? Math.round(mks.reduce((a,m)=>a+m.score,0)/mks.length) : null;
      })
    }));

    view('Grade Book', `
      <div class="card">
        <label>Class</label>
        <select id="gb-cls">${opts(cl.map(c=>({v:c.id,t:c.name})),S.cls)}</select>
      </div>
      <div class="card" style="overflow-x:auto">
        <h2>All Terms Average</h2>
        <table class="t" style="font-size:12px">
          <thead><tr><th>#</th><th>Student</th>${subs.map(s=>`<th>${esc(s.code)}</th>`).join('')}<th>Avg</th></tr></thead>
          <tbody>${rows.map((r,i) => `<tr>
            <td>${i+1}</td>
            <td>${esc(stuName(r.s))}</td>
            ${r.subAvgs.map(v=>`<td style="text-align:center;color:${v===null?'var(--mu)':v>=50?'var(--good)':'var(--bad)'}">${v??'—'}</td>`).join('')}
            <td style="font-weight:700;color:${r.overall>=50?'var(--good)':'var(--bad)'}">${r.overall??'—'}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h2>📈 Top 5 Students — Term Trend</h2>
        <canvas id="gb-chart" style="max-height:220px"></canvas>
      </div>
      <button class="btn full" id="gb-xlsx" style="margin-top:8px">📥 Export to Excel (.csv)</button>
    `, { back:'#/more', tab:'more' });

    document.getElementById('gb-cls').onchange = e => { S.cls = e.target.value; pageGradeBook(); };

    // Chart.js trend chart
    if (window.Chart) {
      const colors = ['#0f766e','#0369a1','#7c3aed','#b45309','#b42318'];
      new Chart(document.getElementById('gb-chart'), {
        type:'line',
        data: { labels: termList,
          datasets: trendData.map((d,i)=>({ label:d.name, data:d.data, borderColor:colors[i%colors.length], backgroundColor:'transparent', tension:0.3, pointRadius:4 }))
        },
        options:{ responsive:true, plugins:{ legend:{ position:'bottom' } }, scales:{ y:{ min:0, max:100 } } }
      });
    }

    // CSV export
    document.getElementById('gb-xlsx').onclick = () => {
      const header = ['Student','Admission',...subs.map(s=>s.code),'Average'];
      const data = rows.map(r => [stuName(r.s), r.s.admission_no, ...r.subAvgs.map(v=>v??''), r.overall??'']);
      const csv = '\uFEFF' + [header,...data].map(r=>r.join(',')).join('\r\n');
      const blob = new Blob([csv],{type:'text/csv'});
      saveBlob(blob, `gradebook_${Store.get('classes',S.cls)?.name||S.cls}.csv`);
    };
  }

  PluginLoader.register({ id:'gradebook', name:'Grade Book', icon:'📗',
    description:'Running averages across all terms with Chart.js trend graphs.',
    routes:{ 'gradebook': pageGradeBook },
    menuItems:[{ hash:'#/gradebook', icon:'📗', title:'Grade Book', sub:'All-term averages + trends', role:'teacher' }]
  });
  return { pageGradeBook };
})();
