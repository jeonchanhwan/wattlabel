import { site, categories, esc, fmt } from './util.mjs';
import { binLabel, binSlug, monthlyKwh } from './normalize.mjs';

const RATE = site.labelRateWonPerKwh;
const U = site.usageDefaults;
const n = (v) => Number(v).toLocaleString('ko-KR');

// CSS·JS 캐시 무효화용 버전 (빌드가 파일 내용 해시로 설정)
let ASSET_VER = '';
export const setAssetVersion = (v) => (ASSET_VER = v);

/** 순위를 '상위 n%' 또는 하위권이면 '하위 n%' 로 표현 */
const rankText = (m) => {
  const top = Math.max(1, Math.ceil((m.rank / m.binSize) * 100));
  if (top <= 50) return `상위 ${top}%`;
  const bottom = Math.max(1, Math.ceil(((m.binSize - m.rank + 1) / m.binSize) * 100));
  return `하위 ${bottom}%`;
};

const chip = (g) =>
  g ? `<i class="chip g${g}" title="${g}등급">${g}</i>` : '<i class="chip chip-none" title="등급 정보 없음">–</i>';

const capText = (cat, cap) => {
  if (cap === null) return '-';
  const base = `${fmt(cap)}${cat.capacity.unit}`;
  return cat.capacity.inch ? `${base} (약 ${Math.round(cap / 2.54)}인치)` : base;
};

/** 요금 계산의 전제 조건. 월간소비전력량이 라벨에 직접 나오는 품목은 사용량 가정이 없다. */
function usageNote(cat) {
  switch (cat.energy.model) {
    case 'wh_per_cycle':
      return `한 달 ${U.cyclesPerMonth}번 세탁`;
    case 'watt':
      return `하루 ${U.tvHoursPerDay}시간 시청`;
    case 'watt_per_area':
      return `하루 ${U.purifierHoursPerDay}시간 가동`;
    default:
      return cat.energy.seasonal ? '냉방기간 표준 시험 조건' : '표준 시험 조건';
  }
}

// 라벨의 1~5등급 계단을 축소한 로고
const MARK = `<svg class="mark" viewBox="0 0 22 20" aria-hidden="true">${[0, 1, 2, 3, 4]
  .map((i) => `<path d="M1 ${1 + i * 3.8}h${7 + i * 2.6}l1.6 1.4-1.6 1.4H1z" fill="var(--g${i + 1})"/>`)
  .join('')}</svg>`;

function searchBox(variant) {
  const ph = variant === 'hero' ? '모델명을 입력하세요' : '모델명 검색';
  return `<div class="search search-${variant}" role="search">
  <label class="sr" for="q">모델명 검색</label>
  <svg class="search-ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  <input type="search" id="q" placeholder="${ph}" autocomplete="off" spellcheck="false">
  ${variant === 'top' ? '<kbd class="search-kbd" aria-hidden="true">/</kbd>' : ''}
  <div id="results" class="results" role="listbox" hidden></div>
</div>`;
}

export function layout({ title, description, canonical, body, baseUrl, noindex = false, active = null, hideSearch = false }) {
  const nav = categories
    .map((c) => `<a href="/${c.slug}/"${active === c.slug ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`)
    .join('');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(baseUrl + canonical)}">`}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#eceff1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1317" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css">
<link rel="stylesheet" href="/assets/style.css?v=${ASSET_VER}">
<script src="/assets/app.js?v=${ASSET_VER}" defer></script>
</head>
<body>
<a class="skip" href="#main">본문 바로가기</a>
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="/">${MARK}<span>가전효율사전</span></a>
    <nav class="cats" aria-label="품목">${nav}</nav>
    ${hideSearch ? '' : searchBox('top')}
  </div>
</header>
<main id="main" class="wrap">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <p><strong>가전효율사전</strong>은 한국에너지공단이 공공데이터포털에 공개한 「에너지소비효율 등급 제품 정보」를 매주 받아 정리합니다. 모델명과 업체명은 신고 원문 표기입니다.</p>
    <p>전기요금은 표준 시험 조건에서 잰 소비전력량으로 계산한 참고값이라, 누진제가 붙는 실제 청구액과 다릅니다. <a href="/guide/label-cost/">계산 기준 보기</a></p>
  </div>
