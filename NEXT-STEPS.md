# 다음에 할 일 체크리스트

> 부부 공용 가계부 프로젝트. 우선순위 순으로 정리. (작성: 2026-07-13)

## 🔴 보안 (먼저)

- [ ] **API 키 재발급(rotate)** — 채팅으로 노출된 키들을 새로 발급
  - [ ] Supabase: Project Settings → API → anon key / service_role key 재발급
  - [ ] OpenAI: platform.openai.com → 기존 `sk-proj-...` 키 폐기 후 새 키 발급
  - [ ] 재발급 후 로컬 `.env.local`과 Vercel 환경변수 모두 새 값으로 교체

## 🟠 버그 수정

- [ ] **알림 테이블 마이그레이션 적용** — `notification_events` / `notification_reads` 누락 상태
  - Supabase SQL Editor에서 `supabase/migrations/20260707130000_create_notification_events.sql` 실행
  - 적용 후 알림 벨/알림 기능 동작 확인

## 🟡 새로 만든 예산 기능 실사용

- [ ] 로그인 → 상단 "예산" 탭에서 **전체 지출 예산**부터 걸어보기
- [ ] 거래를 몇 건 저장하면 카테고리가 생김 → 그다음 **카테고리별 예산** 설정
- [ ] 대시보드·보고서의 "남은 예산"이 실제 값으로 잘 나오는지 확인

## 🟢 선택 (여유 될 때)

- [ ] **반복거래 자동화** — `/api/jobs/create-recurring-transactions`를 Vercel Cron으로 매일 자동 실행 (지금은 수동 curl)
- [ ] **영수증 인식** 품질 확인 — README에 "초안"으로 표기됨, 실물 영수증으로 테스트
- [ ] **Vercel 배포 상태 확인** — 실제 배포돼 있는지 미확인 (로컬엔 `.vercel` 링크 없음)
- [ ] `NEXT-STEPS.md`를 git에 커밋할지 결정 (지금은 로컬 파일)

---
_이 체크리스트는 Claude에게 "내 할일 뭐였지?" 하고 물으면 다시 안내받을 수 있어요._
