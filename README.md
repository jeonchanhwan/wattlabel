# 가전효율사전

가전 모델명으로 에너지등급, 소비전력량, 예상 전기요금, 같은 급 내 순위를 보여주는 정적 사이트.
한국에너지공단 「에너지소비효율 등급 제품 정보」 API를 주 1회 수집해 모델당 HTML 1개를 만들고 Cloudflare Pages에 올린다.

기획 배경과 후보 비교는 상위 폴더의 `공공데이터 기반 정적 웹서비스 기획 — 후보 검증 및 선정안.docx` 참고.

## 현재 상태

| 항목 | 상태 |
|---|---|
| 수집·정규화·순위·페이지 생성·검사 스크립트 | 작성 완료. **가짜 샘플 데이터**로 동작 확인 |
| 파일 수 제한 | 모델 24,000개 샘플로 확인: 상세 18,000개로 잘리고 총 18,141개 파일 |
| 실제 API 호출 | 2026-11-17 개발계정 키로 확인. 6개 품목 중 3개만 정상 (아래 표) |
| GitHub 저장소, Cloudflare Pages 프로젝트 | 미생성 |

## 사이트 기능

| 기능 | 위치 | 설명 |
|---|---|---|
| 모델 상세 | `/{품목}/{모델}/` | 등급 라벨, 같은 용량대 분포와 순위, 요금 계산기, 덜 쓰는 모델, 신고 이력, 네이버쇼핑·다나와 가격 링크 |
| 품목 목록 + 필터 | `/{품목}/` | 등급·용량대·업체 필터, 소비전력·용량 정렬. 조건은 URL(`?g=1&b=9&s=eff`)로 공유 가능 |
| 용량대별 순위 | `/{품목}/size/{구간}/` | 같은 용량대를 소비전력 낮은 순으로. 검색 유입용 정적 페이지 |
| 비교 | `/compare/?m=품목/모델,품목/모델` | 최대 4개. 1년·10년 전기요금 차이, 순위. 비교함은 브라우저 localStorage 에 저장 |
| 검색 | 모든 페이지 상단, `/` 단축키 | 모델명·구모델명 부분 일치 |

필터와 비교는 빌드가 만드는 `/data/{품목}.json` 을 브라우저에서 읽어 동작한다. 서버 기능(Functions)은 쓰지 않는다.

## 동작 구조

1. GitHub Actions가 주 1회(월요일 04:00 KST) API에서 품목별 데이터를 수집한다. 한 품목이라도 실패하면 이전 스냅샷을 유지한다.
2. 원본을 `data` 브랜치에 커밋한다.
3. 모델명 정리, 중복 병합, 품목·용량 구간별 순위를 계산한다.
4. 모델당 HTML 1개씩 정적 페이지를 만든다.
5. 파일 수(19,500개 이하), 빈 값 비율, 전주 대비 급감을 검사한다. 걸리면 배포하지 않는다.
6. `wrangler pages deploy`로 Cloudflare Pages에 올린다.

## 1차 범위

- 품목 6개: 냉장고, 김치냉장고, 에어컨, 드럼세탁기, TV, 공기청정기
- 기능: 모델 상세, 품목 목록(200개씩 쪽 나눔), 검색, 요금 계산기, 주간 자동 배포
- 이후: 품목 12개로 확장, 2개 모델 비교, 제조사·등급별 목록

## 처음 할 일 (순서대로)

### 1. API 키 발급과 필드 확인