</footer>
<div id="tray" class="tray" hidden></div>
</body>
</html>
`;
}

/* ---------- 모델 상세 ---------- */

function energyLabel(cat, m, kwh) {
  const seasonal = !!cat.energy.seasonal;
  const rows = [1, 2, 3, 4, 5]
    .map(
      (g) =>
        `<div class="lrow${m.grade === g ? ' is-on' : ''}"><span class="step g${g}" style="--w:${40 + g * 12}%">${g}</span>${
          m.grade === g ? `<b class="pointer">${g}<small>등급</small></b>` : ''
        }</div>`,
    )
    .join('');
  const cost = kwh === null ? null : Math.round(kwh * RATE * (seasonal ? 1 : 12));
  return `<figure class="elabel${m.grade ? '' : ' is-unknown'}" aria-label="${m.grade ? `에너지소비효율 ${m.grade}등급` : '등급 정보 없음'}">
  <div class="elabel-top"><span>에너지소비효율등급</span><span>${esc(cat.official)}</span></div>
  <div class="ladder">${rows}</div>
  ${m.grade ? '' : '<p class="elabel-missing">등급 정보가 등록되어 있지 않습니다</p>'}
  <dl class="elabel-figs">
    <div><dt>${esc(cat.energy.label)}</dt><dd>${m.metric === null ? '-' : fmt(m.metric, 2)}<small>${esc(cat.energy.unit)}</small></dd></div>
    <div><dt>${seasonal ? '냉방기간 월 전기요금' : '연간 전기요금'}</dt><dd>${cost === null ? '-' : n(cost)}<small>원</small></dd></div>
  </dl>
  <figcaption>${esc(usageNote(cat))} 기준, 1kWh당 ${RATE}원으로 계산</figcaption>
</figure>`;
}

function summaryText(cat, m) {
  const out = [];
  out.push(
    `${m.vendor ? `${m.vendor}의 ` : ''}${cat.name} ${m.model}은(는) ${m.grade === null ? '등급 정보가 등록되어 있지 않습니다' : `에너지소비효율 ${m.grade}등급입니다`}.`,
  );
  if (m.metric !== null) {
    out.push(`${cat.capacity.label} ${capText(cat, m.cap)}에 ${cat.energy.label}은 ${fmt(m.metric, 2)}${cat.energy.unit}입니다.`);
  }
  if (m.rank && m.binSize >= 5) {
    const diff = m.metric - m.binMedian;
    if (Math.abs(diff) < 1e-9) out.push(`같은 용량대의 중간값과 같습니다.`);
    else
      out.push(
        `같은 용량대 중간값(${fmt(m.binMedian, 2)}${cat.energy.unit})보다 ${fmt(Math.abs(diff), 2)}${cat.energy.unit} ${diff < 0 ? '적게' : '많이'} 씁니다.`,
      );
  }
  return out.join(' ');
}

function histogram(cat, m) {
  if (!m.rank || !m.hist) return '';
  const { counts, lo, hi, clamped } = m.hist;
  const max = Math.max(...counts);
  const W = 10;
  const H = 84;
  const bars = counts
    .map((c, i) => {
      const h = c ? Math.max(3, (c / max) * (H - 2)) : 0;
      return `<rect x="${i * W + 1}" y="${(H - h).toFixed(1)}" width="${W - 2}" height="${h.toFixed(1)}"${i === m.histIdx ? ' class="on"' : ''}/>`;
    })
    .join('');
  const left = ((m.histIdx + 0.5) / counts.length) * 100;
  return `<div class="panel hist">
  <p class="hist-rank"><b>${n(m.rank)}</b><span>위 / ${n(m.binSize)}개</span><em class="tag">${rankText(m)}</em></p>
  <p class="hist-note">${esc(binLabel(cat, m.bin))} ${esc(cat.name)} 중 ${esc(cat.energy.label)}이 낮은 순서입니다.</p>
  <div class="hist-plot">
    <span class="hist-marker" style="left:${left.toFixed(2)}%">이 모델</span>
    <svg viewBox="0 0 ${counts.length * W} ${H}" preserveAspectRatio="none" role="img" aria-label="같은 용량대 ${n(m.binSize)}개 모델의 ${esc(cat.energy.label)} 분포">${bars}</svg>
  </div>
  <div class="hist-axis"><span>${fmt(lo, 1)} ${esc(cat.energy.unit)}<br>적게 씀</span><span>${fmt(hi, 1)}${clamped ? ' 이상' : ''} ${esc(cat.energy.unit)}<br>많이 씀</span></div>
