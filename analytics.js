'use strict';
/* ============================================================
   analytics.js — Phase 1 additions
   • svgBarChart(labels, values, opts)  — pure SVG bar chart
   • sparkline(values, w, h)            — mini trend line
   • pageDashboard()                    — Analytics tab
   • shareResultsWhatsApp(student, ctx) — WhatsApp result share
   ============================================================ */

/* ---------- SVG helpers ---------- */
function svgBarChart(labels, values, { w = 320, h = 180, color = '#0f766e', title = '' } = {}) {
  if (!values.length) return '<p class="muted small">No data yet.</p>';
  const max = Math.max(...values, 1);
  const pad = { t: 24, r: 12, b: 48, l: 40 };
  const bw = (w - pad.l - pad.r) / values.length;
  const scale = v => (v / max) * (h - pad.t - pad.b);
  let bars = '', xlabels = '', ylabels = '';

  // Y-axis ticks
  [0, 25, 50, 75, 100].forEach(tick => {
    if (tick > max + 5) return;
    const y = h - pad.b - scale(tick);
    ylabels += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
      <text x="${pad.l - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#5f6f6e">${tick}</text>`;
  });

  values.forEach((v, i) => {
    const bh = scale(v);
    const x = pad.l + i * bw + bw * 0.15;
    const y = h - pad.b - bh;
    const bw2 = bw * 0.7;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw2.toFixed(1)}" height="${bh.toFixed(1)}"
      fill="${color}" rx="3" opacity="0.85">
      <title>${labels[i]}: ${v}</title></rect>
      <text x="${(x + bw2 / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="${color}" font-weight="600">${v}</text>`;
    const lbl = String(labels[i] || '').slice(0, 6);
    xlabels += `<text x="${(x + bw2 / 2).toFixed(1)}" y="${h - pad.b + 14}" text-anchor="middle" font-size="9" fill="#5f6f6e">${lbl}</text>`;
  });

  return `<svg width="100%" viewBox="0 0 ${w} ${h}" style="display:block;max-width:${w}px">
    ${title ? `<text x="${w / 2}" y="14" text-anchor="middle" font-size="11" fill="#14201f" font-weight="600">${title}</text>` : ''}
    ${ylabels}${bars}${xlabels}
    <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${h - pad.b}" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="#cbd5e1" stroke-width="1"/>
  </svg>`;
}