1. [공공데이터포털 API 페이지](https://www.data.go.kr/data/15100647/openapi.do)에서 활용신청 (개발계정은 자동승인).
2. 키를 환경변수에 넣고 확인 스크립트를 실행한다.

`.env.example`을 `.env`로 복사하고 `DATA_GO_KR_KEY=` 뒤에 키를 넣는다. `.env`는 git에 올라가지 않는다.

```powershell
npm run probe          # 6개 품목의 totalCount와 응답 필드 출력
npm run probe -- --all # 29개 품목 전체 totalCount
```

`probe`는 `config/categories.json`에 적힌 필드명이 실제 응답에 없거나 품목이 다르면 경고를 낸다. 경고가 나오면 그 파일의 `op`나 `field`를 고친다.

**API 경로 확인 결과 (2026-11-17)**

포털 화면의 상세기능 번호와 실제 경로 번호가 다르다. `EEP_01`~`EEP_32`를 모두 호출해서 확인했다.

| 품목 | 경로 | 신고 건수 | 상태 |
|---|---|---|---|
| 냉장고 | `EEP_20_LIST` | 5,583 | 정상, `enabled: true` |
| 김치냉장고 | `EEP_13_LIST` | 4,060 | 정상, `enabled: true` |
| 공기청정기 | `EEP_08_LIST` | 2,339 | 정상, `enabled: true` |
| 에어컨 | `EEP_24` 또는 `EEP_28` (추정) | - | HTTP 200 빈 응답(0바이트). `enabled: false` |
| TV | `EEP_17` (추정) | - | 60초 후 504 SERVICETIMEOUT. `enabled: false` |
| 드럼세탁기 | `EEP_06` (추정, 일반은 `EEP_01`) | 0 | 정상 응답이나 0건. `enabled: false` |

- 비활성 3개 품목은 경로와 필드명이 검증되지 않았다. 주기적으로 `npm run probe`를 다시 돌려 응답이 오면 필드를 맞추고 `enabled`를 켠다. 계속 안 되면 공공데이터포털 해당 API의 "오류신고"로 문의한다.
- API 응답이 호출당 약 16초 걸린다(건수와 무관). 3개 품목 전체 수집에 약 30분.
- 비슷한 경로가 더 있다: 전기밥솥은 `EEP_11`(~2025.06.30 기준), 제습기 `EEP_19`, 전기레인지 `EEP_22`. 2단계 확장 때 참고.

### 2. 로컬에서 실제 데이터로 빌드

```powershell
npm run fetch    # data/raw/*.json 생성
npm run build
npm run check
npm run preview  # http://localhost:8788
```

표본 20개 모델을 [공단 검색 화면](https://eep.energy.or.kr/)과 대조해 등급·소비전력량이 일치하는지 확인한다.

키 없이 화면만 보려면 `npm run build:sample` (가짜 데이터, 모델명이 전부 `SMPL-`로 시작).

### 3. GitHub와 Cloudflare 연결

1. GitHub에 빈 저장소를 만들고 이 폴더를 push 한다.
2. Cloudflare Pages 프로젝트를 만든다: `npx wrangler login` 후 `npx wrangler pages project create <프로젝트명> --production-branch=main`
3. Cloudflare 대시보드에서 "Cloudflare Pages: Edit" 권한의 API 토큰을 만든다.
4. GitHub 저장소 Settings → **Secrets and variables → Actions** 에 등록한다. (Environments 가 아님)

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `DATA_GO_KR_KEY` | 공공데이터포털 인증키 |
| Secret | `CLOUDFLARE_API_TOKEN` | 위에서 만든 토큰 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| Variable | `CF_PAGES_PROJECT` | Pages 프로젝트명 |
| Variable | `SITE_URL` | 사이트 주소. 예: `https://프로젝트명.pages.dev` |

5. Actions 탭에서 "주간 수집·빌드·배포"를 수동 실행한다.

### 4. 착수 전 확인할 가정 (기획서 5장)

- 모델명 키워드의 실제 검색량은 조회하지 못했다. 네이버 키워드 도구로 표본 20개를 먼저 본다. 대부분 월 10회 미만이면 2순위 후보(자격 합격률)로 전환을 검토한다.
- 네이버·구글에서 모델명 5~10개를 직접 검색해 모델 단위 경쟁 사이트가 없는지 다시 확인한다.

## 폴더 구조

```
config/categories.json   품목별 API 경로, 필드 매핑, 용량 구간
config/site.json         단가(160원/kWh), 페이지·파일 수 제한, 검사 기준, 사용량 가정
scripts/probe.mjs        키 발급 후 필드·건수 확인
scripts/fetch.mjs        전체 수집
scripts/build.mjs        정규화 → 순위 → dist/ 생성
scripts/check.mjs        배포 전 검사
scripts/make-fixtures.mjs 가짜 샘플 데이터 생성
scripts/lib/             API 호출, 정규화, 템플릿
src/static/              공용 CSS·JS 1개씩
.github/workflows/       주간 배포 워크플로
```

외부 npm 패키지는 쓰지 않는다. Node 22.9 이상만 있으면 된다.

## 계산 기준

- 요금: 월 소비전력량(kWh) × 160원. 160원은 에너지라벨의 연간 에너지비용 표시 단가.
- 세탁기(월 20회), TV(하루 5시간), 공기청정기(하루 12시간)의 사용량 기본값은 **임의로 정한 가정**이다. `config/site.json`의 `usageDefaults`에서 바꾼다. 방문자는 페이지에서 직접 바꿔 계산할 수 있다.
- 누진 구간 단가는 넣지 않았다.
- 순위: 같은 품목·용량 구간에서 소비전력 지표가 낮은 순. 구간 경계는 `config/categories.json`의 `bins`이며 실제 분포를 본 뒤 조정이 필요하다.
- 같은 모델명에 신고가 여러 건이면 페이지는 1개, 요약은 출하예정일이 가장 늦은 건 기준, 나머지는 신고 이력 표에 나온다.

## 품목 추가

`config/categories.json`에 항목을 추가한다. `energy.model`은 네 가지 중 하나다.

| 값 | 의미 | 예 |
|---|---|---|
| `monthly_kwh` | 월간소비전력량이 그대로 제공됨 | 냉장고 |
| `wh_per_cycle` | 1회당 Wh | 세탁기 |
| `watt` | 소비전력 W | TV |
| `watt_per_area` | 면적당 W, 용량 필드가 면적 | 공기청정기 |
