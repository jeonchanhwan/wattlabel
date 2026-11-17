// 검색 + 요금 계산기. 서버 기능(Functions) 없이 동작한다.
(function () {
  var CATS = window.__CATS__ || [];
  var norm = function (s) {
    return String(s).toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
  };

  // ---- 검색: 첫 입력 시점에 품목별 인덱스를 불러온다 ----
  var input = document.getElementById('q');
  var box = document.getElementById('results');
  var index = null;
  var loading = null;
  var active = -1;

  function load() {
    if (loading) return loading;
    loading = Promise.all(
      CATS.map(function (c) {
        return fetch('/search/' + c[0] + '.json')
          .then(function (r) { return r.ok ? r.json() : []; })
          .catch(function () { return []; })
          .then(function (rows) {
            return rows.map(function (r) {
              return { model: r[0], url: '/' + c[0] + '/' + r[1] + '/', vendor: r[2], grade: r[3], cat: c[1], key: norm(r[0]), old: norm(r[4] || ''), oldRaw: r[4] || '' };
            });
          });
      })
    ).then(function (lists) {
      index = [].concat.apply([], lists);
    });
    return loading;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function setActive(i) {
    var links = box.querySelectorAll('a');
    links.forEach(function (a, j) { a.classList.toggle('is-active', j === i); });
    active = i;
    if (links[i]) links[i].scrollIntoView({ block: 'nearest' });
  }

  function render() {
    var q = norm(input.value);
    active = -1;
    if (q.length < 2 || !index) { box.hidden = true; return; }
    var starts = [], contains = [], olds = [];
    for (var i = 0; i < index.length && starts.length < 20; i++) {
      var it = index[i];
      var pos = it.key.indexOf(q);
      if (pos === 0) starts.push(it);
      else if (pos > 0) { if (contains.length < 20) contains.push(it); }
      else if (it.old && it.old.indexOf(q) >= 0) { if (olds.length < 10) olds.push(it); }
    }
    var hits = starts.concat(contains, olds).slice(0, 20);
    box.textContent = '';
    if (!hits.length) {
      box.appendChild(el('p', 'empty', '“' + input.value.trim() + '”와 일치하는 모델이 없습니다. 모델명 앞부분만 입력해 보세요.'));
    }
    hits.forEach(function (it) {
      var a = el('a');
      a.href = it.url;
      a.setAttribute('role', 'option');
      a.appendChild(el('i', it.grade ? 'chip g' + it.grade : 'chip chip-none', it.grade ? String(it.grade) : '–'));
      a.appendChild(el('b', '', it.model));
      var meta = it.cat + (it.vendor ? ', ' + it.vendor : '');
      if (it.key.indexOf(q) < 0) meta += ', 구모델명 ' + it.oldRaw;
      a.appendChild(el('span', '', meta));
      box.appendChild(a);
    });
    box.hidden = false;
  }

  if (input && box) {
    input.addEventListener('focus', load);
    input.addEventListener('input', function () { load().then(render); });
    input.addEventListener('keydown', function (e) {
      var links = box.querySelectorAll('a');
      if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); setActive(Math.min(links.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp' && links.length) { e.preventDefault(); setActive(Math.max(0, active - 1)); }
      else if (e.key === 'Enter') { var t = links[active] || links[0]; if (t) location.href = t.href; }
      else if (e.key === 'Escape') { box.hidden = true; }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search')) box.hidden = true;
    });
  }

  // ---- 요금 계산기 ----
  var fmt = function (n, d) { return n.toLocaleString('ko-KR', { maximumFractionDigits: d || 0 }); };
  document.querySelectorAll('[data-calc]').forEach(function (root) {
    var form = root.querySelector('form');
    var d = root.dataset;
    function set(k, v, unit) {
      var dd = root.querySelector('[data-out="' + k + '"]');
      if (!dd) return;
      dd.textContent = v;
      var s = document.createElement('small');
      s.textContent = unit;
      dd.appendChild(s);
    }
    function calc() {
      var rate = parseFloat(form.rate.value) || 0;
      var usage = form.usage ? parseFloat(form.usage.value) || 0 : 0;
      var metric = parseFloat(d.metric);
      var cap = parseFloat(d.cap);
      var kwh;
      if (d.model === 'monthly_kwh') kwh = metric;
      else if (d.model === 'wh_per_cycle') kwh = (metric / 1000) * usage;
      else if (d.model === 'watt') kwh = (metric * usage * 30) / 1000;
      else if (d.model === 'watt_per_area') kwh = (metric * cap * usage * 30) / 1000;
      if (!isFinite(kwh)) return;
      set('kwh', fmt(kwh, 1), 'kWh');
      set('month', fmt(Math.round(kwh * rate)), '원');
      set('year', fmt(Math.round(kwh * 12 * rate)), '원');
    }
    form.addEventListener('input', calc);
  });
})();
