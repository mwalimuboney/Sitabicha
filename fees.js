'use strict';
/* ============================================================
   fees.js — Fee structures, payment tracking, PDF receipts
   Stores: fee_structures, fee_payments
   ============================================================ */

function pageFees() {
  if (!atLeast('admin')) { view('Fees', '<p class="pad muted">Admins only.</p>', { back: '#/more', tab: 'more' }); return; }
  const structs = Store.all('fee_structures');
  const payments = Store.all('fee_payments');

  const totalCollected = payments.reduce((s, p) => s + (+p.amount_paid || 0), 0);
  const outstanding = structs.reduce((s, fs) => {
    const classStuds = classStudents(fs.class_id);
    const expected = classStuds.length * (+fs.amount || 0);
    const paid = payments.filter(p => p.fee_structure_id === fs.id).reduce((x, p) => x + (+p.amount_paid || 0), 0);
    return s + (expected - paid);
  }, 0);

  view('Fee Management', `
    <div class="grid2">
      <div class="card stat"><b>KES ${totalCollected.toLocaleString()}</b><span>Collected</span></div>
      <div class="card stat"><b>KES ${outstanding.toLocaleString()}</b><span>Outstanding</span></div>
    </div>
    <div class="card"><h2>Fee Structures</h2>
      ${structs.map(fs => {
        const cls = Store.get('classes', fs.class_id);
        return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
          <div class="grow"><b>${esc(fs.description)}</b>
            <div class="small muted">${esc(cls ? cls.name : 'All classes')} · ${esc(fs.term || 'All terms')} · KES ${(+fs.amount || 0).toLocaleString()}</div>
          </div>
          <button class="btn sm" data-fp="${fs.id}">Payments</button>
        </div>`;
      }).join('') || '<p class="muted small">No fee structures yet.</p>'}
      <button class="btn full" id="new-fs" style="margin-top:10px">+ Add fee structure</button>
    </div>
    <div class="card"><h2>Recent payments</h2>
      ${payments.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,20).map(p => {
        const s = Store.get('students', p.student_id);
        return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--bd)">
          <div class="grow"><b>${esc(s ? stuName(s) : '?')}</b>
            <div class="small muted">KES ${(+p.amount_paid).toLocaleString()} · ${esc(p.payment_date)} · ${esc(p.method || 'Cash')}</div>
          </div>
          <button class="btn sm" data-pr="${p.id}">Receipt</button>
        </div>`;
      }).join('') || '<p class="muted small">No payments yet.</p>'}
      <button class="btn pri full" id="new-pay" style="margin-top:10px">+ Record payment</button>
    </div>
  `, { back: '#/more', tab: 'more' });

  document.getElementById('new-fs').onclick = () => feeStructureModal();
  document.getElementById('new-pay').onclick = () => feePaymentModal();
  document.querySelectorAll('[data-fp]').forEach(b => b.onclick = () => pageFeePayments(b.dataset.fp));
  document.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => printReceipt(b.dataset.pr));
}

function feeStructureModal(fs) {
  const n = !fs; fs = fs || {};
  modal(`<h3>${n ? 'New' : 'Edit'} fee structure</h3>
    <label>Description</label><input id="fsd" value="${esc(fs.description || '')}">
    <label>Class (leave empty for all)</label>
    <select id="fsc"><option value="">All classes</option>${opts(classes().map(c=>({v:c.id,t:c.name})), fs.class_id||'')}</select>
    <label>Term</label>
    <select id="fst"><option value="">All terms</option>${opts(list(SET.terms), fs.term||'')}</select>
    <label>Amount (KES)</label><input id="fsa" type="number" inputmode="decimal" value="${esc(fs.amount||'')}">
    <div class="row"><button class="btn grow" id="fs-x">Cancel</button><button class="btn pri grow" id="fs-ok">Save</button></div>`, () => {
    document.getElementById('fs-x').onclick = closeModal;
    document.getElementById('fs-ok').onclick = async () => {
      const desc = document.getElementById('fsd').value.trim();
      if (!desc) return toast('Enter a description.');
      await Store.put('fee_structures', { ...(fs||{}), id: fs.id||Core.uid(), description: desc,
        class_id: document.getElementById('fsc').value || null,
        term: document.getElementById('fst').value || null,
        amount: +document.getElementById('fsa').value || 0, created_at: fs.created_at||nowIso() });
      closeModal(); toast('Saved.'); pageFees();
    };
  });
}

