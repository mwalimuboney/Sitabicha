'use strict';
/* Full Library Management — catalog, borrow/return, overdue alerts */
const Library = (() => {
  const today = () => new Date().toISOString().slice(0,10);
  const addDays = (d,n) => { const dt=new Date(d); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); };

  function pageLibrary() {
    if (!atLeast('teacher')) { view('Library','<p class="pad muted">Teachers only.</p>',{back:'#/more',tab:'more'}); return; }
    const books = Store.all('library_books').sort((a,b)=>a.title.localeCompare(b.title));
    const loans = Store.all('library_loans').filter(l=>!l.returned_at);
    const overdue = loans.filter(l=>l.due_date < today());

    view('Library', `
      ${overdue.length?`<div class="msg bad">⚠️ ${overdue.length} overdue book(s)! <a href="#/library-overdue">View</a></div>`:''}
      <div class="grid2" style="margin-bottom:10px">
        <div class="card stat"><b>${books.length}</b><span>Books</span></div>
        <div class="card stat"><b>${loans.length}</b><span>On Loan</span></div>
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <input id="lib-q" placeholder="Search title, author, ISBN..." style="flex:1">
          ${atLeast('admin')?'<button class="btn sm pri" id="lib-add">+ Add book</button>':''}
        </div>
        <div id="lib-list"></div>
      </div>
    `, { back:'#/more', tab:'more' });

    const paint = () => {
      const q = (document.getElementById('lib-q').value||'').toLowerCase();
      const filtered = books.filter(b => !q || (b.title+b.author+(b.isbn||'')).toLowerCase().includes(q));
      document.getElementById('lib-list').innerHTML = filtered.slice(0,50).map(b => {
        const onLoan = loans.filter(l=>l.book_id===b.id).length;
        const avail = (b.copies||1) - onLoan;
        return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
          <div class="grow">
            <b>${esc(b.title)}</b>
            <div class="small muted">${esc(b.author)} ${b.isbn?'· ISBN:'+esc(b.isbn):''}</div>
            <div class="small" style="color:${avail>0?'var(--good)':'var(--bad)'}">${avail} of ${b.copies||1} available</div>
          </div>
          <div class="row" style="gap:6px">
            ${avail>0?`<button class="btn sm pri" data-lend="${b.id}">Lend</button>`:''}
            ${atLeast('admin')?`<button class="btn sm" data-ledit="${b.id}">Edit</button>`:''}
          </div>
        </div>`;
      }).join('') || '<p class="muted small">No books found.</p>';

      document.querySelectorAll('[data-lend]').forEach(btn => btn.onclick = () => lendModal(btn.dataset.lend));
      document.querySelectorAll('[data-ledit]').forEach(btn => btn.onclick = () => bookModal(Store.get('library_books',btn.dataset.ledit)));
    };

    document.getElementById('lib-q').oninput = paint; paint();
    const addBtn = document.getElementById('lib-add');
    if (addBtn) addBtn.onclick = () => bookModal();
  }

  function bookModal(b) {
    const n = !b; b = b||{};
    modal(`<h3>${n?'Add book':'Edit book'}</h3>
      <label>Title</label><input id="lb-title" value="${esc(b.title||'')}">
      <label>Author</label><input id="lb-author" value="${esc(b.author||'')}">
      <label>ISBN</label><input id="lb-isbn" value="${esc(b.isbn||'')}">
      <label>Category</label><input id="lb-cat" value="${esc(b.category||'')}">
      <label>Number of copies</label><input id="lb-copies" type="number" min="1" value="${b.copies||1}">
      <label>Shelf / location</label><input id="lb-shelf" value="${esc(b.shelf||'')}">
      <div class="row"><button class="btn grow" id="lb-x">Cancel</button><button class="btn pri grow" id="lb-ok">Save</button></div>`, () => {
      document.getElementById('lb-x').onclick = closeModal;
      document.getElementById('lb-ok').onclick = async () => {
        const title = document.getElementById('lb-title').value.trim();
        if (!title) return toast('Enter a title.');
        await Store.put('library_books',{...(b||{}), id:b.id||Core.uid(), title,
          author:document.getElementById('lb-author').value.trim(),
          isbn:document.getElementById('lb-isbn').value.trim(),
          category:document.getElementById('lb-cat').value.trim(),
          copies:+document.getElementById('lb-copies').value||1,
          shelf:document.getElementById('lb-shelf').value.trim(),
          created_at:b.created_at||new Date().toISOString()});
        closeModal(); toast('Saved.'); pageLibrary();
      };
    });
  }

  function lendModal(bookId) {
    const studs = students().filter(s=>s.status!=='left').sort(stuSort);
    const staff  = Store.all('users').filter(u=>u.active!==false);
    modal(`<h3>Lend Book</h3>
      <label>Borrower type</label>
      <select id="ll-type"><option value="student">Student</option><option value="staff">Staff</option></select>
      <label>Student</label>
      <select id="ll-stu">${opts(studs.map(s=>({v:s.id,t:stuName(s)+' ('+s.admission_no+')'})),'')}</select>
      <label>Staff</label>
      <select id="ll-stf" class="hidden">${opts(staff.map(u=>({v:u.id,t:u.full_name})),'')}</select>
      <label>Due date (days to borrow)</label>
      <select id="ll-days">${opts([{v:'7',t:'1 week'},{v:'14',t:'2 weeks'},{v:'30',t:'1 month'}],'14')}</select>
      <div class="row"><button class="btn grow" id="ll-x">Cancel</button><button class="btn pri grow" id="ll-ok">Lend</button></div>`, () => {
      const typeEl = document.getElementById('ll-type');
      typeEl.onchange = () => {
        document.getElementById('ll-stu').classList.toggle('hidden', typeEl.value!=='student');
        document.getElementById('ll-stf').classList.toggle('hidden', typeEl.value!=='staff');
      };
      document.getElementById('ll-x').onclick = closeModal;
      document.getElementById('ll-ok').onclick = async () => {
        const type = typeEl.value;
        const borrowerId = type==='student' ? document.getElementById('ll-stu').value : document.getElementById('ll-stf').value;
        const days = +document.getElementById('ll-days').value;
        const due = addDays(today(), days);
        await Store.put('library_loans',{ id:Core.uid(), book_id:bookId, borrower_type:type, borrower_id:borrowerId,
          lent_date:today(), due_date:due, returned_at:null, issued_by:ME.id, created_at:new Date().toISOString() });
        closeModal(); toast(`Book lent. Due ${due}.`); pageLibrary();
      };
    });
  }

  function pageLibraryLoans() {
    const loans = Store.all('library_loans').filter(l=>!l.returned_at).sort((a,b)=>a.due_date.localeCompare(b.due_date));
    view('Active Loans', `
      <div class="card">
        ${loans.map(l => {
          const b = Store.get('library_books',l.book_id);
          const overdue = l.due_date < today();
          const name = l.borrower_type==='student'
            ? (Store.get('students',l.borrower_id) ? stuName(Store.get('students',l.borrower_id)) : '?')
            : ((Store.get('users',l.borrower_id)||{}).full_name||'?');
          return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--bd)">
            <div class="grow">
              <b>${esc(b?b.title:'?')}</b>
              <div class="small muted">${esc(name)} · Due ${esc(l.due_date)}</div>
              ${overdue?'<div class="small" style="color:var(--bad)">⚠️ OVERDUE</div>':''}
            </div>
            <button class="btn sm pri" data-ret="${l.id}">Return</button>
          </div>`;
        }).join('') || '<p class="muted small">No active loans.</p>'}
      </div>
    `, { back:'#/library', tab:'more' });
    document.querySelectorAll('[data-ret]').forEach(btn => btn.onclick = async () => {
      const l = Store.get('library_loans',btn.dataset.ret);
      if (l) { await Store.put('library_loans',{...l,returned_at:today()}); toast('Returned.'); pageLibraryLoans(); }
    });
  }

  PluginLoader.register({ id:'library', name:'Library Manager', icon:'📚',
    description:'Full book catalog, lending, returns, overdue tracking.',
    stores:['library_books','library_loans'],
    routes:{ 'library':pageLibrary, 'library-loans':pageLibraryLoans },
    menuItems:[{ hash:'#/library', icon:'📚', title:'Library', sub:'Books, lending & returns', role:'teacher' }]
  });
  return { pageLibrary };
})();
