'use strict';
/* ============================================================
   assignments.js — Homework / Assignment tracker
   Stores: 'assignments'  { id, class_id, subject_id, title, description, due_date, created_by, created_at }
           'submissions'  { id, assignment_id, student_id, status, score, comment, updated_at }
   ============================================================ */

function pageAssignments() {
  if (!atLeast('teacher')) {
    view('Assignments', '<p class="pad muted">Teachers and above can manage assignments.</p>', { back: '#/more', tab: 'more' });
    return;
  }
  const items = Store.all('assignments').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const subs  = new Map(Store.all('submissions').map(s => [s.assignment_id + '|' + s.student_id, s]));

  const statusBadge = status => {
    const map = { pending: ['#e0f2fe','#0369a1','Pending'], submitted: ['#ecfdf3','#067647','Submitted'], graded: ['#f0fdf4','#166534','Graded'] };
    const [bg, tx, label] = map[status] || map.pending;
    return `<span style="background:${bg};color:${tx};font-size:11px;padding:2px 8px;border-radius:99px">${label}</span>`;
  };

  view('Assignments', `
    <div class="card">
      ${items.length ? items.map(a => {
        const sub = Store.get('subjects', a.subject_id), cls = Store.get('classes', a.class_id);
        const studs = classStudents(a.class_id);
        const done = studs.filter(s => { const k = subs.get(a.id + '|' + s.id); return k && k.status !== 'pending'; }).length;
        return `<div class="item" style="display:block">
          <div class="row"><div class="grow"><div class="t">${esc(a.title)}</div>
          <div class="s">${esc(sub ? sub.name : '?')} · ${esc(cls ? cls.name : '?')} · Due ${esc(a.due_date)}</div></div>
          <div class="small muted">${done}/${studs.length}</div></div>
          ${atLeast('admin') || a.created_by === ME.id ? `<div class="row" style="margin-top:8px">
            <button class="btn sm grow" data-asgn-view="${a.id}">Submissions</button>
            <button class="btn sm bad" data-asgn-del="${a.id}">Delete</button>
          </div>` : `<button class="btn sm full" style="margin-top:8px" data-asgn-view="${a.id}">View submissions</button>`}
        </div>`;
      }).join('') : '<p class="muted pad">No assignments yet.</p>'}
      ${atLeast('teacher') ? '<button class="btn pri full" id="new-asgn" style="margin-top:12px">+ New assignment</button>' : ''}
    </div>
  `, { back: '#/more', tab: 'more' });

  if ($('#new-asgn')) $('#new-asgn').onclick = () => assignmentModal();
  $$('[data-asgn-view]').forEach(b => b.onclick = () => pageSubmissions(b.dataset.asgnView));
  $$('[data-asgn-del]').forEach(b => b.onclick = () => confirmBox('Delete assignment?', 'All submissions will also be removed.', async () => {
    await Store.removeMany('submissions', Store.all('submissions').filter(s => s.assignment_id === b.dataset.asgnDel).map(s => s.id));
    await Store.remove('assignments', b.dataset.asgnDel);
    toast('Removed.'); pageAssignments();
  }, 'Delete'));
}

function assignmentModal(item = null) {
  const cl = classes(), subs = subjects().filter(s => s.active !== false);
  const a = item || { class_id: (cl[0] || {}).id, due_date: new Date().toISOString().slice(0, 10) };
  modal(`<h3>${item ? 'Edit' : 'New'} Assignment</h3>
    <label>Title</label><input id="as-title" value="${esc(a.title || '')}">
    <label>Class</label><select id="as-cls">${opts(cl.map(c => ({ v: c.id, t: c.name })), a.class_id || '')}</select>
    <label>Subject</label><select id="as-sub">${opts(subs.map(s => ({ v: s.id, t: s.name })), a.subject_id || '')}</select>
    <label>Due date</label><input id="as-due" type="date" value="${esc(a.due_date || '')}">
    <label>Description</label><textarea id="as-desc">${esc(a.description || '')}</textarea>
    <div class="row"><button class="btn grow" id="as-x">Cancel</button><button class="btn pri grow" id="as-ok">Save</button></div>`, () => {
    $('#as-x').onclick = closeModal;
    $('#as-ok').onclick = async () => {
      const title = $('#as-title').value.trim();
      if (!title) return toast('Enter a title.');
      await Store.put('assignments', { ...(item || {}), id: item ? item.id : Core.uid(), title, class_id: $('#as-cls').value, subject_id: $('#as-sub').value, due_date: $('#as-due').value, description: $('#as-desc').value.trim(), created_by: ME.id, created_at: item ? item.created_at : nowIso() });
      closeModal(); toast('Saved.'); pageAssignments();
    };
  });
}

