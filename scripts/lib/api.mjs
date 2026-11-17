import { site } from './util.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function getKey() {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) {
    console.error('DATA_GO_KR_KEY 환경변수가 없습니다. 공공데이터포털에서 발급받은 인증키를 넣으세요.');
    process.exit(1);
  }
  // 포털은 인코딩/디코딩 키를 둘 다 준다. '%'가 있으면 이미 인코딩된 키로 본다.
  return key.includes('%') ? key : encodeURIComponent(key);
}

/** 응답 구조가 문서에 예시로 없어서, 구조에 의존하지 않고 값을 찾는다. */
function findKey(obj, name) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (!Array.isArray(obj) && name in obj) return obj[name];
  for (const v of Object.values(obj)) {
    const r = findKey(v, name);
    if (r !== undefined) return r;
  }
  return undefined;
}

function findItems(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.length && obj.every((x) => x && typeof x === 'object' && 'MODEL_TERM' in x)) return obj;
    for (const v of obj) {
      const r = findItems(v);
      if (r) return r;
    }
    return null;
  }
  if ('MODEL_TERM' in obj) return [obj]; // 결과가 1건일 때 배열이 아닌 객체로 오는 경우
  for (const v of Object.values(obj)) {
    const r = findItems(v);
    if (r) return r;
  }
  return null;
}

export function parseResponse(text) {
  const t = text.trim();
  if (t.startsWith('<')) {
    const msg = (t.match(/<(returnAuthMsg|errMsg|resultMsg)>([^<]*)</) || [])[2];
    throw new Error(`JSON이 아닌 응답(XML/HTML): ${msg || t.slice(0, 200)}`);
  }
  const json = JSON.parse(t);
  const code = findKey(json, 'resultCode');
  if (code !== undefined && !['0', '00', 0].includes(code)) {
    throw new Error(`API 오류 resultCode=${code} resultMsg=${findKey(json, 'resultMsg')}`);
  }
  const total = Number(findKey(json, 'totalCount') ?? 0);
  return { total, items: findItems(json) || [], raw: json };
}

export async function callPage(op, pageNo, numOfRows = 100, { retries = 3 } = {}) {
  const url = `${site.apiBase}/${op}?serviceKey=${getKey()}&pageNo=${pageNo}&numOfRows=${numOfRows}&apiType=json`;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return parseResponse(text);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(2000 * attempt);
    }
  }
  throw new Error(`${op} page ${pageNo} 실패(${retries}회 시도): ${lastErr.message}`);
}

export async function fetchAll(op, { onProgress } = {}) {
  const rows = [];
  let total = null;
  for (let pageNo = 1; pageNo <= 5000; pageNo++) {
    const { total: t, items } = await callPage(op, pageNo, 100);
    if (total === null) total = t;
    rows.push(...items);
    onProgress?.(rows.length, total);
    if (!items.length || rows.length >= total) break;
    await sleep(150);
  }
  if (total && rows.length < total * 0.98) {
    throw new Error(`${op}: totalCount=${total}인데 ${rows.length}건만 수집됨`);
  }
  return { total, rows };
}
