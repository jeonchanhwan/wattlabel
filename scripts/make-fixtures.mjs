// API 키 없이 빌드 파이프라인을 검증하기 위한 가짜 데이터 생성기.
// 실제 제품이 아니다. 모델명은 전부 SMPL- 로 시작하고 업체명은 "샘플/테스트"다.
// 응답 값 형식("9(kg)", "9,000(W)", "NULL")은 공공데이터포털 명세의 샘플 값을 따랐다.
import { categories, p, writeJson } from './lib/util.mjs';

let seed = 20261117;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b, d = 0) => Number((a + rnd() * (b - a)).toFixed(d));

const vendors = ['샘플전자(주)', '(주)테스트가전', '주식회사 예시일렉', '모의테크'];
const labs = ['샘플시험원', '테스트시험연구원'];
const date = () => `${between(2015, 2026)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`;

const gen = {
  refrigerator: () => {
    const capa = between(150, 900, 1);
    return { CAPA: String(capa), MONTH_CONS_PWR: String(between(15, 25, 2) + Number((capa * between(0.02, 0.05, 3)).toFixed(2))) };
  },
  'kimchi-refrigerator': () => {
    const capa = between(80, 560, 1);
    return { KIMCHI_AVAIL_CAPA: `${capa}(ℓ)`, MONTH_CONS_PWR: String(between(8, 14, 2) + Number((capa * 0.02).toFixed(2))), R: String(between(1, 3, 2)) };
  },
  'air-conditioner': () => {
    const capa = pick([2300, 2800, 5200, 6500, 7200, 9000, 11000, 13000, 16000, 18000]);
    const kwh = Number((capa * between(0.022, 0.034, 4)).toFixed(1));
    return {
      CAPA: `${capa.toLocaleString('en-US')}(W)`,
      MONTH_CONS_PWR1: `${kwh}(kWh/월)(1:1기준)`,
      MONTH_CONS_PWR2: rnd() < 0.5 ? `${(kwh * 1.25).toFixed(1)}(kWh/월)(1:2기준)` : 'NULL',
      EFFIC1: `${between(4, 8, 3)}(CSPF)(W/W)(1:1기준)`,
      EFFIC2: 'NULL',
    };
  },
  'washer-drum': () => {
    const kg = pick([9, 10, 12, 15, 17, 19, 21, 24, 25]);
    return { CLASS_CODE: pick(['일반제품', '네트워크제품']), STANDARD_CAPA: `${kg}(kg)`, CONS_PWR: `${Math.round(kg * between(22, 48))}(1회)`, R: String(between(40, 90, 1)) };
  },
  tv: () => {
    const cm = pick([81, 108, 125, 138, 163, 189, 214, 247]);
    return { DIAGO_LENGTH: `${cm}(cm)`, DISPLAY: pick(['LED', 'OLED', 'QLED']), R: `${(cm * between(0.5, 1.3, 3)).toFixed(1)}(W)` };
  },
  'air-purifier': () => {
    const area = between(15, 120, 1);
    return { STANDARD_CONS_AREA: `${area}(㎡)`, DEODORIZATION_EFFIC: `${between(70, 99)}(%)`, WAIT_PWR: `${between(0.3, 3, 1)}(W)`, CONS_PWR: `${between(0.3, 1.2, 2)}(W/㎡)` };
  },
};

const prefix = { refrigerator: 'RF', 'kimchi-refrigerator': 'KR', 'air-conditioner': 'AC', 'washer-drum': 'WD', tv: 'TV', 'air-purifier': 'AP' };

for (const cat of categories) {
  const rows = [];
  const count = Number(process.env.FIXTURE_COUNT || 140); // 대량 테스트: FIXTURE_COUNT=4000
  for (let i = 1; i <= count; i++) {
    const model = `SMPL-${prefix[cat.slug]}${String(i).padStart(4, '0')}${pick(['', 'W', 'K/A', ' S', '.B'])}`;
    const base = {
      APP_NO: String(100000000 + Math.floor(rnd() * 899999999)),
      ENTE_TERM: pick(vendors),
      MACH_TERM: cat.official,
      MODEL_TERM: model,
      OLDX_MODEL_TERM: rnd() < 0.3 ? `SMPL-OLD${prefix[cat.slug]}${String(i).padStart(4, '0')}` : 'NULL',
      MANUFAC_MAN_TERM: pick(['샘플전자', 'Sample Mfg Co., Ltd.', '테스트가전']),
      TEST_ORG_TERM: pick(labs),
      HPRO_YN_NM: pick(['국산', '국산', '수입']),
      SHIP_PRARG_DD: rnd() < 0.05 ? 'NULL' : date(),
      ...gen[cat.slug](),
      GRADE: rnd() < 0.03 ? 'NULL' : String(between(1, 5)),
      DATA_REG_DT: `${date()} 15:22:49`,
    };
    rows.push(base);
    // 같은 모델의 재신고(등급 기준 변경) 사례
    if (rnd() < 0.15) {
      rows.push({ ...base, APP_NO: String(100000000 + Math.floor(rnd() * 899999999)), SHIP_PRARG_DD: date(), GRADE: String(between(1, 5)) });
    }
  }
  writeJson(p('fixtures', 'raw', `${cat.slug}.json`), rows);
}
writeJson(p('fixtures', 'meta.json'), { source: 'fixture', fetchedAt: '2026-11-17T00:00:00.000Z', counts: {}, prevCounts: null }, true);
console.log('fixtures/raw/*.json 생성 완료 (가짜 데이터)');
