'use strict';
/* ============================================================
   math-tools.js — KaTeX equations, equation toolbar,
   auto-convert (x^2→x², 2/3→½), scientific calculator,
   Desmos graph plotter, KCSE formula library, AI step solver
   ============================================================ */
const MathTools = (() => {

  /* ── KaTeX render helper ── */
  function renderMath(container) {
    if (!window.katex || !container) return;
    // Block: $$...$$
    container.innerHTML = container.innerHTML.replace(/\$\$([^$]+)\$\$/g, (_, expr) => {
      try { return `<span class="math-block">${katex.renderToString(expr, { displayMode: true, throwOnError: false })}</span>`; }
      catch(e) { return `<code>${expr}</code>`; }
    });
    // Inline: $...$
    container.innerHTML = container.innerHTML.replace(/\$([^$\n]+)\$/g, (_, expr) => {
      try { return katex.renderToString(expr, { displayMode: false, throwOnError: false }); }
      catch(e) { return `<code>${expr}</code>`; }
    });
  }

  /* ── Auto-convert shortcuts as teacher types ── */
  function autoConvert(text) {
    return text
      .replace(/(\d+)\/(\d+)/g, (_, a, b) => `$\\frac{${a}}{${b}}$`)
      .replace(/(\w+)\^(\d+)/g, (_, b, e) => `$${b}^{${e}}$`)
      .replace(/sqrt\(([^)]+)\)/g, (_, v) => `$\\sqrt{${v}}$`)
      .replace(/\bpi\b/g, '$\\pi$')
      .replace(/\balpha\b/g, '$\\alpha$')
      .replace(/\bbeta\b/g, '$\\beta$')
      .replace(/\btheta\b/g, '$\\theta$')
      .replace(/\bsigma\b/g, '$\\sigma$')
      .replace(/\bdelta\b/g, '$\\Delta$')
      .replace(/\binfty\b/g, '$\\infty$')
      .replace(/<=>/g, '$\\Leftrightarrow$')
      .replace(/->/g, '$\\rightarrow$')
      .replace(/>=/g, '$\\geq$')
      .replace(/<=/g, '$\\leq$')
      .replace(/!=/g, '$\\neq$');
  }

  /* ── Equation toolbar symbols ── */
  const TOOLBAR = [
    { label: 'x²', insert: '^{2}' }, { label: 'xⁿ', insert: '^{n}' },
    { label: '√', insert: '\\sqrt{|}' }, { label: '∛', insert: '\\sqrt[3]{|}' },
    { label: 'a/b', insert: '\\frac{a}{b}' }, { label: '∫', insert: '\\int_{a}^{b}' },
    { label: 'Σ', insert: '\\sum_{i=1}^{n}' }, { label: '∏', insert: '\\prod_{i=1}^{n}' },
    { label: 'lim', insert: '\\lim_{x \\to a}' }, { label: 'log', insert: '\\log_{b}' },
    { label: 'ln', insert: '\\ln' }, { label: '±', insert: '\\pm' },
    { label: '×', insert: '\\times' }, { label: '÷', insert: '\\div' },
    { label: '≤', insert: '\\leq' }, { label: '≥', insert: '\\geq' },
    { label: '≠', insert: '\\neq' }, { label: '≈', insert: '\\approx' },
    { label: '∞', insert: '\\infty' }, { label: 'π', insert: '\\pi' },
    { label: 'α', insert: '\\alpha' }, { label: 'β', insert: '\\beta' },
    { label: 'θ', insert: '\\theta' }, { label: 'Δ', insert: '\\Delta' },
    { label: 'λ', insert: '\\lambda' }, { label: 'μ', insert: '\\mu' },
    { label: 'σ', insert: '\\sigma' }, { label: '→', insert: '\\rightarrow' },
    { label: '⟺', insert: '\\Leftrightarrow' }, { label: '∈', insert: '\\in' },
    { label: '∪', insert: '\\cup' }, { label: '∩', insert: '\\cap' },
    { label: 'vec', insert: '\\vec{v}' }, { label: 'mat', insert: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  ];

  function toolbarHtml(targetId) {
    return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;background:#f0fdfa;padding:8px;border-radius:10px">
      ${TOOLBAR.map(t => `<button type="button" class="btn sm" style="min-height:32px;padding:4px 8px;font-size:13px" onclick="MathTools.insertSymbol('${targetId}','${t.insert.replace(/'/g,"\\'")}')">${ t.label}</button>`).join('')}
      <button type="button" class="btn sm" style="background:#f5f3ff;color:#6d28d9;border-color:#6d28d9;min-height:32px" onclick="MathTools.aiSolve('${targetId}')">🤖 AI Solve</button>
    </div>`;
  }

  function insertSymbol(targetId, symbol) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = el.value.substring(s, e);
    const ins = symbol.includes('|') ? symbol.replace('|', sel || 'x') : symbol;
    el.value = el.value.substring(0, s) + '$' + ins + '$' + el.value.substring(e);
    el.focus(); el.selectionStart = el.selectionEnd = s + ins.length + 2;
  }

  /* ── KCSE Formula Library ── */
  const FORMULAS = {
    'Algebra': [
      { name: 'Quadratic Formula', latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' },
      { name: 'Difference of Two Squares', latex: 'a^2 - b^2 = (a+b)(a-b)' },
      { name: 'Perfect Square', latex: '(a+b)^2 = a^2 + 2ab + b^2' },
      { name: 'Binomial Theorem', latex: '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^k' },
    ],
    'Trigonometry': [
      { name: 'Sine Rule', latex: '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}' },
      { name: 'Cosine Rule', latex: 'c^2 = a^2 + b^2 - 2ab\\cos C' },
      { name: 'Area of Triangle', latex: 'A = \\frac{1}{2}ab\\sin C' },
      { name: 'Pythagorean Identity', latex: '\\sin^2\\theta + \\cos^2\\theta = 1' },
    ],
    'Calculus': [
      { name: 'Power Rule', latex: '\\frac{d}{dx}(x^n) = nx^{n-1}' },
      { name: 'Product Rule', latex: '\\frac{d}{dx}(uv) = u\\frac{dv}{dx} + v\\frac{du}{dx}' },
      { name: 'Chain Rule', latex: '\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}' },
      { name: 'Integration by Parts', latex: '\\int u\\,dv = uv - \\int v\\,du' },
    ],
    'Statistics': [
      { name: 'Mean', latex: '\\bar{x} = \\frac{\\sum x_i}{n}' },
      { name: 'Standard Deviation', latex: '\\sigma = \\sqrt{\\frac{\\sum(x_i - \\bar{x})^2}{n}}' },
      { name: 'Normal Distribution', latex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}' },
    ],
    'Geometry': [
      { name: 'Area of Circle', latex: 'A = \\pi r^2' },
      { name: 'Circumference', latex: 'C = 2\\pi r' },
      { name: 'Volume of Sphere', latex: 'V = \\frac{4}{3}\\pi r^3' },
      { name: 'Volume of Cone', latex: 'V = \\frac{1}{3}\\pi r^2 h' },
    ],
  };

  /* ── Scientific Calculator ── */
  function pageCalculator() {
    let expr = '';
    view('🔢 Scientific Calculator', `
      <div class="card">
        <div id="calc-display" style="font-size:28px;font-weight:800;text-align:right;padding:16px;background:#14201f;color:#a7f3d0;border-radius:12px;min-height:70px;word-break:break-all;margin-bottom:12px">0</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
          ${['sin(','cos(','tan(','ln(','log(','sqrt(','(',')',
             '7','8','9','÷','4','5','6','×','1','2','3','-','0','.','%','+',
             'π','e','ANS','=','C','⌫','x²','x^y'].map(k =>
            `<button class="btn sm calc-btn" data-k="${k}" style="min-height:50px;font-size:${k.length>2?'13':'18'}px;background:${k==='='?'var(--p)':k==='C'?'#fef3f2':k.length>2?'#f0fdfa':'#fff'};color:${k==='='?'#fff':k==='C'?'var(--bad)':k.length>2?'var(--p)':'inherit'};border-color:${k.length>2?'var(--p)':'var(--bd)'}">${k}</button>`
          ).join('')}
        </div>
      </div>
      <div class="card" id="calc-result"></div>
      <div class="card">
        <h2>📐 Formula Library</h2>
        ${Object.entries(FORMULAS).map(([cat, fmls]) => `
          <div style="margin-bottom:12px">
            <div style="font-weight:700;color:var(--p);margin-bottom:6px">${cat}</div>
            ${fmls.map(f => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--bd)">
              <div class="grow"><div style="font-size:13px">${f.name}</div></div>
              <button class="btn sm" onclick="MathTools.copyFormula('${f.latex.replace(/'/g,"\\'")}')">Copy</button>
            </div>`).join('')}
          </div>`).join('')}
      </div>
    `, { back: '#/more', tab: 'more' });

    let ans = 0;
    const display = document.getElementById('calc-display');
    document.querySelectorAll('.calc-btn').forEach(btn => {
      btn.onclick = () => {
        const k = btn.dataset.k;
        if (k === 'C') { expr = ''; display.textContent = '0'; return; }
        if (k === '⌫') { expr = expr.slice(0,-1); display.textContent = expr || '0'; return; }
        if (k === '=') {
          try {
            let e = expr.replace(/÷/g,'/').replace(/×/g,'*').replace(/π/g, Math.PI.toString())
              .replace(/e(?![0-9])/g, Math.E.toString())
              .replace(/sin\(/g,'Math.sin(').replace(/cos\(/g,'Math.cos(').replace(/tan\(/g,'Math.tan(')
              .replace(/ln\(/g,'Math.log(').replace(/log\(/g,'Math.log10(').replace(/sqrt\(/g,'Math.sqrt(')
              .replace(/x²/g,'**2').replace(/x\^y/g,'**').replace(/%/g,'*0.01').replace(/ANS/g,ans);
            const result = Function('"use strict"; return (' + e + ')')();
            ans = result;
            display.textContent = Number.isFinite(result) ? +result.toFixed(10) : 'Error';
            expr = String(+result.toFixed(10));
          } catch(e) { display.textContent = 'Error'; expr = ''; }
          return;
        }
        if (k === 'ANS') expr += ans;
        else if (k === 'x²') expr += '**2';
        else if (k === 'x^y') expr += '**';
        else expr += k;
        display.textContent = expr;
      };
    });
  }

  function copyFormula(latex) {
    navigator.clipboard?.writeText('$' + latex + '$').then(() => toast('Formula copied! Paste in notes with $...$'));
  }

  /* ── AI Step-by-Step Solver ── */
  async function aiSolve(targetId) {
    const el = document.getElementById(targetId);
    const problem = el ? el.value.trim() : '';
    const key = (window.AIReady&&AIReady()?'server':'');
    if (!key) return toast('AI is not available. Sign in with internet; the super admin must set up the AI key on the server.');
    if (!problem) return toast('Enter a maths problem first.');
    toast('AI solving step by step... ⏳', 10000);
    try {
      const res = await groqFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3-8b-8192', messages: [{ role: 'user', content: `Solve this mathematics problem step by step. Show each step clearly. Use simple notation:\n\n${problem}\n\nFormat: Step 1: ..., Step 2: ..., Final Answer: ...` }], max_tokens: 600 })
      });
      const j = await res.json();
      const solution = j.choices?.[0]?.message?.content || 'Could not solve.';
      modal(`<h3>🤖 AI Solution</h3>
        <div style="background:#f0fdfa;border-radius:12px;padding:16px;white-space:pre-wrap;font-size:14px;line-height:1.8">${esc(solution)}</div>
        <button class="btn pri full" id="ais-x" style="margin-top:12px">Close</button>`, () => {
        document.getElementById('ais-x').onclick = closeModal;
      });
    } catch(e) { toast('AI error: ' + e.message); }
  }

  /* ── Math Tools main page ── */
  function pageMathTools() {
    view('🔢 Math Tools', `
      <div class="grid2" style="margin-bottom:12px">
        <div class="item" style="display:block;cursor:pointer" onclick="location.hash='#/calculator'">
          <div style="font-size:32px">🧮</div>
          <div class="t">Scientific Calculator</div>
          <div class="s">sin, cos, log, sqrt, complex</div>
        </div>
        <div class="item" style="display:block;cursor:pointer" onclick="MathTools.pageGraphPlotter()">
          <div style="font-size:32px">📈</div>
          <div class="t">Graph Plotter</div>
          <div class="s">Desmos interactive graphs</div>
        </div>
        <div class="item" style="display:block;cursor:pointer" onclick="MathTools.pageFormulaLib()">
          <div style="font-size:32px">📐</div>
          <div class="t">Formula Library</div>
          <div class="s">KCSE formulas, copy to notes</div>
        </div>
        <div class="item" style="display:block;cursor:pointer" onclick="MathTools.pageEquationEditor()">
          <div style="font-size:32px">✏️</div>
          <div class="t">Equation Editor</div>
          <div class="s">Write and preview equations</div>
        </div>
      </div>
      <div class="card" style="background:#f5f3ff">
        <h2>⚡ Quick Convert</h2>
        <p class="muted small">Type shorthand → auto-converts to equations</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
          <div style="background:#fff;padding:8px;border-radius:8px"><code>2/3</code> → $\\frac{2}{3}$</div>
          <div style="background:#fff;padding:8px;border-radius:8px"><code>x^2</code> → $x^{2}$</div>
          <div style="background:#fff;padding:8px;border-radius:8px"><code>sqrt(16)</code> → $\\sqrt{16}$</div>
          <div style="background:#fff;padding:8px;border-radius:8px"><code>pi</code> → $\\pi$</div>
          <div style="background:#fff;padding:8px;border-radius:8px"><code>alpha</code> → $\\alpha$</div>
          <div style="background:#fff;padding:8px;border-radius:8px"><code>-></code> → $\\rightarrow$</div>
        </div>
      </div>
    `, { back: '#/more', tab: 'more' });
  }

  function pageEquationEditor() {
    view('✏️ Equation Editor', `
      <div class="card">
        <h2>Write equations</h2>
        <p class="muted small">Use $...$ for inline, $$...$$ for block. Use toolbar or type LaTeX directly.</p>
        ${toolbarHtml('eq-input')}
        <textarea id="eq-input" style="min-height:120px;font-family:monospace" placeholder="Type here: e.g. x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"></textarea>
        <button class="btn pri full" id="eq-preview" style="margin-top:10px">👁 Preview</button>
      </div>
      <div class="card" id="eq-preview-area" style="font-size:16px;line-height:2">
        <p class="muted small">Preview will appear here...</p>
      </div>
    `, { back: '#/math-tools', tab: 'more' });
    document.getElementById('eq-preview').onclick = () => {
      const text = document.getElementById('eq-input').value;
      const area = document.getElementById('eq-preview-area');
      area.innerHTML = text.replace(/\n/g, '<br>');
      renderMath(area);
    };
  }

  function pageGraphPlotter() {
    view('📈 Graph Plotter', `
      <div class="card">
        <h2>Desmos Graph Plotter</h2>
        <p class="muted small">Interactive graphing calculator — free, no key required.</p>
        <iframe src="https://www.desmos.com/calculator" style="width:100%;height:500px;border:none;border-radius:12px" allowfullscreen></iframe>
      </div>
      <div class="card">
        <h2>GeoGebra Geometry</h2>
        <p class="muted small">Draw geometric shapes, measure angles and lengths.</p>
        <iframe src="https://www.geogebra.org/geometry" style="width:100%;height:450px;border:none;border-radius:12px" allowfullscreen></iframe>
      </div>
    `, { back: '#/math-tools', tab: 'more' });
  }

  function pageFormulaLib() {
    view('📐 Formula Library', `
      ${Object.entries(FORMULAS).map(([cat, fmls]) => `
        <div class="card">
          <h2>${cat}</h2>
          ${fmls.map(f => `<div style="padding:10px 0;border-bottom:1px solid var(--bd)">
            <div style="font-weight:700;margin-bottom:8px">${f.name}</div>
            <div id="fm-${f.name.replace(/\s/g,'_')}" style="font-size:15px;text-align:center;padding:8px"></div>
            <div class="row" style="margin-top:8px;gap:6px">
              <button class="btn sm grow" onclick="MathTools.copyFormula('${f.latex.replace(/'/g,"\\'")}')">📋 Copy LaTeX</button>
              <button class="btn sm grow" onclick="Dictionary&&Dictionary.speak('${f.name}','en-US')">🔊 Hear name</button>
            </div>
          </div>`).join('')}
        </div>`).join('')}
    `, { back: '#/math-tools', tab: 'more' });
    // Render after DOM is ready
    setTimeout(() => {
      if (!window.katex) return;
      Object.entries(FORMULAS).forEach(([_, fmls]) => fmls.forEach(f => {
        const el = document.getElementById('fm-' + f.name.replace(/\s/g,'_'));
        if (el) { try { el.innerHTML = katex.renderToString(f.latex, { displayMode: true, throwOnError: false }); } catch(e) {} }
      }));
    }, 100);
  }

  PluginLoader.register({
    id: 'math-tools', name: 'Math Tools', icon: '🔢',
    description: 'KaTeX equations, equation editor, scientific calculator, Desmos graphs, formula library.',
    stores: [], routes: { 'math-tools': pageMathTools, 'calculator': pageCalculator, 'equation-editor': pageEquationEditor, 'graph-plotter': pageGraphPlotter, 'formula-lib': pageFormulaLib },
    menuItems: [{ hash: '#/math-tools', icon: '🔢', title: 'Math Tools', sub: 'Calculator, graphs, formulas', role: 'student' }]
  });

  return { renderMath, autoConvert, toolbarHtml, insertSymbol, copyFormula, aiSolve, pageMathTools, pageCalculator, pageEquationEditor, pageGraphPlotter, pageFormulaLib };
})();
