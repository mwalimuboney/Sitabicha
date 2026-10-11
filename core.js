/* Pure logic (no browser APIs needed) - subject rules, grading, ranking, CSV, PDF writer. */
(function (root) {
'use strict';
const uid = () => (root.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/* ---------- grading ---------- */
function parseGrading(text) {
  const out = [];
  String(text || '').split(/[,\n;]+/).forEach(p => {
    const i = p.indexOf(':'); if (i < 0) return;
    const lo = parseFloat(p.slice(0, i)); if (!isNaN(lo)) out.push([lo, p.slice(i + 1).trim()]);
  });
  out.sort((a, b) => b[0] - a[0]);
  return out.length ? out : [[0, '-']];
}
const gradeFor = (score, scale) => { for (const [lo, g] of scale) if (score >= lo) return g; return '-'; };
const fmt = n => String(Math.round(n * 10) / 10);

/* ---------- subject rules (same behaviour as the PC version) ---------- */
function validateSubjects({ subjects, rules, groups, maxAllowed }, optionalIds) {
  const subs = new Map(subjects.filter(s => s.active !== false).map(s => [s.id, s]));
  const opt = new Set(optionalIds || []);
  for (const i of opt) { const s = subs.get(i); if (!s || s.category !== 'optional') return ['One of the selected subjects is not an available optional subject.']; }
  const chosen = new Set([...subs.values()].filter(s => s.category === 'compulsory').map(s => s.id));
  opt.forEach(i => chosen.add(i));
  const name = i => subs.has(i) ? subs.get(i).name : '(removed subject)';
  const errors = [];
  for (const r of rules) {
    if (r.type === 'exclusive' && chosen.has(r.subject_a) && chosen.has(r.subject_b)) errors.push(`${name(r.subject_a)} and ${name(r.subject_b)} cannot be taken together.`);
    if (r.type === 'requires' && chosen.has(r.subject_a) && !chosen.has(r.subject_b) && subs.has(r.subject_b)) errors.push(`${name(r.subject_a)} requires ${name(r.subject_b)}.`);
  }
  for (const g of groups) {
    if (g.max_pick == null || g.max_pick === '') continue;
    let n = 0; chosen.forEach(i => { if (subs.get(i).group_id === g.id) n++; });
    if (n > +g.max_pick) errors.push(`At most ${g.max_pick} subject(s) allowed from ${g.name}.`);
  }
  if (chosen.size > maxAllowed) errors.push(`Too many subjects: ${chosen.size} selected, maximum is ${maxAllowed}.`);
  return errors;
}

/* ---------- results & ranking ---------- */
function rankBy(items, key) {
  const ord = [...items].sort((a, b) => key(b) - key(a)); const pos = new Map(); let last = null, rank = 0;
  ord.forEach((it, i) => { const k = key(it); if (k !== last) { rank = i + 1; last = k; } pos.set(it, rank); });
  return pos;
}
/* subjects: Map id->subject (active) ; enrolled: Map studentId->Set(subjectId) ; scores: Map "stu|sub"->average score */
function computeResults({ subjects, enrolled, scores, scale }, students) {
  const comp = [...subjects.values()].filter(s => s.category === 'compulsory').map(s => s.id);
  const out = students.map(s => {
    const taken = [...new Set([...comp, ...[...(enrolled.get(s.id) || [])].filter(i => subjects.has(i))])]
      .sort((a, b) => { const x = subjects.get(a), y = subjects.get(b); return x.category === y.category ? x.name.localeCompare(y.name) : (x.category < y.category ? -1 : 1); });
    let total = 0, n = 0;
    const rows = taken.map((i, k) => {
      const sub = subjects.get(i), sc = scores.get(s.id + '|' + i);
      if (sc !== undefined) { total += sc; n++; }
      return { no: k + 1, subject: sub.name, code: sub.code, category: sub.category === 'compulsory' ? 'Compulsory' : 'Optional',
               score: sc === undefined ? '' : fmt(sc), grade: sc === undefined ? '' : gradeFor(sc, scale) };
    });
    const avg = n ? total / n : 0;
    return { student: s, rows, total: Math.round(total * 10) / 10, average: Math.round(avg * 10) / 10, grade: n ? gradeFor(avg, scale) : '', n };
  });
  const pos = rankBy(out, r => r.total);
  out.forEach(r => r.pos = pos.get(r));
  return out;
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
const toCSV = rows => '\uFEFF' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');

/* ---------- minimal PDF writer (A4, Helvetica) ---------- */
const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
class PDF {
  constructor() { this.W = 595.28; this.H = 841.89; this.pages = []; this.addPage(); }
  addPage() { this.cur = []; this.pages.push(this.cur); }
  width(s, size, bold) { const t = bold ? WB : WR; let w = 0; for (const ch of String(s)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126) ? t[c - 32] : 556; } return w * size / 1000; }
  fit(s, w, size, bold) { s = String(s == null ? '' : s); if (this.width(s, size, bold) <= w) return s; while (s.length > 1 && this.width(s + '...', size, bold) > w) s = s.slice(0, -1); return s + '...'; }
  _esc(s) {
    let o = '';
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.charCodeAt(0);
      if (c > 255) o += (c === 0x2013 || c === 0x2014) ? '-' : (c === 0x2018 || c === 0x2019) ? "'" : (c === 0x201c || c === 0x201d) ? '"' : '?';
      else if (c >= 32) o += ch;
    }
    return o.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
  text(x, y, s, { size = 11, bold = false, align = 'left', color = [0, 0, 0] } = {}) {
    const w = this.width(s, size, bold); if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
    this.cur.push(`q ${color.join(' ')} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${(this.H - y).toFixed(2)} Td (${this._esc(s)}) Tj ET Q`);
  }
  line(x1, y1, x2, y2, w = 0.5, color = [0.5, 0.5, 0.5]) { this.cur.push(`q ${color.join(' ')} RG ${w} w ${x1.toFixed(2)} ${(this.H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H - y2).toFixed(2)} l S Q`); }
  rect(x, y, w, h, { fill = null, stroke = [0.5, 0.5, 0.5] } = {}) {
    let op = ''; if (fill) op += `${fill.join(' ')} rg `; if (stroke) op += `${stroke.join(' ')} RG 0.5 w `;
    this.cur.push(`q ${op}${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
  }
  /* cols: [{w, align, title}] rows: arrays of strings. returns new y. Breaks pages automatically. */
  table(x, y, cols, rows, { rowH = 20, size = 10, top = 50, bottom = 50 } = {}) {
    const total = cols.reduce((a, c) => a + c.w, 0);
    const head = () => { this.rect(x, y, total, rowH, { fill: [0.91, 0.93, 0.96] }); let cx = x; cols.forEach(c => { this.text(c.align === 'right' ? cx + c.w - 5 : c.align === 'center' ? cx + c.w / 2 : cx + 5, y + rowH / 2 + size * 0.35, this.fit(c.title, c.w - 10, size, true), { size, bold: true, align: c.align || 'left' }); cx += c.w; }); y += rowH; };
    head();
    for (const r of rows) {
      if (y + rowH > this.H - bottom) { this.addPage(); y = top; head(); }
      this.rect(x, y, total, rowH, { fill: null }); let cx = x;
      cols.forEach((c, i) => { this.text(c.align === 'right' ? cx + c.w - 5 : c.align === 'center' ? cx + c.w / 2 : cx + 5, y + rowH / 2 + size * 0.35, this.fit(r[i], c.w - 10, size, false), { size, align: c.align || 'left' }); cx += c.w; });
      y += rowH;
    }
    return y;
  }
  output() {
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // pages, filled below
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const p of this.pages) {
      const body = p.join('\n');
      const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      const pg = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`);
      kids.push(pg + ' 0 R');
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n'; const off = [];
    objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xr = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
    return u;
  }
}

/* ---------- report layouts ---------- */
function head(pdf, c, title) {
  pdf.text(pdf.W / 2, 62, c.school_name || 'School', { size: 20, bold: true, align: 'center' });
  pdf.text(pdf.W / 2, 86, title, { size: 13, bold: true, align: 'center' });
  pdf.text(pdf.W / 2, 104, `${c.term}, ${c.year} - ${c.exam}`, { size: 10, align: 'center', color: [0.3, 0.3, 0.3] });
}
function studentPage(pdf, c) {
  const s = c.student, x = 50;
  head(pdf, c, 'STUDENT REPORT CARD');
  const info = [['Name', s.name, 'Admission No', s.admission_no], ['Class', s.class_name, 'Position', `${c.position} of ${c.class_size}`]];
  let y = 125; const cw = [80, 170, 90, 105];
  info.forEach(r => { let cx = x; r.forEach((v, i) => { pdf.rect(cx, y, cw[i], 22, { fill: i % 2 ? null : [0.95, 0.96, 0.98] }); pdf.text(cx + 5, y + 15, pdf.fit(v, cw[i] - 10, 10, i % 2 === 0), { size: 10, bold: i % 2 === 0 }); cx += cw[i]; }); y += 22; });
  y = pdf.table(x, y + 18, [{ w: 30, title: '#', align: 'center' }, { w: 255, title: 'Subject' }, { w: 80, title: 'Score', align: 'right' }, { w: 80, title: 'Grade', align: 'center' }],
    c.rows.map(r => [r.no, r.subject, r.score, r.grade]), { rowH: 22, size: 11 });
  y += 24;
  pdf.text(x, y, `Total: ${c.total}      Average: ${c.average}      Overall grade: ${c.grade}`, { size: 11, bold: true });
  if (c.comment) { y += 24; pdf.text(x, y, 'Comment:', { size: 10, bold: true }); wrap(pdf, c.comment, 480, 10).forEach((ln, i) => pdf.text(x + 55, y + i * 14, ln, { size: 10 })); y += 14 * Math.max(1, wrap(pdf, c.comment, 480, 10).length); }
  y = Math.max(y + 50, 640);
  pdf.line(x, y, x + 200, y, 0.7, [0, 0, 0]); pdf.line(x + 280, y, x + 480, y, 0.7, [0, 0, 0]);
  pdf.text(x, y + 14, 'Class teacher', { size: 9 }); pdf.text(x + 280, y + 14, 'Principal', { size: 9 });
  pdf.text(pdf.W / 2, 800, `Printed ${c.date}`, { size: 8, align: 'center', color: [0.4, 0.4, 0.4] });
}
function wrap(pdf, text, w, size) {
  const out = []; let line = '';
  String(text).split(/\s+/).forEach(word => { const t = line ? line + ' ' + word : word; if (pdf.width(t, size) > w && line) { out.push(line); line = word; } else line = t; });
  if (line) out.push(line); return out;
}
function classPage(pdf, c) {
  head(pdf, c, `CLASS PERFORMANCE - ${c.class_name}`);
  const y = pdf.table(50, 125, [{ w: 30, title: '#', align: 'center' }, { w: 170, title: 'Name' }, { w: 85, title: 'Adm No' }, { w: 55, title: 'Total', align: 'right' }, { w: 60, title: 'Average', align: 'right' }, { w: 45, title: 'Grade', align: 'center' }, { w: 40, title: 'Pos', align: 'center' }],
    c.students.map(s => [s.no, s.name, s.admission_no, s.total, s.average, s.grade, s.position]), { rowH: 20, size: 10 });
  if (y + 40 > pdf.H - 50) pdf.addPage();
  const yy = y + 40 > pdf.H - 50 ? 80 : y + 26;
  pdf.text(50, yy, `Class average: ${c.class_average}      Students: ${c.count}`, { size: 11, bold: true });
}
const studentPDF = ctxs => { const p = new PDF(); ctxs.forEach((c, i) => { if (i) p.addPage(); studentPage(p, c); }); return p.output(); };
const classPDF = c => { const p = new PDF(); classPage(p, c); return p.output(); };

const api = { uid, parseGrading, gradeFor, fmt, validateSubjects, computeResults, parseCSV, toCSV, PDF, studentPDF, classPDF };
if (typeof module !== 'undefined') module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
