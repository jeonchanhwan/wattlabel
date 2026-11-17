// 품목별 전체 수집. 한 품목이라도 실패하면 기존 스냅샷(data/raw)을 건드리지 않는다.
// 사용: DATA_GO_KR_KEY=... node scripts/fetch.mjs
import fs from 'node:fs';
import { categories, p, readJson, writeJson } from './lib/util.mjs';
import { fetchAll } from './lib/api.mjs';

const rawDir = p('data', 'raw');
const tmpDir = p('data', 'raw.tmp');
const metaFile = p('data', 'meta.json');

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

const counts = {};
try {
  for (const cat of categories) {
    process.stdout.write(`${cat.name} (${cat.op}) 수집 중...`);
    const { total, rows } = await fetchAll(cat.op);
    if (!rows.length) throw new Error(`${cat.op}: 0건 수집됨`);
    writeJson(`${tmpDir}/${cat.slug}.json`, rows);
    counts[cat.slug] = rows.length;
    console.log(` ${rows.length.toLocaleString()}건 (totalCount ${total})`);
  }
} catch (err) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error(`\n수집 실패 → 이전 스냅샷 유지: ${err.message}`);
  process.exit(1);
}

const prev = fs.existsSync(metaFile) ? readJson(metaFile) : null;
fs.mkdirSync(rawDir, { recursive: true });
for (const cat of categories) {
  fs.renameSync(`${tmpDir}/${cat.slug}.json`, `${rawDir}/${cat.slug}.json`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });
writeJson(
  metaFile,
  {
    source: 'api',
    fetchedAt: new Date().toISOString(),
    counts,
    prevCounts: prev?.source === 'api' ? prev.counts : null,
  },
  true,
);
console.log('수집 완료: data/raw/*.json, data/meta.json');
