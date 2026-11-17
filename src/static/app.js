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

  function render() {
    var q = norm(input.value);
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
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '일치하는 모델이 없습니다.';
      box.appendChild(p);
    }
    hits.forEach(function (it) {
      var a = document.createElement('a');
      a.href = it.url;
      var b = document.createElement('b');
      b.textContent = it.model;
      var s = document.createElement('span');
      var isOld = it.key.indexOf(q) < 0;
      s.textContent = [it.cat, it.vendor, it.grade ? it.grade + '등급' : '', isOld ? '구모델명 ' + it.oldRaw : ''].filter(Boolean).join(' · ');
      a.appendChild(b);
      a.appendChild(s);
      box.appendChild(a);
    });
    box.hidden = false;
  }

  if (input) {
    input.addEventListener('focus', load);
    input.addEventListener('input', function () { load().then(render); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = box.querySelector('a'); if (first) location.href = first.href; }
      if (e.key === 'Escape') box.hidden = true;
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search')) box.hidden = true;
    });
  }

  // ---- 요금 계산기 ----
  var won = function (n) { return Math.round(n).toLocaleString('ko-KR') + '원'; };
  document.querySelectorAll('[data-calc]').forEach(function (form) {
    var root = form.closest('.cost');
    var d = form.dataset;
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
      var set = function (k, v) { var el = root.querySelector('[data-out="' + k + '"]'); if (el) el.textContent = v; };
      set('kwh', kwh.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + ' kWh');
      set('month', won(kwh * rate));
      set('year', won(kwh * 12 * rate));
    }
    form.addEventListener('input', calc);
  });
})();