function feePaymentModal(fsId) {
  const structs = Store.all('fee_structures');
  modal(`<h3>Record payment</h3>
    <label>Student</label>
    <select id="fp-stu">${opts(students().filter(s=>s.status!=='left').sort(stuSort).map(s=>({v:s.id,t:stuName(s)+' ('+s.admission_no+')'})), '')}</select>
    <label>Fee item</label>
    <select id="fp-fs"><option value="">— General payment —</option>${opts(structs.map(f=>({v:f.id,t:f.description+' KES '+f.amount})), fsId||'')}</select>
    <label>Amount paid (KES)</label><input id="fp-amt" type="number" inputmode="decimal">
    <label>Method</label>
    <select id="fp-mth">${opts(['Cash','M-Pesa','Bank','Cheque','Other'], 'M-Pesa')}</select>
    <label>Reference / receipt no</label><input id="fp-ref">
    <label>Date</label><input id="fp-dt" type="date" value="${new Date().toISOString().slice(0,10)}">
    <div class="row"><button class="btn grow" id="fp-x">Cancel</button><button class="btn pri grow" id="fp-ok">Save &amp; print receipt</button></div>`, () => {
    document.getElementById('fp-x').onclick = closeModal;
    document.getElementById('fp-ok').onclick = async () => {
      const amt = +document.getElementById('fp-amt').value;
      if (!amt || amt <= 0) return toast('Enter a valid amount.');
      const rec = await Store.put('fee_payments', { id: Core.uid(), student_id: document.getElementById('fp-stu').value,
        fee_structure_id: document.getElementById('fp-fs').value || null,
        amount_paid: amt, method: document.getElementById('fp-mth').value,
        reference: document.getElementById('fp-ref').value.trim(),
        payment_date: document.getElementById('fp-dt').value,
        recorded_by: ME.id, created_at: nowIso() });
      closeModal(); toast('Payment recorded.'); printReceipt(rec.id); pageFees();
    };
  });
}

function pageFeePayments(fsId) {
  const fs = Store.get('fee_structures', fsId); if (!fs) return;
  const cls = Store.get('classes', fs.class_id);
  const studs = fs.class_id ? classStudents(fs.class_id) : students().filter(s=>s.status!=='left');
  const payments = Store.all('fee_payments').filter(p => p.fee_structure_id === fsId);
  const paidMap = new Map();
  payments.forEach(p => paidMap.set(p.student_id, (paidMap.get(p.student_id)||0) + (+p.amount_paid||0)));

  view(`Payments: ${fs.description}`, `
    <div class="card"><div class="muted small">${esc(cls ? cls.name : 'All classes')} · KES ${(+fs.amount).toLocaleString()} per student</div></div>
    <div class="card">${studs.map(s => {
      const paid = paidMap.get(s.id) || 0;
      const bal  = (+fs.amount||0) - paid;
      return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
        ${avatar(s)}
        <div class="grow"><b>${esc(stuName(s))}</b><div class="small muted">${esc(s.admission_no)}</div></div>
        <div style="text-align:right"><div class="small ${bal > 0 ? 'bad' : 'good'}">Bal: KES ${bal.toLocaleString()}</div>
          <div class="small muted">Paid: ${paid.toLocaleString()}</div></div>
      </div>`;
    }).join('')}</div>
  `, { back: '#/fees', tab: 'more' });
}

function printReceipt(paymentId) {
  const p = Store.get('fee_payments', paymentId); if (!p) return;
  const s = Store.get('students', p.student_id);
  const fs = p.fee_structure_id ? Store.get('fee_structures', p.fee_structure_id) : null;
  const pdf = new Core.PDF();
  pdf.rect(50, 50, 495, 741, { stroke: [0.8,0.8,0.8] });
  pdf.text(297, 90, SET.school_name, { size: 18, bold: true, align: 'center' });
  pdf.text(297, 112, 'OFFICIAL FEE RECEIPT', { size: 13, bold: true, align: 'center' });
  pdf.line(50, 125, 545, 125);
  const kv = [[' Receipt No', p.id.slice(-8).toUpperCase()],['Date', p.payment_date],['Student', s ? stuName(s) : '?'],
    ['Adm No', s ? s.admission_no : '?'],['Fee item', fs ? fs.description : 'General payment'],
    ['Amount paid', `KES ${(+p.amount_paid).toLocaleString()}`],['Method', p.method],['Reference', p.reference || '—']];
  let y = 155;
  kv.forEach(([k,v]) => { pdf.text(70, y, k, { size: 11, bold: true }); pdf.text(220, y, v, { size: 11 }); y += 24; });
  pdf.line(70, y+10, 525, y+10);
  pdf.text(297, y+30, 'Thank you for your payment.', { size: 10, align: 'center', color: [0.4,0.4,0.4] });
  pdf.text(297, 790, `Printed ${new Date().toLocaleDateString('en-GB')} · ${SET.school_name}`, { size: 8, align: 'center', color: [0.5,0.5,0.5] });
  saveBlob(new Blob([pdf.output()], { type: 'application/pdf' }), `receipt_${p.id.slice(-8)}.pdf`);
  toast('Receipt downloaded.');
}
