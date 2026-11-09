/* 줍줍 라벨러 — 화면 동작 (캔버스 편집기 · 목록 · 모달 · 가이드 · 체험 투어) */
'use strict';
(function () {
  // =========================================================================
  // 도우미
  // =========================================================================
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ic = (n, c) => window.icon(n, c);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const TOKEN = new URLSearchParams(location.search).get('t') || '';
  const basename = (p) => p.split('/').pop();
  const dirname = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const stemOf = (p) => p.replace(/\.[^./]+$/, '');
  const encRel = (rel) => rel.split('/').map(encodeURIComponent).join('/');
  const ROW_H = 60;
  const LABEL_FONT = '700 12px "Pretendard Variable", "Malgun Gothic", sans-serif';
  const SAMPLE_PREFIX = '줍줍 라벨러 예제';

  const PALETTE = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
    '#6366f1', '#eab308', '#f43f5e', '#0ea5e9', '#d946ef', '#10b981', '#8b5cf6', '#fb923c', '#2dd4bf', '#e11d48'];
  function colorOf(i) {
    if (i == null || i < 0) return '#94a3b8';
    if (i < PALETTE.length) return PALETTE[i];
    return `hsl(${Math.round((i * 137.508) % 360)} 68% 55%)`;
  }
  function inkOn(c) {
    if (!c || c[0] !== '#') return '#fff';
    const r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 0.66 ? '#0b0d12' : '#ffffff';
  }

  const bus = new EventTarget();
  const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));

  // =========================================================================
  // 파이썬 연결
  // =========================================================================
  let API = null;
  async function call(name, ...args) {
    try {
      const r = await API[name](...args);
      return r == null ? { ok: false, error: '응답이 없어요' } : r;
    } catch (e) {
      console.error(name, e);
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }
  function logJs(msg) { try { if (API && API.log_js) API.log_js(String(msg).slice(0, 2000)); } catch (_) { /* 무시 */ } }
  window.addEventListener('error', (e) => logJs(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => logJs('promise: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));

  // =========================================================================
  // 상태
  // =========================================================================
  const S = {
    settings: {}, version: '', home: '', recent: [],
    ds: null, images: [], filtered: [], posOf: new Map(), filter: 'all', search: '',
    index: -1, img: null, imgOK: false, W: 0, H: 0, boxes: [], sel: -1, hover: -1,
    undo: [], redo: [], cur: 0, view: { s: 1, ox: 0, oy: 0, fit: true }, cw: 0, ch: 0,
    drag: null, space: false, mouse: null, hide: false, clip: [], source: null, polygon: false, readonly: false,
    unmarked: false, saveChain: Promise.resolve(), loadToken: 0, imgCache: new Map(), raf: 0, clsQuery: '', cursor: '',
    lastSavePath: '',
  };
  window.__jj = S;   // 개발 중 확인용

  const stage = $('#stage'), cv = $('#canvas'), ctx = cv.getContext('2d');
  let dpr = 1, stageRect = null;

  // =========================================================================
  // 시작
  // =========================================================================
  function pywebviewReady() {
    return new Promise((res) => {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.boot) return res();
      window.addEventListener('pywebviewready', () => res(), { once: true });
    });
  }

  async function init() {
    paintStaticIcons();
    bindUI();
    renderHint();
    await pywebviewReady();
    API = window.pywebview.api;
    const r = await call('boot');
    if (!r.ok) { toast('시작 정보를 불러오지 못했어요: ' + r.error, 'err', { ms: 8000 }); return; }
    S.settings = r.settings; S.version = r.version; S.home = r.home; S.recent = r.recent || [];
    applyTheme();
    try { await document.fonts.load(LABEL_FONT); } catch (_) { /* 글꼴 없이도 동작 */ }
    renderWelcome();
    showWelcome(true);
    const last = S.settings.last_dataset;
    if (last && S.recent.some((x) => x.path === last && x.exists)) await openPath(last, { quiet: true });
    document.body.classList.add('ready');
    if (!S.settings.first_run_done) {
      S.settings.first_run_done = true;
      call('save_settings', { first_run_done: true });
      openGuide(0);
    }
  }

  function applyTheme() {
    const t = S.settings.theme || 'system';
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  function paintStaticIcons() {
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('dsIcon', ic('folder', 'sm')); set('dsCaret', ic('down', 'sm'));
    set('btnPrev', ic('left')); set('btnNext', ic('right'));
    set('btnUndo', ic('undo')); set('btnRedo', ic('redo'));
    set('btnGuide', ic('help')); set('btnSettings', ic('sliders'));
    set('btnExport', ic('export', 'sm') + '<span>내보내기</span>');
    set('btnAddImages', ic('plus', 'sm')); set('searchIcon', ic('search', 'sm')); set('clsSearchIcon', ic('search', 'sm'));
    set('zoomOut', ic('minus')); set('zoomIn', ic('plus')); set('btnFit', ic('fit')); set('btnHide', ic('eye')); set('btnKeys', ic('keyboard'));
    set('btnClearBoxes', ic('trash', 'sm')); set('polyIcon', ic('alert'));
  }

  // =========================================================================
  // 이벤트 연결
  // =========================================================================
  function bindUI() {
    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
    on('dsChip', 'click', (e) => dsMenu(e.currentTarget));
    on('btnPrev', 'click', () => step(-1));
    on('btnNext', 'click', () => step(1));
    on('btnUndo', 'click', undo);
    on('btnRedo', 'click', redo);
    on('btnGuide', 'click', () => openGuide(0));
    on('btnSettings', 'click', openSettings);
    on('btnExport', 'click', openExport);
    on('btnAddImages', 'click', (e) => addMenu(e.currentTarget));
    on('zoomOut', 'click', () => zoomCenter(0.8));
    on('zoomIn', 'click', () => zoomCenter(1.25));
    on('zoomLabel', 'click', zoom100);
    on('btnFit', 'click', fit);
    on('btnHide', 'click', toggleHide);
    on('btnKeys', 'click', () => openGuide('keys'));
    on('btnClearBoxes', 'click', clearBoxes);
    on('polyAllow', 'click', () => { S.readonly = false; $('#polyBanner').hidden = true; toast('편집할 수 있어요. 고치면 박스로 저장돼요.', 'info'); });
    on('statusPill', 'click', toggleReviewed);

    on('imgSearch', 'input', (e) => { S.search = e.target.value; computeFiltered(); renderList(true); });
    on('filterChips', 'click', (e) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      S.filter = b.dataset.f; computeFiltered(); renderFilters(); $('#imgList').scrollTop = 0; renderList(true); ensureVisible(S.index);
    });
    const vl = $('#imgList');
    let listRaf = 0;
    vl.addEventListener('scroll', () => { if (!listRaf) listRaf = requestAnimationFrame(() => { listRaf = 0; renderList(); }); });
    $('#imgListInner').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) goTo(+r.dataset.i); });
    new ResizeObserver(() => renderList()).observe(vl);

    on('classList', 'click', (e) => { const c = e.target.closest('[data-c]'); if (c) setClass(+c.dataset.c); });
    on('clsSearch', 'input', (e) => { S.clsQuery = e.target.value; renderClasses(); });
    on('boxList', 'click', (e) => {
      const d = e.target.closest('[data-del]');
      if (d) { e.stopPropagation(); deleteBox(+d.dataset.del); return; }
      const b = e.target.closest('[data-b]'); if (b) { select(+b.dataset.b); cv.focus({ preventScroll: true }); }
    });
    on('boxList', 'dblclick', (e) => { const b = e.target.closest('[data-b]'); if (b) { const r = b.getBoundingClientRect(); pickClassFor(+b.dataset.b, r.left - 270, r.top); } });
    on('boxList', 'mouseover', (e) => { const b = e.target.closest('[data-b]'); const i = b ? +b.dataset.b : -1; if (i !== S.hover) { S.hover = i; requestDraw(); } });
    on('boxList', 'mouseleave', () => { S.hover = -1; requestDraw(); });
    on('stageMsg', 'click', (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'addFiles') addImages(); else if (a.dataset.act === 'addFolder') addImageFolder();
    });
    on('welcome', 'click', onWelcomeClick);

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { if (!S.drag) { S.mouse = null; S.hover = -1; requestDraw(); renderCoord(); } });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('dblclick', onDblClick);
    new ResizeObserver(resizeCanvas).observe(stage);

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', (e) => { if (e.code === 'Space' && S.space) { S.space = false; hoverUpdate(S.mouse); requestDraw(); } });
    window.addEventListener('blur', () => { if (S.space) { S.space = false; setCursor('crosshair'); } });
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => { e.preventDefault(); toast('끌어다 놓기 대신 [데이터 폴더 열기]로 폴더를 골라 주세요.', 'info'); });
    document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    bindTooltips();
  }

  // =========================================================================
  // 시작 화면
  // =========================================================================
  function renderWelcome() {
    const rec = (S.recent || []).slice(0, 6);
    const tree = `<span class="f">my-dataset/</span>
├─ <span class="f">images/</span>        <span class="c">이미지 (필수, 하위 폴더 OK)</span>
├─ <span class="f">labels/</span>        <span class="c">YOLO 라벨 (없으면 자동 생성)</span>
├─ classes.txt     <span class="c">클래스 목록 — 또는 data.yaml</span>
└─ annotations.json <span class="c">COCO 라벨 (선택)</span>`;
    $('#welcome').innerHTML = `<div class="welcome-inner">
      <div class="hero">
        <img src="img/logo.svg" alt="">
        <div style="margin-top:14px"><span class="ver">v${esc(S.version)}</span></div>
        <h1>줍줍 <span>라벨러</span></h1>
        <p>이미지에 박스를 그리고 클래스를 붙여서, YOLO · COCO 학습 데이터로 내보내는 라벨링 도구예요.</p>
      </div>
      <div class="actions">
        <button class="action" data-act="open"><span class="ai" style="background:linear-gradient(135deg,#34d399,#059669)">${ic('folder')}</span><span class="go">${ic('arrowRight')}</span>
          <h3>데이터 폴더 열기</h3><p>images 폴더가 든 폴더를 열어요.<br>기존 YOLO · COCO 라벨도 그대로 불러와요.</p></button>
        <button class="action" data-act="new"><span class="ai" style="background:linear-gradient(135deg,#60a5fa,#2563eb)">${ic('folderPlus')}</span><span class="go">${ic('arrowRight')}</span>
          <h3>새 데이터 폴더 만들기</h3><p>폴더 이름과 클래스만 정하면<br>규격에 맞는 폴더를 만들어 줘요.</p></button>
        <button class="action featured" data-act="sample"><span class="ai" style="background:linear-gradient(135deg,#fbbf24,#f97316)">${ic('sparkles')}</span><span class="go">${ic('arrowRight')}</span>
          <h3>예제로 체험하기</h3><p>샘플 이미지와 AI 라벨로<br>따라 하면서 1분 만에 익혀요.</p></button>
      </div>
      ${rec.length ? `<div class="recent"><h4>최근 연 폴더</h4><div class="recent-list">${rec.map((r) => `
        <div class="rc ${r.exists ? '' : 'missing'}" data-path="${esc(r.path)}">
          <span class="fi">${ic('folder', 'sm')}</span><span class="tx"><b>${esc(r.name)}</b><small>${esc(r.path)}</small></span>
          <button class="icon-btn sm" data-forget="${esc(r.path)}" data-tip="목록에서 빼기">${ic('x', 'sm')}</button></div>`).join('')}</div></div>` : ''}
      <div class="spec">
        <div class="spec-card"><h4>데이터 폴더는 이렇게 생겼어요</h4><div class="tree">${tree}</div></div>
        <div class="spec-card"><h4>세 단계면 끝</h4>
          <ul class="glist one">
            <li><span class="b">${ic('check')}</span><span><b>폴더 열기</b> — 클래스는 data.yaml → classes.txt → annotations.json 순서로 찾아요</span></li>
            <li><span class="b">${ic('check')}</span><span><b>드래그로 박스</b> — 숫자키로 클래스, <kbd class="sm">D</kbd>로 다음 (자동 저장)</span></li>
            <li><span class="b">${ic('check')}</span><span><b>내보내기</b> — YOLO(기본) 또는 COCO 데이터셋으로</span></li>
          </ul></div>
      </div>
      <div class="welcome-foot">
        ${S.ds ? `<button class="btn" data-act="back">${ic('left', 'sm')} ${esc(S.ds.name)}(으)로 돌아가기</button>` : ''}
        <button class="btn ghost" data-act="guide">${ic('book', 'sm')} 사용 가이드</button>
        <button class="btn ghost" data-act="keys">${ic('keyboard', 'sm')} 단축키</button>
        <button class="btn ghost" data-act="settings">${ic('sliders', 'sm')} 설정</button>
      </div></div>`;
  }

  async function onWelcomeClick(e) {
    const f = e.target.closest('[data-forget]');
    if (f) {
      e.stopPropagation();
      await call('forget_recent', f.dataset.forget);
      S.recent = S.recent.filter((r) => r.path !== f.dataset.forget);
      renderWelcome(); return;
    }
    const rc = e.target.closest('[data-path]');
    if (rc) { openPath(rc.dataset.path); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'open') openFolderFlow();
    else if (act === 'new') openNewDataset();
    else if (act === 'sample') sampleFlow(true);
    else if (act === 'guide') openGuide(0);
    else if (act === 'keys') openGuide('keys');
    else if (act === 'settings') openSettings();
    else if (act === 'back') showWelcome(false);
  }

  function showWelcome(flag) {
    if (flag) renderWelcome();
    $('#welcome').hidden = !flag;
  }

  // =========================================================================
  // 데이터 폴더 열기
  // =========================================================================
  async function openFolderFlow() {
    const r = await call('pick_folder');
    if (r.ok && r.path) return openPath(r.path);
    return false;
  }

  async function openPath(path, opts) {
    opts = opts || {};
    if (S.ds && S.index >= 0) await leave(S.index);
    const r = await call('open_dataset', path);
    if (!r.ok) { if (!opts.quiet) toast(r.error, 'err', { ms: 7000 }); return false; }
    if (r.status === 'missing') { if (!opts.quiet) toast('폴더를 찾을 수 없어요: ' + path, 'err'); return false; }
    if (opts.quiet && r.status !== 'ok') return false;
    if (r.status === 'need_flat_fix') {
      const ok = await confirmBox({
        icon: 'folder', title: 'images 폴더로 정리할까요?',
        text: `이 폴더에는 <b>images</b> 폴더 없이 이미지 <b>${r.count}장</b>이 바로 들어 있어요.<br>규격에 맞게 <b>images/</b> 폴더로 옮기고, 같은 이름의 .txt 라벨은 <b>labels/</b>로 함께 옮길게요.`,
        extra: `<div class="tree" style="margin-top:12px;padding:12px 14px;border-radius:12px;background:var(--panel-2);border:1px solid var(--line)">${esc(basename(r.root.replace(/\\/g, '/')))}/\n├─ <span class="f">images/</span>  <span class="c">← 이미지 ${r.count}장</span>\n└─ <span class="f">labels/</span>  <span class="c">← 같은 이름 .txt</span></div>`,
        ok: '정리하고 열기',
      });
      if (!ok) return false;
      const f = await call('fix_flat', r.root);
      if (!f.ok) { toast(f.error, 'err'); return false; }
      toast(`이미지 ${f.moved}장을 images 폴더로 옮겼어요`, 'ok');
      return openPath(r.root, opts);
    }
    if (r.status === 'need_images_dir') {
      const ok = await confirmBox({ icon: 'folderPlus', title: 'images 폴더가 없어요', text: `이 폴더를 새 데이터 폴더로 쓰도록 <b>images</b> 폴더를 만들까요?<br><span style="color:var(--muted)">${esc(r.root)}</span>`, ok: '만들기' });
      if (!ok) return false;
      const m = await call('make_images_dir', r.root);
      if (!m.ok) { toast(m.error, 'err'); return false; }
      return openPath(r.root, opts);
    }
    if (r.status === 'need_classes') {
      const names = await classSetupDialog(r.root);
      if (!names) return false;
      const w = await call('write_classes', r.root, names);
      if (!w.ok) { toast(w.error, 'err'); return false; }
      return openPath(r.root, opts);
    }
    if (r.status === 'ok') { await applyDataset(r.dataset, opts); return true; }
    return false;
  }

  async function applyDataset(ds, opts) {
    opts = opts || {};
    const keep = !!opts.keepRel;
    S.ds = ds;
    S.images = ds.images.map(([rel, count, reviewed]) => ({ rel, count, reviewed }));
    S.index = -1; S.img = null; S.imgOK = false; S.boxes = []; S.sel = -1; S.hover = -1; S.imgCache.clear();
    S.cur = keep ? clamp(S.cur, 0, ds.class_names.length - 1) : 0;
    if (!keep) { S.filter = 'all'; S.search = ''; $('#imgSearch').value = ''; S.clsQuery = ''; $('#clsSearch').value = ''; }
    rowPool.forEach((el) => el.remove()); rowPool.clear();
    showWelcome(false);
    computeFiltered(); renderFilters(); renderList(true); renderClasses(); renderCurClass(); renderBoxes(); renderProgress(); renderTop(); renderHint();
    $('#imgList').scrollTop = 0;
    if (ds.warnings && ds.warnings.length && !opts.quietWarn) {
      toast(`데이터 폴더에서 확인할 점이 ${ds.warnings.length}개 있어요`, 'warn', { ms: 8000, action: ['자세히', () => showWarnings(ds.warnings)] });
    }
    if (!S.images.length) { draw(); renderImageChip(); renderCoord(); showStageMsg('empty'); return; }
    let start = -1;
    const want = opts.keepRel || ds.last;
    if (want) start = S.images.findIndex((im) => im.rel === want);
    if (start < 0) { start = S.images.findIndex((im) => !im.reviewed); if (start < 0) start = 0; }
    await loadImage(start);
  }

  async function reloadDataset() {
    if (!S.ds) return;
    const keepRel = S.images[S.index] ? S.images[S.index].rel : null;
    await S.saveChain;
    const r = await call('reload');
    if (!r.ok) { toast(r.error, 'err'); return; }
    if (r.status !== 'ok') { toast('데이터 폴더 상태가 바뀌었어요. 다시 열어 주세요.', 'warn'); return; }
    await applyDataset(r.dataset, { keepRel, quietWarn: true });
    toast('클래스와 라벨을 다시 읽었어요', 'ok', { ms: 1600 });
  }

  async function addImages() {
    if (!S.ds) return;
    const r = await call('pick_images');
    if (!r.ok || !r.paths || !r.paths.length) return;
    const res = await call('add_images', r.paths);
    afterAdd(res);
  }
  async function addImageFolder() {
    if (!S.ds) return;
    const r = await call('pick_folder');
    if (!r.ok || !r.path) return;
    const res = await call('add_image_folder', r.path);
    afterAdd(res);
  }
  async function afterAdd(res) {
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (res.status === 'ok') {
      const keepRel = S.images[S.index] ? S.images[S.index].rel : null;
      await applyDataset(res.dataset, { keepRel, quietWarn: true });
    }
    toast(`이미지 ${res.added || 0}장을 images 폴더에 복사했어요`, res.added ? 'ok' : 'warn');
  }

  async function sampleFlow(withTour) {
    const t = toast('예제 데이터를 만드는 중이에요…', 'info', { ms: 60000 });
    const r = await call('make_sample');
    t.dismiss();
    if (!r.ok) { toast(r.error, 'err'); return; }
    const ok = await openPath(r.path);
    if (ok) {
      toast('문서 폴더에 예제 폴더를 만들었어요', 'ok', { ms: 4000, action: ['폴더 열기', () => call('open_path', r.path)] });
      if (withTour) setTimeout(startTour, 450);
    }
  }

  // =========================================================================
  // 이미지 목록 (가상 스크롤)
  // =========================================================================
  const FILTERS = [['all', '전체'], ['todo', '미확인'], ['done', '확인'], ['boxed', '박스 있음'], ['empty', '박스 없음']];
  const rowPool = new Map();

  function passFilter(im, f) {
    switch (f) {
      case 'todo': return !im.reviewed;
      case 'done': return im.reviewed;
      case 'boxed': return !!im.count;
      case 'empty': return !im.count;
      default: return true;
    }
  }

  function computeFiltered() {
    const q = S.search.trim().toLowerCase();
    S.filtered = []; S.posOf = new Map();
    S.images.forEach((im, i) => {
      if (i !== S.index) {
        if (q && !im.rel.toLowerCase().includes(q)) return;
        if (!passFilter(im, S.filter)) return;
      }
      S.posOf.set(i, S.filtered.length); S.filtered.push(i);
    });
  }

  function renderFilters() {
    const c = { all: S.images.length, todo: 0, done: 0, boxed: 0, empty: 0 };
    S.images.forEach((im) => { if (im.reviewed) c.done++; else c.todo++; if (im.count) c.boxed++; else c.empty++; });
    $('#filterChips').innerHTML = FILTERS.map(([k, l]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-f="${k}">${l}<span class="n">${c[k]}</span></button>`).join('');
  }

  function thumbUrl(rel) { return `/thumb/${TOKEN}/${S.ds.gen}/${encRel(rel)}`; }
  function imageUrl(rel) { return `/img/${TOKEN}/${S.ds.gen}/${encRel(rel)}`; }

  function renderList(force) {
    const vl = $('#imgList'), inner = $('#imgListInner');
    const n = S.filtered.length;
    if (force) { rowPool.forEach((el) => el.remove()); rowPool.clear(); }
    const empty = inner.querySelector('.list-empty');
    if (!n) {
      inner.style.height = 'auto';
      if (!empty) inner.insertAdjacentHTML('beforeend', `<div class="list-empty">${S.ds ? (S.images.length ? '조건에 맞는 이미지가 없어요' : '이미지가 없어요') : ''}</div>`);
      return;
    }
    if (empty) empty.remove();
    inner.style.height = n * ROW_H + 'px';
    const top = vl.scrollTop, hgt = vl.clientHeight || 600;
    const a = Math.max(0, Math.floor(top / ROW_H) - 6), b = Math.min(n, Math.ceil((top + hgt) / ROW_H) + 6);
    const want = new Set();
    for (let p = a; p < b; p++) want.add(S.filtered[p]);
    rowPool.forEach((el, i) => { if (!want.has(i)) { el.remove(); rowPool.delete(i); } });
    for (let p = a; p < b; p++) {
      const i = S.filtered[p];
      let el = rowPool.get(i);
      if (!el) { el = makeRow(i); rowPool.set(i, el); inner.appendChild(el); }
      el.style.top = p * ROW_H + 'px';
    }
  }

  function makeRow(i) {
    const im = S.images[i];
    const el = document.createElement('div');
    el.className = 'row'; el.dataset.i = i;
    el.innerHTML = `<div class="thumb"><img alt="" decoding="async" loading="lazy"></div>
      <div class="meta"><div class="fn"></div><div class="sub"></div></div><span class="st"></span>`;
    const img = el.querySelector('img');
    img.onload = () => img.classList.add('ok');
    img.src = thumbUrl(im.rel);
    el.querySelector('.fn').textContent = basename(im.rel);
    el.title = im.rel;
    fillRow(el, i);
    return el;
  }

  function fillRow(el, i) {
    const im = S.images[i];
    const st = im.reviewed ? 'rev' : (im.count != null ? 'auto' : 'none');
    el.classList.toggle('cur', i === S.index);
    const folder = dirname(im.rel);
    let badge;
    if (im.reviewed && !im.count) badge = '<span class="badge rev">물체 없음</span>';
    else if (im.count == null) badge = '<span class="badge new">라벨 없음</span>';
    else badge = `<span class="badge ${im.reviewed ? 'rev' : 'auto'}">박스 ${im.count}</span>`;
    el.querySelector('.sub').innerHTML = badge + (folder ? `<span>${esc(folder)}</span>` : '');
    const s = el.querySelector('.st');
    s.className = 'st ' + st;
    s.innerHTML = st === 'rev' ? ic('check') : '';
    s.title = st === 'rev' ? '사람이 확인함' : st === 'auto' ? '라벨은 있지만 아직 확인 안 함 (AI·기존 라벨)' : '라벨 없음';
  }

  function updateRow(i) { const el = rowPool.get(i); if (el) fillRow(el, i); }

  function ensureVisible(i) {
    const pos = S.posOf.get(i);
    if (pos == null) return;
    const vl = $('#imgList');
    const top = pos * ROW_H, bot = top + ROW_H;
    if (top < vl.scrollTop) vl.scrollTop = Math.max(0, top - 8);
    else if (bot > vl.scrollTop + vl.clientHeight) vl.scrollTop = bot - vl.clientHeight + 8;
    renderList();
  }

  function renderProgress() {
    const n = S.images.length;
    let r = 0, boxes = 0;
    S.images.forEach((im) => { if (im.reviewed) r++; boxes += im.count || 0; });
    const pct = n ? Math.round((r * 100) / n) : 0;
    $('#progressText').textContent = pct + '%';
    $('#progressRing').style.strokeDashoffset = String(59.7 * (1 - (n ? r / n : 0)));
    $('#reviewBar').style.width = (n ? (r * 100) / n : 0) + '%';
    $('#footLeft').innerHTML = `확인 <b>${r}</b> / ${n}`;
    $('#footRight').textContent = `박스 ${boxes}개`;
    $('#imgCount').textContent = n;
  }

  // =========================================================================
  // 상단 / 오른쪽 패널
  // =========================================================================
  function renderTop() {
    $('#dsName').textContent = S.ds ? S.ds.name : '데이터 폴더 열기';
    const im = S.images[S.index];
    $('#navPos').innerHTML = `${im ? S.index + 1 : 0} <small>/ ${S.images.length}</small>`;
    $('#navName').textContent = im ? basename(im.rel) : '';
    $('#btnUndo').disabled = !S.undo.length;
    $('#btnRedo').disabled = !S.redo.length;
    $('#btnExport').disabled = !S.ds;
    document.title = im ? `${basename(im.rel)} · ${S.ds.name} — 줍줍 라벨러` : '줍줍 라벨러';
  }

  const validCls = (c) => S.ds && c >= 0 && c < S.ds.class_names.length;
  const className = (c) => (validCls(c) ? S.ds.class_names[c] : `알 수 없음(${c})`);
  const keyOf = (i) => (i < 9 ? String(i + 1) : i === 9 ? '0' : '');

  function renderCurClass() {
    const names = S.ds ? S.ds.class_names : [];
    const card = $('#curCard');
    card.style.setProperty('--cc', colorOf(names.length ? S.cur : -1));
    $('#curLab').textContent = S.sel >= 0 ? '선택한 박스의 클래스' : '다음에 그릴 클래스';
    $('#curName').textContent = names.length ? names[S.cur] : '-';
    const k = keyOf(S.cur);
    $('#curKey').textContent = k;
    $('#curKey').hidden = !k || !names.length;
  }

  function renderClasses() {
    const names = S.ds ? S.ds.class_names : [];
    const counts = {};
    S.boxes.forEach((b) => { counts[b.cls] = (counts[b.cls] || 0) + 1; });
    $('#clsCount').textContent = names.length;
    $('#clsSource').textContent = S.ds ? S.ds.class_source + ' 에서 읽음' : '';
    $('#clsSource').title = $('#clsSource').textContent;
    $('#clsSearchWrap').hidden = names.length <= 8;
    const q = S.clsQuery.trim().toLowerCase();
    $('#classList').innerHTML = names.map((n, i) => {
      if (q && !n.toLowerCase().includes(q) && String(i + 1) !== q) return '';
      const c = colorOf(i), k = keyOf(i);
      return `<div class="cls ${i === S.cur ? 'on' : ''}" data-c="${i}" style="--cc:${c}"><span class="sw" style="background:${c}"></span>
        <span class="nm">${esc(n)}</span><span class="cnt">${counts[i] || ''}</span>${k ? `<kbd class="sm">${k}</kbd>` : ''}</div>`;
    }).join('');
  }

  function renderBoxes() {
    $('#boxCount').textContent = S.boxes.length;
    const list = $('#boxList');
    if (!S.boxes.length) {
      list.innerHTML = S.img ? `<div class="empty-note">아직 박스가 없어요.<br>이미지 위를 <b>드래그</b>해서 그려 보세요.</div>` : '';
    } else {
      list.innerHTML = S.boxes.map((b, i) => {
        const [x1, y1, x2, y2] = rectOf(b), c = colorOf(validCls(b.cls) ? b.cls : -1);
        return `<div class="bx ${i === S.sel ? 'on' : ''}" data-b="${i}"><span class="idx" style="background:${c};color:${inkOn(c)}">${i + 1}</span>
          <span class="nm">${esc(className(b.cls))}</span><span class="sz">${Math.round(x2 - x1)}×${Math.round(y2 - y1)}</span>
          <button class="icon-btn sm del" data-del="${i}" data-tip="지우기" data-key="Del">${ic('trash', 'sm')}</button></div>`;
      }).join('');
    }
    $('#btnClearBoxes').disabled = !S.boxes.length;
    renderClasses();
  }

  function renderImageChip() {
    const chip = $('#imageChip'), im = S.images[S.index];
    if (!im || !S.ds) { chip.hidden = true; return; }
    chip.hidden = false;
    $('#imgTitle').textContent = im.rel;
    const pill = $('#statusPill');
    if (im.reviewed) {
      pill.className = 'status-pill rev'; pill.innerHTML = ic('check', 'sm') + '확인함';
      pill.dataset.tip = '클릭하면 확인 표시를 지워요';
    } else if (S.touched) {
      pill.className = 'status-pill new'; pill.innerHTML = ic('check', 'sm') + '작업 중 · 넘어가면 확인';
      pill.dataset.tip = '고친 내용은 바로 저장돼요. 다음 이미지로 가면 확인(✔)으로 표시돼요';
    } else if (im.count != null) {
      pill.className = 'status-pill auto'; pill.innerHTML = '◐ 미확인 라벨';
      pill.dataset.tip = 'AI·기존 라벨이 있어요. 다음으로 넘어가면 확인으로 표시돼요';
    } else {
      pill.className = 'status-pill new'; pill.innerHTML = '새 이미지';
      pill.dataset.tip = '다음으로 넘어가면 확인으로 표시돼요';
    }
    let src = '라벨 파일 없음';
    if (S.source === 'txt') src = `labels/${stemOf(im.rel)}.txt`;
    else if (S.source === 'coco') src = `COCO · ${S.ds.coco || ''}`;
    $('#srcPill').textContent = src;
  }

  function renderHint() {
    let items;
    if (S.drag && S.drag.mode === 'draw') items = [['놓기', '박스 완성'], ['Esc', '취소']];
    else if (S.sel >= 0) items = [['모서리', '크기'], ['안쪽', '이동'], ['1~9', '클래스'], ['Del', '삭제'], ['Esc', '해제']];
    else items = [['드래그', '박스 그리기'], ['클릭', '선택'], ['휠', '확대'], ['Space', '이동'], ['D', '다음']];
    $('#hintPill').innerHTML = items.map(([k, t]) => `<span><kbd class="sm">${k}</kbd>${t}</span>`).join('');
  }

  function renderCoord() {
    const pill = $('#coordPill');
    if (!S.img) { pill.hidden = true; $('#zoomLabel').textContent = '—'; return; }
    pill.hidden = false;
    let t = `${S.W} × ${S.H}`;
    if (S.mouse) {
      const [x, y] = c2i(S.mouse.x, S.mouse.y);
      if (x >= 0 && y >= 0 && x <= S.W && y <= S.H) t += `  ·  ${Math.round(x)}, ${Math.round(y)}`;
    }
    pill.textContent = t;
    $('#zoomLabel').textContent = Math.round(S.view.s * 100) + '%';
  }

  function setSave(state) {
    const el = $('#saveState');
    el.classList.toggle('saving', state === 'saving');
    el.classList.toggle('error', state === 'error');
    $('#saveText').textContent = state === 'saving' ? '저장 중…' : state === 'error' ? '저장 실패' : '자동 저장됨';
  }

  function showStageMsg(kind, extra) {
    const el = $('#stageMsg');
    if (!kind) { el.hidden = true; el.innerHTML = ''; return; }
    if (kind === 'empty') {
      el.innerHTML = `<div><div class="icon-wrap">${ic('images')}</div><h2>이미지가 아직 없어요</h2>
        <p>images 폴더에 이미지를 넣거나, 아래 버튼으로 추가하세요.</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:18px">
        <button class="btn primary" data-act="addFiles">${ic('plus', 'sm')} 이미지 파일 추가</button>
        <button class="btn" data-act="addFolder">${ic('folder', 'sm')} 폴더째로 추가</button></div></div>`;
    } else {
      el.innerHTML = `<div><div class="icon-wrap">${ic('alert')}</div><h2>이미지를 열 수 없어요</h2><p>${esc(extra || '')}</p></div>`;
    }
    el.hidden = false;
  }

  // =========================================================================
  // 이미지 이동 / 불러오기 / 저장
  // =========================================================================
  function loadImg(rel) {
    const cached = S.imgCache.get(rel);
    if (cached) { S.imgCache.delete(rel); S.imgCache.set(rel, cached); return cached; }
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = imageUrl(rel);
    }).then(async (img) => { if (img) { try { await img.decode(); } catch (_) { /* 이미 로드됨 */ } } return img; });
    S.imgCache.set(rel, p);
    while (S.imgCache.size > 10) S.imgCache.delete(S.imgCache.keys().next().value);
    return p;
  }

  function preloadAround(i) {
    const pos = S.posOf.get(i);
    const near = [];
    if (pos != null) [1, 2, -1].forEach((d) => { const j = S.filtered[pos + d]; if (j != null) near.push(j); });
    near.forEach((j) => loadImg(S.images[j].rel));
  }

  async function goTo(i) {
    if (!S.ds || i == null || i < 0 || i >= S.images.length) return;
    if (i === S.index && S.img) return;
    if (S.index >= 0) await leave(S.index);
    await loadImage(i);
  }

  async function leave(i) {
    S.drag = null;
    await S.saveChain;
    const im = S.images[i];
    if (im && S.imgOK && i === S.index && !S.unmarked && !im.reviewed) markReviewed(i, true);
  }

  function markReviewed(i, flag) {
    const im = S.images[i];
    if (!im || im.reviewed === flag) return;
    im.reviewed = flag;
    call('set_reviewed', im.rel, flag);
    updateRow(i); renderProgress(); renderFilters();
    if (i === S.index) renderImageChip();
  }

  function toggleReviewed() {
    const im = S.images[S.index];
    if (!im) return;
    if (im.reviewed) { markReviewed(S.index, false); S.unmarked = true; toast('확인 표시를 지웠어요. 다른 이미지로 가도 다시 붙지 않아요.', 'info'); }
    else { markReviewed(S.index, true); S.unmarked = false; toast('확인으로 표시했어요', 'ok', { ms: 1400 }); }
  }

  async function loadImage(i) {
    const token = ++S.loadToken;
    const prev = S.index;
    S.index = i; S.sel = -1; S.hover = -1; S.undo = []; S.redo = []; S.unmarked = false; S.readonly = false; S.drag = null; S.touched = false;
    const im = S.images[i];
    if (prev >= 0) updateRow(prev);
    updateRow(i);
    if (!S.posOf.has(i)) { computeFiltered(); renderList(true); }
    ensureVisible(i);
    renderTop(); renderImageChip(); renderHint();
    $('#polyBanner').hidden = true;
    const slow = setTimeout(() => { if (token === S.loadToken) $('#loader').hidden = false; }, 120);
    const [img, lab] = await Promise.all([loadImg(im.rel), call('load_labels', im.rel)]);
    clearTimeout(slow);
    if (token !== S.loadToken) return;
    $('#loader').hidden = true;
    if (!img) {
      S.img = null; S.imgOK = false; S.boxes = [];
      draw(); renderBoxes(); renderCoord(); showStageMsg('error', im.rel);
      return;
    }
    showStageMsg(null);
    S.img = img; S.imgOK = true; S.W = img.naturalWidth; S.H = img.naturalHeight;
    const entries = lab.ok ? lab.entries : [];
    S.boxes = entries.map(([c, x1, y1, x2, y2]) => ({ cls: c, x1: x1 * S.W, y1: y1 * S.H, x2: x2 * S.W, y2: y2 * S.H }));
    S.source = lab.ok ? lab.source : null;
    S.polygon = !!(lab.ok && lab.polygon);
    S.readonly = S.polygon;
    $('#polyBanner').hidden = !S.polygon;
    if (!lab.ok) toast('라벨을 읽지 못했어요: ' + lab.error, 'err');
    else if (lab.bad) toast(`라벨 파일에서 읽을 수 없는 줄 ${lab.bad}개는 건너뛰었어요`, 'warn');
    const unknown = S.boxes.filter((b) => !validCls(b.cls)).length;
    if (unknown) toast(`클래스 번호가 범위를 벗어난 박스 ${unknown}개가 있어요 (회색)`, 'warn');
    fit();
    renderBoxes(); renderCurClass(); renderImageChip(); renderCoord(); renderTop(); renderHint();
    call('set_last', im.rel);
    preloadAround(i);
    emit('navigate', i);
  }

  async function step(d) {
    if (!S.ds || !S.images.length) return;
    const pos = S.posOf.get(S.index);
    let target;
    if (pos == null) {
      const list = S.filtered.filter((j) => (d > 0 ? j > S.index : j < S.index));
      target = d > 0 ? list[0] : list[list.length - 1];
    } else target = S.filtered[pos + d];
    if (target == null) {
      if (d > 0) await leave(S.index);
      toast(d > 0 ? '목록의 마지막 이미지예요' : '목록의 첫 이미지예요', 'info', { ms: 1500 });
      return;
    }
    await goTo(target);
  }

  async function nextTodo() {
    if (!S.ds) return;
    const n = S.images.length;
    for (let k = 1; k <= n; k++) {
      const j = (S.index + k) % n;
      if (j !== S.index && !S.images[j].reviewed) { await goTo(j); return; }
    }
    await leave(S.index);
    toast('모든 이미지를 확인했어요! 🎉', 'ok');
  }

  function entriesNow() {
    return S.boxes.map((b) => { const [x1, y1, x2, y2] = rectOf(b); return [b.cls, x1 / S.W, y1 / S.H, x2 / S.W, y2 / S.H]; })
      .filter(([, x1, y1, x2, y2]) => (x2 - x1) * S.W >= 1 && (y2 - y1) * S.H >= 1);
  }

  function queueSave() {
    if (!S.img || S.index < 0) return S.saveChain;
    const i = S.index, rel = S.images[i].rel, entries = entriesNow();
    setSave('saving');
    S.saveChain = S.saveChain.then(async () => {
      const r = await call('save_labels', rel, entries);
      if (r && r.ok) {
        S.images[i].count = r.count; S.lastSavePath = r.path;
        if (i === S.index) { S.source = 'txt'; S.polygon = false; renderImageChip(); }
        updateRow(i); renderProgress(); renderFilters(); setSave('ok');
      } else {
        setSave('error');
        toast('저장하지 못했어요: ' + ((r && r.error) || '알 수 없는 오류'), 'err', { ms: 6000 });
      }
    });
    return S.saveChain;
  }

  async function saveNow() {
    if (!S.img) return;
    await queueSave();
    markReviewed(S.index, true); S.unmarked = false;
    toast(`저장했어요 · ${S.lastSavePath}${S.boxes.length ? '' : ' (물체 없음)'}`, 'ok');
  }

  // =========================================================================
  // 편집
  // =========================================================================
  function canEdit() {
    if (!S.img) return false;
    if (S.readonly) { toast('폴리곤 라벨이라 보호 중이에요. 위쪽 배너에서 편집을 허용해 주세요.', 'warn'); return false; }
    return true;
  }
  const snap = () => ({ boxes: S.boxes.map((b) => ({ ...b })), sel: S.sel });
  function pushUndo() { S.undo.push(snap()); if (S.undo.length > 300) S.undo.shift(); S.redo = []; renderTop(); }
  function commit() { S.touched = true; renderBoxes(); renderTop(); requestDraw(); queueSave(); renderImageChip(); }

  function restore(sn) {
    S.boxes = sn.boxes.map((b) => ({ ...b }));
    S.sel = sn.sel < S.boxes.length ? sn.sel : -1;
    commit(); renderCurClass(); renderHint();
  }
  function undo() {
    if (!S.undo.length || S.readonly) { if (S.img && !S.readonly) toast('되돌릴 작업이 없어요', 'info', { ms: 1200 }); return; }
    S.redo.push(snap()); restore(S.undo.pop());
  }
  function redo() {
    if (!S.redo.length || S.readonly) { if (S.img && !S.readonly) toast('다시 실행할 작업이 없어요', 'info', { ms: 1200 }); return; }
    S.undo.push(snap()); restore(S.redo.pop());
  }

  function select(i) {
    S.sel = i;
    if (i >= 0 && S.boxes[i] && validCls(S.boxes[i].cls)) S.cur = S.boxes[i].cls;
    renderBoxes(); renderCurClass(); renderHint(); requestDraw();
    if (i >= 0) { const el = document.querySelector(`.bx[data-b="${i}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }

  function setClass(i) {
    if (!S.ds) return;
    const n = S.ds.class_names.length;
    if (i < 0 || i >= n) { toast(`${i + 1}번 클래스는 없어요 (클래스 ${n}개)`, 'warn', { ms: 1600 }); return; }
    const sel = S.sel;
    if (sel >= 0 && S.boxes[sel] && S.boxes[sel].cls !== i) {
      if (!canEdit()) return;
      pushUndo();
      S.boxes[sel].cls = i; S.cur = i;
      commit(); renderCurClass();
      emit('classChanged', i);
    } else {
      S.cur = i; renderClasses(); renderCurClass();
    }
    emit('class', i);
  }

  function deleteBox(i) {
    if (!S.boxes[i] || !canEdit()) return;
    pushUndo();
    S.boxes.splice(i, 1);
    S.sel = -1; S.hover = -1;
    commit(); renderCurClass(); renderHint();
    toast('박스를 지웠어요', 'ok', { ms: 1800, action: ['되돌리기', undo] });
  }
  function deleteSelected() { if (S.sel >= 0) deleteBox(S.sel); }

  async function clearBoxes() {
    if (!S.boxes.length || !canEdit()) return;
    const ok = await confirmBox({ icon: 'trash', title: '박스를 모두 지울까요?', text: `이 이미지의 박스 <b>${S.boxes.length}개</b>를 지워요. <kbd class="sm">Ctrl</kbd>+<kbd class="sm">Z</kbd>로 되돌릴 수 있어요.`, ok: '모두 지우기', danger: true });
    if (!ok) return;
    pushUndo(); S.boxes = []; S.sel = -1; commit(); renderHint();
  }

  function copyBoxes() {
    if (!S.img || !S.boxes.length) { toast('복사할 박스가 없어요', 'info', { ms: 1400 }); return; }
    const src = S.sel >= 0 ? [S.boxes[S.sel]] : S.boxes;
    S.clip = src.map((b) => { const [x1, y1, x2, y2] = rectOf(b); return [b.cls, x1 / S.W, y1 / S.H, x2 / S.W, y2 / S.H]; });
    toast(`박스 ${S.clip.length}개를 복사했어요`, 'ok', { ms: 1400 });
  }

  function addNormBoxes(entries, what) {
    if (!entries.length) { toast(`${what} 박스가 없어요`, 'info', { ms: 1500 }); return; }
    if (!canEdit()) return;
    pushUndo();
    entries.forEach(([c, x1, y1, x2, y2]) => S.boxes.push({ cls: c, x1: clamp(x1, 0, 1) * S.W, y1: clamp(y1, 0, 1) * S.H, x2: clamp(x2, 0, 1) * S.W, y2: clamp(y2, 0, 1) * S.H }));
    S.sel = S.boxes.length - 1;
    commit(); renderCurClass(); renderHint();
    toast(`${what} 박스 ${entries.length}개를 넣었어요`, 'ok', { ms: 1600 });
  }
  function paste() { addNormBoxes(S.clip.slice(), '복사한'); }
  async function pastePrev() {
    if (!S.img) return;
    const pos = S.posOf.get(S.index);
    const prev = pos != null && pos > 0 ? S.filtered[pos - 1] : S.index - 1;
    if (prev == null || prev < 0) { toast('앞 이미지가 없어요', 'info'); return; }
    const r = await call('load_labels', S.images[prev].rel);
    if (!r.ok) { toast(r.error, 'err'); return; }
    addNormBoxes(r.entries, '앞 이미지의');
  }

  function cycleBox(d) {
    if (!S.boxes.length) return;
    select(S.sel < 0 ? (d > 0 ? 0 : S.boxes.length - 1) : (S.sel + d + S.boxes.length) % S.boxes.length);
  }

  function escape() {
    if (S.drag && S.drag.mode === 'draw') { S.drag = null; renderHint(); requestDraw(); return; }
    if (S.sel >= 0) select(-1);
  }

  function toggleHide() {
    S.hide = !S.hide;
    $('#btnHide').innerHTML = ic(S.hide ? 'eyeOff' : 'eye');
    $('#btnHide').classList.toggle('on', S.hide);
    $('#btnHide').dataset.tip = S.hide ? '박스 보이기' : '박스 숨기기';
    requestDraw();
  }

  async function pickClassFor(i, x, y) {
    if (!S.boxes[i]) return;
    select(i);
    const r = await pickClass(x, y, S.boxes[i].cls);
    if (r != null) setClass(r);
    cv.focus({ preventScroll: true });
  }

  // =========================================================================
  // 캔버스
  // =========================================================================
  const PAD = { t: 64, b: 70, l: 24, r: 24 };
  const c2i = (x, y) => [(x - S.view.ox) / S.view.s, (y - S.view.oy) / S.view.s];
  const i2c = (x, y) => [x * S.view.s + S.view.ox, y * S.view.s + S.view.oy];
  const clampImg = (x, y) => [clamp(x, 0, S.W), clamp(y, 0, S.H)];
  function rectOf(b) { return [Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.max(b.x1, b.x2), Math.max(b.y1, b.y2)]; }
  const area = (b) => { const [x1, y1, x2, y2] = rectOf(b); return (x2 - x1) * (y2 - y1); };

  function resizeCanvas() {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    S.cw = r.width; S.ch = r.height;
    stageRect = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    if (S.view.fit) fit(); else draw();
    if (tour.on) tourPlace();
  }

  function fitScale() { return Math.max(0.005, Math.min((S.cw - PAD.l - PAD.r) / S.W, (S.ch - PAD.t - PAD.b) / S.H)); }
  function fit() {
    if (!S.img) { draw(); return; }
    const s = fitScale();
    S.view = { s, ox: PAD.l + (S.cw - PAD.l - PAD.r - S.W * s) / 2, oy: PAD.t + (S.ch - PAD.t - PAD.b - S.H * s) / 2, fit: true };
    draw(); renderCoord();
  }
  function zoomAt(x, y, f) {
    if (!S.img) return;
    const ns = clamp(S.view.s * f, Math.min(fitScale(), 1) * 0.2, 40);
    const [ix, iy] = c2i(x, y);
    S.view = { s: ns, ox: x - ix * ns, oy: y - iy * ns, fit: false };
    requestDraw(); renderCoord();
  }
  const zoomCenter = (f) => zoomAt(S.cw / 2, S.ch / 2, f);
  const zoom100 = () => { if (S.img) zoomCenter(1 / S.view.s); };

  function requestDraw() { if (!S.raf) S.raf = requestAnimationFrame(draw); }

  function draw() {
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S.cw, S.ch);
    if (!S.img) return;
    const { s, ox, oy } = S.view, w = S.W * s, hh = S.H * s;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, w, hh);
    ctx.restore();
    ctx.imageSmoothingEnabled = s < 2.5; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, ox, oy, w, hh);
    if (!S.hide) drawBoxes();
    drawPreview();
    drawCross();
  }

  function rr(x, y, w, hh, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, hh, r); else ctx.rect(x, y, w, hh); }

  function drawBoxes() {
    const { s, ox, oy } = S.view;
    const lw = Number(S.settings.line_width) || 2;
    const fa = S.settings.fill_opacity == null ? 0.14 : Number(S.settings.fill_opacity);
    const names = S.settings.show_names !== false;
    const order = [];
    for (let i = 0; i < S.boxes.length; i++) if (i !== S.sel) order.push(i);
    if (S.sel >= 0 && S.sel < S.boxes.length) order.push(S.sel);
    ctx.font = LABEL_FONT; ctx.textBaseline = 'middle';
    for (const i of order) {
      const b = S.boxes[i];
      const [x1, y1, x2, y2] = rectOf(b);
      const X1 = ox + x1 * s, Y1 = oy + y1 * s, X2 = ox + x2 * s, Y2 = oy + y2 * s;
      const c = colorOf(validCls(b.cls) ? b.cls : -1);
      const sel = i === S.sel, hov = i === S.hover && !sel;
      ctx.globalAlpha = Math.min(1, fa * (sel ? 1.7 : hov ? 1.6 : 1));
      ctx.fillStyle = c; ctx.fillRect(X1, Y1, X2 - X1, Y2 - Y1);
      ctx.globalAlpha = 1;
      if (sel || hov) { ctx.lineWidth = lw + 4; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.strokeRect(X1, Y1, X2 - X1, Y2 - Y1); }
      ctx.lineWidth = sel ? lw + 1 : lw; ctx.strokeStyle = c; ctx.strokeRect(X1, Y1, X2 - X1, Y2 - Y1);
      if (names) {
        const txt = `${i + 1}  ${className(b.cls)}`;
        const tw = ctx.measureText(txt).width + 14, th = 20;
        let ty = Y1 - th - lw / 2;
        if (ty < 2) ty = Y1 + lw / 2;
        const tx = clamp(X1 - lw / 2, 2, Math.max(2, S.cw - tw - 2));
        ctx.fillStyle = c; rr(tx, ty, tw, th, 5); ctx.fill();
        ctx.fillStyle = inkOn(c); ctx.fillText(txt, tx + 7, ty + th / 2 + 0.5);
      }
      if (sel) {
        const hs = 4.5, mx = (X1 + X2) / 2, my = (Y1 + Y2) / 2;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.5;
        for (const [hx, hy] of [[X1, Y1], [X2, Y1], [X1, Y2], [X2, Y2], [mx, Y1], [mx, Y2], [X1, my], [X2, my]]) {
          ctx.beginPath(); ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  function drawPreview() {
    const d = S.drag;
    if (!d || d.mode !== 'draw') return;
    const { s, ox, oy } = S.view;
    const [ax, ay] = d.startImg, [bx, by] = d.cur;
    const X1 = ox + Math.min(ax, bx) * s, Y1 = oy + Math.min(ay, by) * s, W = Math.abs(bx - ax) * s, H = Math.abs(by - ay) * s;
    const c = colorOf(S.cur);
    ctx.globalAlpha = 0.18; ctx.fillStyle = c; ctx.fillRect(X1, Y1, W, H); ctx.globalAlpha = 1;
    ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
    ctx.strokeStyle = '#ffffff'; ctx.strokeRect(X1, Y1, W, H);
    ctx.lineDashOffset = 6; ctx.strokeStyle = c; ctx.strokeRect(X1, Y1, W, H);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    const label = `${className(S.cur)} · ${Math.round(Math.abs(bx - ax))} × ${Math.round(Math.abs(by - ay))}`;
    ctx.font = LABEL_FONT; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 16;
    const px = Math.min(X1 + W + 10, S.cw - tw - 6), py = Math.min(Y1 + H + 10, S.ch - 30);
    ctx.fillStyle = 'rgba(10,12,16,0.86)'; rr(px, py, tw, 24, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, px + 8, py + 12.5);
  }

  function drawCross() {
    if (!S.mouse || S.settings.show_crosshair === false || S.space || S.cursor !== 'crosshair') return;
    const d = S.drag;
    if (d && (d.mode === 'pan' || d.mode === 'move' || d.mode === 'resize')) return;
    const { x, y } = S.mouse;
    ctx.save();
    ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(S.cw, Math.round(y) + 0.5);
    ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, S.ch); ctx.stroke();
    ctx.restore();
  }

  function boxesAt(ix, iy) {
    const t = 3 / S.view.s, out = [];
    S.boxes.forEach((b, i) => {
      const [x1, y1, x2, y2] = rectOf(b);
      if (ix >= x1 - t && ix <= x2 + t && iy >= y1 - t && iy <= y2 + t) out.push(i);
    });
    return out.sort((a, b) => area(S.boxes[a]) - area(S.boxes[b]));
  }

  function hitEdges(i, x, y) {
    const b = S.boxes[i];
    if (!b) return null;
    const [x1, y1, x2, y2] = rectOf(b);
    const [X1, Y1] = i2c(x1, y1), [X2, Y2] = i2c(x2, y2);
    const tol = 7;
    const inY = y >= Y1 - tol && y <= Y2 + tol, inX = x >= X1 - tol && x <= X2 + tol;
    let l = Math.abs(x - X1) <= tol && inY, r = Math.abs(x - X2) <= tol && inY;
    let t = Math.abs(y - Y1) <= tol && inX, bt = Math.abs(y - Y2) <= tol && inX;
    if (l && r) { const k = Math.abs(x - X1) <= Math.abs(x - X2); l = k; r = !k; }
    if (t && bt) { const k = Math.abs(y - Y1) <= Math.abs(y - Y2); t = k; bt = !k; }
    return l || r || t || bt ? { l, r, t, b: bt } : null;
  }
  function edgeCursor(e) {
    if ((e.l && e.t) || (e.r && e.b)) return 'nwse-resize';
    if ((e.r && e.t) || (e.l && e.b)) return 'nesw-resize';
    return e.l || e.r ? 'ew-resize' : 'ns-resize';
  }
  function setCursor(c) { if (S.cursor !== c) { S.cursor = c; cv.style.cursor = c; } }

  function hoverUpdate(p) {
    if (!S.img || !p) { setCursor('default'); return; }
    if (S.space) { setCursor('grab'); return; }
    let cur = 'crosshair', hov = -1;
    if (!S.hide) {
      const [ix, iy] = c2i(p.x, p.y);
      if (S.sel >= 0 && S.boxes[S.sel]) {
        const ed = hitEdges(S.sel, p.x, p.y);
        if (ed) cur = edgeCursor(ed);
        else { const [x1, y1, x2, y2] = rectOf(S.boxes[S.sel]); if (ix >= x1 && ix <= x2 && iy >= y1 && iy <= y2) cur = 'move'; }
      }
      const c = boxesAt(ix, iy);
      hov = c.length ? c[0] : -1;
    }
    setCursor(cur);
    S.hover = hov;
  }

  function evPoint(e) { const r = stageRect || cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function capture(e) { try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 */ } }

  function onDown(e) {
    if (!S.img) return;
    stageRect = cv.getBoundingClientRect();
    cv.focus({ preventScroll: true });
    hideTip();
    const p = evPoint(e);
    S.mouse = p;
    if (e.button === 1 || (e.button === 0 && S.space)) {
      e.preventDefault();
      S.drag = { mode: 'pan', start: p, o: [S.view.ox, S.view.oy] };
      capture(e); setCursor('grabbing'); return;
    }
    if (e.button === 2) { boxMenu(e, p); return; }
    if (e.button !== 0) return;
    const [ix, iy] = c2i(p.x, p.y);
    const force = e.ctrlKey || e.metaKey;
    if (!force && !S.hide && S.sel >= 0) {
      const ed = hitEdges(S.sel, p.x, p.y);
      if (ed) { S.drag = { mode: 'resize', idx: S.sel, edges: ed, started: false, orig: { ...S.boxes[S.sel] }, start: p }; capture(e); return; }
    }
    const cands = force || S.hide ? [] : boxesAt(ix, iy);
    if (S.sel >= 0 && cands.includes(S.sel)) S.drag = { mode: 'pmove', idx: S.sel, cands, start: p, startImg: [ix, iy], orig: { ...S.boxes[S.sel] } };
    else S.drag = { mode: 'pending', cands, start: p, startImg: clampImg(ix, iy) };
    capture(e);
  }

  function onMove(e) {
    const p = evPoint(e);
    S.mouse = p;
    const d = S.drag;
    if (!d) { hoverUpdate(p); renderCoord(); requestDraw(); return; }
    if (d.mode === 'pan') {
      S.view.ox = d.o[0] + p.x - d.start.x; S.view.oy = d.o[1] + p.y - d.start.y; S.view.fit = false;
      requestDraw(); renderCoord(); return;
    }
    const moved = Math.abs(p.x - d.start.x) > 3 || Math.abs(p.y - d.start.y) > 3;
    if (d.mode === 'pending') {
      if (!moved) return;
      if (!canEdit()) { S.drag = null; return; }
      d.mode = 'draw'; d.cur = d.startImg;
      if (S.sel >= 0) select(-1);
      setCursor('crosshair'); renderHint();
    } else if (d.mode === 'pmove') {
      if (!moved) return;
      if (!canEdit()) { S.drag = null; return; }
      pushUndo(); d.mode = 'move'; setCursor('move');
    } else if (d.mode === 'resize' && !d.started) {
      if (Math.abs(p.x - d.start.x) < 2 && Math.abs(p.y - d.start.y) < 2) return;
      if (!canEdit()) { S.drag = null; return; }
      pushUndo(); d.started = true;
    }
    const [ix, iy] = c2i(p.x, p.y);
    if (d.mode === 'draw') d.cur = clampImg(ix, iy);
    else if (d.mode === 'move') {
      const [x1, y1, x2, y2] = rectOf(d.orig);
      const dx = clamp(ix - d.startImg[0], -x1, S.W - x2), dy = clamp(iy - d.startImg[1], -y1, S.H - y2);
      Object.assign(S.boxes[d.idx], { x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy });
    } else if (d.mode === 'resize') {
      let [x1, y1, x2, y2] = rectOf(d.orig);
      const [cx, cy] = clampImg(ix, iy);
      if (d.edges.l) x1 = cx;
      if (d.edges.r) x2 = cx;
      if (d.edges.t) y1 = cy;
      if (d.edges.b) y2 = cy;
      Object.assign(S.boxes[d.idx], { x1, y1, x2, y2 });
    }
    requestDraw(); renderCoord();
  }

  async function onUp(e) {
    const d = S.drag;
    S.drag = null;
    try { cv.releasePointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    if (!d) return;
    const p = evPoint(e);
    if (d.mode === 'pan') { setCursor(S.space ? 'grab' : 'crosshair'); hoverUpdate(p); return; }
    if (d.mode === 'pending') select(d.cands.length ? d.cands[0] : -1);
    else if (d.mode === 'pmove') {
      if (d.cands.length > 1) { const k = d.cands.indexOf(d.idx); select(d.cands[(k + 1) % d.cands.length]); }
    } else if (d.mode === 'draw') {
      const [ax, ay] = d.startImg, [bx, by] = d.cur;
      const w = Math.abs(bx - ax), hh = Math.abs(by - ay);
      if (w * S.view.s >= 4 && hh * S.view.s >= 4 && w >= 1 && hh >= 1) {
        pushUndo();
        S.boxes.push({ cls: S.cur, x1: Math.min(ax, bx), y1: Math.min(ay, by), x2: Math.max(ax, bx), y2: Math.max(ay, by) });
        const idx = S.boxes.length - 1;
        select(idx); commit();
        emit('boxCreated', idx);
        if (S.settings.ask_class_after_draw) {
          const r = await pickClass(e.clientX, e.clientY, S.cur);
          if (r != null) setClass(r);
          cv.focus({ preventScroll: true });
        }
      }
      renderHint();
    } else if (d.mode === 'move' || d.mode === 'resize') {
      const b = S.boxes[d.idx];
      if (b) {
        const [x1, y1, x2, y2] = rectOf(b);
        if (x2 - x1 < 1 || y2 - y1 < 1) Object.assign(b, d.orig); else Object.assign(b, { x1, y1, x2, y2 });
      }
      if (d.mode === 'move' || d.started) { commit(); emit('boxEdited', d.idx); }
    }
    hoverUpdate(p); requestDraw();
  }

  function onWheel(e) {
    e.preventDefault();
    if (!S.img) return;
    const p = evPoint(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    zoomAt(p.x, p.y, clamp(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), 0.5, 2));
  }

  function onDblClick(e) {
    if (!S.img || S.hide) return;
    const p = evPoint(e);
    const [ix, iy] = c2i(p.x, p.y);
    const c = boxesAt(ix, iy);
    if (c.length) pickClassFor(S.sel >= 0 && c.includes(S.sel) ? S.sel : c[0], e.clientX, e.clientY);
  }

  // =========================================================================
  // 키보드
  // =========================================================================
  function onKey(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && ['KeyR', 'KeyP', 'KeyF', 'KeyJ', 'KeyU', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'KeyW', 'KeyN', 'KeyT', 'KeyH'].includes(e.code)) e.preventDefault();
    if (['F3', 'F5', 'F7', 'F12'].includes(e.code) || (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight'))) e.preventDefault();
    const top = topLayer();
    if (top) {
      if (top.onKey && top.onKey(e)) { e.preventDefault(); return; }
      if (e.key === 'Escape') { e.preventDefault(); top.close(); return; }
      if (e.key === 'Enter' && !e.isComposing && top.type !== 'menu') {
        const t = e.target;
        if (t && t.tagName === 'TEXTAREA') return;
        const btn = top.el.querySelector('.btn.primary:not(:disabled)');
        if (btn) { e.preventDefault(); btn.click(); }
      }
      return;
    }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (e.key === 'Escape') { t.blur(); cv.focus({ preventScroll: true }); }
      return;
    }
    if (e.code === 'F1') { e.preventDefault(); openGuide(0); return; }
    if (!S.ds) {
      if (ctrl && e.code === 'KeyO') { e.preventDefault(); openFolderFlow(); }
      return;
    }
    const shift = e.shiftKey, code = e.code;
    if (ctrl) {
      const acts = {
        KeyZ: () => (shift ? redo() : undo()), KeyY: redo, KeyS: saveNow, KeyO: openFolderFlow, KeyE: openExport,
        KeyC: copyBoxes, KeyV: () => (shift ? pastePrev() : paste()), KeyG: openGoto,
      };
      if (acts[code]) { e.preventDefault(); acts[code](); }
      return;
    }
    if (code === 'Space') {
      e.preventDefault();
      if (!S.space) { S.space = true; setCursor('grab'); requestDraw(); }
      return;
    }
    const dm = /^(Digit|Numpad)(\d)$/.exec(code);
    if (dm && !e.altKey) { e.preventDefault(); const n = +dm[2]; setClass(n === 0 ? 9 : n - 1); return; }
    const acts = {
      KeyA: () => step(-1), ArrowLeft: () => step(-1), ArrowUp: () => step(-1),
      KeyD: () => step(1), ArrowRight: () => step(1), ArrowDown: () => step(1),
      KeyN: nextTodo, KeyF: fit, KeyH: toggleHide,
      Delete: deleteSelected, Backspace: deleteSelected, Escape: escape,
      Tab: () => cycleBox(shift ? -1 : 1),
      Equal: () => zoomCenter(1.25), NumpadAdd: () => zoomCenter(1.25),
      Minus: () => zoomCenter(0.8), NumpadSubtract: () => zoomCenter(0.8),
      F5: reloadDataset,
      Slash: () => { if (shift) openGuide('keys'); },
    };
    if (acts[code]) { e.preventDefault(); if (!e.repeat || /Arrow|Key[AD]|Equal|Minus|Numpad/.test(code)) acts[code](); }
  }

  // =========================================================================
  // 레이어: 모달 · 메뉴 · 토스트 · 툴팁
  // =========================================================================
  const layer = $('#layer');
  const stack = [];
  const topLayer = () => stack[stack.length - 1];

  function openModal(o) {
    const scrim = h(`<div class="scrim"><div class="modal ${o.cls || ''}">${o.html}</div></div>`);
    const m = { type: 'modal', scrim, el: scrim.firstElementChild, onKey: o.onKey, closed: false };
    m.close = (val) => {
      if (m.closed) return;
      m.closed = true; scrim.remove();
      const k = stack.indexOf(m); if (k >= 0) stack.splice(k, 1);
      if (o.onClose) o.onClose(val);
      if (!stack.length) cv.focus({ preventScroll: true });
    };
    if (o.dismiss !== false) scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) m.close(); });
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.close(); });
    hideTip();
    layer.appendChild(scrim);
    stack.push(m);
    setTimeout(() => { const f = m.el.querySelector('[autofocus]'); if (f) { f.focus(); if (f.select) f.select(); } }, 40);
    return m;
  }

  const head = (icn, title, sub) => `<div class="modal-head"><span class="mi">${ic(icn)}</span><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    <button class="icon-btn x" data-close>${ic('x')}</button></div>`;

  function confirmBox(o) {
    return new Promise((resolve) => {
      let val = false;
      const m = openModal({
        html: `${head(o.icon || 'info', o.title, '')}<div class="modal-body" style="padding-top:2px"><p style="margin:0;color:var(--text-2);line-height:1.65">${o.text}</p>${o.extra || ''}</div>
          <div class="modal-foot"><span class="grow"></span><button class="btn ghost" data-close>${o.cancel || '취소'}</button>
          <button class="btn ${o.danger ? 'danger' : 'primary'}" data-ok>${o.ok || '확인'}</button></div>`,
        onClose: () => resolve(val),
      });
      if (o.danger) {
        m.onKey = (e) => { if (e.key === 'Enter') { val = true; m.close(); return true; } return false; };
      }
      m.el.querySelector('[data-ok]').addEventListener('click', () => { val = true; m.close(); });
    });
  }

  function showWarnings(list) {
    openModal({
      html: `${head('alert', '확인할 점', '데이터 폴더를 열면서 찾은 내용이에요. 작업은 계속할 수 있어요.')}
        <div class="modal-body"><ul class="glist one">${list.map((w) => `<li><span class="b" style="background:var(--warn-soft);color:var(--warn)">${ic('alert')}</span><span>${esc(w)}</span></li>`).join('')}</ul></div>
        <div class="modal-foot"><span class="grow"></span><button class="btn primary" data-close>확인</button></div>`,
    });
  }

  function closeMenus() { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].type === 'menu') stack[k].close(); }

  function placePop(el, x, y) {
    const r = el.getBoundingClientRect();
    el.style.left = clamp(x, 8, window.innerWidth - r.width - 8) + 'px';
    el.style.top = (y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y) + 'px';
  }

  function openPop(el, x, y, onClose) {
    closeMenus(); hideTip();
    layer.appendChild(el);
    placePop(el, x, y);
    const m = { type: 'menu', el, closed: false };
    const outside = (ev) => { if (!el.contains(ev.target)) m.close(); };
    m.close = (v) => {
      if (m.closed) return;
      m.closed = true; el.remove();
      document.removeEventListener('mousedown', outside, true);
      const k = stack.indexOf(m); if (k >= 0) stack.splice(k, 1);
      if (onClose) onClose(v);
    };
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    stack.push(m);
    return m;
  }

  function openMenu(x, y, items) {
    const el = h('<div class="menu"></div>');
    let m = null;
    items.forEach((it) => {
      if (it.sep) { el.appendChild(h('<div class="msep"></div>')); return; }
      if (it.title) { el.appendChild(h(`<div class="mlabel">${esc(it.title)}</div>`)); return; }
      const lead = it.icon ? ic(it.icon, 'sm') : it.swatch ? `<i class="sw" style="background:${it.swatch}"></i>` : '<i class="sw" style="background:transparent"></i>';
      const b = h(`<button class="mi ${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${lead}<span>${esc(it.label)}</span>${it.kbd ? `<span class="k">${esc(it.kbd)}</span>` : ''}</button>`);
      b.addEventListener('click', () => { m.close(); if (it.act) it.act(); });
      el.appendChild(b);
    });
    m = openPop(el, x, y);
    return m;
  }

  function pickClass(x, y, current) {
    return new Promise((resolve) => {
      const names = S.ds ? S.ds.class_names : [];
      const el = h(`<div class="menu" style="width:270px"><label class="search">${ic('search', 'sm')}<input placeholder="클래스 검색 · 번호" spellcheck="false"></label><div class="pick-list"></div></div>`);
      const list = el.querySelector('.pick-list'), inp = el.querySelector('input');
      let shown = [], act = 0, chosen = null;
      function render() {
        const q = inp.value.trim().toLowerCase();
        shown = names.map((n, i) => i).filter((i) => !q || names[i].toLowerCase().includes(q) || String(i + 1).startsWith(q));
        act = clamp(act, 0, Math.max(0, shown.length - 1));
        list.innerHTML = shown.map((i, k) => `<button class="mi ${k === act ? 'act' : ''}" data-k="${k}"><i class="sw" style="background:${colorOf(i)}"></i><span>${esc(names[i])}</span><span class="k">${keyOf(i)}</span></button>`).join('')
          || '<div class="mlabel">맞는 클래스가 없어요</div>';
        const a = list.querySelector('.mi.act'); if (a) a.scrollIntoView({ block: 'nearest' });
      }
      const m = openPop(el, x, y, () => resolve(chosen));
      m.onKey = () => false;
      inp.addEventListener('input', () => { act = 0; render(); });
      inp.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown') { act++; render(); } else if (e.key === 'ArrowUp') { act--; render(); } else if (e.key === 'Enter') { if (shown.length) { chosen = shown[act]; m.close(); } } else if (e.key === 'Escape') { m.close(); } else return;
        e.preventDefault(); e.stopPropagation();
      });
      list.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { chosen = shown[+b.dataset.k]; m.close(); } });
      act = Math.max(0, names.indexOf(names[current]));
      render();
      placePop(el, x, y);
      setTimeout(() => inp.focus(), 20);
    });
  }

  function boxMenu(e, p) {
    if (!S.img) return;
    const [ix, iy] = c2i(p.x, p.y);
    const cands = S.hide ? [] : boxesAt(ix, iy);
    if (!cands.length) {
      openMenu(e.clientX, e.clientY, [
        { label: '화면에 맞추기', icon: 'fit', kbd: 'F', act: fit },
        { label: S.clip.length ? `붙여넣기 (${S.clip.length}개)` : '붙여넣기', icon: 'copy', kbd: 'Ctrl+V', act: paste, disabled: !S.clip.length },
        { label: '앞 이미지 박스 가져오기', icon: 'layers', kbd: 'Ctrl+Shift+V', act: pastePrev },
      ]);
      return;
    }
    const idx = cands.includes(S.sel) ? S.sel : cands[0];
    select(idx);
    openMenu(e.clientX, e.clientY, [
      { title: `박스 ${idx + 1} · ${className(S.boxes[idx].cls)}` },
      { label: '클래스 바꾸기…', icon: 'tag', kbd: '더블클릭', act: () => pickClassFor(idx, e.clientX, e.clientY) },
      { label: '복사', icon: 'copy', kbd: 'Ctrl+C', act: copyBoxes },
      { sep: true },
      { label: '지우기', icon: 'trash', kbd: 'Del', danger: true, act: () => deleteBox(idx) },
    ]);
  }

  function dsMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const others = (S.recent || []).filter((x) => !S.ds || x.path !== S.ds.root).slice(0, 5);
    const items = [
      { label: '데이터 폴더 열기…', icon: 'folder', kbd: 'Ctrl+O', act: openFolderFlow },
      { label: '새 데이터 폴더 만들기…', icon: 'folderPlus', act: openNewDataset },
      { label: '예제로 체험하기', icon: 'sparkles', act: () => sampleFlow(true) },
    ];
    if (S.ds) {
      items.push({ sep: true },
        { label: '이미지 파일 추가…', icon: 'plus', act: addImages },
        { label: '이미지 폴더째로 추가…', icon: 'images', act: addImageFolder },
        { sep: true },
        { label: '탐색기에서 열기', icon: 'open', act: () => call('open_path', S.ds.root) },
        { label: '클래스·라벨 다시 읽기', icon: 'refresh', kbd: 'F5', act: reloadDataset },
        { label: '시작 화면 보기', icon: 'book', act: () => showWelcome(true) });
    }
    if (others.length) {
      items.push({ sep: true }, { title: '최근 연 폴더' });
      others.forEach((o) => items.push({ label: o.name, icon: 'folder', act: () => openPath(o.path), disabled: !o.exists }));
    }
    openMenu(r.left, r.bottom + 6, items);
  }

  function addMenu(anchor) {
    if (!S.ds) { toast('먼저 데이터 폴더를 열어 주세요', 'info'); return; }
    const r = anchor.getBoundingClientRect();
    openMenu(r.left, r.bottom + 6, [
      { label: '이미지 파일 추가…', icon: 'plus', act: addImages },
      { label: '이미지 폴더째로 추가…', icon: 'images', act: addImageFolder },
    ]);
  }

  // ---------- 토스트 ----------
  function toast(msg, kind, o) {
    kind = kind || 'ok'; o = o || {};
    const icons = { ok: 'check', warn: 'alert', err: 'alert', info: 'info' };
    const el = h(`<div class="toast ${kind}"><span class="ti">${ic(icons[kind] || 'info')}</span><span class="msg">${esc(msg)}</span></div>`);
    if (o.action) {
      const b = h(`<button class="btn sm act">${esc(o.action[0])}</button>`);
      b.addEventListener('click', () => { o.action[1](); dismiss(); });
      el.appendChild(b);
    }
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild.remove();
    let timer = setTimeout(dismiss, o.ms || 2600);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1500); });
    function dismiss() { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 220); }
    return { dismiss };
  }

  // ---------- 툴팁 ----------
  let tipTimer = 0, tipEl = null, tipTarget = null;
  function bindTooltips() {
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (t === tipTarget) return;
      hideTip();
      if (!t) return;
      tipTarget = t;
      tipTimer = setTimeout(() => showTip(t), 420);
    });
    document.addEventListener('mousedown', hideTip, true);
    document.addEventListener('keydown', hideTip, true);
  }
  function showTip(t) {
    if (!document.body.contains(t)) return;
    const r = t.getBoundingClientRect();
    tipEl = h(`<div class="tip">${esc(t.dataset.tip)}${t.dataset.key ? `<kbd>${esc(t.dataset.key)}</kbd>` : ''}</div>`);
    document.body.appendChild(tipEl);
    const tr = tipEl.getBoundingClientRect();
    let y = r.bottom + 8;
    if (y + tr.height > window.innerHeight - 6) y = r.top - tr.height - 8;
    tipEl.style.left = clamp(r.left + r.width / 2 - tr.width / 2, 6, window.innerWidth - tr.width - 6) + 'px';
    tipEl.style.top = y + 'px';
  }
  function hideTip() { clearTimeout(tipTimer); tipTarget = null; if (tipEl) { tipEl.remove(); tipEl = null; } }

  // =========================================================================
  // 대화상자들
  // =========================================================================
  function tagInput(box, initial) {
    const names = initial.slice();
    function render() {
      box.innerHTML = names.map((n, i) => `<span class="tag"><i style="background:${colorOf(i)}"></i>${esc(n)}<button type="button" data-rm="${i}">${ic('x', 'sm')}</button></span>`).join('')
        + `<input placeholder="${names.length ? '클래스 추가' : '예: plastic'} · Enter" spellcheck="false">`;
      box.querySelector('input').addEventListener('keydown', onk);
    }
    function addFrom(v) { v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).forEach((s) => { if (!names.includes(s)) names.push(s); }); }
    function onk(e) {
      if (e.isComposing || e.keyCode === 229) return;
      const v = e.target.value.trim();
      if ((e.key === 'Enter' || e.key === ',') && v) { e.preventDefault(); e.stopPropagation(); addFrom(v); render(); box.querySelector('input').focus(); }
      else if (e.key === 'Backspace' && !e.target.value && names.length) { names.pop(); render(); box.querySelector('input').focus(); }
    }
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) { names.splice(+b.dataset.rm, 1); render(); }
      box.querySelector('input').focus();
    });
    render();
    return { get: () => { const v = box.querySelector('input').value.trim(); if (v) addFrom(v); return names.slice(); } };
  }

  function classSetupDialog(root) {
    return new Promise((resolve) => {
      let out = null;
      const m = openModal({
        cls: 'wide',
        html: `${head('tag', '클래스를 정해 주세요', `이 폴더에서 클래스 파일(data.yaml · classes.txt · annotations.json)을 찾지 못했어요.<br>입력한 순서대로 <b>classes.txt</b>를 만들어서 써요.`)}
          <div class="modal-body"><div class="field"><span class="lbl">클래스 목록</span><div class="tagbox" id="csTags"></div>
          <div class="help">첫 번째가 0번(숫자키 1), 두 번째가 1번(숫자키 2)이에요. 쉼표로 여러 개를 한 번에 넣을 수 있어요.</div></div>
          <div class="path-box" style="margin:0">${esc(root)}\\classes.txt</div></div>
          <div class="modal-foot"><span class="grow"></span><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>classes.txt 만들고 열기</button></div>`,
        onClose: () => resolve(out),
      });
      const tags = tagInput(m.el.querySelector('#csTags'), ['plastic', 'can', 'paper', 'general']);
      m.el.querySelector('[data-ok]').addEventListener('click', () => {
        const v = tags.get();
        if (!v.length) { toast('클래스를 하나 이상 넣어 주세요', 'warn'); return; }
        out = v; m.close();
      });
    });
  }

  function openNewDataset() {
    const st = { parent: '', add: true };
    const last = S.settings.last_dataset || '';
    const cut = Math.max(last.lastIndexOf('\\'), last.lastIndexOf('/'));
    if (cut > 2) st.parent = last.slice(0, cut);
    const m = openModal({
      cls: 'wide',
      html: `${head('folderPlus', '새 데이터 폴더 만들기', 'images/ · labels/ · classes.txt 가 들어 있는 규격 폴더를 만들어요.')}
        <div class="modal-body">
          <div class="field"><span class="lbl">만들 위치</span><div class="row-input"><input class="input" id="ndParent" value="${esc(st.parent)}" placeholder="[찾아보기]로 폴더를 골라 주세요" spellcheck="false">
            <button class="btn" data-act="pick">${ic('folder', 'sm')} 찾아보기</button></div></div>
          <div class="field"><span class="lbl">폴더 이름</span><input class="input" id="ndName" value="my-dataset" spellcheck="false" autofocus></div>
          <div class="field"><span class="lbl">클래스</span><div class="tagbox" id="ndTags"></div><div class="help">입력하고 Enter. 순서대로 숫자키 1, 2, 3… 이 돼요.</div></div>
          <div class="setting" style="border:0;padding-bottom:0"><div class="tx"><b>만든 뒤 바로 이미지 추가하기</b><small>이미지 파일을 골라서 images 폴더로 복사해요</small></div>
            <label class="toggle"><input type="checkbox" id="ndAdd" checked><span></span></label></div>
        </div>
        <div class="modal-foot"><span class="grow"></span><button class="btn ghost" data-close>취소</button><button class="btn primary" data-act="create">${ic('check', 'sm')} 만들기</button></div>`,
    });
    const tags = tagInput(m.el.querySelector('#ndTags'), ['plastic', 'can', 'paper', 'general']);
    m.el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'pick') {
        const r = await call('pick_folder', m.el.querySelector('#ndParent').value);
        if (r.ok && r.path) m.el.querySelector('#ndParent').value = r.path;
      } else if (a.dataset.act === 'create') {
        const parent = m.el.querySelector('#ndParent').value.trim(), name = m.el.querySelector('#ndName').value.trim();
        const names = tags.get(), add = m.el.querySelector('#ndAdd').checked;
        if (!parent) { toast('만들 위치를 골라 주세요', 'warn'); return; }
        if (!names.length) { toast('클래스를 하나 이상 넣어 주세요', 'warn'); return; }
        const r = await call('create_dataset', parent, name, names);
        if (!r.ok) { toast(r.error, 'err', { ms: 6000 }); return; }
        m.close();
        const ok = await openPath(r.path);
        if (ok) { toast('새 데이터 폴더를 만들었어요', 'ok'); if (add) addImages(); }
      }
    });
  }

  function openGoto() {
    if (!S.images.length) return;
    const m = openModal({
      html: `${head('arrowRight', '번호로 이동', `1 ~ ${S.images.length} 사이의 번호를 넣어 주세요.`)}
        <div class="modal-body"><input class="input" id="gtNum" type="number" min="1" max="${S.images.length}" value="${S.index + 1}" autofocus></div>
        <div class="modal-foot"><span class="grow"></span><button class="btn ghost" data-close>취소</button><button class="btn primary" data-go>이동</button></div>`,
    });
    m.el.querySelector('[data-go]').addEventListener('click', () => {
      const v = parseInt(m.el.querySelector('#gtNum').value, 10);
      if (v >= 1 && v <= S.images.length) { m.close(); goTo(v - 1); } else toast('범위 안의 번호를 넣어 주세요', 'warn');
    });
  }

  // ---------- 설정 ----------
  function openSettings() {
    const s = S.settings;
    const m = openModal({
      cls: 'wide',
      html: `${head('sliders', '설정', '바꾸면 바로 적용되고 저장돼요.')}<div class="modal-body" id="setBody"></div>
        <div class="modal-foot"><span class="grow"></span><button class="btn primary" data-close>완료</button></div>`,
    });
    const body = m.el.querySelector('#setBody');
    const toggleRow = (k, t, sub) => `<div class="setting"><div class="tx"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div>
      <label class="toggle"><input type="checkbox" data-tg="${k}" ${s[k] ? 'checked' : ''}><span></span></label></div>`;
    const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button class="${s[k] === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    function render() {
      body.innerHTML = `
        <div class="section-title">화면</div>
        <div class="setting"><div class="tx"><b>테마</b><small>시스템을 고르면 Windows 설정을 따라가요</small></div>${seg('theme', [['system', '시스템'], ['light', '라이트'], ['dark', '다크']])}</div>
        ${toggleRow('show_names', '박스 위에 클래스 이름 표시', '')}
        ${toggleRow('show_crosshair', '십자 안내선', '마우스 위치를 가로·세로 점선으로 보여줘요')}
        <div class="setting"><div class="tx"><b>박스 채우기 진하기</b></div><div class="slider"><input type="range" min="0" max="0.5" step="0.02" value="${Number(s.fill_opacity)}" data-range="fill_opacity"><span>${Math.round(Number(s.fill_opacity) * 100)}%</span></div></div>
        <div class="setting"><div class="tx"><b>박스 선 두께</b></div><div class="slider"><input type="range" min="1" max="5" step="1" value="${Number(s.line_width)}" data-range="line_width"><span>${Number(s.line_width)}px</span></div></div>
        <div class="section-title">작업</div>
        ${toggleRow('ask_class_after_draw', '박스를 그린 뒤 클래스 선택창 띄우기', '클래스가 많을 때 편해요')}
        <div class="setting"><div class="tx"><b>기본 내보내기 형식</b><small>내보내기 창에서 처음 골라져 있는 형식</small></div>${seg('export_format', [['yolo', 'YOLO'], ['coco', 'COCO']])}</div>
        <div class="section-title">도움말 · 정보</div>
        <div class="setting"><div class="tx"><b>사용 가이드</b><small>움직이는 그림으로 다시 보기</small></div><button class="btn sm" data-act="guide">${ic('book', 'sm')} 열기</button></div>
        <div class="setting"><div class="tx"><b>예제 체험 투어</b><small>샘플 데이터로 따라 하면서 익히기</small></div><button class="btn sm" data-act="tour">${ic('sparkles', 'sm')} 시작</button></div>
        <div class="setting"><div class="tx"><b>줍줍 라벨러 v${esc(S.version)}</b><small>설정·오류 기록 폴더: ${esc(S.home)}</small></div><button class="btn sm" data-act="home">${ic('open', 'sm')} 열기</button></div>`;
    }
    let timer = 0;
    function save(patch, quiet) {
      Object.assign(S.settings, patch);
      applyTheme(); requestDraw();
      clearTimeout(timer);
      timer = setTimeout(() => call('save_settings', patch), quiet ? 250 : 0);
    }
    body.addEventListener('click', (e) => {
      const sb = e.target.closest('.seg button');
      if (sb) { save({ [sb.parentElement.dataset.seg]: sb.dataset.v }); render(); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'guide') { m.close(); openGuide(0); }
      if (a.dataset.act === 'tour') { m.close(); tourFromAnywhere(); }
      if (a.dataset.act === 'home') call('open_path', S.home);
    });
    body.addEventListener('change', (e) => { const k = e.target.dataset.tg; if (k) save({ [k]: e.target.checked }); });
    body.addEventListener('input', (e) => {
      const k = e.target.dataset.range; if (!k) return;
      const v = parseFloat(e.target.value);
      e.target.nextElementSibling.textContent = k === 'line_width' ? v + 'px' : Math.round(v * 100) + '%';
      save({ [k]: v }, true);
    });
    render();
  }

  // ---------- 내보내기 ----------
  async function openExport() {
    if (!S.ds) { toast('먼저 데이터 폴더를 열어 주세요', 'info'); return; }
    await S.saveChain;
    const d = await call('default_export_dir');
    const st = {
      fmt: S.settings.export_format === 'coco' ? 'coco' : 'yolo',
      inc: ['labeled_or_reviewed', 'reviewed', 'all'].includes(S.settings.export_include) ? S.settings.export_include : 'labeled_or_reviewed',
      copy: S.settings.copy_images_on_export !== false,
      out: (d && d.path) || '',
    };
    const counts = { labeled_or_reviewed: 0, reviewed: 0, all: S.images.length };
    S.images.forEach((im) => { if (im.reviewed || im.count != null) counts.labeled_or_reviewed++; if (im.reviewed) counts.reviewed++; });
    let poll = 0, result = null;
    const m = openModal({
      cls: 'wide',
      html: `${head('export', '내보내기', '학습에 쓸 데이터셋을 새 폴더로 만들어요. 원본 데이터 폴더는 바뀌지 않아요.')}
        <div class="modal-body" id="exBody"></div><div class="modal-foot" id="exFoot"></div>`,
      onClose: () => clearTimeout(poll),
    });
    const body = m.el.querySelector('#exBody'), foot = m.el.querySelector('#exFoot');
    const INC = [['labeled_or_reviewed', '라벨이 있거나 확인(✔)한 이미지', '추천 · 아직 안 본 빈 이미지는 빼요'],
      ['reviewed', '사람이 확인(✔)한 이미지만', 'AI 라벨 중 검수한 것만 담고 싶을 때'],
      ['all', '모든 이미지', '라벨이 없는 이미지는 배경(물체 없음)으로 들어가요']];
    function form() {
      body.innerHTML = `
        <div class="field"><span class="lbl">형식</span><div class="fmt-cards">
          <button class="fmt ${st.fmt === 'yolo' ? 'on' : ''}" data-fmt="yolo"><span class="check">${st.fmt === 'yolo' ? ic('check', 'sm') : ''}</span>
            <h3>YOLO <small>기본</small></h3><p>Ultralytics에 data.yaml만 넘기면 바로 학습해요.</p>
            <div class="tree">yolo_날짜_시간/
├─ <span class="f">images/</span>
├─ <span class="f">labels/</span>    <span class="c">txt</span>
├─ data.yaml
└─ classes.txt</div></button>
          <button class="fmt ${st.fmt === 'coco' ? 'on' : ''}" data-fmt="coco"><span class="check">${st.fmt === 'coco' ? ic('check', 'sm') : ''}</span>
            <h3>COCO</h3><p>bbox = [x, y, 너비, 높이] 픽셀 · id는 1부터</p>
            <div class="tree">coco_날짜_시간/
├─ <span class="f">images/</span>    <span class="c">선택</span>
├─ annotations.json
└─ classes.txt</div></button>
        </div></div>
        ${st.fmt === 'coco' ? `<div class="setting" style="margin-top:-4px"><div class="tx"><b>이미지 파일도 함께 복사</b><small>끄면 annotations.json만 만들고, file_name은 원본 images 폴더 기준이에요</small></div>
          <label class="toggle"><input type="checkbox" id="exCopy" ${st.copy ? 'checked' : ''}><span></span></label></div>` : ''}
        <div class="field" style="margin-top:6px"><span class="lbl">담을 이미지</span><div class="opt-list">
          ${INC.map(([k, t, sub]) => `<div class="opt ${st.inc === k ? 'on' : ''}" data-inc="${k}"><span class="radio"></span><span class="tx"><b>${t}</b><small>${sub}</small></span><span class="n">${counts[k]}장</span></div>`).join('')}
        </div></div>
        <div class="field"><span class="lbl">저장 위치</span><div class="row-input"><input class="input" id="exOut" value="${esc(st.out)}" spellcheck="false">
          <button class="btn" data-act="pick">${ic('folder', 'sm')} 바꾸기</button></div>
          <div class="help">이 안에 <b>${st.fmt}_날짜_시간</b> 폴더가 새로 생겨요.</div></div>`;
      foot.innerHTML = `<span class="grow"></span><button class="btn ghost" data-close>취소</button>
        <button class="btn primary" data-act="run" ${counts[st.inc] ? '' : 'disabled'}>${ic('export', 'sm')} ${counts[st.inc]}장 내보내기</button>`;
    }
    body.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-fmt]'); if (f) { st.fmt = f.dataset.fmt; form(); return; }
      const o = e.target.closest('[data-inc]'); if (o) { st.inc = o.dataset.inc; form(); return; }
      const a = e.target.closest('[data-act="pick"]');
      if (a) { const r = await call('pick_folder', st.out); if (r.ok && r.path) { st.out = r.path; form(); } }
    });
    body.addEventListener('change', (e) => { if (e.target.id === 'exCopy') st.copy = e.target.checked; });
    body.addEventListener('input', (e) => { if (e.target.id === 'exOut') st.out = e.target.value; });
    foot.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'run') run();
      else if (act === 'cancel') { a.disabled = true; call('export_cancel'); }
      else if (act === 'open' && result) call('open_path', result.path);
      else if (act === 'again') form();
    });
    async function run() {
      const r = await call('export_start', st.fmt, st.inc, st.copy, st.out);
      if (!r.ok) { toast(r.error, 'err', { ms: 6000 }); return; }
      Object.assign(S.settings, { export_format: st.fmt, export_include: st.inc, copy_images_on_export: st.copy });
      body.innerHTML = `<div style="padding:28px 4px 8px"><div style="display:flex;justify-content:space-between;margin-bottom:10px;font-weight:650">
        <span>${st.fmt.toUpperCase()}로 내보내는 중…</span><span class="num" id="exNum">0 / ${counts[st.inc]}</span></div>
        <div class="progress"><i id="exBar"></i></div><p style="color:var(--muted);font-size:12.5px;margin:12px 0 0">이미지를 복사하고 라벨을 변환하고 있어요.</p></div>`;
      foot.innerHTML = '<span class="grow"></span><button class="btn" data-act="cancel">취소</button>';
      tick();
    }
    async function tick() {
      const s = await call('export_status');
      if (m.closed) return;
      const bar = body.querySelector('#exBar'), num = body.querySelector('#exNum');
      if (s.total && bar) { bar.style.width = (s.done * 100) / s.total + '%'; num.textContent = `${s.done} / ${s.total}`; }
      if (!s.finished) { poll = setTimeout(tick, 120); return; }
      if (s.error) {
        body.innerHTML = `<div class="done-view"><div class="done-check" style="background:var(--danger-soft);color:var(--danger)">${ic('alert')}</div>
          <h2 style="margin:0;font-size:18px">${esc(s.error)}</h2></div>`;
        foot.innerHTML = '<span class="grow"></span><button class="btn ghost" data-close>닫기</button><button class="btn primary" data-act="again">다시 설정</button>';
        return;
      }
      result = s.result;
      const sm = result.summary;
      body.innerHTML = `<div class="done-view"><div class="done-check">${ic('check')}</div>
        <h2 style="margin:0;font-size:21px;letter-spacing:-.02em">내보내기 완료!</h2>
        <p style="color:var(--muted);margin:6px 0 0">${st.fmt.toUpperCase()} 데이터셋을 새 폴더로 만들었어요.</p>
        <div class="stats"><div><b>${sm.images}</b><small>이미지</small></div><div><b>${sm.boxes}</b><small>박스</small></div><div><b>${S.ds.class_names.length}</b><small>클래스</small></div></div>
        <div class="path-box">${esc(result.path)}</div>
        ${sm.skipped_unknown ? `<p class="help" style="color:var(--warn)">클래스 번호가 범위를 벗어나 뺀 박스 ${sm.skipped_unknown}개</p>` : ''}
        ${sm.unreadable ? `<p class="help" style="color:var(--warn)">읽지 못해 뺀 이미지 ${sm.unreadable}장</p>` : ''}</div>`;
      foot.innerHTML = `<span class="grow"></span><button class="btn ghost" data-close>닫기</button><button class="btn primary" data-act="open">${ic('open', 'sm')} 결과 폴더 열기</button>`;
      emit('exported');
    }
    form();
  }

  // ---------- 사용 가이드 ----------
  function openGuide(start) {
    const steps = window.Guide.steps;
    let cur = typeof start === 'string' ? Math.max(0, steps.findIndex((s) => s.id === start)) : (start || 0);
    const seen = new Set();
    const m = openModal({
      cls: 'xl',
      html: `<div class="guide"><nav class="guide-nav">
          <div class="gh"><img src="img/logo.svg" alt=""><div><b>사용 가이드</b><small>움직이는 그림으로 배워요</small></div></div>
          ${steps.map((s, i) => `<button class="gstep" data-g="${i}"><span class="n">${i === 0 ? '★' : i}</span>${s.nav}</button>`).join('')}
          <span style="flex:1;min-height:12px"></span>
          <button class="btn" data-act="tour" style="margin:0 4px">${ic('sparkles', 'sm')} 예제로 직접 해보기</button>
        </nav>
        <div class="guide-main"><div class="guide-body"><div class="guide-stage" id="gStage"></div><div class="guide-text" id="gText"></div></div>
          <div class="guide-foot"><div class="dots" id="gDots">${steps.map(() => '<i></i>').join('')}</div><span style="flex:1"></span>
            <button class="btn ghost" data-close>닫기</button>
            <button class="btn" data-act="prev">${ic('left', 'sm')} 이전</button>
            <button class="btn primary" data-act="next">다음 ${ic('right', 'sm')}</button></div></div></div>`,
      onKey: (e) => {
        if (e.key === 'ArrowRight') { show(cur + 1); return true; }
        if (e.key === 'ArrowLeft') { show(cur - 1); return true; }
        return false;
      },
    });
    const stageEl = m.el.querySelector('#gStage'), textEl = m.el.querySelector('#gText');
    function show(i) {
      cur = clamp(i, 0, steps.length - 1);
      seen.add(cur);
      const { art, text } = window.Guide.stepHTML(cur);
      stageEl.innerHTML = art;
      stageEl.classList.toggle('is-shot', steps[cur].id === 'overview');
      textEl.innerHTML = text;
      m.el.querySelectorAll('.gstep').forEach((b, k) => { b.classList.toggle('on', k === cur); b.classList.toggle('seen', seen.has(k) && k !== cur); });
      m.el.querySelectorAll('#gDots i').forEach((d, k) => d.classList.toggle('on', k === cur));
      m.el.querySelector('[data-act="prev"]').disabled = cur === 0;
      const nx = m.el.querySelector('[data-act="next"]');
      nx.innerHTML = cur === steps.length - 1 ? `${ic('check', 'sm')} 시작하기` : `다음 ${ic('right', 'sm')}`;
      m.el.querySelector('.guide-body').scrollTop = 0;
    }
    m.el.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]'); if (g) { show(+g.dataset.g); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'prev') show(cur - 1);
      if (a.dataset.act === 'next') { if (cur === steps.length - 1) m.close(); else show(cur + 1); }
      if (a.dataset.act === 'tour') { m.close(); tourFromAnywhere(); }
    });
    show(cur);
    return m;
  }

  // =========================================================================
  // 체험 투어 (예제 데이터 위에서 따라 하기)
  // =========================================================================
  const TOUR = [
    { target: '#classList', place: 'left', title: '클래스를 골라요', text: '숫자키 <kbd>1</kbd>~<kbd>4</kbd>를 누르거나 목록을 클릭해요. 지금은 <b>plastic</b>(1번)을 골라 보세요.', wait: 'class', waitText: '숫자키나 클릭을 기다리는 중…' },
    { target: '#stage', place: 'inside', pad: -10, title: '드래그해서 박스 그리기', text: '물체의 한쪽 모서리에서 반대쪽 모서리까지 <b>끌어서</b> 감싸 보세요. 마우스 휠로 확대하면 더 정확해요.', wait: 'boxCreated', waitText: '박스를 그려 보세요…' },
    { target: '#rightPanel', place: 'left', title: '고치기도 쉬워요', text: '박스를 클릭하면 선택돼요. <b>모서리</b>를 끌면 크기, <b>안쪽</b>을 끌면 위치, <b>숫자키</b>를 누르면 클래스가 바뀌어요. 나머지 물체도 그려 보세요.' },
    { target: '#btnNext', place: 'bottom', title: '다음 이미지로', text: '<kbd>D</kbd>(또는 →)를 누르면 저장하고 다음 이미지로 가요. 본 이미지에는 <b>✔</b>가 붙어요.', wait: 'navigate', waitText: 'D 를 눌러 보세요…' },
    { target: '#leftPanel', place: 'right', title: 'AI 라벨 검수', text: '<b>◐</b> 표시는 AI·기존 라벨만 있고 아직 사람이 안 본 이미지예요. <b>park_04 ~ 06</b>에는 일부러 틀린 라벨을 넣어 뒀어요. 찾아서 고쳐 보세요!' },
    { target: '#btnExport', place: 'bottom-left', title: '다 하면 내보내기', text: 'YOLO 또는 COCO 데이터셋으로 내보내요. 막히면 언제든 <kbd>F1</kbd>로 가이드를 열어 보세요. 즐거운 라벨링 되세요!' },
  ];
  const tour = { on: false, i: 0, ring: null, card: null, timer: 0 };

  function tourFromAnywhere() {
    if (S.ds && S.ds.name.startsWith(SAMPLE_PREFIX) && S.images.length) startTour();
    else sampleFlow(true);
  }

  function startTour() {
    endTour(false);
    tour.on = true;
    tour.ring = h('<div class="tour-ring"></div>');
    tour.card = h('<div class="tour-card"></div>');
    document.body.append(tour.ring, tour.card);
    tour.card.addEventListener('click', (e) => {
      const a = e.target.closest('[data-t]'); if (!a) return;
      if (a.dataset.t === 'skip') endTour(true);
      else if (a.dataset.t === 'next') tourGo(tour.i + 1);
    });
    window.addEventListener('resize', tourPlace);
    tourGo(0);
  }

  function tourGo(i) {
    clearTimeout(tour.timer);
    if (!tour.on) return;
    if (i >= TOUR.length) { endTour(true); toast('체험 투어를 마쳤어요!', 'ok'); return; }
    tour.i = i;
    const st = TOUR[i];
    tour.card.innerHTML = `<div class="step">STEP ${i + 1} / ${TOUR.length}</div><h3>${st.title}</h3><p>${st.text}</p>
      ${st.wait ? `<div class="wait"><i></i><span>${st.waitText}</span></div>` : ''}
      <div class="tf"><button class="btn ghost sm" data-t="skip">투어 끝내기</button><span class="grow"></span>
      ${st.wait ? '<button class="btn sm" data-t="next">건너뛰기</button>' : `<button class="btn primary sm" data-t="next">${i === TOUR.length - 1 ? '시작하기' : '다음'}</button>`}</div>`;
    tour.card.style.animation = 'none'; void tour.card.offsetWidth; tour.card.style.animation = '';
    tourPlace();
  }

  function tourPlace() {
    if (!tour.on) return;
    const st = TOUR[tour.i], t = $(st.target);
    if (!t) return;
    const r = t.getBoundingClientRect(), pad = st.pad != null ? st.pad : 6;
    Object.assign(tour.ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const c = tour.card.getBoundingClientRect();
    let x = r.left, y = r.bottom + 16;
    if (st.place === 'left') { x = r.left - c.width - 20; y = r.top + 20; }
    else if (st.place === 'right') { x = r.right + 20; y = r.top + 60; }
    else if (st.place === 'bottom') { x = r.left + r.width / 2 - c.width / 2; y = r.bottom + 16; }
    else if (st.place === 'bottom-left') { x = r.right - c.width; y = r.bottom + 16; }
    else if (st.place === 'inside') { x = r.left + 28; y = r.top + 74; }
    tour.card.style.left = clamp(x, 10, window.innerWidth - c.width - 10) + 'px';
    tour.card.style.top = clamp(y, 10, window.innerHeight - c.height - 10) + 'px';
  }

  function endTour(save) {
    clearTimeout(tour.timer);
    tour.on = false;
    if (tour.ring) tour.ring.remove();
    if (tour.card) tour.card.remove();
    tour.ring = tour.card = null;
    window.removeEventListener('resize', tourPlace);
    if (save) { S.settings.tour_done = true; call('save_settings', { tour_done: true }); }
  }

  // 지금 단계가 기다리는 행동이면 칭찬하고 다음으로, 뒤 단계의 행동을 먼저 했으면 그 단계 뒤로 건너뜁니다.
  ['class', 'boxCreated', 'navigate', 'classChanged', 'exported'].forEach((ev) => bus.addEventListener(ev, () => {
    if (!tour.on) return;
    let k = -1;
    for (let j = tour.i; j < TOUR.length; j++) if (TOUR[j].wait === ev) { k = j; break; }
    if (k < 0) return;
    if (k === tour.i) {
      const w = tour.card.querySelector('.wait');
      if (w) w.innerHTML = `<span style="color:var(--accent);display:inline-flex;gap:6px;align-items:center;font-weight:700">${ic('check', 'sm')} 잘했어요!</span>`;
    }
    clearTimeout(tour.timer);
    tour.timer = setTimeout(() => tourGo(k + 1), k === tour.i ? 750 : 250);
  }));

  // 개발·테스트용으로 몇 가지 함수를 밖에서 부를 수 있게 둡니다.
  window.__jjApp = { openPath, goTo, step, setClass, select, openGuide, openExport, openSettings, startTour, endTour, fit, zoomAt, toast, sampleFlow, showWelcome, reloadDataset, openNewDataset };

  init();
})();
