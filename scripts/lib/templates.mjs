import { site, categories, esc, fmt, won } from './util.mjs';
import { binLabel, monthlyKwh } from './normalize.mjs';

const RATE = site.labelRateWonPerKwh;
const U = site.usageDefaults;

/** 순위를 '상위 n%' 또는 하위권이면 '하위 n%' 로 표현 */
const rankText = (m) => {
  const top = Math.max(1, Math.ceil((m.rank / m.binSize) * 100));
  if (top <= 50) return `상위 ${top}%`;
  const bottom = Math.max(1, Math.ceil(((m.binSize - m.rank + 1) / m.binSize) * 100));
  return `하위 ${bottom}%`;
};

const gradeBadge = (g, big = false) =>
  g === null
    ? `<span class="grade grade-none${big ? ' grade-big' : ''}">등급 정보 없음</span>`
    : `<span class="grade grade-${g}${big ? ' grade-big' : ''}"><b>${g}</b>등급</span>`;

const capText = (cat, cap) => {
  if (cap === null) return '-';
  const base = `${fmt(cap)}${cat.capacity.unit}`;
  return cat.capacity.inch ? `${base} (약 ${Math.round(cap / 2.54)}인치)` : base;
};

/** 사용량 가정 문구. 월간소비전력량이 라벨에 직접 나오는 품목은 가정이 없다. */
function usageNote(cat) {
  switch (cat.energy.model) {
    case 'wh_per_cycle':
      return `월 ${U.cyclesPerMonth}회 세탁 가정`;
    case 'watt':
      return `하루 ${U.tvHoursPerDay}시간 시청 가정`;
    case 'watt_per_area':
      return `하루 ${U.purifierHoursPerDay}시간 가동 가정`;
    default:
      return cat.energy.seasonal ? '냉방기간 표준 시험 조건' : '표준 시험 조건';
  }
}

