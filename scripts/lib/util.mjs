import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const p = (...parts) => path.join(ROOT, ...parts);

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJson = (file, data, pretty = false) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0));
};
export const writeText = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

export const site = readJson(p('config', 'site.json'));
/** 설정의 전체 품목 (probe 용) */
export const allCategories = readJson(p('config', 'categories.json'));
/** 수집·빌드 대상: enabled 가 true 인 품목만 */
export const categories = allCategories.filter((c) => c.enabled !== false);

/** API 값("9(kg)", "9,000(W)", "246(kWh/월)(1:1기준)", "NULL")에서 맨 앞 숫자만 꺼낸다. */
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** "NULL", 빈 문자열, "-" 를 null 로 통일. */
export function cleanText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || /^(null|-|없음|해당없음)$/i.test(s)) return null;
  return s;
}

/** "2017-07-01", "20170701", "2022-05-10 15:22:49" → "YYYY-MM-DD" 또는 null */
export function parseDate(v) {
  const s = cleanText(v);
  if (!s) return null;
  const m = s.match(/(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (+y < 1990 || +y > 2100 || +mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo}-${d}`;
}

/** 모델명 → URL slug. 대문자 통일, 영문·숫자·하이픈 외 문자는 하이픈. */
export function slugify(model) {
  return String(model)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 업체명 표기 통일: 법인 표기 제거. */
export function normalizeVendor(name) {
  const s = cleanText(name);
  if (!s) return null;
  return s
    .normalize('NFKC')
    .replace(/\(주\)|주식회사|\(유\)|유한회사|\(사\)/g, '')
    .replace(/\s+/g, ' ')
    .trim() || s;
}

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function fmt(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

export const won = (n) => (n === null || !Number.isFinite(n) ? '-' : `${Math.round(n).toLocaleString('ko-KR')}원`);

export function countFiles(dir) {
  let n = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) n += countFiles(path.join(dir, ent.name));
    else n += 1;
  }
  return n;
}
