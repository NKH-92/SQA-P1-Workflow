/**
 * 파트장이 계정을 만들거나 비밀번호를 초기화할 때 쓰는 공통 임시 비밀번호(docs/OPERATIONS.md 계정 절).
 * 같은 값이 Edge Function 두 곳(supabase/functions/account-admin, complete-password-change)에도 있다.
 * 바꿀 때는 이 상수, 두 함수, OPERATIONS.md, 원격 E2E fixture를 함께 바꾼다.
 */
export const TEMPORARY_PASSWORD = '12345678'
