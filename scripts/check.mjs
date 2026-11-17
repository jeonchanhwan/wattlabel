// 배포 전 검사. 하나라도 걸리면 exit 1 → 워크플로가 배포를 중단하고 기존 사이트가 유지된다.
// 사용: node scripts/check.mjs [--allow-fixtures]
import fs from 'node:fs';
import { site, p, readJson } from './lib/util.mjs';

const reportFile = p('.build', 'report.json');
if (!fs.existsSync(reportFile)) {
  console.error('.build/report.json 이 없습니다. 먼저 빌드하세요.');
  process.exit(1);
}
const r = readJson(reportFile);
const errors = [];
const warns = [];

if (r.source !== 'api' && !process.argv.includes('--allow-fixtures')) {
  errors.push(`데이터 출처가 "${r.source}"입니다. 실제 API 데이터가 아니면 배포하지 않습니다.`);
}
if (r.fileCount > site.fileLimit) {
  errors.push(`파일 수 ${r.fileCount} > 제한 ${site.fileLimit} (Cloudflare Pages 한도 20,000)`);
}
if (r.baseUrl.includes('example.pages.dev')) {
  warns.push('SITE_URL 이 설정되지 않아 canonical/sitemap 이 example.pages.dev 로 생성됨');
}
for (const c of r.categories) {
  if (c.models === 0) errors.push(`${c.slug}: 모델 0개`);
  if (c.emptyRatio > site.check.maxEmptyRatio) {
    errors.push(`${c.slug}: 등급 또는 소비전력이 빈 모델 ${(c.emptyRatio * 100).toFixed(1)}% > ${(site.check.maxEmptyRatio * 100).toFixed(0)}% (필드 매핑 확인 필요)`);
  }
  const prev = r.prevCounts?.[c.slug];
  if (prev && c.rows < prev * (1 - site.check.maxCountDropRatio)) {
    errors.push(`${c.slug}: 신고 건수 급감 ${prev} → ${c.rows}`);
  }
}

warns.forEach((w) => console.log(`경고: ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`실패: ${e}`));
  process.exit(1);
}
console.log(`검사 통과: 파일 ${r.fileCount.toLocaleString()}개, 모델 상세 ${r.modelPages.toLocaleString()}개`);