function sparkline(values, w = 120, h = 36) {
  if (values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1;
  const pts = values.map((v, i) =>
    `${((i / (values.length - 1)) * (w - 8) + 4).toFixed(1)},${(h - 4 - ((v - min) / range) * (h - 8)).toFixed(1)}`
  ).join(' ');
  const last = values[values.length - 1], prev = values[values.length - 2];
  const arrow = last > prev ? '▲' : last < prev ? '▼' : '–';
  const arrowColor = last > prev ? '#067647' : last < prev ? '#b42318' : '#5f6f6e';
  return `<span style="display:inline-flex;align-items:center;gap:4px">
    <svg width="${w}" height="${h}" style="vertical-align:middle">
      <polyline points="${pts}" fill="none" stroke="var(--p)" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
    <span style="font-size:11px;color:${arrowColor};font-weight:700">${arrow}</span>
  </span>`;
}

/* ---------- Dashboard page ---------- */
function pageDashboard() {
  if (!atLeast('teacher')) {
    view('Dashboard', '<p class="pad muted">Teachers and above can view the dashboard.</p>', { tab: 'dashboard' });
    return;
  }

  const cl = classes();
  if (!cl.length) {
    view('Dashboard', '<p class="pad muted">Add classes to see analytics.</p>', { tab: 'dashboard' });
    return;
  }

  const year = SET.current_year, term = SET.current_term;
  const allMarks = Store.all('marks');
  const allStudents = students().filter(s => s.status !== 'left');
  const allAttendance = Store.all('attendance');

  // — KPI totals —
  const totalStudents = allStudents.length;
  const totalMarks = allMarks.length;
  const marksThisTerm = allMarks.filter(m => String(m.year) === String(year) && m.term === term);
  const avgScore = marksThisTerm.length
    ? Math.round(marksThisTerm.reduce((s, m) => s + m.score, 0) / marksThisTerm.length)
    : 0;

  // Attendance rate this term (any record = a school day)
  const attThisTerm = allAttendance.filter(a => a.date && a.date.startsWith(year));
  const attPresent = attThisTerm.filter(a => a.status === 'present' || a.status === 'late').length;
  const attRate = attThisTerm.length ? Math.round((attPresent / attThisTerm.length) * 100) : null;

  // — Class averages bar chart —
  const clLabels = [], clAvgs = [];
  cl.forEach(c => {
    const sts = classStudents(c.id);
    if (!sts.length) return;
    const mks = marksThisTerm.filter(m => sts.some(s => s.id === m.student_id));
    if (!mks.length) return;
    const avg = Math.round(mks.reduce((s, m) => s + m.score, 0) / mks.length);
    clLabels.push(c.name); clAvgs.push(avg);
  });

  // — Subject pass rates —
  const subs = subjects().filter(s => s.active !== false);
  const subLabels = [], subPass = [];
  const passThreshold = Math.round(+SET.max_score * 0.5) || 50;
  subs.forEach(sub => {
    const mks = marksThisTerm.filter(m => m.subject_id === sub.id);
    if (!mks.length) return;
    const pass = Math.round((mks.filter(m => m.score >= passThreshold).length / mks.length) * 100);
    subLabels.push(sub.code); subPass.push(pass);
  });

  // — Top 5 students this term —
  const studentTotals = new Map();
  marksThisTerm.forEach(m => {
    const cur = studentTotals.get(m.student_id) || { total: 0, n: 0 };
    studentTotals.set(m.student_id, { total: cur.total + m.score, n: cur.n + 1 });
  });
  const top5 = [...studentTotals.entries()]
    .map(([id, d]) => ({ student: Store.get('students', id), avg: Math.round(d.total / d.n) }))
    .filter(x => x.student)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // — Term-over-term sparklines per class (last 3 terms) —
  const termList = list(SET.terms);
  const classSparkData = cl.map(c => {
    const sts = classStudents(c.id);
    const vals = termList.map(t => {
      const mks = allMarks.filter(m => String(m.year) === String(year) && m.term === t && sts.some(s => s.id === m.student_id));
      return mks.length ? Math.round(mks.reduce((s, m) => s + m.score, 0) / mks.length) : 0;
    });
    return { name: c.name, vals };
  }).filter(x => x.vals.some(v => v > 0));

  view('Dashboard', `
    <!-- KPIs -->
    <div class="grid2" style="gap:10px;margin-bottom:12px">
      <div class="card stat"><b>${totalStudents}</b><span>Active Students</span></div>
      <div class="card stat"><b>${avgScore || '—'}</b><span>Mean Score (${term})</span></div>
      <div class="card stat"><b>${attRate !== null ? attRate + '%' : '—'}</b><span>Attendance Rate</span></div>
      <div class="card stat"><b>${totalMarks}</b><span>Total Marks Entered</span></div>
    </div>

    <!-- Class averages -->
    ${clAvgs.length ? `<div class="card"><h2>Class Averages — ${term}, ${year}</h2>
      ${svgBarChart(clLabels, clAvgs, { title: '', color: '#0f766e' })}
    </div>` : ''}

    <!-- Subject pass rates -->
    ${subPass.length ? `<div class="card"><h2>Subject Pass Rates (≥${passThreshold}) %</h2>
      ${svgBarChart(subLabels, subPass, { color: '#0369a1', h: 160 })}
    </div>` : ''}

    <!-- Term trend per class -->
    ${classSparkData.length ? `<div class="card"><h2>Term-over-Term Trend</h2>
      ${classSparkData.map(c => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
        <div class="grow"><b>${esc(c.name)}</b></div>
        ${sparkline(c.vals.filter(v => v > 0))}
        <span class="small muted" style="min-width:28px;text-align:right">${c.vals.filter(v => v > 0).slice(-1)[0] || 0}</span>
      </div>`).join('')}
    </div>` : ''}

    <!-- Top performers -->
    ${top5.length ? `<div class="card"><h2>Top 5 Students — ${term}</h2>
      ${top5.map((x, i) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
        <div style="width:24px;color:var(--mu);font-size:13px">${i + 1}</div>
        ${avatar(x.student)}
        <div class="grow"><b>${esc(stuName(x.student))}</b><div class="small muted">${esc(className(x.student.class_id) || '—')}</div></div>
        <b style="color:var(--p)">${x.avg}</b>
      </div>`).join('')}
    </div>` : '<div class="card"><p class="muted small">No marks entered yet for ${term}.</p></div>'}

    <p class="muted small pad">Data reflects ${term}, ${year}. Switch term in Settings.</p>
  `, { tab: 'dashboard' });
}

/* ---------- WhatsApp result sharing ---------- */
function shareResultsWhatsApp(student, ctx) {
  const phone = student.guardian_phone || student.guardian_phone2;
  if (!phone) { toast('No guardian phone number on record.'); return; }
  const lines = [
    `📊 *${esc(stuName(student))} — ${ctx.term} ${ctx.year}*`,
    `Class: ${ctx.student.class_name} | Pos: ${ctx.position} of ${ctx.class_size}`,
    '',
    ...ctx.rows.filter(r => r.score !== '').map(r => `${r.code}: ${r.score} (${r.grade})`),
    '',
    `Total: ${ctx.total} | Average: ${ctx.average} | Overall: ${ctx.grade}`,
    '',
    `— ${SET.school_name}`
  ];
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('0')) d = '254' + d.slice(1);
  window.open('https://wa.me/' + d + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
}