export function layout({ title, description, canonical, body, baseUrl, noindex = false }) {
  const nav = categories.map((c) => `<a href="/${c.slug}/">${esc(c.name)}</a>`).join('');
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
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/app.js" defer></script>
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="/">${esc(site.name)}</a>
    <form class="search" role="search" onsubmit="return false">
      <input type="search" id="q" placeholder="모델명 검색 (예: 일부만 입력해도 됨)" autocomplete="off" aria-label="모델명 검색">
      <div id="results" class="results" hidden></div>
    </form>
  </div>
  <nav class="wrap cats">${nav}</nav>
</header>
<main class="wrap">
${body}
</main>
<footer class="foot">
  <div class="wrap">
    <p>데이터 출처: 한국에너지공단 「에너지소비효율 등급 제품 정보」(공공데이터포털). 전기요금은 표준 시험 조건 기준 참고값이며 실제 청구액과 다릅니다.</p>
    <p><a href="/guide/label-cost/">요금 계산 기준</a> · <a href="https://eep.energy.or.kr/" rel="nofollow noopener">한국에너지공단 효율관리제도</a></p>
  </div>
</footer>
</body>
</html>
`;
}

/** 모델마다 달라지는 해석 문장. 페이지 간 중복도를 낮추는 용도. */
function summarySentences(cat, m) {
  const out = [];
  const vendor = m.vendor ? `${m.vendor}의 ` : '';
  out.push(
    `${m.model}은(는) ${vendor}${cat.name} 모델로, 에너지소비효율 ${m.grade === null ? '등급 정보가 등록되어 있지 않습니다' : `${m.grade}등급입니다`}.`,
  );
  if (m.metric !== null) {
    out.push(`${cat.energy.label}은 ${fmt(m.metric, 2)}${cat.energy.unit}${m.cap !== null ? `, ${cat.capacity.label}은 ${capText(cat, m.cap)}` : ''}입니다.`);
  }
  if (m.rank && m.binSize >= 5) {
    const diff = m.metric - m.binMedian;
    const cmp =
      Math.abs(diff) < 1e-9
        ? '구간 중앙값과 같습니다'
        : `구간 중앙값(${fmt(m.binMedian, 2)}${cat.energy.unit})보다 ${fmt(Math.abs(diff), 2)}${cat.energy.unit} ${diff < 0 ? '적게' : '많이'} 씁니다`;
    out.push(`같은 ${binLabel(cat, m.bin)} 구간 ${m.binSize.toLocaleString('ko-KR')}개 모델 중 ${m.rank.toLocaleString('ko-KR')}위(${rankText(m)})이며, ${cmp}.`);
  }
  return out;
}

function costBlock(cat, m) {
  const kwh = monthlyKwh(cat, m.metric, m.cap);
  if (kwh === null) return '<p class="muted">소비전력 정보가 없어 요금을 환산할 수 없습니다.</p>';
  const seasonal = !!cat.energy.seasonal;
  const usageInput =
    cat.energy.model === 'wh_per_cycle'
      ? `<label>월 세탁 횟수 <input type="number" name="usage" value="${U.cyclesPerMonth}" min="0" step="1"></label>`
      : cat.energy.model === 'watt'
        ? `<label>하루 시청 시간 <input type="number" name="usage" value="${U.tvHoursPerDay}" min="0" max="24" step="0.5"></label>`
        : cat.energy.model === 'watt_per_area'
          ? `<label>하루 가동 시간 <input type="number" name="usage" value="${U.purifierHoursPerDay}" min="0" max="24" step="0.5"></label>`
          : '';
  return `
<div class="cost">
  <div class="cost-main">
    <div><span class="k">${seasonal ? '냉방기간 월' : '월'} 소비전력량</span><span class="v" data-out="kwh">${fmt(kwh, 1)} kWh</span></div>
    <div><span class="k">${seasonal ? '냉방기간 월' : '월'} 전기요금</span><span class="v" data-out="month">${won(kwh * RATE)}</span></div>
    ${seasonal ? '' : `<div><span class="k">연간 전기요금</span><span class="v" data-out="year">${won(kwh * 12 * RATE)}</span></div>`}
  </div>
  <p class="note">${cat.energy.model === 'monthly_kwh' ? `${esc(usageNote(cat))} 기준 참고값` : `표준 시험 조건 기준 참고값 · ${esc(usageNote(cat))}`} · 1kWh당 ${RATE}원(에너지라벨 기준 단가). 실제 청구액은 가구 전체 사용량의 누진 구간에 따라 달라집니다.</p>
  <form class="calc" data-calc data-model="${cat.energy.model}" data-metric="${m.metric}" data-cap="${m.cap ?? ''}" data-seasonal="${seasonal ? 1 : 0}" onsubmit="return false">
    <strong>내 조건으로 다시 계산</strong>
    <label>1kWh당 단가(원) <input type="number" name="rate" value="${RATE}" min="0" step="1"></label>
    ${usageInput}
  </form>
</div>`;
}

function alternatives(cat, m, alts) {
  if (!alts.length) return '';
  const seasonal = !!cat.energy.seasonal;
  const myKwh = monthlyKwh(cat, m.metric, m.cap);
  const rows = alts
    .map((a) => {
      const kwh = monthlyKwh(cat, a.metric, a.cap);
      const save = myKwh !== null && kwh !== null ? (myKwh - kwh) * RATE * (seasonal ? 1 : 12) : null;
      return `<tr><td><a href="/${cat.slug}/${a.slug}/">${esc(a.model)}</a></td><td>${esc(a.vendor || '-')}</td><td>${gradeBadge(a.grade)}</td><td class="num">${capText(cat, a.cap)}</td><td class="num">${fmt(a.metric, 2)}</td><td class="num">${save !== null && save > 0 ? won(save) : '-'}</td></tr>`;
    })
    .join('');
  return `
<section>
  <h2>같은 구간에서 전기를 더 적게 쓰는 모델</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>모델</th><th>업체</th><th>등급</th><th>${esc(cat.capacity.label)}</th><th>${esc(cat.energy.label)}(${esc(cat.energy.unit)})</th><th>${seasonal ? '냉방기간 월' : '연간'} 차액</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="note">차액은 ${esc(usageNote(cat))}, 1kWh당 ${RATE}원 기준으로 이 모델과 비교한 값입니다.</p>
</section>`;
}

export function modelPage(cat, m, alts, baseUrl, fetchedAt) {
  const pct = m.rank ? Math.max(1, Math.ceil((m.rank / m.binSize) * 100)) : null;
  const kwh = monthlyKwh(cat, m.metric, m.cap);
  const descParts = [
    `${m.model} ${cat.name}`,
    m.grade !== null ? `에너지소비효율 ${m.grade}등급` : null,
    m.metric !== null ? `${cat.energy.label} ${fmt(m.metric, 2)}${cat.energy.unit}` : null,
    kwh !== null ? `${cat.energy.seasonal ? '냉방기간 월' : '월'} 전기요금 약 ${won(kwh * RATE)}` : null,
    pct ? `동급 ${rankText(m)}` : null,
  ].filter(Boolean);

  const extraRows = cat.extra
    .map((e, i) => (m.extra[i] === null ? '' : `<tr><th>${esc(e.label)}</th><td>${e.text ? esc(m.extra[i]) : `${fmt(m.extra[i], 3)}${esc(e.unit)}`}</td></tr>`))
    .join('');

  const history = m.history
    .map(
      (h) =>
        `<tr><td>${esc(h.ship || '-')}</td><td>${gradeBadge(h.grade)}</td><td class="num">${fmt(h.metric, 2)}</td><td class="num">${capText(cat, h.cap)}</td><td>${esc(h.appNo || '-')}</td><td>${esc(h.lab || '-')}</td></tr>`,
    )
    .join('');

  const rankBlock = m.rank
    ? `<section>
  <h2>같은 급 안에서의 순위</h2>
  <p><strong>${esc(binLabel(cat, m.bin))}</strong> 구간 ${m.binSize.toLocaleString('ko-KR')}개 모델 중 <strong>${m.rank.toLocaleString('ko-KR')}위</strong> (${esc(cat.energy.label)}이 낮은 순, ${rankText(m)})</p>
  <div class="bar" role="img" aria-label="${rankText(m)}"><i style="left:${Math.min(98, Math.max(0, pct - 1))}%"></i></div>
  <div class="bar-legend"><span>적게 씀</span><span>많이 씀</span></div>
</section>`
    : '';

  const body = `
<nav class="crumb"><a href="/">홈</a> › <a href="/${cat.slug}/">${esc(cat.name)}</a> › ${esc(m.model)}</nav>
<article>
  <header class="model-head">
    <div>
      <p class="eyebrow">${esc(m.vendor || '')} ${esc(cat.name)}</p>
      <h1>${esc(m.model)}</h1>
    </div>
    ${gradeBadge(m.grade, true)}
  </header>
  <p class="lead">${summarySentences(cat, m).map(esc).join(' ')}</p>

  <section>
    <h2>예상 전기요금</h2>
    ${costBlock(cat, m)}
  </section>

  ${rankBlock}

  <section>
    <h2>제품 정보</h2>
    <div class="tablewrap"><table class="spec">
      <tr><th>모델명</th><td>${esc(m.model)}</td></tr>
      ${m.oldModels.length ? `<tr><th>구모델명</th><td>${m.oldModels.map(esc).join(', ')}</td></tr>` : ''}
      <tr><th>업체</th><td>${esc(m.vendor || '-')}</td></tr>
      <tr><th>제조원</th><td>${esc(m.maker || '-')}</td></tr>
      <tr><th>에너지소비효율등급</th><td>${m.grade === null ? '-' : `${m.grade}등급`}</td></tr>
      <tr><th>${esc(cat.capacity.label)}</th><td>${capText(cat, m.cap)}</td></tr>
      <tr><th>${esc(cat.energy.label)}</th><td>${m.metric === null ? '-' : `${fmt(m.metric, 2)}${esc(cat.energy.unit)}`}</td></tr>
      ${extraRows}
      <tr><th>출하예정일</th><td>${esc(m.ship || '-')}</td></tr>
      <tr><th>국산/수입</th><td>${esc(m.origin || '-')}</td></tr>
      <tr><th>시험기관</th><td>${esc(m.lab || '-')}</td></tr>
    </table></div>
  </section>

  ${alternatives(cat, m, alts)}

  <section>
    <h2>신고 이력</h2>
    <p class="note">등급 기준은 주기적으로 강화됩니다. 같은 모델명이라도 제조 시기에 따라 라벨의 등급이 다를 수 있으니, 제품에 붙은 라벨의 적용 기준일을 함께 확인하세요. 위 요약은 출하예정일이 가장 늦은 신고 건 기준입니다.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>출하예정일</th><th>등급</th><th>${esc(cat.energy.label)}(${esc(cat.energy.unit)})</th><th>${esc(cat.capacity.label)}</th><th>신청번호</th><th>시험기관</th></tr></thead>
      <tbody>${history}</tbody>
    </table></div>
  </section>
  <p class="muted">데이터 기준일: ${esc(fetchedAt.slice(0, 10))} · 한국에너지공단 신고 자료 원문 기준</p>
</article>`;

  return layout({
    title: `${m.model} 소비전력·에너지등급·전기요금 | ${cat.name} | ${site.name}`,
    description: `${descParts.join(', ')}.`,
    canonical: `/${cat.slug}/${m.slug}/`,
    body,
    baseUrl,
  });
}

export function listPage(cat, models, page, pages, total, gradeCounts, baseUrl) {
  const url = page === 1 ? `/${cat.slug}/` : `/${cat.slug}/page/${page}/`;
  const rows = models
    .map(
      (m) =>
        `<tr><td>${m.hasPage ? `<a href="/${cat.slug}/${m.slug}/">${esc(m.model)}</a>` : esc(m.model)}</td><td>${esc(m.vendor || '-')}</td><td>${gradeBadge(m.grade)}</td><td class="num">${capText(cat, m.cap)}</td><td class="num">${fmt(m.metric, 2)}</td><td>${esc(m.ship || '-')}</td></tr>`,
    )
    .join('');
  const link = (n) => (n === 1 ? `/${cat.slug}/` : `/${cat.slug}/page/${n}/`);
  const pager =
    pages > 1
      ? `<nav class="pager">${page > 1 ? `<a href="${link(page - 1)}">← 이전</a>` : '<span></span>'}<span>${page} / ${pages}</span>${page < pages ? `<a href="${link(page + 1)}">다음 →</a>` : '<span></span>'}</nav>`
      : '';
  const dist = [1, 2, 3, 4, 5].map((g) => `<li>${gradeBadge(g)} <span>${(gradeCounts[g] || 0).toLocaleString('ko-KR')}개</span></li>`).join('');
  const body = `
<nav class="crumb"><a href="/">홈</a> › ${esc(cat.name)}</nav>
<h1>${esc(cat.name)} 에너지등급·소비전력 목록</h1>
<p class="lead">한국에너지공단에 신고된 ${esc(cat.official)} ${total.toLocaleString('ko-KR')}개 모델을 출하예정일 최근순으로 정리했습니다. 모델명을 누르면 예상 전기요금과 같은 급 내 순위를 볼 수 있습니다.</p>
${page === 1 ? `<ul class="dist">${dist}</ul>` : ''}
<div class="tablewrap"><table>
  <thead><tr><th>모델</th><th>업체</th><th>등급</th><th>${esc(cat.capacity.label)}</th><th>${esc(cat.energy.label)}(${esc(cat.energy.unit)})</th><th>출하예정일</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
${pager}`;
  return layout({
    title: `${cat.name} 에너지등급·소비전력 목록${page > 1 ? ` (${page}쪽)` : ''} | ${site.name}`,
    description: `${cat.name} ${total.toLocaleString('ko-KR')}개 모델의 에너지소비효율등급, ${cat.energy.label}, ${cat.capacity.label}을 모델별로 확인하세요.`,
    canonical: url,
    body,
    baseUrl,
  });
}

export function homePage(summary, baseUrl, fetchedAt) {
  const cards = summary
    .map(
      (s) =>
        `<a class="card" href="/${s.cat.slug}/"><strong>${esc(s.cat.name)}</strong><span>${s.models.toLocaleString('ko-KR')}개 모델</span><span class="muted">1등급 ${s.grade1.toLocaleString('ko-KR')}개</span></a>`,
    )
    .join('');
  const body = `
<section class="hero">
  <h1>${esc(site.tagline)}</h1>
  <p class="lead">가전 모델명을 위 검색창에 입력하면 에너지소비효율등급, 소비전력량, 예상 전기요금, 같은 급 제품 안에서의 순위를 바로 볼 수 있습니다.</p>
</section>
<section>
  <h2>품목별 보기</h2>
  <div class="cards">${cards}</div>
</section>
<section>
  <h2>이 사이트가 보여주는 것</h2>
  <ul class="plain">
    <li><strong>같은 급 내 순위</strong> — 같은 1등급이라도 소비전력량은 다릅니다. 같은 품목·용량 구간 안에서 몇 번째로 적게 쓰는지 보여줍니다.</li>
    <li><strong>전기요금 환산</strong> — 에너지라벨과 같은 1kWh당 ${RATE}원 기준으로 계산하고, 단가와 사용 시간을 바꿔 다시 계산할 수 있습니다.</li>
    <li><strong>신고 이력</strong> — 같은 모델명이라도 기준 변경으로 등급이 달라진 경우 이력을 표로 보여줍니다.</li>
  </ul>
  <p class="muted">데이터 기준일: ${esc(fetchedAt.slice(0, 10))}</p>
</section>`;
  return layout({
    title: `${site.name} — ${site.tagline}`,
    description: '가전 모델명으로 에너지소비효율등급, 소비전력량, 예상 전기요금, 동급 내 순위를 확인하는 사이트. 한국에너지공단 공공데이터 기반.',
    canonical: '/',
    body,
    baseUrl,
  });
}

export function guidePage(baseUrl) {
  const body = `
<nav class="crumb"><a href="/">홈</a> › 요금 계산 기준</nav>
<article>
  <h1>전기요금은 어떻게 계산했나</h1>
  <p class="lead">이 사이트의 전기요금은 실제 청구액이 아니라, 제품끼리 비교하기 위한 표준 조건 기준 참고값입니다.</p>
  <h2>계산식</h2>
  <ul class="plain">
    <li><strong>냉장고·김치냉장고</strong>: 월간소비전력량(kWh) × ${RATE}원. 연간은 × 12.</li>
    <li><strong>에어컨</strong>: 냉방기간 월간소비전력량(kWh) × ${RATE}원. 냉방기간에만 해당하므로 연간 금액은 표시하지 않습니다.</li>
    <li><strong>드럼세탁기</strong>: 1회 세탁 소비전력량(Wh) × 월 세탁 횟수(기본 ${U.cyclesPerMonth}회) ÷ 1,000 × ${RATE}원.</li>
    <li><strong>TV</strong>: 소비전력(W) × 하루 시청 시간(기본 ${U.tvHoursPerDay}시간) × 30일 ÷ 1,000 × ${RATE}원.</li>
    <li><strong>공기청정기</strong>: 면적당 소비전력(W/㎡) × 표준사용면적(㎡) × 하루 가동 시간(기본 ${U.purifierHoursPerDay}시간) × 30일 ÷ 1,000 × ${RATE}원.</li>
  </ul>
  <p>1kWh당 ${RATE}원은 에너지소비효율등급 라벨의 연간 에너지비용 표시에 쓰이는 단가입니다. 세탁 횟수와 사용 시간의 기본값은 이 사이트가 정한 가정이며, 각 모델 페이지에서 직접 바꿔 계산할 수 있습니다.</p>
  <h2>실제 청구액과 다른 이유</h2>
  <ul class="plain">
    <li>주택용 전기요금은 가구 전체 사용량에 따라 단가가 올라가는 누진제가 적용됩니다.</li>
    <li>소비전력량은 정해진 시험 조건에서 측정한 값이라 설치 환경과 사용 습관에 따라 달라집니다.</li>
    <li>기본요금, 부가가치세, 전력산업기반기금은 포함하지 않았습니다.</li>
  </ul>
  <h2>순위 계산 방식</h2>
  <p>같은 품목을 용량 구간으로 나누고, 구간 안에서 소비전력 지표가 낮은 순으로 순위를 매깁니다. 값이 같으면 같은 순위입니다.</p>
  <h2>데이터 출처</h2>
  <p>한국에너지공단이 공공데이터포털에 공개한 「에너지소비효율 등급 제품 정보」를 주 1회 수집해 그대로 사용합니다. 모델명과 업체명은 신고 원문 표기입니다.</p>
</article>`;
  return layout({
    title: `전기요금 계산 기준 | ${site.name}`,
    description: `에너지라벨 기준 1kWh당 ${RATE}원으로 가전 전기요금을 환산하는 방식과 실제 청구액과 다른 이유를 설명합니다.`,
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
    body: `<h1>페이지를 찾을 수 없습니다</h1><p class="lead">모델명이 바뀌었거나 목록에서 빠진 모델일 수 있습니다. 위 검색창에서 모델명을 다시 찾아보세요.</p><p><a href="/">홈으로</a></p>`,
  });
}