</div>`;
}

function calculator(cat, m, kwh) {
  if (kwh === null) return '<div class="panel calc"><p>소비전력 정보가 없어 요금을 계산할 수 없습니다.</p></div>';
  const seasonal = !!cat.energy.seasonal;
  const usage =
    cat.energy.model === 'wh_per_cycle'
      ? `<label>한 달에 <input type="number" name="usage" inputmode="decimal" value="${U.cyclesPerMonth}" min="0" step="1"> 번 세탁</label>`
      : cat.energy.model === 'watt'
        ? `<label>하루 <input type="number" name="usage" inputmode="decimal" value="${U.tvHoursPerDay}" min="0" max="24" step="0.5"> 시간 시청</label>`
        : cat.energy.model === 'watt_per_area'
          ? `<label>하루 <input type="number" name="usage" inputmode="decimal" value="${U.purifierHoursPerDay}" min="0" max="24" step="0.5"> 시간 가동</label>`
          : '';
  const p = seasonal ? '냉방기간 월' : '월';
  return `<div class="panel calc" data-calc data-model="${cat.energy.model}" data-metric="${m.metric}" data-cap="${m.cap ?? ''}">
  <form class="calc-in" onsubmit="return false">
    <label>전기요금 1kWh당 <input type="number" name="rate" inputmode="numeric" value="${RATE}" min="0" step="1"> 원</label>
    ${usage}
  </form>
  <dl class="calc-out">
    <div><dt>${p} 소비전력량</dt><dd data-out="kwh">${fmt(kwh, 1)}<small>kWh</small></dd></div>
    <div><dt>${p} 전기요금</dt><dd data-out="month">${n(Math.round(kwh * RATE))}<small>원</small></dd></div>
    ${seasonal ? '' : `<div><dt>연간 전기요금</dt><dd data-out="year">${n(Math.round(kwh * RATE * 12))}<small>원</small></dd></div>`}
  </dl>
  <p class="fine">${RATE}원은 에너지라벨이 쓰는 단가입니다. 집 전체 사용량이 많으면 누진 구간 단가가 올라가니, 고지서의 1kWh당 평균 단가를 넣어 보세요.</p>
</div>`;
}

function alternatives(cat, m, alts) {
  if (!alts.length) return '';
  const seasonal = !!cat.energy.seasonal;
  const myKwh = monthlyKwh(cat, m.metric, m.cap);
  const items = alts
    .map((a) => {
      const kwh = monthlyKwh(cat, a.metric, a.cap);
      const save = myKwh !== null && kwh !== null ? (myKwh - kwh) * RATE * (seasonal ? 1 : 12) : null;
      return `<li><a href="/${cat.slug}/${a.slug}/">
  <span class="alt-rank">${n(a.rank)}위</span>
  ${chip(a.grade)}
  <span class="alt-name"><b>${esc(a.model)}</b><small>${esc(a.vendor || '업체 정보 없음')}, ${capText(cat, a.cap)}</small></span>
  <span class="alt-kwh">${fmt(a.metric, 2)}<small>${esc(cat.energy.unit)}</small></span>
  <span class="alt-save">${save !== null && save > 0 ? `${seasonal ? '월' : '연'} ${n(Math.round(save))}원 적게` : ''}</span>
</a></li>`;
    })
    .join('');
  return `<section class="sec">
  <h2>같은 용량대에서 전기를 덜 쓰는 모델</h2>
  <p class="sec-lead">${esc(binLabel(cat, m.bin))} 안에서 ${esc(cat.energy.label)}이 가장 낮은 모델입니다. 금액은 이 모델과의 차이입니다.</p>
  <ol class="alts">${items}</ol>
</section>`;
}

export function modelPage(cat, m, alts, baseUrl, fetchedAt) {
  const kwh = monthlyKwh(cat, m.metric, m.cap);
  const descParts = [
    `${m.model} ${cat.name}`,
    m.grade !== null ? `에너지소비효율 ${m.grade}등급` : null,
    m.metric !== null ? `${cat.energy.label} ${fmt(m.metric, 2)}${cat.energy.unit}` : null,
    kwh !== null ? `${cat.energy.seasonal ? '냉방기간 월' : '월'} 전기요금 약 ${n(Math.round(kwh * RATE))}원` : null,
    m.rank ? `같은 용량대 ${rankText(m)}` : null,
  ].filter(Boolean);

  const specRows = [
    ['모델명', esc(m.model)],
    m.oldModels.length ? ['구모델명', m.oldModels.map(esc).join(', ')] : null,
    ['업체', esc(m.vendor || '-')],
    ['제조원', esc(m.maker || '-')],
    ['에너지소비효율등급', m.grade === null ? '-' : `${m.grade}등급`],
    [esc(cat.capacity.label), capText(cat, m.cap)],
    [esc(cat.energy.label), m.metric === null ? '-' : `${fmt(m.metric, 2)}${esc(cat.energy.unit)}`],
    ...cat.extra.map((e, i) =>
      m.extra[i] === null ? null : [esc(e.label), e.text ? esc(m.extra[i]) : `${fmt(m.extra[i], 3)}${esc(e.unit)}`],
    ),
    ['출하예정일', esc(m.ship || '-')],
    ['국산/수입', esc(m.origin || '-')],
    ['시험기관', esc(m.lab || '-')],
  ]
    .filter(Boolean)
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');

  const history = m.history
    .map(
      (h) =>
        `<tr><td>${esc(h.ship || '-')}</td><td>${chip(h.grade)}</td><td class="num">${fmt(h.metric, 2)}</td><td class="num">${capText(cat, h.cap)}</td><td>${esc(h.appNo || '-')}</td><td>${esc(h.lab || '-')}</td></tr>`,
    )
    .join('');

  const body = `
