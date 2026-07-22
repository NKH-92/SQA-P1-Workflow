## 목적

- 변경 목적:
- 단일 책임:

## 비목표

- 이번 PR에서 변경하지 않는 동작:

## 변경 파일

- production:
- tests:
- docs/ops:

## 보존 계약

- [ ] UI/문구/DOM/ARIA/hash/keyboard 계약 유지
- [ ] local/remote 결과와 오류 의미 유지
- [ ] RLS/RPC/audit/migration/deploy gate 유지
- [ ] public import/signature 호환 유지

## 검증 증거

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test -- --run`
- [ ] `npm run build`
- [ ] `npm run check:bundle`
- [ ] `git diff --check`
- [ ] RLS evidence 또는 해당 없음 사유
- [ ] E2E/component evidence 또는 해당 없음 사유
- [ ] 화면 비교 또는 해당 없음 사유

## 위험과 롤백

- migration 변경: 없음 / append-only migration
- dependency 변경: 없음 / 설명
- rollback: 이 PR 전체 revert
