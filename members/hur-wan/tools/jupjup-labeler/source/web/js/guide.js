/* 줍줍 라벨러 — 사용 가이드: 움직이는 그림(SVG 애니메이션)과 설명 */
(function () {
  let uid = 0;
  const A = (attr, values, times, dur, extra) =>
    `<animate attributeName="${attr}" values="${values.join(';')}" keyTimes="${times.join(';')}" dur="${dur}s" repeatCount="indefinite" ${extra || ''}/>`;
  const T = (type, values, times, dur, extra) =>
    `<animateTransform attributeName="transform" type="${type}" values="${values.join(';')}" keyTimes="${times.join(';')}" dur="${dur}s" repeatCount="indefinite" ${extra || ''}/>`;

  function defs(p) {
    return `<defs>
      <linearGradient id="${p}grass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6aa64e"/><stop offset="1" stop-color="#3c7333"/></linearGradient>
      <linearGradient id="${p}grass2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa957"/><stop offset="1" stop-color="#4a7c3a"/></linearGradient>
      <pattern id="${p}blades" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M3 12l2-6M9 14l1.5-7M13 9l2-5" stroke="#9bd17a" stroke-width="1.3" stroke-linecap="round" opacity=".45"/></pattern>
      <linearGradient id="${p}dirt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b59a6e" stop-opacity="0"/><stop offset=".3" stop-color="#b59a6e" stop-opacity=".85"/><stop offset=".7" stop-color="#b59a6e" stop-opacity=".85"/><stop offset="1" stop-color="#b59a6e" stop-opacity="0"/></linearGradient>
      <filter id="${p}sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".35"/></filter>
      <filter id="${p}soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".28"/></filter>
    </defs>`;
  }

  function photo(p, x, y, w, h, alt) {
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="url(#${p}${alt ? 'grass2' : 'grass'})"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="url(#${p}blades)"/>
      <path d="M${x + w * 0.08} ${y} L${x + w * 0.3} ${y} L${x + w * 0.42} ${y + h} L${x + w * 0.18} ${y + h} Z" fill="url(#${p}dirt)" opacity="${alt ? 0 : .55}"/>
      <ellipse cx="${x + w * 0.78}" cy="${y + h * 0.18}" rx="7" ry="3.5" fill="#c9952f" transform="rotate(30 ${x + w * 0.78} ${y + h * 0.18})"/>
      <ellipse cx="${x + w * 0.14}" cy="${y + h * 0.82}" rx="6" ry="3" fill="#a0702c" transform="rotate(-40 ${x + w * 0.14} ${y + h * 0.82})"/>
      <ellipse cx="${x + w * 0.6}" cy="${y + h * 0.9}" rx="6" ry="3" fill="#d1a64a" transform="rotate(70 ${x + w * 0.6} ${y + h * 0.9})"/>
    </g>`;
  }

  function bottle(p, cx, cy, rot, s, cap, band) {
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s || 1})" filter="url(#${p}sh)">
      <rect x="-90" y="-27" width="128" height="54" rx="18" fill="#d6eef9"/>
      <path d="M34 -27 L62 -12 L62 12 L34 27 Z" fill="#d6eef9"/>
      <rect x="60" y="-10" width="14" height="20" fill="#cfe7f3"/>
      <rect x="72" y="-13" width="18" height="26" rx="4" fill="${cap || '#2563eb'}"/>
      <rect x="-46" y="-27" width="48" height="54" fill="${band || '#16a34a'}"/>
      <rect x="-38" y="-8" width="30" height="7" rx="3" fill="#fff" opacity=".9"/>
      <rect x="-80" y="-19" width="108" height="5" rx="2.5" fill="#fff" opacity=".75"/>
      <path d="M-62 -24v48M-70 -24v48" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    </g>`;
  }

  function can(p, cx, cy, rot, s, color) {
    const c = color || '#ef4444';
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s || 1})" filter="url(#${p}sh)">
      <rect x="-55" y="-30" width="110" height="60" rx="9" fill="${c}"/>
      <rect x="-55" y="-29" width="11" height="58" rx="5" fill="#cfd5dc"/>
      <rect x="44" y="-29" width="11" height="58" rx="5" fill="#cfd5dc"/>
      <circle cx="-4" cy="0" r="15" fill="#fff"/><circle cx="-4" cy="0" r="8" fill="${c}"/>
      <rect x="18" y="-8" width="20" height="5" fill="#fff" opacity=".85"/><rect x="18" y="2" width="14" height="4" fill="#fff" opacity=".6"/>
      <rect x="-44" y="-22" width="88" height="6" rx="3" fill="#fff" opacity=".35"/>
    </g>`;
  }

  function cup(p, cx, cy, rot, s) {
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s || 1})" filter="url(#${p}sh)">
      <path d="M-50 -28 L44 -40 L44 40 L-50 28 Z" fill="#f5f4ef"/>
      <path d="M-18 -32 L14 -36 L14 36 L-18 32 Z" fill="#b45309"/>
      <ellipse cx="44" cy="0" rx="8" ry="40" fill="#e7e4da"/><ellipse cx="45" cy="0" rx="4" ry="33" fill="#c8c2b2"/>
    </g>`;
  }

  function wrapper(p, cx, cy, rot, s, color) {
    const c = color || '#f59e0b';
    return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s || 1})" filter="url(#${p}sh)">
      <path d="M-50 -28 L50 -28 L56 -21 L50 -14 L56 -7 L50 0 L56 7 L50 14 L56 21 L50 28 L-50 28 L-56 21 L-50 14 L-56 7 L-50 0 L-56 -7 L-50 -14 L-56 -21 Z" fill="${c}"/>
      <circle cx="-6" cy="0" r="15" fill="#dc2626"/><rect x="-16" y="-4" width="20" height="8" rx="3" fill="#fff"/>
      <rect x="16" y="-10" width="22" height="5" fill="#fff" opacity=".85"/><rect x="16" y="2" width="16" height="4" fill="#fff" opacity=".6"/>
    </g>`;
  }

  const CURSOR = '<path d="M0 0V19L4.9 14.4L8.2 21.6L11.5 20.1L8.3 13.1H14.6Z" fill="#fff" stroke="#111827" stroke-width="1.5" stroke-linejoin="round"/>';

  function cursor(values, times, dur, extra) {
    return `<g>${T('translate', values, times, dur)}<g ${extra || ''}>${CURSOR}</g></g>`;
  }

  function ripple(x, y, at, dur) {
    const t = [0, at - 0.001, at, Math.min(at + 0.08, 0.999), 1];
    return `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="#34d399" stroke-width="3" opacity="0">
      ${A('r', [4, 4, 4, 26, 26], t, dur)}${A('opacity', [0, 0, 0.9, 0, 0], t, dur)}</circle>`;
  }

  function keycap(x, y, label, presses, dur, w, sub) {
    w = w || 52;
    const h = 52;
    let vals = ['0 0'], times = [0];
    let ov = [0], ovt = [0];
    (presses || []).forEach((t) => {
      vals.push('0 0', '0 4', '0 0'); times.push(t, t + 0.025, t + 0.07);
      ov.push(0, 1, 0); ovt.push(t, t + 0.025, t + 0.12);
    });
    vals.push('0 0'); times.push(1); ov.push(0); ovt.push(1);
    return `<g>
      <rect x="${x}" y="${y + 5}" width="${w}" height="${h}" rx="12" class="g-kshadow"/>
      <g>${presses && presses.length ? T('translate', vals, times, dur) : ''}
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" class="g-ktop"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#34d399" opacity="0">${presses && presses.length ? A('opacity', ov, ovt, dur) : ''}</rect>
        <text x="${x + w / 2}" y="${y + h / 2 + 7}" text-anchor="middle" class="g-ktext">${label}</text>
      </g>
      ${sub ? `<text x="${x + w / 2}" y="${y + h + 26}" text-anchor="middle" class="g-ksub">${sub}</text>` : ''}
    </g>`;
  }

  function tag(x, y, text, color, w) {
    w = w || (text.length * 8.5 + 18);
    return `<g><rect x="${x}" y="${y - 22}" width="${w}" height="22" rx="6" fill="${color}"/><text x="${x + 9}" y="${y - 6}" class="g-tag">${text}</text></g>`;
  }

  function svgWrap(p, body) {
    return `<svg class="gsvg" viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">${defs(p)}${body}</svg>`;
  }

  // ---------------- 단계별 그림 ----------------
  function artFolder() {
    const p = 'g' + (++uid) + '_', D = 7;
    const appear = (t) => A('opacity', [0, 0, 1, 1, 0], [0, t, t + 0.04, 0.94, 1], D);
    const tree = `
      <g filter="url(#${p}soft)"><rect x="50" y="56" width="330" height="338" rx="18" class="g-win"/></g>
      <text x="74" y="92" class="g-h">탐색기</text>
      <g opacity="0">${appear(0.04)}
        <rect x="70" y="112" width="26" height="20" rx="4" fill="#fbbf24"/><text x="106" y="128" class="g-t">my-dataset</text></g>
      <g opacity="0">${appear(0.11)}
        <path d="M84 138v34h18" class="g-stroke"/><rect x="106" y="162" width="24" height="18" rx="4" fill="#34d399"/>
        <text x="140" y="177" class="g-t">images</text><text x="214" y="177" class="g-mut">이미지 (필수)</text>
        <rect x="140" y="188" width="44" height="32" rx="6" fill="url(#${p}grass)"/><rect x="190" y="188" width="44" height="32" rx="6" fill="url(#${p}grass2)"/><rect x="240" y="188" width="44" height="32" rx="6" fill="url(#${p}grass)"/>
        <circle cx="160" cy="203" r="6" fill="#ef4444"/><rect x="200" y="198" width="22" height="10" rx="4" fill="#d6eef9"/><circle cx="262" cy="204" r="6" fill="#f59e0b"/></g>
      <g opacity="0">${appear(0.19)}
        <path d="M84 172v68h18" class="g-stroke"/><rect x="106" y="230" width="24" height="18" rx="4" fill="#60a5fa"/>
        <text x="140" y="245" class="g-t">labels</text><text x="208" y="245" class="g-mut">YOLO 라벨 (없으면 자동 생성)</text></g>
      <g opacity="0">${appear(0.27)}
        <path d="M84 240v52h18" class="g-stroke"/><rect x="108" y="280" width="20" height="24" rx="3" class="g-file"/>
        <text x="140" y="297" class="g-t">classes.txt</text><text x="240" y="297" class="g-mut">클래스 목록</text>
        <g transform="translate(140 316)">
          <rect width="60" height="24" rx="7" fill="#22c55e" opacity=".9"/><text x="30" y="16.5" text-anchor="middle" class="g-chip">plastic</text>
          <rect x="66" width="42" height="24" rx="7" fill="#ef4444" opacity=".9"/><text x="87" y="16.5" text-anchor="middle" class="g-chip">can</text>
          <rect x="114" width="52" height="24" rx="7" fill="#3b82f6" opacity=".9"/><text x="140" y="16.5" text-anchor="middle" class="g-chip">paper</text>
          <rect x="172" width="62" height="24" rx="7" fill="#f59e0b" opacity=".9"/><text x="203" y="16.5" text-anchor="middle" class="g-chip">general</text>
        </g></g>`;
    const right = `
      <g>${A('opacity', [1, 1, 0, 0, 1], [0, 0.52, 0.56, 0.95, 1], D)}
        <rect x="440" y="96" width="300" height="258" rx="20" class="g-win"/>
        <rect x="560" y="122" width="60" height="60" rx="16" fill="#10b981"/>
        <path d="M576 144v-6a4 4 0 0 1 4-4h6M598 134h6a4 4 0 0 1 4 4v6M608 160v6a4 4 0 0 1-4 4h-6M586 170h-6a4 4 0 0 1-4-4v-6" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
        <text x="590" y="214" text-anchor="middle" class="g-h">줍줍 라벨러</text>
        <g><rect x="480" y="240" width="220" height="48" rx="13" fill="#10b981"/>
          <text x="590" y="270" text-anchor="middle" class="g-btn">데이터 폴더 열기</text>
          <rect x="480" y="240" width="220" height="48" rx="13" fill="#fff" opacity="0">${A('opacity', [0, 0, 0.35, 0, 0], [0, 0.46, 0.48, 0.52, 1], D)}</rect></g>
        <rect x="480" y="300" width="220" height="34" rx="11" class="g-line" opacity=".6"/>
      </g>
      <g opacity="0">${A('opacity', [0, 0, 1, 1, 0], [0, 0.55, 0.6, 0.94, 1], D)}
        <rect x="420" y="70" width="340" height="320" rx="18" class="g-win"/>
        <rect x="420" y="70" width="340" height="34" rx="18" class="g-bar"/><rect x="420" y="90" width="340" height="14" class="g-bar"/>
        <rect x="436" y="80" width="14" height="14" rx="4" fill="#10b981"/><rect x="458" y="83" width="70" height="8" rx="4" class="g-line"/>
        <rect x="430" y="114" width="96" height="266" rx="10" class="g-side"/>
        ${[0, 1, 2, 3].map((i) => `<g opacity="0">${A('opacity', [0, 0, 1, 1, 0], [0, 0.6 + i * 0.04, 0.63 + i * 0.04, 0.94, 1], D)}
          <rect x="438" y="${124 + i * 44}" width="30" height="24" rx="5" fill="url(#${p}${i % 2 ? 'grass2' : 'grass'})"/>
          <rect x="474" y="${129 + i * 44}" width="44" height="6" rx="3" class="g-line"/><rect x="474" y="${140 + i * 44}" width="28" height="5" rx="2.5" class="g-line" opacity=".6"/></g>`).join('')}
        <g opacity="0">${A('opacity', [0, 0, 1, 1, 0], [0, 0.66, 0.72, 0.94, 1], D)}${photo(p, 536, 114, 214, 266)}${bottle(p, 640, 210, -25, 0.55)}${can(p, 690, 320, 30, 0.6)}</g>
      </g>
      ${ripple(590, 264, 0.47, D)}
      ${cursor(['760 420', '760 420', '600 268', '600 268', '640 330', '760 420'], [0, 0.3, 0.45, 0.5, 0.62, 1], D)}`;
    return svgWrap(p, tree + right);
  }

  function artClass() {
    const p = 'g' + (++uid) + '_', D = 6;
    const cls = [['plastic', '#22c55e'], ['can', '#ef4444'], ['paper', '#3b82f6'], ['general', '#f59e0b']];
    const rowsY = [176, 222, 268, 314];
    const hl = A('y', [rowsY[0], rowsY[0], rowsY[1], rowsY[1], rowsY[3], rowsY[3], rowsY[0], rowsY[0]], [0, 0.22, 0.25, 0.5, 0.53, 0.78, 0.81, 1], D);
    const nameVals = (i) => {
      const on = [i === 0 ? 1 : 0, i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 1 ? 1 : 0, i === 3 ? 1 : 0, i === 3 ? 1 : 0, i === 0 ? 1 : 0, i === 0 ? 1 : 0];
      return A('opacity', on, [0, 0.22, 0.25, 0.5, 0.53, 0.78, 0.81, 1], D);
    };
    const left = `
      <text x="80" y="110" class="g-big">숫자키 = 클래스</text>
      <text x="80" y="140" class="g-mut2">1~9, 0 을 누르면 바로 바뀌어요</text>
      ${keycap(80, 200, '1', [0.79], D, 56, 'plastic')}
      ${keycap(150, 200, '2', [0.23], D, 56, 'can')}
      ${keycap(220, 200, '3', [], D, 56, 'paper')}
      ${keycap(290, 200, '4', [0.51], D, 56, 'general')}
      <text x="80" y="340" class="g-mut2">클래스가 많으면 오른쪽 목록을 클릭해도 돼요</text>`;
    const right = `
      <g filter="url(#${p}soft)"><rect x="430" y="44" width="320" height="362" rx="20" class="g-win"/></g>
      <rect x="448" y="62" width="284" height="80" rx="14" class="g-side"/>
      <text x="466" y="88" class="g-mut">현재 클래스</text>
      ${cls.map(([n, c], i) => `<g opacity="${i === 0 ? 1 : 0}">${nameVals(i)}<rect x="466" y="104" width="16" height="16" rx="5" fill="${c}"/><text x="492" y="119" class="g-name">${n}</text></g>`).join('')}
      <rect x="440" y="176" width="300" height="40" rx="11" fill="#34d399" opacity=".16">${hl}</rect>
      ${cls.map(([n, c], i) => `<g><rect x="458" y="${rowsY[i] + 14}" width="12" height="12" rx="4" fill="${c}"/><text x="482" y="${rowsY[i] + 25}" class="g-t">${n}</text>
        <rect x="700" y="${rowsY[i] + 9}" width="22" height="22" rx="6" class="g-ktop"/><text x="711" y="${rowsY[i] + 25}" text-anchor="middle" class="g-ksmall">${i + 1}</text></g>`).join('')}`;
    return svgWrap(p, left + right);
  }

  function stageBase(p, x, y, w, h) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" class="g-stage"/>`;
  }

  function artDraw() {
    const p = 'g' + (++uid) + '_', D = 5.5;
    const bx = 232, by = 140, bw = 196, bh = 120;
    const t = [0, 0.18, 0.22, 0.58, 0.6, 0.9, 1];
    const body = `
      ${stageBase(p, 150, 34, 500, 382)}
      ${photo(p, 172, 56, 456, 338)}
      ${bottle(p, 330, 200, -20, 1)}
      ${can(p, 520, 320, 30, 1)}
      <rect x="${bx}" y="${by}" width="0" height="0" fill="#22c55e" fill-opacity=".12" stroke="#fff" stroke-width="2.5" stroke-dasharray="8 6" opacity="0">
        ${A('width', [0, 0, 0, bw, bw, bw, 0], t, D)}${A('height', [0, 0, 0, bh, bh, bh, 0], t, D)}
        ${A('opacity', [0, 0, 1, 1, 0, 0, 0], t, D)}</rect>
      <g opacity="0">${A('opacity', [0, 0, 0, 0, 1, 1, 0], t, D)}
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#22c55e" fill-opacity=".14" stroke="#22c55e" stroke-width="3" rx="2"/>
        ${tag(bx - 1.5, by, 'plastic', '#22c55e')}</g>
      <g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0, 0], t, D)}${T('translate', [`${bx} ${by}`, `${bx} ${by}`, `${bx} ${by}`, `${bx + bw} ${by + bh}`, `${bx + bw} ${by + bh}`, `${bx + bw} ${by + bh}`, `${bx} ${by}`], t, D)}
        <rect x="12" y="16" width="112" height="24" rx="7" fill="#111827" opacity=".85"/>
        <text x="68" y="33" text-anchor="middle" class="g-chip">plastic · 196×120</text></g>
      ${ripple(bx, by, 0.2, D)}
      ${cursor(['640 430', '640 430', `${bx} ${by}`, `${bx} ${by}`, `${bx + bw} ${by + bh}`, `${bx + bw} ${by + bh}`, '700 420'], [0, 0.05, 0.18, 0.22, 0.58, 0.68, 1], D)}
      <g transform="translate(674 70)">
        <rect width="112" height="128" rx="16" class="g-win" opacity=".95"/>
        <text x="56" y="34" text-anchor="middle" class="g-mut">드래그해서</text>
        <text x="56" y="56" text-anchor="middle" class="g-mut">물체를 감싸요</text>
        <rect x="26" y="70" width="60" height="40" rx="4" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-dasharray="5 4"/>
      </g>`;
    return svgWrap(p, body);
  }

  function artEdit() {
    const p = 'g' + (++uid) + '_', D = 7;
    const x = 453, y = 262;
    const t = [0, 0.3, 0.5, 1];
    const wv = [168, 168, 134, 134], hv = [130, 130, 116, 116];
    const colorOn = (green) => A('opacity', green ? [1, 1, 0, 0, 1] : [0, 0, 1, 1, 0], [0, 0.62, 0.64, 0.95, 1], D);
    const handle = (cx, cy, ax, ay) => `<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" rx="2" fill="#fff" stroke="#111827" stroke-width="1.5">
      ${ax ? A('x', ax.map((v) => v - 5), t, D) : ''}${ay ? A('y', ay.map((v) => v - 5), t, D) : ''}</rect>`;
    const body = `
      ${stageBase(p, 150, 34, 500, 382)}
      ${photo(p, 172, 56, 456, 338)}
      ${bottle(p, 330, 200, -20, 1)}
      ${can(p, 520, 320, 30, 1)}
      <rect x="232" y="140" width="196" height="120" fill="#22c55e" fill-opacity=".1" stroke="#22c55e" stroke-width="3"/>
      ${tag(230.5, 140, 'plastic', '#22c55e')}
      <g>
        <rect x="${x}" y="${y}" width="168" height="130" fill="#22c55e" fill-opacity=".12" stroke="#22c55e" stroke-width="3.5">
          ${A('width', wv, t, D)}${A('height', hv, t, D)}${colorOn(true)}</rect>
        <rect x="${x}" y="${y}" width="134" height="116" fill="#ef4444" fill-opacity=".14" stroke="#ef4444" stroke-width="3.5" opacity="0">${colorOn(false)}</rect>
        <g>${colorOn(true)}${tag(x - 1.75, y, 'plastic', '#22c55e')}</g>
        <g opacity="0">${colorOn(false)}${tag(x - 1.75, y, 'can', '#ef4444')}</g>
        <g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0], [0, 0.14, 0.15, 0.6, 0.62, 1], D)}
          ${handle(x, y)}${handle(x + 168, y, [x + 168, x + 168, x + 134, x + 134])}
          ${handle(x, y + 130, null, [y + 130, y + 130, y + 116, y + 116])}
          ${handle(x + 168, y + 130, [x + 168, x + 168, x + 134, x + 134], [y + 130, y + 130, y + 116, y + 116])}</g>
      </g>
      ${ripple(530, 330, 0.14, D)}
      ${cursor(['700 430', '530 330', '530 330', `${x + 168} ${y + 130}`, `${x + 168} ${y + 130}`, `${x + 134} ${y + 116}`, `${x + 134} ${y + 116}`, '700 430'],
        [0, 0.12, 0.17, 0.27, 0.3, 0.5, 0.56, 1], D)}
      ${keycap(686, 120, '2', [0.62], D, 60, '→ can')}
      <g transform="translate(672 250)">
        <rect width="116" height="120" rx="16" class="g-win" opacity=".95"/>
        <text x="58" y="30" text-anchor="middle" class="g-mut">클릭 → 선택</text>
        <text x="58" y="54" text-anchor="middle" class="g-mut">모서리 → 크기</text>
        <text x="58" y="78" text-anchor="middle" class="g-mut">안쪽 → 이동</text>
        <text x="58" y="102" text-anchor="middle" class="g-mut">Del → 삭제</text>
      </g>`;
    return svgWrap(p, body);
  }

  function artNext() {
    const p = 'g' + (++uid) + '_', D = 6;
    const rows = [64, 124, 184, 244];
    const sw = [0, 0.32, 0.36, 0.94, 1];
    const body = `
      <rect x="40" y="34" width="230" height="382" rx="20" class="g-win"/>
      <text x="62" y="58" class="g-mut">이미지</text>
      <rect x="48" y="64" width="214" height="52" rx="12" fill="#34d399" opacity=".16">${A('y', [64, 64, 124, 124, 64], sw, D)}</rect>
      ${rows.map((ry, i) => `<g>
        <rect x="58" y="${ry + 6}" width="52" height="40" rx="8" fill="url(#${p}${i % 2 ? 'grass2' : 'grass'})"/>
        <rect x="120" y="${ry + 14}" width="${84 - i * 6}" height="8" rx="4" class="g-line"/>
        <rect x="120" y="${ry + 28}" width="48" height="6" rx="3" class="g-line" opacity=".6"/></g>`).join('')}
      <circle cx="244" cy="90" r="9" fill="none" stroke="#fbbf24" stroke-width="2.5">${A('opacity', [1, 1, 0, 0, 1], sw, D)}</circle>
      <path d="M244 81a9 9 0 0 1 0 18z" fill="#fbbf24">${A('opacity', [1, 1, 0, 0, 1], sw, D)}</path>
      <g opacity="0">${A('opacity', [0, 0, 1, 1, 0], sw, D)}<circle cx="244" cy="90" r="10" fill="#34d399"/><path d="M239 90.5l3.4 3.4 6.4-6.8" stroke="#032b1e" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
      ${rows.slice(1).map((ry) => `<circle cx="244" cy="${ry + 26}" r="8" fill="none" class="g-ring" stroke-width="2.5"/>`).join('')}
      ${keycap(70, 330, 'D', [0.3], D, 56)}${keycap(136, 330, '→', [], D, 56)}
      <text x="205" y="364" class="g-mut">다음</text>
      ${stageBase(p, 290, 34, 470, 382)}
      <g>${A('opacity', [1, 1, 0, 0, 1], sw, D)}${photo(p, 310, 56, 430, 338)}${bottle(p, 450, 190, -15, 0.95)}${can(p, 630, 300, 25, 0.95)}
        <rect x="354" y="136" width="192" height="104" fill="none" stroke="#22c55e" stroke-width="3"/>${tag(352.5, 136, 'plastic', '#22c55e')}</g>
      <g opacity="0">${A('opacity', [0, 0, 1, 1, 0], sw, D)}${photo(p, 310, 56, 430, 338, true)}${cup(p, 470, 260, 20, 1)}${wrapper(p, 640, 150, -30, 1, '#8b5cf6')}</g>
      <g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0], [0, 0.36, 0.4, 0.8, 0.86, 1], D)}${T('translate', ['0 10', '0 10', '0 0', '0 0', '0 6', '0 6'], [0, 0.36, 0.4, 0.8, 0.86, 1], D)}
        <rect x="540" y="350" width="200" height="44" rx="12" class="g-win"/>
        <circle cx="564" cy="372" r="11" fill="#34d399" opacity=".25"/><path d="M558 372.5l4 4 7-7.5" stroke="#34d399" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="584" y="378" class="g-t">자동 저장됨 · ✔ 확인</text></g>`;
    return svgWrap(p, body);
  }

  function artReview() {
    const p = 'g' + (++uid) + '_', D = 7.5;
    const fix = [0, 0.4, 0.42, 0.95, 1];
    const done = [0, 0.62, 0.64, 0.95, 1];
    const show = (vals, t) => A('opacity', vals, t, D);
    const body = `
      ${stageBase(p, 150, 34, 500, 382)}
      ${photo(p, 172, 56, 456, 338)}
      ${bottle(p, 330, 200, -20, 1)}
      ${can(p, 520, 320, 30, 1)}
      <g>${show([1, 1, 0, 0, 1], done)}
        <rect x="232" y="140" width="196" height="120" fill="none" stroke="#fbbf24" stroke-width="3" stroke-dasharray="9 6"/>${tag(230.5, 140, 'AI · plastic', '#d97706')}</g>
      <g opacity="0">${show([0, 0, 1, 1, 0], done)}
        <rect x="232" y="140" width="196" height="120" fill="#22c55e" fill-opacity=".1" stroke="#22c55e" stroke-width="3"/>${tag(230.5, 140, 'plastic', '#22c55e')}</g>
      <g>${show([1, 1, 0, 0, 1], fix)}
        <rect x="453" y="262" width="134" height="116" fill="none" stroke="#fbbf24" stroke-width="3" stroke-dasharray="9 6"/>${tag(451.5, 262, 'AI · plastic', '#d97706')}</g>
      <g opacity="0">${show([0, 0, 1, 1, 0], fix)}
        <rect x="453" y="262" width="134" height="116" fill="#ef4444" fill-opacity=".14" stroke="#ef4444" stroke-width="3.5"/>${tag(451.5, 262, 'can', '#ef4444')}</g>
      <g transform="translate(172 66)">
        <rect x="12" y="0" width="150" height="32" rx="10" fill="#111827" opacity=".72"/>
        <g>${show([1, 1, 0, 0, 1], done)}<path d="M33 9a7 7 0 0 1 0 14z" fill="#fbbf24"/><circle cx="33" cy="16" r="7" fill="none" stroke="#fbbf24" stroke-width="2"/><text x="48" y="21.5" class="g-chip">AI 라벨 · 미확인</text></g>
        <g opacity="0">${show([0, 0, 1, 1, 0], done)}<circle cx="33" cy="16" r="8" fill="#34d399"/><path d="M29 16.5l3 3 5-5.5" stroke="#032b1e" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="48" y="21.5" class="g-chip">확인 완료</text></g>
      </g>
      ${ripple(530, 330, 0.2, D)}
      ${cursor(['700 430', '700 430', '530 330', '530 330', '700 430'], [0, 0.06, 0.18, 0.5, 1], D)}
      ${keycap(686, 100, '2', [0.4], D, 60, '클래스 고치기')}
      ${keycap(686, 230, 'D', [0.62], D, 60, '확인하고 다음')}`;
    return svgWrap(p, body);
  }

  function artExport() {
    const p = 'g' + (++uid) + '_', D = 7.5;
    const modal = [0, 0.14, 0.18, 0.56, 0.6, 1];
    const body = `
      <rect x="30" y="24" width="740" height="402" rx="20" class="g-win"/>
      <rect x="30" y="24" width="740" height="46" rx="20" class="g-bar"/><rect x="30" y="50" width="740" height="20" class="g-bar"/>
      <rect x="48" y="36" width="22" height="22" rx="6" fill="#10b981"/><rect x="80" y="42" width="80" height="10" rx="5" class="g-line"/>
      <g><rect x="652" y="34" width="104" height="28" rx="9" fill="#10b981"/><text x="704" y="53" text-anchor="middle" class="g-btn2">내보내기</text></g>
      <rect x="44" y="84" width="150" height="328" rx="12" class="g-side"/>
      ${photo(p, 206, 84, 400, 328)}${bottle(p, 330, 200, -20, 0.8)}${can(p, 500, 320, 30, 0.8)}
      <rect x="618" y="84" width="138" height="328" rx="12" class="g-side"/>
      <rect x="30" y="24" width="740" height="402" rx="20" fill="#000" opacity="0">${A('opacity', [0, 0, 0.45, 0.45, 0, 0], modal, D)}</rect>
      <g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0], modal, D)}
        <rect x="210" y="96" width="380" height="290" rx="20" class="g-win" filter="url(#${p}soft)"/>
        <text x="236" y="132" class="g-h">내보내기</text>
        <rect x="234" y="148" width="160" height="96" rx="14" fill="#34d399" fill-opacity=".14" stroke="#34d399" stroke-width="2.5"/>
        <text x="252" y="178" class="g-name">YOLO</text><text x="252" y="200" class="g-mut">txt · 기본</text>
        <circle cx="372" cy="170" r="9" fill="#34d399"/><path d="M368 170.5l3 3 5-5.5" stroke="#032b1e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <rect x="406" y="148" width="160" height="96" rx="14" class="g-side" stroke-width="2"/>
        <text x="424" y="178" class="g-name">COCO</text><text x="424" y="200" class="g-mut">json</text>
        <rect x="234" y="262" width="332" height="10" rx="5" class="g-line"/>
        <rect x="234" y="262" width="0" height="10" rx="5" fill="#34d399">${A('width', [0, 0, 0, 332, 332], [0, 0.4, 0.42, 0.55, 1], D)}</rect>
        <g><rect x="446" y="296" width="120" height="38" rx="11" fill="#10b981"/><text x="506" y="320" text-anchor="middle" class="g-btn2">내보내기</text></g>
      </g>
      <g opacity="0">${A('opacity', [0, 0, 1, 1, 0], [0, 0.6, 0.64, 0.95, 1], D)}
        <rect x="230" y="104" width="340" height="270" rx="20" class="g-win" filter="url(#${p}soft)"/>
        <circle cx="400" cy="152" r="24" fill="#34d399" opacity=".18"/><path d="M389 152l7.5 7.5L412 144" stroke="#34d399" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        ${[['yolo_20261108_1530/', 0.66, '#fbbf24', 0], ['images/', 0.7, '#34d399', 1], ['labels/', 0.74, '#60a5fa', 1], ['data.yaml', 0.78, null, 1], ['classes.txt', 0.82, null, 1]].map(([n, at, col, lv], i) =>
          `<g opacity="0">${A('opacity', [0, 0, 1, 1, 0], [0, at, at + 0.03, 0.95, 1], D)}
            ${col ? `<rect x="${262 + lv * 22}" y="${196 + i * 32}" width="20" height="15" rx="3" fill="${col}"/>` : `<rect x="${264 + lv * 22}" y="${193 + i * 32}" width="16" height="20" rx="3" class="g-file"/>`}
            <text x="${292 + lv * 22}" y="${209 + i * 32}" class="g-t">${n}</text></g>`).join('')}
      </g>
      ${ripple(704, 48, 0.12, D)}${ripple(506, 315, 0.38, D)}
      ${cursor(['600 440', '704 50', '704 50', '506 316', '506 316', '640 440', '600 440'], [0, 0.1, 0.16, 0.34, 0.42, 0.6, 1], D)}`;
    return svgWrap(p, body);
  }

  function artKeys() {
    const p = 'g' + (++uid) + '_';
    const key = (x, y, l, w, hot, sub, delay) => `<g class="${hot ? 'hk' : ''}" style="animation-delay:${delay || 0}s">
      <rect x="${x}" y="${y + 4}" width="${w}" height="44" rx="10" class="g-kshadow"/>
      <rect x="${x}" y="${y}" width="${w}" height="44" rx="10" class="${hot ? 'g-khot' : 'g-ktop'}"/>
      <text x="${x + w / 2}" y="${y + 28}" text-anchor="middle" class="${hot ? 'g-khtext' : 'g-ktext2'}">${l}</text>
      ${sub ? `<text x="${x + w / 2}" y="${y + 66}" text-anchor="middle" class="g-ksub">${sub}</text>` : ''}</g>`;
    let s = '';
    const r1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    r1.forEach((k, i) => { s += key(70 + i * 52, 40, k, 46, i < 4, i === 1 ? '클래스' : '', i * 0.15); });
    s += key(594, 40, 'Del', 66, true, '삭제', 0.6);
    const r2 = ['Q', 'W', 'E', 'R', 'T', 'Y'];
    r2.forEach((k, i) => { s += key(96 + i * 52, 128, k, 46, false); });
    const r3 = [['A', '이전'], ['S', ''], ['D', '다음'], ['F', '맞춤'], ['G', ''], ['H', '숨김']];
    r3.forEach(([k, sub], i) => { s += key(110 + i * 52, 216, k, 46, !!sub, sub, 0.8 + i * 0.12); });
    s += key(424, 216, 'N', 46, true, '미확인', 1.4);
    s += key(30, 304, 'Ctrl', 70, true, '+Z 되돌리기', 1.6);
    s += key(124, 304, 'Z', 46, true, '', 1.6);
    s += key(196, 304, 'Space', 230, true, '누른 채 끌면 화면 이동', 1.8);
    s += key(470, 304, 'Tab', 66, true, '다음 박스', 2.0);
    s += `<g transform="translate(600 130)">
      <rect width="170" height="208" rx="18" class="g-win"/>
      <text x="85" y="34" text-anchor="middle" class="g-mut">마우스</text>
      <rect x="57" y="50" width="56" height="84" rx="28" fill="none" class="g-strokeb" stroke-width="3"/>
      <path d="M85 50v30" class="g-strokeb" stroke-width="3"/><rect x="80" y="60" width="10" height="16" rx="5" fill="#34d399"/>
      <text x="85" y="160" text-anchor="middle" class="g-t">휠: 확대·축소</text>
      <text x="85" y="184" text-anchor="middle" class="g-mut">가운데 끌기: 이동</text></g>`;
    return svgWrap(p, s);
  }

  // 화면 캡처(img/overview.png) 위 번호 위치(%) — 캡처할 때 실제 요소 위치로 계산한 값
  const OVERVIEW_SPOTS = [['1', 16.5, 47.4], ['2', 49.6, 53.3], ['3', 96.6, 31.3], ['4', 96.6, 53.7], ['5', 95.7, 3.4], ['6', 69.3, 95.6]];

  function artOverview() {
    // 실제 화면 캡처 + 번호 표시. 캡처가 없으면 그림으로 대신합니다.
    return `<div class="shot-wrap"><img class="shot" src="img/overview.webp" alt="화면 구성" onerror="this.parentNode.replaceWith(Object.assign(document.createElement('div'),{innerHTML:Guide.fallbackOverview()}).firstChild)">
      ${OVERVIEW_SPOTS.map(([n, x, y]) => `<span class="hot" style="left:${x}%;top:${y}%">${n}</span>`).join('')}</div>`;
  }

  function fallbackOverview() {
    const p = 'g' + (++uid) + '_';
    return svgWrap(p, `
      <rect x="20" y="20" width="760" height="410" rx="20" class="g-win"/>
      <rect x="20" y="20" width="760" height="40" rx="20" class="g-bar"/><rect x="20" y="40" width="760" height="20" class="g-bar"/>
      <rect x="20" y="60" width="170" height="370" class="g-side"/>
      <rect x="610" y="60" width="170" height="370" class="g-side"/>
      ${photo(p, 206, 76, 388, 338)}${bottle(p, 330, 200, -20, 0.8)}${can(p, 500, 320, 30, 0.8)}`);
  }

  // ---------------- 단계 내용 ----------------
  const K = (...ks) => ks.map((k) => `<kbd>${k}</kbd>`).join('');
  const STEPS = [
    {
      id: 'overview', nav: '화면 둘러보기', kicker: '시작하기', title: '한눈에 보는 화면 구성', art: artOverview,
      lead: '실제 화면이에요. 번호를 따라 각 영역이 무엇을 하는지 확인해 보세요.',
      legend: [['1', '이미지 목록 — 썸네일, 확인 상태(✔/◐), 필터'], ['2', '작업 화면 — 드래그로 박스 그리기'], ['3', '현재 클래스와 클래스 목록'],
        ['4', '이 이미지의 박스 목록'], ['5', '내보내기 (YOLO / COCO)'], ['6', '확대·축소, 화면 맞춤, 박스 숨기기']],
    },
    {
      id: 'folder', nav: '데이터 폴더 열기', kicker: '1단계', title: '데이터 폴더를 열어요', art: artFolder,
      lead: '이미지가 든 <b>images</b> 폴더와 클래스 파일이 있는 폴더 하나를 열면 돼요. 클래스는 <b>data.yaml → classes.txt → annotations.json</b> 순서로 찾아요.',
      bullets: ['처음이면 <b>새 데이터 폴더 만들기</b>로 폴더와 클래스를 한 번에 만들 수 있어요', 'images 폴더 없이 이미지만 있는 폴더를 열어도 알아서 정리해 줘요',
        '이미 있는 YOLO 라벨(labels/)이나 COCO(annotations.json)도 그대로 불러와요', '마지막으로 연 폴더와 위치는 다음에 켤 때 자동으로 열려요'],
    },
    {
      id: 'class', nav: '클래스 고르기', kicker: '2단계', title: '숫자키로 클래스를 골라요', art: artClass,
      lead: '숫자키 <b>1~9, 0</b>이 클래스 목록의 순서와 같아요. 고른 클래스로 다음 박스가 그려져요.',
      bullets: ['오른쪽 클래스 목록을 클릭해도 돼요', '박스를 선택한 상태에서 누르면 <b>그 박스의 클래스</b>가 바뀌어요',
        '클래스가 많으면 설정에서 <b>박스를 그린 뒤 클래스 선택창</b>을 켜 보세요'],
      keys: [['1~9, 0', '클래스']],
    },
    {
      id: 'draw', nav: '박스 그리기', kicker: '3단계', title: '드래그해서 박스를 그려요', art: artDraw,
      lead: '물체의 한쪽 모서리에서 반대쪽 모서리까지 <b>끌기만 하면</b> 박스가 생겨요. 물체에 딱 맞게 감싸는 게 좋아요.',
      bullets: ['다른 박스 위에서 시작해도 끌면 새 박스가 그려져요', '<b>Ctrl</b>을 누른 채 끌면 어디서든 항상 새로 그려요',
        '마우스 <b>휠</b>로 확대하면 작은 물체도 정확하게 그릴 수 있어요', '십자선과 크기 표시가 위치를 잡도록 도와줘요'],
      keys: [['드래그', '그리기'], ['Ctrl + 드래그', '항상 새로']],
    },
    {
      id: 'edit', nav: '선택하고 고치기', kicker: '4단계', title: '클릭해서 고치고, 지워요', art: artEdit,
      lead: '박스를 클릭하면 선택돼요. <b>모서리</b>를 끌면 크기, <b>안쪽</b>을 끌면 위치가 바뀌어요.',
      bullets: ['숫자키로 선택한 박스의 클래스를 바로 바꿔요', '<b>Delete</b>로 지우고, <b>Ctrl+Z</b>로 되돌려요',
        '겹친 박스는 같은 곳을 다시 클릭하면 다음 박스가 선택돼요', '박스에서 오른쪽 클릭하면 메뉴가 나와요'],
      keys: [['Del', '삭제'], ['Ctrl+Z', '되돌리기'], ['Tab', '다음 박스']],
    },
    {
      id: 'next', nav: '다음 이미지 · 자동 저장', kicker: '5단계', title: '넘어가면 저장은 자동이에요', art: artNext,
      lead: '<b>D</b>(또는 →)를 누르면 다음 이미지로 가요. 고친 내용은 그때그때 <b>labels/ 폴더에 YOLO 형식</b>으로 저장되고, 본 이미지에는 <b>✔</b>가 붙어요.',
      bullets: ['<b>A</b>(또는 ←)는 이전 이미지', '<b>N</b>은 아직 확인 안 한 다음 이미지로 바로 가요',
        '박스가 없는 이미지에서 <b>Ctrl+S</b>를 누르면 "물체 없음"으로 저장돼요', '목록 위 필터로 확인 안 한 이미지만 볼 수 있어요'],
      keys: [['D', '다음'], ['A', '이전'], ['N', '미확인']],
    },
    {
      id: 'review', nav: 'AI 라벨 검수', kicker: '6단계', title: 'AI가 만든 라벨을 빠르게 검수해요', art: artReview,
      lead: 'SAM·Grounding DINO·LLM 결과를 <b>labels/</b>(YOLO txt)나 <b>annotations.json</b>(COCO)으로 넣어 두면, <b>◐</b> 표시로 보여요. 틀린 것만 고치고 넘어가면 끝!',
      bullets: ['필터를 <b>미확인</b>으로 바꾸면 검수할 이미지만 남아요', '클래스가 틀리면 클릭 → 숫자키, 위치가 틀리면 모서리 끌기',
        '빠진 물체는 새로 그리고, 잘못 잡힌 박스는 Delete', '내보낼 때 <b>확인한 이미지만</b> 골라 담을 수 있어요'],
      keys: [['클릭 + 숫자', '클래스 고치기'], ['D', '확인 + 다음']],
    },
    {
      id: 'export', nav: '내보내기', kicker: '7단계', title: 'YOLO · COCO로 내보내요', art: artExport,
      lead: '오른쪽 위 <b>내보내기</b>에서 형식과 담을 이미지를 고르면, 매번 새 폴더로 깔끔하게 만들어져요. 원본은 그대로예요.',
      bullets: ['<b>YOLO</b>: images · labels · data.yaml — Ultralytics에 바로 학습', '<b>COCO</b>: annotations.json (bbox = x, y, 너비, 높이 픽셀)',
        'train/val 폴더로 나뉘어 있으면 그대로 나눠서 내보내요', '기본 형식은 설정에서 바꿀 수 있어요'],
      keys: [['Ctrl+E', '내보내기']],
    },
    {
      id: 'keys', nav: '단축키 모음', kicker: '마무리', title: '단축키 한눈에 보기', art: artKeys, keysTable: true,
      lead: '마우스만으로도 다 되지만, 단축키를 쓰면 몇 배 빨라져요. 한/영 상태와 상관없이 동작해요.',
    },
  ];

  // [제목, [[대체 키들, 설명], ...]] — 키 문자열의 '+'는 함께 누르기
  const KEY_TABLE = [
    ['이동', [[['D', '→'], '다음 이미지'], [['A', '←'], '이전 이미지'], [['N'], '확인 안 한 다음 이미지'], [['Ctrl+G'], '번호로 이동']]],
    ['박스', [[['드래그'], '박스 그리기'], [['1~9', '0'], '클래스 고르기 / 바꾸기'], [['Del'], '선택한 박스 지우기'], [['Tab'], '다음 박스 선택'],
      [['Esc'], '선택 해제'], [['Ctrl+Z'], '되돌리기'], [['Ctrl+Y'], '다시 실행'], [['Ctrl+C'], '박스 복사'],
      [['Ctrl+V'], '붙여넣기'], [['Ctrl+Shift+V'], '앞 이미지 박스 가져오기']]],
    ['화면', [[['휠'], '확대 / 축소'], [['Space+끌기'], '화면 이동'], [['F'], '화면에 맞추기'], [['H'], '박스 숨기기']]],
    ['파일', [[['Ctrl+S'], '지금 저장 (+확인 표시)'], [['Ctrl+O'], '폴더 열기'], [['Ctrl+E'], '내보내기'], [['F5'], '다시 읽기'], [['F1'], '사용 가이드']]],
  ];

  function keysTableHTML() {
    const plus = '<span style="color:var(--faint)">+</span>', or = '<span style="color:var(--faint);padding:0 2px">/</span>';
    let h = '<div class="keys-grid">';
    KEY_TABLE.forEach(([title, rows]) => {
      h += `<h5>${title}</h5>`;
      rows.forEach(([alts, desc]) => {
        const ks = alts.map((combo) => combo.split('+').map((k) => `<kbd>${k}</kbd>`).join(plus)).join(or);
        h += `<div class="kr"><span class="ks">${ks}</span><span>${desc}</span></div>`;
      });
    });
    return h + '</div>';
  }

  window.Guide = {
    steps: STEPS,
    fallbackOverview,
    keysTableHTML,
    stepHTML(i) {
      const s = STEPS[i];
      const check = window.icon ? window.icon('check') : '✓';
      let text = `<div class="kicker">${s.kicker}</div><h2>${s.title}</h2><p class="lead">${s.lead}</p>`;
      if (s.legend) {
        text += `<div class="legend">${s.legend.map(([n, t]) => `<span><i class="hn">${n}</i>${t}</span>`).join('')}</div>`;
      }
      if (s.bullets) {
        text += `<ul class="glist">${s.bullets.map((b) => `<li><span class="b">${check}</span><span>${b}</span></li>`).join('')}</ul>`;
      }
      if (s.keysTable) text += keysTableHTML();
      return { art: s.art(), text };
    },
  };
  window.Guide.K = K;
})();
