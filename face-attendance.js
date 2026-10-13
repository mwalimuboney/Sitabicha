'use strict';
/* ============================================================
   face-attendance.js — Facial recognition attendance
   Uses face-api.js (CDN) for on-device face detection.
   ALL processing on device — only attendance record sent.
   Stores: face_profiles, face_attendance_log
   Permission: admin must grant per teacher (face_permitted users)
   ============================================================ */
const FaceAttendance = (() => {
  const MODELS_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  let modelsLoaded = false;

  async function loadModels() {
    if (modelsLoaded || !window.faceapi) return;
    toast('Loading face models (first time only)... ⏳', 8000);
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]);
    modelsLoaded = true;
    toast('Face models ready ✅');
  }

  /* ── Permission check ── */
  function canUseFace(userId) {
    if (!userId) userId = window.ME?.id;
    if (window.ME && (ME.role === 'superadmin' || ME.role === 'admin')) return true;
    const perm = Store.get('face_profiles', 'perm:' + userId);
    return !!(perm && perm.allowed);
  }

  /* ── Enroll student face ── */
  async function enrollFace(studentId) {
    if (!canUseFace()) return toast('You do not have permission to use face scanning.');
    if (!window.faceapi) { toast('Loading face-api.js... Add CDN to index.html'); return; }
    await loadModels();
    const s = Store.get('students', studentId); if (!s) return;
    const video = document.createElement('video');
    video.style.cssText = 'width:100%;border-radius:12px;max-height:300px;background:#000';
    video.autoplay = true; video.playsinline = true;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;color:#fff;';
    overlay.innerHTML = `<h2 style="margin:0 0 10px">📷 Enroll: ${esc(stuName(s))}</h2>
      <p style="margin:0 0 14px;opacity:.8;font-size:13px">Look straight at camera. Hold still.</p>`;
    overlay.appendChild(video);
    const status = document.createElement('div');
    status.style.cssText = 'margin-top:12px;font-size:14px;opacity:.9';
    status.textContent = 'Starting camera...';
    overlay.appendChild(status);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn'; cancelBtn.textContent = 'Cancel'; cancelBtn.style.cssText = 'margin-top:12px;background:#fff;color:#14201f';
    overlay.appendChild(cancelBtn);
    document.body.appendChild(overlay);
    let stream;
    cancelBtn.onclick = () => { if (stream) stream.getTracks().forEach(t => t.stop()); overlay.remove(); };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      video.srcObject = stream;
      await new Promise(r => video.onloadedmetadata = r);
      status.textContent = 'Detecting face...';
      // Capture multiple descriptors for accuracy
      const descriptors = [];
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 800));
        const detection = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks().withFaceDescriptor();
        if (!detection) { status.textContent = `Attempt ${i+1}/5 — no face detected. Look at camera.`; i--; continue; }
        descriptors.push(Array.from(detection.descriptor));
        status.textContent = `Captured ${i+1}/5 samples... ${i===4?'Done!':''}`;
      }
      stream.getTracks().forEach(t => t.stop()); overlay.remove();
      // Store face profile
      await Store.put('face_profiles', {
        id: 'face:' + studentId, student_id: studentId, descriptors,
        enrolled_at: new Date().toISOString(), enrolled_by: window.ME?.id
      });
      await Store.put('face_attendance_log', {
        id: Core.uid(), action: 'enroll', student_id: studentId,
        performed_by: window.ME?.id, ts: new Date().toISOString()
      });
      toast(`✅ Face enrolled for ${stuName(s)}`);
    } catch(e) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      overlay.remove();
      toast('Camera error: ' + (e.message || 'Permission denied'));
    }
  }

  /* ── Take attendance by face ── */
  async function takeFaceAttendance(classId, period) {
    if (!canUseFace()) return toast('You do not have permission to use facial attendance.');
    if (!window.faceapi) { toast('face-api.js not loaded. Add CDN to index.html.'); return; }
    await loadModels();
    // Build face matchers from enrolled students
    const faceProfiles = Store.all('face_profiles').filter(p => p.student_id && p.descriptors?.length);
    if (!faceProfiles.length) return toast('No students enrolled yet. Enroll faces first.');
    const studs = classStudents(classId);
    const enrolled = faceProfiles.filter(p => studs.some(s => s.id === p.student_id));
    if (!enrolled.length) return toast('No students in this class have enrolled faces.');
    const labeled = enrolled.map(p => {
      const descriptors = p.descriptors.map(d => new Float32Array(d));
      return new faceapi.LabeledFaceDescriptors(p.student_id, descriptors);
    });
    const matcher = new faceapi.FaceMatcher(labeled, 0.5);
    const video = document.createElement('video');
    video.style.cssText = 'width:100%;border-radius:12px;max-height:300px;background:#000';
    video.autoplay = true; video.playsinline = true;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;color:#fff;overflow-y:auto;';
    overlay.innerHTML = `<h2 style="margin:0 0 6px">📷 Face Attendance</h2>
      <p style="margin:0 0 12px;opacity:.8;font-size:13px">${esc(className(classId)||'')} — ${esc(period||'today')}</p>`;
    overlay.appendChild(video);
    const status = document.createElement('div'); status.style.cssText = 'margin-top:10px;font-size:14px';
    const marked = document.createElement('div'); marked.style.cssText = 'margin-top:10px;max-height:120px;overflow-y:auto;width:100%;max-width:400px';
    overlay.appendChild(status); overlay.appendChild(marked);
    const doneBtn = document.createElement('button'); doneBtn.className = 'btn'; doneBtn.textContent = '✅ Done'; doneBtn.style.cssText = 'margin-top:12px;background:var(--p);color:#fff;border-color:var(--p)';
    overlay.appendChild(doneBtn);
    document.body.appendChild(overlay);
    const attendanceMarked = new Map();
    let stream, scanning = true;

    doneBtn.onclick = async () => {
      scanning = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
      overlay.remove();
      // Save all marked attendance
      const today = new Date().toISOString().slice(0,10);
      for (const [sid, statusVal] of attendanceMarked) {
        const id = `${today}:${period||'Face'}:${sid}`;
        await Store.put('attendance', { id, student_id: sid, class_id: classId, date: today, period: period||'Face', status: statusVal, recorded_by: ME.username, updated_at: new Date().toISOString() });
        await Store.put('face_attendance_log', { id: Core.uid(), action: 'mark_present', student_id: sid, class_id: classId, performed_by: ME.id, ts: new Date().toISOString() });
      }
      toast(`✅ ${attendanceMarked.size} students marked present by face`);
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      video.srcObject = stream;
      await new Promise(r => video.onloadedmetadata = r);
      status.textContent = 'Scanning faces...';

      const scan = async () => {
        if (!scanning) return;
        const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks().withFaceDescriptors();
        for (const d of detections) {
          const match = matcher.findBestMatch(d.descriptor);
          if (match.label !== 'unknown' && !attendanceMarked.has(match.label)) {
            attendanceMarked.set(match.label, 'present');
            const s = Store.get('students', match.label);
            if (s) {
              const div = document.createElement('div');
              div.style.cssText = 'background:rgba(6,118,110,.3);padding:6px 12px;border-radius:8px;margin-bottom:4px;font-size:13px';
              div.textContent = `✅ ${stuName(s)} — present (${Math.round((1-match.distance)*100)}% match)`;
              marked.appendChild(div);
            }
          }
        }
        status.textContent = `Scanning... ${attendanceMarked.size} recognized | ${studs.length - attendanceMarked.size} remaining`;
        if (scanning) setTimeout(scan, 500);
      };
      scan();
    } catch(e) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      overlay.remove();
      toast('Camera error: ' + (e.message || 'Permission denied'));
    }
  }

  /* ── Face Attendance admin page ── */
  function pageFaceAttendance() {
    if (!atLeast('admin') && !canUseFace()) {
      view('Face Attendance', '<p class="pad muted">You do not have permission. Ask admin to enable face scanning for you.</p>', { back: '#/more', tab: 'more' });
      return;
    }
    const cl = classes();
    const enrolled = Store.all('face_profiles').filter(p => p.student_id).length;
    const log = Store.all('face_attendance_log').sort((a,b) => b.ts.localeCompare(a.ts)).slice(0, 20);
    view('📷 Face Attendance', `
      <div class="card" style="background:#f0fdfa">
        <div class="row">
          <div class="grow"><b>${enrolled}</b> students enrolled</div>
          <span class="badge">On-device AI</span>
        </div>
        <div class="small muted" style="margin-top:4px">All face data processed on this device. No face images sent to server.</div>
      </div>
      <div class="card">
        <h2>📋 Take Face Attendance</h2>
        <label>Class</label>
        <select id="fa-cls">${opts(cl.map(c=>({v:c.id,t:c.name})), cl[0]?.id||'')}</select>
        <label>Period</label>
        <select id="fa-per">${opts(['Period 1','Period 2','Period 3','Period 4','Period 5','Period 6','Period 7','Period 8','Full Day'], 'Full Day')}</select>
        <button class="btn pri full" id="fa-start" style="margin-top:12px">📷 Start Face Scanning</button>
      </div>
      <div class="card">
        <h2>👤 Enroll Students</h2>
        <label>Student</label>
        <select id="fa-stu">${opts(students().filter(s=>s.status!=='left').sort(stuSort).map(s=>({v:s.id,t:stuName(s)+' ('+s.admission_no+')'})), '')}</select>
        <button class="btn full" id="fa-enroll" style="margin-top:8px">📷 Enroll Face</button>
      </div>
      ${atLeast('admin') ? `<div class="card">
        <h2>🔐 Teacher Permissions</h2>
        <p class="muted small">Grant specific teachers permission to use face scanning.</p>
        ${Store.all('users').filter(u=>u.active!==false&&u.role==='teacher').map(u => {
          const perm = Store.get('face_profiles', 'perm:' + u.id);
          return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
            <div class="grow"><b>${esc(u.full_name)}</b><div class="small muted">@${esc(u.username)}</div></div>
            <button class="btn sm ${perm?.allowed?'bad':'pri'}" data-fp="${u.id}" data-fa="${perm?.allowed?'0':'1'}">${perm?.allowed?'Revoke':'Allow'}</button>
          </div>`;
        }).join('') || '<p class="muted small">No teachers found.</p>'}
      </div>` : ''}
      <div class="card">
        <h2>📋 Audit Log (last 20 uses)</h2>
        ${log.map(l => {
          const s = l.student_id ? Store.get('students', l.student_id) : null;
          const u = l.performed_by ? Store.get('users', l.performed_by) : null;
          return `<div class="lg"><b>${esc(u?.full_name||'?')}</b> ${esc(l.action)} ${s?esc(stuName(s)):''}
            <span class="muted"> · ${new Date(l.ts).toLocaleString()}</span></div>`;
        }).join('') || '<p class="muted small">No log entries.</p>'}
      </div>
    `, { back: '#/more', tab: 'more' });

    document.getElementById('fa-start').onclick = () => takeFaceAttendance(
      document.getElementById('fa-cls').value,
      document.getElementById('fa-per').value
    );
    document.getElementById('fa-enroll').onclick = () => enrollFace(document.getElementById('fa-stu').value);
    document.querySelectorAll('[data-fp]').forEach(b => b.onclick = async () => {
      const allow = b.dataset.fa === '1';
      await Store.put('face_profiles', { id: 'perm:' + b.dataset.fp, allowed: allow, granted_by: ME.id, granted_at: new Date().toISOString() });
      toast(allow ? 'Permission granted.' : 'Permission revoked.'); pageFaceAttendance();
    });
  }

  PluginLoader.register({
    id: 'face-attendance', name: 'Face Attendance', icon: '📷',
    description: 'On-device facial recognition for attendance. All processing local. Audit logged.',
    stores: ['face_profiles', 'face_attendance_log'],
    routes: { 'face-attendance': pageFaceAttendance },
    menuItems: [{ hash: '#/face-attendance', icon: '📷', title: 'Face Attendance', sub: 'On-device face scan', role: 'teacher' }]
  });

  return { enrollFace, takeFaceAttendance, canUseFace, pageFaceAttendance };
})();
