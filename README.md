# Couple Budget

부부가 함께 거래를 기록하고 계좌, 반복 결제, 예산, 소비 흐름을 확인하는 공동 가계부입니다.

## 포함된 구성

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, RLS 기반 household 데이터 격리
- 모바일 빠른 거래 입력과 영수증 인식 초안
- 계좌, 구독비/고정비, 대시보드, 보고서, 알림
- 확인 필요한 거래와 곧 나갈 돈 캘린더
- OpenAI 소비 조언과 iOS Shortcuts webhook

## 실행 방법

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 로컬 점검 명령어

타입, 린트, 보안/스키마 회귀 테스트, 프로덕션 빌드를 각각 확인합니다.

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Supabase CLI를 사용한다면 migration 적용도 함께 확인합니다.

```bash
supabase db push
```

Vercel에 새 migration이 자동 적용되지는 않습니다. 배포 전에 Supabase SQL Editor 또는 Supabase CLI로 `supabase/migrations`의 파일을 이름순으로 적용해 주세요.

## 환경변수

`.env.local`에 아래 값을 채워 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
SHORTCUTS_WEBHOOK_SECRET=
JOB_SECRET=
SETUP_SECRET=
HOUSEHOLD_NAME=우리집 공동 가계부
HUSBAND_EMAIL=
HUSBAND_PASSWORD=
HUSBAND_NAME=남편
WIFE_EMAIL=
WIFE_PASSWORD=
WIFE_NAME=아내
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_NAME=관리자
```

Supabase 연결 기능을 사용하려면 URL, anon key, service role key를 모두 넣어야 합니다. `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, 각종 secret은 브라우저에 노출되는 `NEXT_PUBLIC_` 이름으로 만들면 안 됩니다.

`JOB_SECRET`은 서버 작업 API를 직접 호출할 때 쓰는 비밀값입니다. 운영 환경에서는 반드시 설정해 주세요.

`OPENAI_MODEL`은 AI 소비 조언 생성에 사용할 모델입니다. 필요하면 운영 환경에서 다른 모델로 바꿀 수 있습니다.

## 로그인 계정 만들기

Vercel 환경변수에 `SETUP_SECRET`, 남편/아내/관리자 이메일과 비밀번호를 넣은 뒤 아래 주소를 한 번 호출하면 Supabase Auth 계정 3개와 household 멤버 연결이 만들어집니다.

```bash
curl -X POST https://YOUR_VERCEL_DOMAIN/api/setup/login-accounts \
  -H "Authorization: Bearer $SETUP_SECRET" \
  -H "Content-Type: application/json"
```

생성되는 역할은 아래와 같습니다.

- 남편: `member`, `member_label=husband`
- 아내: `member`, `member_label=wife`
- 관리자: `owner`

수입/지출을 저장하면 `transactions.user_id`에 현재 로그인한 사용자가 자동으로 들어갑니다. 설정 화면은 관리자 역할인 `owner`만 접근할 수 있습니다.

## 주요 경로

- `/`
- `/login`
- `/dashboard`
- `/m/new`
- `/transactions`
- `/accounts`
- `/recurring`
- `/settings`

## 반복 거래 직접 만들기

`recurring_items`에서 오늘까지 결제일이 도래한 active 항목을 찾아 `transactions`에 `source=recurring`으로 저장합니다.

```bash
curl -X POST http://localhost:3000/api/jobs/create-recurring-transactions \
  -H "Authorization: Bearer $JOB_SECRET" \
  -H "Content-Type: application/json"
```

테스트 날짜를 지정하려면 아래처럼 호출합니다.

```bash
curl -X POST http://localhost:3000/api/jobs/create-recurring-transactions \
  -H "Authorization: Bearer $JOB_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"today":"2026-07-06"}'
```

## AI 소비 조언 생성

로그인된 사용자의 household 데이터를 월간 집계로 요약해 OpenAI에 전달하고, 생성된 조언을 `ai_advice_logs`에 저장합니다. 원본 거래 전체, 계좌번호, 카드번호, 상점명은 전달하지 않아요.

```bash
curl -X POST http://localhost:3000/api/ai/spending-advice \
  -H "Content-Type: application/json"
```

특정 household를 지정하려면 아래처럼 호출합니다.

```bash
curl -X POST http://localhost:3000/api/ai/spending-advice \
  -H "Content-Type: application/json" \
  -d '{"household_id":"HOUSEHOLD_ID"}'
```

## iOS Shortcuts 거래 저장 Webhook

Shortcuts에서 `POST /api/shortcuts/transactions`로 JSON을 보내면 거래가 저장됩니다. `shortcut_secret`은 `.env.local`의 `SHORTCUTS_WEBHOOK_SECRET`과 같아야 합니다. 본문 대신 `x-shortcut-secret` 헤더나 `Authorization: Bearer ...` 헤더로 보내도 됩니다.

```bash
curl -X POST http://localhost:3000/api/shortcuts/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "household_id": "HOUSEHOLD_ID",
    "user_id": "USER_ID",
    "shortcut_secret": "SHORTCUT_SECRET",
    "amount": 12000,
    "type": "expense",
    "category": "식비",
    "account": "신한카드",
    "merchant": "김밥집",
    "memo": "점심",
    "spent_at": "2026-07-06T12:30:00+09:00"
  }'
```

카테고리는 이름으로 찾고 없으면 만듭니다. 계좌는 활성 계좌 이름으로 찾으며, 같은 이름의 활성 계좌가 여러 개 있으면 저장하지 않아요.

단축어 재시도로 같은 거래가 두 번 저장되는 일을 막으려면 요청마다 고유한 `idempotency_key`를 본문에 넣거나 `x-idempotency-key` 헤더로 보내세요. 같은 household에서 같은 키를 다시 보내면 기존 거래를 반환합니다.

## shadcn/ui 컴포넌트 추가

`components.json`과 `@/*` alias가 준비되어 있습니다. 새 컴포넌트는 아래처럼 추가합니다.

```bash
npx shadcn@latest add input card dialog select tabs
```

## 배포 전 확인

1. Supabase migration을 모두 적용합니다.
2. Vercel 환경변수를 Production과 Preview 환경에 맞게 등록합니다.
3. 새 배포를 실행한 뒤 로그인, 거래 저장, 계좌 조회를 확인합니다.
4. `JOB_SECRET`, `SHORTCUTS_WEBHOOK_SECRET`, `SETUP_SECRET`은 서로 다른 긴 임의 문자열을 사용합니다.
