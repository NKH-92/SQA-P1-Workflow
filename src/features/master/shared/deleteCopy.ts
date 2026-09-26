/**
 * 마스터 삭제 확인 칸의 안내 문구. 삭제하면 함께 사라지는 것과, 되돌릴 방법이 없을 때 대신 할 수 있는 일을 알려준다.
 */
export const masterDeleteWarnings = {
  allowedUser: '계정 목록에서만 지워져요. 이미 가입한 사람의 로그인을 막으려면 [비활성화]를 눌러 주세요. 계정을 완전히 지우려면 관리자에게 요청해 주세요.',
  product: '변경 적용 이력이 있는 제품은 기록을 지키기 위해 삭제할 수 없어요.',
  productWithAssignments: (count: number) =>
    `담당자 배정 ${count}건도 함께 삭제돼요. 변경 적용 이력이 있는 제품은 기록을 지키기 위해 삭제할 수 없어요.`,
  duty: '이 업무의 담당자 배정도 함께 삭제돼요.',
  dutyMajorCategory: '빈 대분류를 삭제해요. 삭제 사유는 감사 이력에 남아요.',
} as const
