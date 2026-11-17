// 가전효율사전 클라이언트: 검색, 요금 계산기, 비교함, 목록 필터, 비교 페이지.
// 서버 기능 없이 /search/*.json 과 /data/*.json 만 읽는다.
(() => {
  'use strict';

  const CATS = window.__CATS__ || []; // [[slug, 이름]]
  const RATE = window.__RATE__ || 160;
  const CAT_NAME = Object.fromEntries(CATS);

  /* ---------- 작은 도구 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d });
  const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(3)) if (kid !== null && kid !== undefined && kid !== false) e.append(kid instanceof Node ? kid : String(kid));
    return e;
  }
  const chip = (g) => h('i', { class: g ? `chip g${g}` : 'chip chip-none', title: g ? `${g}등급` : '등급 정보 없음', text: g ? String(g) : '–' });

  /* ---------- 데이터 ---------- */
  const catCache = {};
  const loadCat = (slug) =>
    (catCache[slug] ||= fetch(`/data/${slug}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null));

  const toModel = (d, r) => ({
    cat: d.slug, model: r[0], slug: r[1], vendor: r[2], grade: r[3], cap: r[4], metric: r[5], ship: r[6], bin: r[7], rank: r[8], binSize: r[9],
  });

  function kwhOf(d, m, usage = d.usageDefault) {
    const x = m.metric;
    if (x === null || x === undefined) return null;
    switch (d.model) {
      case 'monthly_kwh': return x;
      case 'wh_per_cycle': return (x / 1000) * usage;
      case 'watt': return (x * usage * 30) / 1000;
      case 'watt_per_area': return m.cap === null ? null : (x * m.cap * usage * 30) / 1000;
      default: return null;
    }
  }

  let indexPromise = null;
  const loadIndex = () =>
    (indexPromise ||= Promise.all(
      CATS.map(([slug, name]) =>
        fetch(`/search/${slug}.json`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
          .then((rows) =>
            rows.map((r) => ({ model: r[0], slug: r[1], vendor: r[2], grade: r[3], cat: slug, catName: name, key: norm(r[0]), old: norm(r[4] || ''), oldRaw: r[4] || '' })),
          ),
      ),
    ).then((lists) => lists.flat()));

  /* ---------- 검색 (상단, 홈, 비교 페이지 공용) ---------- */
  function attachSearch(input, box, onPick) {
    if (!input || !box) return;
    let active = -1;

    const setActive = (i) => {
      const items = $$('a', box);
      items.forEach((a, j) => a.classList.toggle('is-active', j === i));
      active = i;
      items[i]?.scrollIntoView({ block: 'nearest' });
    };

    async function render() {
      const q = norm(input.value);
      active = -1;
      if (q.length < 2) { box.hidden = true; return; }
      const index = await loadIndex();
      if (norm(input.value) !== q) return;
      const starts = [], contains = [], olds = [];
      for (const it of index) {
        if (starts.length >= 20) break;
        const pos = it.key.indexOf(q);
        if (pos === 0) starts.push(it);
        else if (pos > 0) { if (contains.length < 20) contains.push(it); }
        else if (it.old && it.old.includes(q) && olds.length < 10) olds.push(it);
      }
      const hits = [...starts, ...contains, ...olds].slice(0, 20);
      box.replaceChildren();
      if (!hits.length) {
        box.append(h('p', { class: 'empty', text: `“${input.value.trim()}”와 일치하는 모델이 없습니다. 모델명 앞부분만 입력해 보세요.` }));
      }
      for (const it of hits) {
        let meta = it.catName + (it.vendor ? `, ${it.vendor}` : '');
        if (!it.key.includes(q)) meta += `, 구모델명 ${it.oldRaw}`;
        const a = h('a', { href: `/${it.cat}/${it.slug}/`, role: 'option' }, chip(it.grade), h('b', { text: it.model }), h('span', { text: meta }));
        if (onPick) a.addEventListener('click', (e) => { e.preventDefault(); onPick(it); box.hidden = true; });
        box.append(a);
      }
      box.hidden = false;
    }

    input.addEventListener('focus', () => loadIndex());
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      const items = $$('a', box);
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); setActive(Math.min(items.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); setActive(Math.max(0, active - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); (items[active] || items[0])?.click(); }
      else if (e.key === 'Escape') box.hidden = true;
    });
    document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== input) box.hidden = true; });
  }

  attachSearch($('#q'), $('#results'));
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
      const q = $('#q') || $('#cmp-q');
      if (q) { e.preventDefault(); q.focus(); }
    }
  });

  /* ---------- 요금 계산기 (모델 페이지) ---------- */
  for (const root of $$('[data-calc]')) {
    const form = $('form', root);
    const d = root.dataset;
    const set = (k, v, unit) => {
      const dd = $(`[data-out="${k}"]`, root);
      if (dd) dd.replaceChildren(v, h('small', { text: unit }));
    };
    form.addEventListener('input', () => {
      const rate = parseFloat(form.rate.value) || 0;
      const usage = form.usage ? parseFloat(form.usage.value) || 0 : 0;
      const kwh = kwhOf({ model: d.model }, { metric: parseFloat(d.metric), cap: d.cap === '' ? null : parseFloat(d.cap) }, usage);
      if (kwh === null || !isFinite(kwh)) return;
      set('kwh', fmt(kwh, 1), 'kWh');
      set('month', fmt(Math.round(kwh * rate)), '원');
      set('year', fmt(Math.round(kwh * 12 * rate)), '원');
    });
  }

  /* ---------- 비교함 ---------- */
  const KEY = 'wattlabel-compare';
  const MAX = 4;
  const isComparePage = !!$('#compare');

  function getCmp() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string').slice(0, MAX) : [];
    } catch { return []; }
  }
  function setCmp(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* 저장 불가 환경 */ }
    syncCmp();
  }
  function toggleCmp(id, name) {
    let list = getCmp();
    if (list.some((x) => x.id === id)) list = list.filter((x) => x.id !== id);
    else {
      if (list.length >= MAX) list.shift();
      list.push({ id, name });
    }
    setCmp(list);
  }
  // id 는 소문자 품목/대문자·숫자·하이픈 slug 라 URL 에 그대로 써도 안전하다
  const compareUrl = (ids) => `/compare/?m=${ids.join(',')}`;

  function syncCmp() {
    const list = getCmp();
    const ids = new Set(list.map((x) => x.id));
    for (const b of $$('[data-cmp]')) {
      const on = ids.has(b.dataset.cmp);
      b.hidden = false;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = b.classList.contains('btn-cmp') ? (on ? '비교함에 담김' : '비교함에 담기') : on ? '담김' : '비교';
    }
    const tray = $('#tray');
    if (!tray) return;
    if (!list.length || isComparePage) { tray.hidden = true; return; }
    tray.replaceChildren(
      h('span', { class: 'tray-label' }, '비교함 ', h('b', { text: String(list.length) }), `/${MAX}`),
      h('span', { class: 'tray-names' },
        list.map((x) =>
          h('span', { class: 'tray-name' }, x.name,
            h('button', { type: 'button', class: 'tray-x', 'aria-label': `${x.name} 빼기`, onclick: () => toggleCmp(x.id, x.name) }, '×'))),
      ),
      list.length >= 2
        ? h('a', { class: 'tray-go', href: compareUrl(list.map((x) => x.id)) }, '비교하기')
        : h('span', { class: 'tray-hint', text: '하나 더 담으면 비교할 수 있습니다' }),
    );
    tray.hidden = false;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmp]');
    if (!b) return;
    e.preventDefault();
    toggleCmp(b.dataset.cmp, b.dataset.name || b.dataset.cmp.split('/')[1]);
  });
  syncCmp();

  /* ---------- 목록 필터 ---------- */
  const filters = $('#filters');
  if (filters) initFilters(filters);

  function renderRow(d, m) {
    const kwh = kwhOf(d, m);
    const name = m.slug ? h('a', { href: `/${d.slug}/${m.slug}/`, text: m.model }) : m.model;
    const id = `${d.slug}/${m.slug}`;
    return h('tr', {},
      h('td', { class: 'cell-model' }, name, h('small', { text: m.vendor || '-' })),
      h('td', {}, chip(m.grade)),
      h('td', { class: 'num c-cap', text: m.cap === null ? '-' : `${fmt(m.cap, 1)}${d.capUnit}` }),
      h('td', { class: 'num c-metric', text: m.metric === null ? '-' : fmt(m.metric, 2) }),
      h('td', { class: 'num c-cost', text: kwh === null ? '-' : `${fmt(Math.round(kwh * RATE))}원` }),
      h('td', { class: 'num dim c-ship', text: m.ship || '-' }),
      h('td', { class: 'c-cmp' }, m.slug ? h('button', { type: 'button', class: 'cmp-btn', 'data-cmp': id, 'data-name': m.model, 'aria-pressed': 'false' }, '비교') : null),
    );
  }

  async function initFilters(form) {
    const d = await loadCat(form.dataset.cat);
    if (!d) return;
    const all = d.rows.map((r) => toModel(d, r));
    const tbody = $('#list-body');
    const more = $('#list-more');
    const pager = $('.pager');
    const count = $('#f-count');
    const STEP = 100;
    let limit = STEP;

    const params = new URLSearchParams(location.search);
    const state = {
      g: new Set((params.get('g') || '').split(',').map(Number).filter((x) => x >= 1 && x <= 5)),
      b: params.get('b') || '',
      v: params.get('v') || '',
      s: params.get('s') || 'new',
    };
    const isDefault = () => !state.g.size && !state.b && !state.v && state.s === 'new';

    // 컨트롤에 상태 반영
    form.b.value = state.b;
    form.v.value = state.v;
    form.s.value = state.s;
    for (const btn of $$('.f-grade', form)) btn.setAttribute('aria-pressed', String(state.g.has(+btn.dataset.g)));
    form.hidden = false;

    function apply(push = true) {
      let rows = all.filter((m) => (!state.g.size || state.g.has(m.grade)) && (state.b === '' || m.bin === +state.b) && (!state.v || m.vendor === state.v));
      const val = (x) => (x === null ? Infinity : x);
      if (state.s === 'eff') rows = rows.slice().sort((a, b) => val(a.metric) - val(b.metric));
      else if (state.s === 'effd') rows = rows.slice().sort((a, b) => (b.metric ?? -1) - (a.metric ?? -1));
      else if (state.s === 'cap') rows = rows.slice().sort((a, b) => (b.cap ?? -1) - (a.cap ?? -1));

      count.textContent = isDefault() ? `전체 ${fmt(all.length)}개 모델` : `조건에 맞는 모델 ${fmt(rows.length)}개`;
      tbody.replaceChildren(...rows.slice(0, limit).map((m) => renderRow(d, m)));
      if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: '7', class: 'empty-row', text: '조건에 맞는 모델이 없습니다. 등급이나 용량대 조건을 하나 풀어 보세요.' })));
      more.hidden = rows.length <= limit;
      more.textContent = `더 보기 (${fmt(Math.min(STEP, rows.length - limit))}개 더, 남은 ${fmt(rows.length - limit)}개)`;
      if (pager) pager.hidden = true;
      syncCmp();

      if (push) {
        const q = new URLSearchParams();
        if (state.g.size) q.set('g', [...state.g].sort().join(','));
        if (state.b) q.set('b', state.b);
        if (state.v) q.set('v', state.v);
        if (state.s !== 'new') q.set('s', state.s);
        const qs = q.toString();
        history.replaceState(null, '', `/${d.slug}/${qs ? `?${qs}` : ''}`);
      }
    }

    form.addEventListener('click', (e) => {
      const btn = e.target.closest('.f-grade');
      if (!btn) return;
      const g = +btn.dataset.g;
      state.g.has(g) ? state.g.delete(g) : state.g.add(g);
      btn.setAttribute('aria-pressed', String(state.g.has(g)));
      limit = STEP;
      apply();
    });
    form.addEventListener('change', () => {
      state.b = form.b.value;
      state.v = form.v.value;
      state.s = form.s.value;
      limit = STEP;
      apply();
    });
    more.addEventListener('click', () => { limit += STEP; apply(false); });

    // 2쪽 이후 정적 페이지에서 조건 없이 들어온 경우는 서버가 만든 표를 그대로 둔다
    if (!isDefault() || form.dataset.page === '1') apply(!isDefault());
    else count.textContent = `전체 ${fmt(all.length)}개 모델`;
  }

  /* ---------- 비교 페이지 ---------- */
  if (isComparePage) initCompare();

  async function initCompare() {
    const body = $('#cmp-body');
    const rateIn = $('#cmp-rate');
    const params = new URLSearchParams(location.search);
    let ids = (params.get('m') ? params.get('m').split(',').map(decodeURIComponent) : getCmp().map((x) => x.id))
      .filter((x) => /^[a-z-]+\/[A-Z0-9-]+$/.test(x))
      .slice(0, MAX);

    attachSearch($('#cmp-q'), $('#cmp-results'), (it) => {
      const id = `${it.cat}/${it.slug}`;
      if (!ids.includes(id)) {
        if (ids.length >= MAX) ids.shift();
        ids.push(id);
      }
      $('#cmp-q').value = '';
      render();
    });
    rateIn.addEventListener('input', () => render(false));

    async function render(persist = true) {
      const found = (
        await Promise.all(
          ids.map(async (id) => {
            const [cat, slug] = id.split('/');
            const d = await loadCat(cat);
            const r = d?.rows.find((x) => x[1] === slug);
            return r ? { id, d, m: toModel(d, r) } : null;
          }),
        )
      ).filter(Boolean);
      ids = found.map((x) => x.id);

      if (persist) {
        setCmp(found.map((x) => ({ id: x.id, name: x.m.model })));
        history.replaceState(null, '', ids.length ? compareUrl(ids) : '/compare/');
      }

      if (!found.length) {
        body.replaceChildren(
          h('div', { class: 'cmp-empty' },
            h('p', { class: 'cmp-empty-title', text: '비교할 모델을 담아 주세요' }),
            h('p', { text: '위 검색창에서 모델명을 찾아 추가하거나, 모델 페이지와 목록에서 비교 버튼을 누르면 여기에 모입니다. 최대 4개까지 비교할 수 있습니다.' }),
          ),
        );
        return;
      }

      const rate = parseFloat(rateIn.value) || 0;
      const calc = found.map(({ d, m }) => {
        const kwh = kwhOf(d, m);
        const per = d.seasonal ? 1 : 12;
        return { kwh, month: kwh === null ? null : kwh * rate, year: kwh === null ? null : kwh * rate * per, seasonal: d.seasonal };
      });
      const years = calc.map((c) => c.year).filter((v) => v !== null);
      const minYear = years.length ? Math.min(...years) : null;
      const best = found.length > 1 ? calc.findIndex((c) => c.year === minYear) : -1;

      const val = (v, unit, d = 0) => (v === null || v === undefined ? '-' : [h('b', { text: fmt(v, d) }), h('small', { text: unit })]);
      const row = (label, cells, cls) =>
        h('tr', { class: cls || null }, h('th', { scope: 'row', text: label }), cells.map((c, i) => h('td', { class: i === best ? 'is-best' : null }, c)));

      const head = h('tr', {},
        h('th', { scope: 'col', class: 'cmp-corner' }, h('span', { class: 'sr', text: '항목' })),
        found.map(({ id, d, m }, i) =>
          h('th', { scope: 'col', class: i === best ? 'is-best' : null },
            i === best ? h('span', { class: 'best-tag', text: '전기 가장 적게 씀' }) : h('span', { class: 'best-tag is-empty' }),
            h('a', { class: 'cmp-model', href: `/${d.slug}/${m.slug}/`, text: m.model }),
            h('span', { class: 'cmp-sub', text: [d.name, m.vendor].filter(Boolean).join(', ') }),
            h('button', { type: 'button', class: 'cmp-remove', onclick: () => { ids = ids.filter((x) => x !== id); render(); } }, '빼기'),
          )),
      );

      const rows = [
        row('에너지소비효율등급', found.map(({ m }) => [chip(m.grade), m.grade ? ` ${m.grade}등급` : ' 정보 없음'])),
        row('용량', found.map(({ d, m }) => (m.cap === null ? '-' : `${fmt(m.cap, 1)}${d.capUnit}`))),
        row('소비전력', found.map(({ d, m }) => [val(m.metric, d.metricUnit, 2), h('span', { class: 'cmp-note', text: d.metricLabel })])),
        row('월 소비전력량', calc.map((c) => val(c.kwh, 'kWh', 1))),
        row('월 전기요금', calc.map((c) => val(c.month, '원'))),
        row('1년 전기요금', calc.map((c) => (c.seasonal ? '냉방기간만 해당' : val(c.year, '원'))), 'is-key'),
        row('10년 전기요금', calc.map((c) => (c.seasonal || c.year === null ? '-' : val(c.year * 10, '원')))),
        found.length > 1
          ? row('가장 적게 쓰는 모델보다', calc.map((c, i) =>
              c.year === null ? '-'
                : i === best ? h('span', { class: 'diff-best', text: '기준' })
                : h('span', { class: 'diff-more' }, h('b', { text: `1년 ${fmt(c.year - minYear)}원 더` }), h('span', { text: `10년이면 ${fmt((c.year - minYear) * 10)}원` }))), 'is-diff')
          : null,
        row('같은 용량대 순위', found.map(({ d, m }) => (m.rank ? [h('b', { text: `${fmt(m.rank)}위` }), h('small', { text: ` / ${fmt(m.binSize)}개` }), h('span', { class: 'cmp-note', text: d.bins[m.bin]?.label || '' })] : '-'))),
        row('출하예정일', found.map(({ m }) => m.ship || '-')),
        row('가격 보기', found.map(({ m }) => h('span', { class: 'cmp-links' },
          h('a', { href: `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(m.model)}`, target: '_blank', rel: 'nofollow noopener', text: '네이버쇼핑' }),
          h('a', { href: `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(m.model)}`, target: '_blank', rel: 'nofollow noopener', text: '다나와' })))),
      ];

      const mixed = new Set(found.map((x) => x.d.slug)).size > 1;
      const usageNotes = [...new Map(found.map(({ d }) => [d.slug, d])).values()]
        .map((d) =>
          d.model === 'watt_per_area' ? `${d.name}는 하루 ${d.usageDefault}시간 가동`
          : d.model === 'wh_per_cycle' ? `${d.name}는 한 달 ${d.usageDefault}번 세탁`
          : d.model === 'watt' ? `${d.name}는 하루 ${d.usageDefault}시간 시청` : null)
        .filter(Boolean);
      body.replaceChildren(
        h('div', { class: 'cmp-wrap' }, h('table', { class: 'cmp-table', style: `--cols:${found.length}` }, h('thead', {}, head), h('tbody', {}, rows))),
        h('p', { class: 'fine', text: [
          `표준 시험 조건에서 잰 소비전력량으로 계산한 참고값입니다. 1kWh당 ${fmt(rate)}원.`,
          usageNotes.length ? `${usageNotes.join(', ')} 기준입니다.` : '',
          mixed ? '서로 다른 품목이 섞여 있어 소비전력 지표는 직접 비교할 수 없고, 전기요금만 비교할 수 있습니다.' : '',
        ].filter(Boolean).join(' ') }),
      );
    }

    render();
  }
})();
