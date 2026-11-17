// 정규화 → 순위 계산 → 정적 페이지 생성.
// 사용: node scripts/build.mjs            (data/raw 사용)
//       node scripts/build.mjs --fixtures (fixtures/raw 의 가짜 데이터 사용)
import fs from 'node:fs';
import path from 'node:path';
import { site, categories, p, readJson, writeJson, writeText, countFiles, esc } from './lib/util.mjs';
import { normalizeCategory } from './lib/normalize.mjs';
import { modelPage, listPage, homePage, guidePage, notFoundPage } from './lib/templates.mjs';

const useFixtures = process.argv.includes('--fixtures');
const dataDir = useFixtures ? p('fixtures') : p('data');
const rawDir = path.join(dataDir, 'raw');
const dist = p('dist');
const baseUrl = (process.env.SITE_URL || site.defaultUrl).replace(/\/+$/, '');

if (!fs.existsSync(rawDir)) {
  console.error(`${rawDir} 가 없습니다. 먼저 "npm run fetch"(API 키 필요) 또는 "npm run build:sample"을 실행하세요.`);
  process.exit(1);
}
const meta = fs.existsSync(path.join(dataDir, 'meta.json'))
  ? readJson(path.join(dataDir, 'meta.json'))
  : { source: 'unknown', fetchedAt: new Date().toISOString() };

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// 1) 정규화
const data = categories.map((cat) => {
  const rows = readJson(path.join(rawDir, `${cat.slug}.json`));
  return { cat, ...normalizeCategory(cat, rows) };
});

// 2) 상세 페이지를 만들 모델 선정: 전체에서 최근순으로 maxModelPages 개
let candidates = data.flatMap((d) => d.models);
if (site.minShipYear) candidates = candidates.filter((m) => m.date >= `${site.minShipYear}-01-01`);
candidates.sort((a, b) => (a.date < b.date ? 1 : -1));
candidates.slice(0, site.maxModelPages).forEach((m) => (m.hasPage = true));

// 3) 생성
const summary = [];
const sitemaps = [];
let modelPages = 0;

for (const { cat, models, bins, stats } of data) {
  // 구간별로 "페이지가 있는 모델"만 소비전력 낮은 순으로 준비 (추천 목록용)
  const binPaged = new Map([...bins].map(([i, list]) => [i, list.filter((m) => m.hasPage)]));
  const urls = [`/${cat.slug}/`];

  for (const m of models) {
    if (!m.hasPage) continue;
    const alts = (binPaged.get(m.bin) || []).filter((a) => a !== m && m.metric !== null && a.metric < m.metric).slice(0, 5);
    writeText(path.join(dist, cat.slug, m.slug, 'index.html'), modelPage(cat, m, alts, baseUrl, meta.fetchedAt));
    urls.push(`/${cat.slug}/${m.slug}/`);
    modelPages += 1;
  }

  const gradeCounts = {};
  for (const m of models) if (m.grade) gradeCounts[m.grade] = (gradeCounts[m.grade] || 0) + 1;
  const pages = Math.max(1, Math.ceil(models.length / site.listPageSize));
  for (let page = 1; page <= pages; page++) {
    const slice = models.slice((page - 1) * site.listPageSize, page * site.listPageSize);
    const file = page === 1 ? path.join(dist, cat.slug, 'index.html') : path.join(dist, cat.slug, 'page', String(page), 'index.html');
    writeText(file, listPage(cat, slice, page, pages, models.length, gradeCounts, baseUrl));
    if (page > 1) urls.push(`/${cat.slug}/page/${page}/`);
  }

  // 검색 인덱스: [모델명, slug, 업체, 등급, 구모델명들]
  writeJson(
    path.join(dist, 'search', `${cat.slug}.json`),
    models.filter((m) => m.hasPage).map((m) => [m.model, m.slug, m.vendor || '', m.grade || 0, m.oldModels.join(' ')]),
  );

  // sitemap (파일당 50,000 URL 제한)
  for (let i = 0; i < urls.length; i += 45000) {
    const name = `sitemap-${cat.slug}${i ? `-${i / 45000 + 1}` : ''}.xml`;
    writeText(
      path.join(dist, name),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .slice(i, i + 45000)
        .map((u) => `<url><loc>${esc(baseUrl + u)}</loc></url>`)
        .join('\n')}\n</urlset>\n`,
    );
    sitemaps.push(name);
  }

  summary.push({ cat, ...stats, gradeCounts, grade1: gradeCounts[1] || 0, paged: models.filter((m) => m.hasPage).length });
}

// 홈 예시: 품목마다 가장 최근에 출하된 1등급 모델 하나
const examples = data
  .map(({ cat, models }) => models.find((m) => m.hasPage && m.grade === 1))
  .filter(Boolean)
  .map((m) => ({ cat: data.find((d) => d.models.includes(m)).cat.slug, slug: m.slug, model: m.model }));

writeText(path.join(dist, 'index.html'), homePage(summary, baseUrl, meta.fetchedAt, examples));
writeText(path.join(dist, 'guide', 'label-cost', 'index.html'), guidePage(baseUrl));
writeText(path.join(dist, '404.html'), notFoundPage(baseUrl));

writeText(
  path.join(dist, 'sitemap-pages.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${baseUrl}/</loc></url>\n<url><loc>${baseUrl}/guide/label-cost/</loc></url>\n</urlset>\n`,
);
sitemaps.unshift('sitemap-pages.xml');
writeText(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps
    .map((s) => `<sitemap><loc>${baseUrl}/${s}</loc></sitemap>`)
    .join('\n')}\n</sitemapindex>\n`,
);
writeText(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
writeText(path.join(dist, '_headers'), `/assets/*\n  Cache-Control: public, max-age=86400\n/search/*\n  Cache-Control: public, max-age=3600\n`);

fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
const cats = JSON.stringify(categories.map((c) => [c.slug, c.name]));
fs.copyFileSync(p('src', 'static', 'style.css'), path.join(dist, 'assets', 'style.css'));
writeText(path.join(dist, 'assets', 'app.js'), `window.__CATS__=${cats};\n${fs.readFileSync(p('src', 'static', 'app.js'), 'utf8')}`);

// 4) 검사용 리포트 (dist 밖에 저장)
const fileCount = countFiles(dist);
const report = {
  source: meta.source,
  fetchedAt: meta.fetchedAt,
  baseUrl,
  fileCount,
  modelPages,
  prevCounts: meta.prevCounts || null,
  categories: summary.map((s) => ({
    slug: s.cat.slug,
    rows: s.rows,
    models: s.models,
    paged: s.paged,
    emptyRatio: s.models ? Number((s.emptyCount / s.models).toFixed(4)) : 1,
  })),
};
writeJson(p('.build', 'report.json'), report, true);

console.log(`빌드 완료 (${meta.source === 'fixture' ? '가짜 샘플 데이터' : meta.source}) → dist/`);
for (const c of report.categories) {
  console.log(`  ${c.slug.padEnd(20)} 신고 ${String(c.rows).padStart(6)}건 → 모델 ${String(c.models).padStart(6)}개 (상세 ${c.paged}개, 빈 값 ${(c.emptyRatio * 100).toFixed(1)}%)`);
}
console.log(`  파일 수: ${fileCount.toLocaleString()} / 제한 ${site.fileLimit.toLocaleString()}`);