function pageSubmissions(assignmentId) {
  const a = Store.get('assignments', assignmentId);
  if (!a) return toast('Assignment not found.');
  const studs = classStudents(a.class_id);
  const subs  = new Map(Store.all('submissions').filter(s => s.assignment_id === assignmentId).map(s => [s.student_id, s]));
  const sub   = Store.get('subjects', a.subject_id);
  const canEdit = atLeast('admin') || a.created_by === ME.id;

  view(`Submissions: ${a.title}`, `
    <div class="card"><div class="muted small">${esc(sub ? sub.name : '?')} · Due ${esc(a.due_date)}</div>
      ${a.description ? `<p style="margin:6px 0 0">${esc(a.description)}</p>` : ''}
    </div>
    <div class="card">${studs.map(s => {
      const sub = subs.get(s.id) || { status: 'pending' };
      return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
        ${avatar(s)}
        <div class="grow"><b>${esc(stuName(s))}</b>
          <div class="small muted">${esc(s.admission_no)}</div>
        </div>
        <div style="text-align:right">
          <div style="margin-bottom:4px">${statusBadgeInline(sub.status)}</div>
          ${sub.score !== undefined && sub.score !== null ? `<div class="small muted">Score: ${sub.score}</div>` : ''}
          ${canEdit ? `<button class="btn sm" data-sub-sid="${s.id}">Grade</button>` : ''}
        </div>
      </div>`;
    }).join('') || '<p class="muted">No students in this class.</p>'}</div>
  `, { back: '#/assignments', tab: 'more' });

  if (canEdit) $$('[data-sub-sid]').forEach(b => {
    b.onclick = () => {
      const sid = b.dataset.subSid, cur = subs.get(sid) || { status: 'pending' };
      const max = +SET.max_score || 100;
      modal(`<h3>Grade: ${esc(stuName(Store.get('students', sid)))}</h3>
        <label>Status</label><select id="sub-st">${opts([{v:'pending',t:'Pending'},{v:'submitted',t:'Submitted'},{v:'graded',t:'Graded'}], cur.status)}</select>
        <label>Score (optional, 0–${max})</label><input id="sub-sc" type="number" min="0" max="${max}" value="${cur.score ?? ''}">
        <label>Comment</label><textarea id="sub-cm">${esc(cur.comment || '')}</textarea>
        <div class="row"><button class="btn grow" id="sub-x">Cancel</button><button class="btn pri grow" id="sub-ok">Save</button></div>`, () => {
        $('#sub-x').onclick = closeModal;
        $('#sub-ok').onclick = async () => {
          const sc = $('#sub-sc').value !== '' ? +$('#sub-sc').value : null;
          if (sc !== null && (isNaN(sc) || sc < 0 || sc > max)) return toast(`Score must be 0–${max}.`);
          await Store.put('submissions', { ...(cur.id ? cur : {}), id: cur.id || Core.uid(), assignment_id: assignmentId, student_id: sid, status: $('#sub-st').value, score: sc, comment: $('#sub-cm').value.trim() });
          closeModal(); toast('Saved.'); pageSubmissions(assignmentId);
        };
      });
    };
  });
}

function statusBadgeInline(status) {
  const map = { pending: ['#e0f2fe','#0369a1','Pending'], submitted: ['#ecfdf3','#067647','Submitted'], graded: ['#f0fdf4','#166534','Graded'] };
  const [bg, tx, label] = map[status] || map.pending;
  return `<span style="background:${bg};color:${tx};font-size:11px;padding:2px 8px;border-radius:99px">${label}</span>`;
}
