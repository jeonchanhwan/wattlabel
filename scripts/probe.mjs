// 키 발급 후 가장 먼저 실행: 품목별 totalCount와 실제 응답 필드를 확인한다.
// 사용: DATA_GO_KR_KEY=... node scripts/probe.mjs [--all]
//   --all : 1차 6개 품목 외에 EEP_01~29 전체의 totalCount도 조회
import { allCategories as categories, p, writeJson } from './lib/util.mjs';
import { callPage } from './lib/api.mjs';

const all = process.argv.includes('--all');
const report = [];
let failed = false;

const targets = all
  ? Array.from({ length: 29 }, (_, i) => {
      const op = `EEP_${String(i + 1).padStart(2, '0')}_LIST`;
      return categories.find((c) => c.op === op) || { op, name: `(미설정 ${op})`, slug: null };
    })
  : categories;

for (const cat of targets) {
  try {
    const { total, items, raw } = await callPage(cat.op, 1, 1);
    const sample = items[0] || {};
    const fields = Object.keys(sample);
    const expected = cat.slug
      ? [cat.capacity.field, cat.energy.field, ...cat.extra.map((e) => e.field), 'MODEL_TERM', 'GRADE', 'SHIP_PRARG_DD']
      : [];
    const missing = expected.filter((f) => !fields.includes(f));
    report.push({ op: cat.op, name: cat.name, machTerm: sample.MACH_TERM, total, fields, missing, sample });
    console.log(`\n[${cat.op}] ${cat.name}${cat.enabled === false ? ' (비활성)' : ''} → 기자재명: ${sample.MACH_TERM} / totalCount: ${total}`);
    console.log(`  필드: ${fields.join(', ')}`);
    if (missing.length) {
      failed = true;
      console.log(`  ⚠ config/categories.json 에 적힌 필드가 응답에 없음: ${missing.join(', ')}`);
    }
    if (cat.official && sample.MACH_TERM && sample.MACH_TERM !== cat.official) {
      failed = true;
      console.log(`  ⚠ 품목 불일치: 설정은 "${cat.official}", 응답은 "${sample.MACH_TERM}" → op 번호를 고칠 것`);
    }
    if (!fields.length && cat.enabled !== false) failed = true;
    if (!fields.length) console.log(`  원본 응답: ${JSON.stringify(raw).slice(0, 400)}`);
  } catch (err) {
    if (cat.enabled !== false) failed = true;
    console.log(`\n[${cat.op}] ${cat.name} 실패: ${err.message}`);
  }
}

const sum = report.filter((r) => categories.some((c) => c.op === r.op && c.enabled !== false)).reduce((a, r) => a + (r.total || 0), 0);
console.log(`\n활성 품목 신고 건수 합계: ${sum.toLocaleString()} (모델 병합 전)`);
writeJson(p('data', 'probe.json'), report, true);
console.log('상세 결과: data/probe.json');
process.exit(failed ? 1 : 0);
