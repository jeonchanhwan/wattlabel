import { site, parseNum, cleanText, parseDate, slugify, normalizeVendor } from './util.mjs';

/** 원본 1행 → 공통 구조 */
function toRecord(cat, row) {
  const model = cleanText(row.MODEL_TERM);
  if (!model) return null;
  const grade = parseNum(row.GRADE);
  return {
    appNo: cleanText(row.APP_NO),
    vendor: normalizeVendor(row.ENTE_TERM),
    model,
    oldModel: cleanText(row.OLDX_MODEL_TERM),
    maker: cleanText(row.MANUFAC_MAN_TERM),
    lab: cleanText(row.TEST_ORG_TERM),
    origin: cleanText(row.HPRO_YN_NM),
    ship: parseDate(row.SHIP_PRARG_DD),
    grade: grade !== null && grade >= 1 && grade <= 5 ? Math.round(grade) : null,
    cap: parseNum(row[cat.capacity.field]),
    metric: parseNum(row[cat.energy.field]),
    extra: cat.extra.map((e) => (e.text ? cleanText(row[e.field]) : parseNum(row[e.field]))),
  };
}

// DATA_REG_DT 는 실제 등록일이 아니라 API 조회 시각이 들어온다(2026-11-17 확인). 정렬에 쓰지 않는다.
const sortDate = (r) => r.ship || '0000-00-00';

export function binIndex(cat, cap) {
  if (cap === null) return -1;
  const edges = cat.capacity.bins;
  let i = 0;
  while (i < edges.length && cap >= edges[i]) i++;
  return i;
}

export function binLabel(cat, i) {
  const { bins, unit } = cat.capacity;
  if (i < 0) return '용량 정보 없음';
  if (i === 0) return `${bins[0]}${unit} 미만`;
  if (i === bins.length) return `${bins[bins.length - 1]}${unit} 이상`;
  return `${bins[i - 1]}~${bins[i]}${unit}`;
}

/** 표준 조건 기준 월 소비전력량(kWh). 세탁기·TV·공기청정기는 사용량 가정이 들어간다. */
export function monthlyKwh(cat, metric, cap, usage = site.usageDefaults) {
  if (metric === null) return null;
  switch (cat.energy.model) {
    case 'monthly_kwh':
      return metric;
    case 'wh_per_cycle':
      return (metric / 1000) * usage.cyclesPerMonth;
    case 'watt':
      return (metric * usage.tvHoursPerDay * 30) / 1000;
    case 'watt_per_area':
      return cap === null ? null : (metric * cap * usage.purifierHoursPerDay * 30) / 1000;
    default:
      return null;
  }
}

/** 품목 하나를 모델 단위로 병합하고 순위를 계산한다. */
export function normalizeCategory(cat, rows) {
  const records = rows.map((r) => toRecord(cat, r)).filter(Boolean);

  // 1) 모델 병합. slug가 같아도 대문자 통일한 모델명이 다르면 별개 모델로 보고 -2, -3을 붙인다.
  const bySlug = new Map();
  for (const rec of records) {
    const base = slugify(rec.model);
    if (!base) continue;
    const norm = rec.model.normalize('NFKC').toUpperCase().replace(/\s+/g, ' ');
    if (!bySlug.has(base)) bySlug.set(base, new Map());
    const variants = bySlug.get(base);
    if (!variants.has(norm)) variants.set(norm, []);
    variants.get(norm).push(rec);
  }

  const models = [];
  for (const [base, variants] of bySlug) {
    let n = 0;
    for (const recs of variants.values()) {
      n += 1;
      recs.sort((a, b) => (sortDate(a) < sortDate(b) ? 1 : -1));
      // 완전히 같은 신고(같은 신청번호)는 한 번만
      const seen = new Set();
      const history = recs.filter((r) => {
        const k = `${r.appNo}|${r.ship}|${r.grade}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const cur = history[0];
      const oldModels = [...new Set(history.map((r) => r.oldModel).filter((o) => o && slugify(o) !== base))];
      models.push({
        slug: n === 1 ? base : `${base}-${n}`,
        ...cur,
        date: sortDate(cur),
        oldModels,
        history,
        bin: binIndex(cat, cur.cap),
      });
    }
  }

  // 2) 최근순 정렬 (목록 기본 순서)
  models.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1));

  // 3) 용량 구간별 순위: 소비전력 지표가 낮을수록 상위
  const bins = new Map();
  for (const m of models) {
    if (m.metric === null || m.bin < 0) continue;
    if (!bins.has(m.bin)) bins.set(m.bin, []);
    bins.get(m.bin).push(m);
  }
  for (const list of bins.values()) {
    list.sort((a, b) => a.metric - b.metric);
    let rank = 0;
    list.forEach((m, i) => {
      if (i === 0 || list[i - 1].metric !== m.metric) rank = i + 1; // 동률은 같은 순위
      m.rank = rank;
      m.binSize = list.length;
    });
    const mid = list[Math.floor(list.length / 2)];
    list.forEach((m) => (m.binMedian = mid.metric));
  }

  const emptyCount = models.filter((m) => m.grade === null || m.metric === null).length;
  return { models, bins, stats: { rows: rows.length, models: models.length, emptyCount } };
}