<div class="mhead">
  <div class="mhead-text">
    <nav class="crumb" aria-label="위치"><a href="/">홈</a><span aria-hidden="true">›</span><a href="/${cat.slug}/">${esc(cat.name)}</a></nav>
    <p class="kind">${esc(m.vendor || '')} ${esc(cat.name)}</p>
    <h1 class="model" style="--len:${Math.max(6, [...m.model].length)}">${esc(m.model)}</h1>
    <p class="lead">${esc(summaryText(cat, m))}</p>
    <div class="actions">
      <button type="button" class="btn btn-primary btn-cmp" data-cmp="${cat.slug}/${m.slug}" data-name="${esc(m.model)}" aria-pressed="false" hidden>비교함에 담기</button>
      <a class="btn" href="https://search.shopping.naver.com/search/all?query=${encodeURIComponent(m.model)}" target="_blank" rel="nofollow noopener">네이버쇼핑 가격</a>
      <a class="btn" href="https://search.danawa.com/dsearch.php?query=${encodeURIComponent(m.model)}" target="_blank" rel="nofollow noopener">다나와 가격</a>
    </div>
  </div>
  ${energyLabel(cat, m, kwh)}
</div>

<div class="duo">
  <section class="sec">
    <h2>같은 용량대에서의 위치</h2>
    ${histogram(cat, m) || '<p class="sec-lead">비교할 같은 용량대 모델이 부족합니다.</p>'}
    ${m.rank ? `<p class="more"><a href="/${cat.slug}/size/${binSlug(cat, m.bin)}/">${esc(binLabel(cat, m.bin))} ${esc(cat.name)} 순위 전체 보기</a></p>` : ''}
  </section>
  <section class="sec">
    <h2>내 조건으로 전기요금 계산</h2>
    ${calculator(cat, m, kwh)}
  </section>
</div>

${alternatives(cat, m, alts)}

<section class="sec">
  <h2>제품 정보</h2>
  <dl class="spec">${specRows}</dl>
</section>

<section class="sec">
  <h2>신고 이력</h2>
  <p class="sec-lead">등급 기준은 몇 년마다 강화됩니다. 같은 모델명이라도 제조 시기에 따라 라벨 등급이 다를 수 있으니 제품에 붙은 라벨도 확인하세요. 위 내용은 출하예정일이 가장 늦은 신고 기준입니다.</p>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>출하예정일</th><th>등급</th><th class="num">${esc(cat.energy.label)}</th><th class="num">${esc(cat.capacity.label)}</th><th>신청번호</th><th>시험기관</th></tr></thead>
    <tbody>${history}</tbody>
  </table></div>
  <p class="stamp">데이터 기준일 ${esc(fetchedAt.slice(0, 10))}</p>
</section>`;

  return layout({
    title: `${m.model} 소비전력·에너지등급·전기요금 | ${cat.name} | ${site.name}`,
    description: `${descParts.join(', ')}.`,
    canonical: `/${cat.slug}/${m.slug}/`,
    body,
    baseUrl,
    active: cat.slug,
  });
}

/* ---------- 품목 목록 ---------- */

function gradeBar(counts, { compact = false } = {}) {
  const total = [1, 2, 3, 4, 5].reduce((a, g) => a + (counts[g] || 0), 0) || 1;
  const segs = [1, 2, 3, 4, 5]
    .filter((g) => counts[g])
    .map((g) => {
      const pct = (counts[g] / total) * 100;
      return `<span class="g${g}" style="flex:${counts[g]} 1 0">${!compact && pct >= 9 ? `${g}등급 ${Math.round(pct)}%` : ''}</span>`;
    })
    .join('');
  const label = [1, 2, 3, 4, 5].map((g) => `${g}등급 ${n(counts[g] || 0)}개`).join(', ');
  return `<div class="gbar${compact ? ' gbar-compact' : ''}" role="img" aria-label="${label}">${segs}</div>`;
}

/** 목록·순위 표의 한 줄. 열 구성은 app.js 의 renderRow 와 같아야 한다. */
function listRow(cat, m, { rank = false } = {}) {
  const kwh = monthlyKwh(cat, m.metric, m.cap);
  const name = m.hasPage ? `<a href="/${cat.slug}/${m.slug}/">${esc(m.model)}</a>` : esc(m.model);
  const cmp = m.hasPage
    ? `<button type="button" class="cmp-btn" data-cmp="${cat.slug}/${m.slug}" data-name="${esc(m.model)}" aria-pressed="false" hidden>비교</button>`
    : '';
  return `<tr>${rank ? `<td class="num c-rank">${n(m.rank)}</td>` : ''}<td class="cell-model">${name}<small>${esc(m.vendor || '-')}</small></td><td>${chip(m.grade)}</td><td class="num c-cap">${capText(cat, m.cap)}</td><td class="num c-metric">${fmt(m.metric, 2)}</td><td class="num c-cost">${kwh === null ? '-' : `${n(Math.round(kwh * RATE))}원`}</td>${rank ? '' : `<td class="num dim c-ship">${esc(m.ship || '-')}</td>`}<td class="c-cmp">${cmp}</td></tr>`;
}

function tableHead(cat, { rank = false } = {}) {
  const seasonal = !!cat.energy.seasonal;
  return `<thead><tr>${rank ? '<th class="num c-rank">순위</th>' : ''}<th>모델</th><th>등급</th><th class="num c-cap">${esc(cat.capacity.label)}</th><th class="num c-metric">${esc(cat.energy.label)}<small>${esc(cat.energy.unit)}</small></th><th class="num c-cost">${seasonal ? '냉방기간 월 요금' : '월 요금'}</th>${rank ? '' : '<th class="num c-ship">출하예정일</th>'}<th class="c-cmp"><span class="sr">비교</span></th></tr></thead>`;
}

function sizeNav(cat, binLinks, current = null) {
  if (!binLinks.length) return '';
  return `<nav class="sizes" aria-label="용량대별 순위">
  <p class="sizes-title">용량대별 전기 적게 쓰는 순위</p>
  <ul>${binLinks
    .map(
      (b) =>
        `<li><a href="/${cat.slug}/size/${b.slug}/"${current === b.i ? ' aria-current="page"' : ''}><b>${esc(b.label)}</b><span>${n(b.count)}개</span></a></li>`,
    )
    .join('')}</ul>
</nav>`;
}

export function listPage(cat, models, page, pages, total, gradeCounts, baseUrl, binLinks = [], vendors = []) {
  const url = page === 1 ? `/${cat.slug}/` : `/${cat.slug}/page/${page}/`;
  const rows = models.map((m) => listRow(cat, m)).join('');
  const link = (p) => (p === 1 ? `/${cat.slug}/` : `/${cat.slug}/page/${p}/`);
  const pager =
    pages > 1
      ? `<nav class="pager" aria-label="쪽 이동">${page > 1 ? `<a href="${link(page - 1)}" rel="prev">이전 쪽</a>` : '<span></span>'}<span>${page} / ${pages}쪽</span>${page < pages ? `<a href="${link(page + 1)}" rel="next">다음 쪽</a>` : '<span></span>'}</nav>`
      : '';
  const legend = [1, 2, 3, 4, 5].map((g) => `<li>${chip(g)}<span>${n(gradeCounts[g] || 0)}개</span></li>`).join('');
  const filters = `<form class="filters" id="filters" data-cat="${cat.slug}" data-page="${page}" onsubmit="return false" hidden>
  <div class="f-grades" role="group" aria-label="등급">${[1, 2, 3, 4, 5]
    .map((g) => `<button type="button" class="f-grade" data-g="${g}" aria-pressed="false">${chip(g)}<span>${g}등급</span></button>`)
    .join('')}</div>
  <div class="f-selects">
    <label class="f-field"><span>용량대</span><select name="b"><option value="">전체</option>${binLinks
      .map((b) => `<option value="${b.i}">${esc(b.label)} (${n(b.count)})</option>`)
      .join('')}</select></label>
    <label class="f-field"><span>업체</span><select name="v"><option value="">전체</option>${vendors
      .map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${n(v.count)})</option>`)
      .join('')}</select></label>
    <label class="f-field"><span>정렬</span><select name="s"><option value="new">최근 출하 순</option><option value="eff">${esc(cat.energy.label)} 낮은 순</option><option value="effd">${esc(cat.energy.label)} 높은 순</option><option value="cap">${esc(cat.capacity.label)} 큰 순</option></select></label>
  </div>
  <p class="f-count" id="f-count" aria-live="polite"></p>
</form>`;
  const body = `
<header class="lhead">
  <nav class="crumb" aria-label="위치"><a href="/">홈</a><span aria-hidden="true">›</span>${esc(cat.name)}</nav>
  <h1>${esc(cat.name)} <span class="lhead-count">${n(total)}개 모델</span></h1>
  <p class="lead">한국에너지공단에 신고된 ${esc(cat.official)} 전체입니다. 등급, 용량대, 업체로 좁히고 소비전력이 낮은 순으로 정렬해 보세요. 마음에 드는 모델은 비교함에 담아 나란히 비교할 수 있습니다.</p>
  ${gradeBar(gradeCounts)}
  <ul class="gbar-legend">${legend}</ul>
</header>
${sizeNav(cat, binLinks)}
${filters}
<div class="tbl-wrap"><table class="tbl tbl-list">
  ${tableHead(cat)}
  <tbody id="list-body">${rows}</tbody>
</table></div>
<button type="button" id="list-more" class="more-btn" hidden>더 보기</button>
${pager}`;
  return layout({
    title: `${cat.name} 에너지등급·소비전력 목록${page > 1 ? ` (${page}쪽)` : ''} | ${site.name}`,
    description: `${cat.name} ${n(total)}개 모델의 에너지소비효율등급, ${cat.energy.label}, ${cat.capacity.label}, 예상 전기요금을 등급·용량대·업체별로 찾아보세요.`,
    canonical: url,
    body,
    baseUrl,
    active: cat.slug,
  });
}

/* ---------- 용량대별 순위 ---------- */

export function sizePage(cat, binIndex, list, binLinks, baseUrl, fetchedAt) {
  const label = binLabel(cat, binIndex);
  const best = list[0];
  const worst = list[list.length - 1];
  const g1 = list.filter((m) => m.grade === 1).length;
  const seasonal = !!cat.energy.seasonal;
  const yr = (m) => {
    const k = monthlyKwh(cat, m.metric, m.cap);
    return k === null ? null : k * RATE * (seasonal ? 1 : 12);
  };
  const gap = list.length >= 2 && yr(worst) !== null && yr(best) !== null ? yr(worst) - yr(best) : null;
  const summary =
    gap !== null
      ? `1위 ${best.model}(${fmt(best.metric, 2)}${cat.energy.unit})와 마지막 ${worst.model}(${fmt(worst.metric, 2)}${cat.energy.unit})은 ${seasonal ? '냉방기간 한 달' : '1년'} 전기요금이 약 ${n(Math.round(gap))}원 차이 납니다.`
      : '';
  const body = `
<header class="lhead">
  <nav class="crumb" aria-label="위치"><a href="/">홈</a><span aria-hidden="true">›</span><a href="/${cat.slug}/">${esc(cat.name)}</a><span aria-hidden="true">›</span>${esc(label)}</nav>
  <h1>${esc(label)} ${esc(cat.name)} <span class="lhead-count">전기 적게 쓰는 순위</span></h1>
  <p class="lead">${esc(label)} ${esc(cat.official)} ${n(list.length)}개를 ${esc(cat.energy.label)}이 낮은 순서로 줄 세웠습니다. 이 중 1등급은 ${n(g1)}개입니다. ${esc(summary)}</p>
</header>
${sizeNav(cat, binLinks, binIndex)}
<div class="tbl-wrap"><table class="tbl tbl-list tbl-rank">
  ${tableHead(cat, { rank: true })}
  <tbody>${list.map((m) => listRow(cat, m, { rank: true })).join('')}</tbody>
</table></div>
<p class="stamp">데이터 기준일 ${esc(fetchedAt.slice(0, 10))}. 요금은 ${esc(usageNote(cat))} 기준, 1kWh당 ${RATE}원입니다.</p>`;
  return layout({
    title: `${label} ${cat.name} 소비전력 순위, 전기 적게 쓰는 모델 | ${site.name}`,
    description: `${label} ${cat.name} ${n(list.length)}개 모델을 ${cat.energy.label}이 낮은 순서로 정리했습니다. 1위 ${best.model}, 1등급 ${n(g1)}개.`,
    canonical: `/${cat.slug}/size/${binSlug(cat, binIndex)}/`,
    body,
    baseUrl,
    active: cat.slug,
  });
}

/* ---------- 비교 ---------- */

export function comparePage(baseUrl) {
  const body = `
<header class="lhead">
  <nav class="crumb" aria-label="위치"><a href="/">홈</a><span aria-hidden="true">›</span>모델 비교</nav>
  <h1>모델 비교</h1>
  <p class="lead">후보 모델을 최대 4개까지 나란히 놓고 등급, 소비전력량, 1년과 10년 전기요금 차이를 비교합니다.</p>
</header>
<div id="compare" class="compare">
  <div class="cmp-tools">
    <div class="search search-add" role="search">
      <label class="sr" for="cmp-q">비교할 모델 추가</label>
      <svg class="search-ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" id="cmp-q" placeholder="비교할 모델명 추가" autocomplete="off" spellcheck="false">
      <div id="cmp-results" class="results" hidden></div>
    </div>
    <label class="cmp-rate">전기요금 1kWh당 <input type="number" id="cmp-rate" inputmode="numeric" value="${RATE}" min="0" step="1"> 원</label>
  </div>
  <div id="cmp-body"><p class="sec-lead">비교 기능은 자바스크립트를 켜야 동작합니다.</p></div>
</div>`;
  return layout({
    title: `모델 비교 | ${site.name}`,
    description: '가전 후보 모델의 에너지등급, 소비전력량, 1년과 10년 전기요금 차이를 나란히 비교합니다.',
    canonical: '/compare/',
    noindex: true,
    body,
    baseUrl,
  });
}

/* ---------- 홈 ---------- */

function proofSection(pf) {
  const { cat, bin, count, best, worst } = pf;
  const yr = (m) => Math.round(monthlyKwh(cat, m.metric, m.cap) * RATE * 12);
  const diff = yr(worst) - yr(best);
  const row = (m, tone) => `<a class="pf-row pf-${tone}" href="/${cat.slug}/${m.slug}/">
    <span class="pf-who">${chip(m.grade)}<b>${esc(m.model)}</b><small>${esc(m.vendor || '')}, ${capText(cat, m.cap)}</small></span>
    <span class="pf-bar"><i style="width:${((m.metric / worst.metric) * 100).toFixed(1)}%"></i></span>
    <span class="pf-val"><b>${fmt(m.metric, 1)}</b><small>kWh/월</small><em>연 ${n(yr(m))}원</em></span>
  </a>`;
  return `<section class="sec proof">
  <div class="proof-text">
    <h2>${worst.metric / best.metric >= 1.5 ? `같은 1등급인데 전기요금은 ${fmt(worst.metric / best.metric, 1)}배` : '같은 1등급이라도 전기요금은 다릅니다'}</h2>
    <p class="lead">${esc(binLabel(cat, bin))} ${esc(cat.name)} 1등급 ${n(count)}개 중 가장 적게 쓰는 모델과 가장 많이 쓰는 모델입니다. 등급 숫자만 보지 말고 소비전력량과 용량대 순위를 함께 보세요.</p>
    <p class="proof-links"><a href="/compare/?m=${cat.slug}/${best.slug},${cat.slug}/${worst.slug}">두 모델 나란히 비교</a><a href="/${cat.slug}/size/${binSlug(cat, bin)}/">${esc(binLabel(cat, bin))} 순위 보기</a></p>
  </div>
  <div class="proof-viz">
    ${row(best, 'best')}
    ${row(worst, 'worst')}
    <p class="pf-diff"><span>1년 전기요금 차이</span><b>${n(diff)}<small>원</small></b></p>
  </div>
</section>`;
}

export function homePage(summary, baseUrl, fetchedAt, examples = [], proof = null) {
  const all = {};
  let total = 0;
  for (const s of summary) {
    total += s.models;
    for (const g of [1, 2, 3, 4, 5]) all[g] = (all[g] || 0) + (s.gradeCounts[g] || 0);
  }
  const max = Math.max(...[1, 2, 3, 4, 5].map((g) => all[g] || 0)) || 1;
  const ladder = [1, 2, 3, 4, 5]
    .map(
      (g) =>
        `<div class="lrow"><span class="step g${g}" style="--w:${28 + ((all[g] || 0) / max) * 62}%">${g}</span><span class="lcount">${n(all[g] || 0)}<small>개</small></span></div>`,
    )
    .join('');
  const names = summary.map((s) => s.cat.name).join(', ');
  const ex = examples.length
    ? `<p class="examples"><span>예시</span>${examples.map((e) => `<a href="/${e.cat}/${e.slug}/">${esc(e.model)}</a>`).join('')}</p>`
    : '';
  const cats = summary
    .map((s) => {
      const g1 = s.models ? Math.round(((s.gradeCounts[1] || 0) / s.models) * 100) : 0;
      return `<li><a class="cat-row" href="/${s.cat.slug}/">
  <span class="cat-name"><b>${esc(s.cat.name)}</b><small>${n(s.models)}개 모델</small></span>
  ${gradeBar(s.gradeCounts, { compact: true })}
  <span class="cat-g1">1등급 ${g1}%</span>
</a></li>`;
    })
    .join('');

  const body = `
<section class="hero">
  <div class="hero-text">
    <h1>이 모델, 전기 얼마나 쓸까</h1>
    <p class="lead">한국에너지공단에 신고된 ${esc(names)} ${n(total)}개 모델의 등급, 소비전력량, 예상 전기요금을 모델명으로 찾아보세요.</p>
    ${searchBox('hero')}
    ${ex}
  </div>
  <figure class="elabel elabel-home">
    <div class="elabel-top"><span>등급별 모델 수</span><span>${n(total)}개</span></div>
    <div class="ladder">${ladder}</div>
    <figcaption>데이터 기준일 ${esc(fetchedAt.slice(0, 10))}, 매주 갱신</figcaption>
  </figure>
</section>

<section class="sec">
  <h2>품목별로 보기</h2>
  <ul class="catlist">${cats}</ul>
</section>

${proof ? proofSection(proof) : ''}`;
  return layout({
    title: `${site.name}: 모델명으로 찾는 가전 에너지등급과 전기요금`,
    description: `${names} ${n(total)}개 모델의 에너지소비효율등급, 소비전력량, 예상 전기요금, 같은 용량대 순위를 모델명으로 확인하세요. 한국에너지공단 공공데이터 기반.`,
    canonical: '/',
    body,
    baseUrl,
    hideSearch: true,
  });
}

/* ---------- 안내, 404 ---------- */

export function guidePage(baseUrl) {
  const body = `
<article class="prose">
  <nav class="crumb" aria-label="위치"><a href="/">홈</a><span aria-hidden="true">›</span>계산 기준</nav>
  <h1>전기요금은 어떻게 계산했나</h1>
  <p class="lead">이 사이트의 전기요금은 실제 청구액이 아니라, 제품끼리 비교하기 위한 표준 조건 기준 참고값입니다.</p>
  <h2>품목별 계산식</h2>
  <dl class="spec spec-1">
    <div><dt>냉장고, 김치냉장고</dt><dd>월간소비전력량(kWh) × ${RATE}원. 연간은 여기에 12를 곱합니다.</dd></div>
    <div><dt>에어컨</dt><dd>냉방기간 월간소비전력량(kWh) × ${RATE}원. 냉방기간에만 해당하므로 연간 금액은 표시하지 않습니다.</dd></div>
    <div><dt>드럼세탁기</dt><dd>1회 세탁 소비전력량(Wh) × 한 달 세탁 횟수(기본 ${U.cyclesPerMonth}번) ÷ 1,000 × ${RATE}원.</dd></div>
    <div><dt>TV</dt><dd>소비전력(W) × 하루 시청 시간(기본 ${U.tvHoursPerDay}시간) × 30일 ÷ 1,000 × ${RATE}원.</dd></div>
    <div><dt>공기청정기</dt><dd>면적당 소비전력(W/㎡) × 표준사용면적(㎡) × 하루 가동 시간(기본 ${U.purifierHoursPerDay}시간) × 30일 ÷ 1,000 × ${RATE}원.</dd></div>
  </dl>
  <p>1kWh당 ${RATE}원은 에너지소비효율등급 라벨이 연간 에너지비용을 표시할 때 쓰는 단가입니다. 세탁 횟수와 사용 시간 기본값은 이 사이트가 정한 가정이며, 모델 페이지에서 바꿔 계산할 수 있습니다.</p>
  <h2>실제 청구액과 다른 이유</h2>
  <ul>
    <li>주택용 전기요금은 집 전체 사용량에 따라 단가가 올라가는 누진제가 적용됩니다.</li>
    <li>소비전력량은 정해진 시험 조건에서 잰 값이라 설치 환경과 사용 습관에 따라 달라집니다.</li>
    <li>기본요금, 부가가치세, 전력산업기반기금은 넣지 않았습니다.</li>
  </ul>
  <h2>순위는 어떻게 매겼나</h2>
  <p>같은 품목을 용량대로 나누고, 그 안에서 소비전력 지표가 낮은 순서로 순위를 매깁니다. 값이 같으면 같은 순위입니다.</p>
  <h2>데이터 출처</h2>
  <p>한국에너지공단이 공공데이터포털에 공개한 「에너지소비효율 등급 제품 정보」를 매주 받아 그대로 씁니다. 모델명과 업체명은 신고 원문 표기입니다.</p>
</article>`;
  return layout({
    title: `전기요금 계산 기준 | ${site.name}`,
    description: `에너지라벨 기준 1kWh당 ${RATE}원으로 가전 전기요금을 계산하는 방식과 실제 청구액과 다른 이유를 설명합니다.`,
    canonical: '/guide/label-cost/',
    body,
    baseUrl,
  });
}

export function notFoundPage(baseUrl) {
  return layout({
    title: `페이지를 찾을 수 없음 | ${site.name}`,
    description: '요청한 페이지가 없습니다.',
    canonical: '/404.html',
    noindex: true,
    baseUrl,
    body: `<article class="prose"><h1>이 주소에는 페이지가 없습니다</h1><p class="lead">모델명이 바뀌었거나 목록에서 빠진 모델일 수 있습니다. 위 검색창에 모델명 일부를 입력해 다시 찾아보세요.</p><p><a href="/">홈으로 가기</a></p></article>`,
  });
}
