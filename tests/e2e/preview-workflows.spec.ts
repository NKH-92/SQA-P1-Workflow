import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '홈', exact: true })).toBeVisible()
})

test('01 leader and member navigation scopes remain distinct', async ({ page }) => {
  await expect(page.getByRole('button', { name: '검토 통계', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^제품/ })).toBeVisible()
  await page.getByRole('button', { name: '파트원', exact: true }).click()
  await expect(page.getByRole('button', { name: '검토 통계', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^제품/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^내 검토요청/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^변경 적용/ })).toBeVisible()
})

test('02 command palette preserves keyboard navigation and hash routing', async ({ page }) => {
  await page.keyboard.press('Control+K')
  const search = page.getByRole('dialog', { name: '빠른 이동' }).getByRole('textbox')
  await expect(search).toBeVisible()
  await search.fill('공지')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/announcements/)
  await expect(page.getByRole('heading', { name: '공지 게시판', exact: true })).toBeVisible()
})

test('03 review lifecycle updates the request after explicit confirmation', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/#/reviews')
  const detail = page.getByRole('article').first()
  await expect(detail.getByRole('button', { name: '완료 처리' })).toBeVisible()
  await detail.getByRole('button', { name: '완료 처리' }).click()
  await expect(page.getByText('완료 상태로 전환했습니다.')).toBeVisible()
  await expect(detail.getByRole('button', { name: '다시 열기' })).toBeVisible()
})

test('04 project create update and delete remain one local workflow', async ({ page }) => {
  await page.goto('/#/projects')
  await page.getByRole('button', { name: '프로젝트', exact: true }).click()
  const composer = page.getByRole('dialog', { name: '무엇을 함께 만들까요?' })
  await composer.getByLabel('프로젝트 이름').fill('E2E 교정 프로젝트')
  await composer.getByRole('button', { name: /파트원 A/ }).click()
  await composer.getByRole('button', { name: /^프로젝트 생성 ·/ }).click()

  let card = page.locator('article[data-project-id]').filter({ hasText: 'E2E 교정 프로젝트' })
  await expect(card).toBeVisible()
  const projectId = await card.getAttribute('data-project-id')
  await card.getByRole('button', { name: '수정' }).click()
  card = page.locator(`[data-project-id="${projectId}"]`)
  await card.getByLabel('이름').fill('E2E 교정 프로젝트 수정')
  await card.getByRole('button', { name: '저장' }).click()
  card = page.locator('article[data-project-id]').filter({ hasText: 'E2E 교정 프로젝트 수정' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '삭제' }).click()
  await card.getByRole('textbox', { name: '삭제 사유' }).fill('E2E 프로젝트 정리')
  await card.getByRole('button', { name: '삭제 확인' }).click()
  await expect(page.getByText('E2E 교정 프로젝트 수정')).toHaveCount(0)
})

test('05 product assignment exposes pending change-task transfer', async ({ page }) => {
  await page.goto('/#/products')
  await page.getByRole('button', { name: '제품 배정', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '제품 배정' })
  const assignee = dialog.getByRole('combobox').nth(0)
  const product = dialog.getByRole('combobox').nth(1)
  await product.selectOption({ index: 2 })
  await assignee.selectOption({ index: 2 })
  const transfer = dialog.getByRole('checkbox', { name: /미완료 적용업무도 새 담당자에게 이관/ })
  if (await transfer.count() === 0) await assignee.selectOption({ index: 3 })
  await expect(transfer).toBeVisible()
  await transfer.check()
  await expect(transfer).toBeChecked()
})

test('06 member can complete an assigned change task', async ({ page }) => {
  await page.getByRole('button', { name: '파트원', exact: true }).click()
  await page.getByRole('button', { name: /^변경 적용/ }).click()
  await page.getByRole('button', { name: '적용 완료' }).first().click()
  const dialog = page.getByRole('dialog', { name: '실제로 적용을 완료했습니까?' })
  await dialog.getByPlaceholder('예: 제품표준서 Rev.12 반영').fill('E2E 완료 증빙')
  await dialog.getByRole('button', { name: '완료 확인' }).click()
  await expect(page.getByText(/적용업무를 완료했습니다/)).toBeVisible()
})

test('07 deep links select the intended major workspaces', async ({ page }) => {
  await page.goto('/#/reviews?id=review-02')
  await expect(page.getByRole('heading', { name: '정산 자동화 화면 문구 확인' })).toBeVisible()
  await page.goto('/#/change-applications')
  await expect(page.getByRole('heading', { name: '변경 적용', exact: true })).toBeVisible()
  await page.goto('/#/projects?id=project-03')
  await expect(page.locator('[data-project-id="project-03"]')).toHaveClass(/deeplink-target/)
})

test('08 density preference remains persistent across reloads', async ({ page }) => {
  await page.getByRole('button', { name: '간격 압축해서 보기' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
})

test('09 mobile sidebar opens navigates and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.hamburger').click()
  await expect(page.locator('aside.sidebar')).toHaveClass(/open/)
  await page.getByRole('button', { name: /^공지/ }).click()
  await expect(page).toHaveURL(/#\/announcements/)
  await expect(page.locator('aside.sidebar')).not.toHaveClass(/open/)
})

test('10 notification panel supports read acknowledgement and navigation', async ({ page }) => {
  await page.getByRole('button', { name: /^알림/ }).click()
  const panel = page.getByRole('dialog', { name: '알림' })
  await expect(panel).toBeVisible()
  const markAllRead = panel.getByRole('button', { name: '모두 읽음' })
  if (await markAllRead.count()) {
    await markAllRead.click()
    await expect(page.getByText('검토 알림을 모두 읽음 처리했습니다.')).toBeVisible()
    await page.getByRole('button', { name: /^알림/ }).click()
  }
  await page.getByRole('dialog', { name: '알림' }).getByRole('button', { name: /검토요청 전체 보기/ }).click()
  await expect(page).toHaveURL(/#\/reviews/)
})

test('11 review stats requester filter keeps KPIs and the exact table aligned', async ({ page }) => {
  await page.goto('/#/review-stats')
  await expect(page.getByRole('heading', { name: '검토 통계', exact: true })).toBeVisible()

  const requesterFilter = page.getByRole('combobox', { name: '요청자', exact: true })
  await requesterFilter.selectOption({ label: '파트원 A' })
  await expect(requesterFilter).toHaveValue('member-01')
  await expect(page.getByRole('combobox', { name: '현재 상태', exact: true })).toHaveValue('all')
  await expect(page.getByRole('article', { name: '요청 건수 1건' })).toBeVisible()
  await expect(page.getByRole('article', { name: '제출 횟수 1회' })).toBeVisible()
  await expect(page.getByRole('article', { name: '현재 대기 1건' })).toBeVisible()

  const table = page.getByRole('table')
  await expect(table.getByRole('row', { name: /파트원 A/ })).toBeVisible()
  await expect(table.getByRole('row', { name: /파트원 B/ })).toHaveCount(0)
  await expect(table.locator('tfoot')).toContainText('합계')
  await expect(table.locator('tfoot td')).toHaveText(['1', '1', '0', '1', '0', '0'])
})

test('12 a11y: closing a conditionally-unmounted modal returns focus to its trigger', async ({ page }) => {
  await page.goto('/#/change-applications')
  const trigger = page.getByRole('button', { name: '적용 완료' }).first()
  await trigger.focus()
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '실제로 적용을 완료했습니까?' })
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expect(dialog).toBeVisible()
  await dialog.locator('.modal-close').click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('13 leader sees a durable completed-change signal only after every product is applied', async ({ page }) => {
  await page.goto('/#/change-applications')

  const exceptionRow = page.locator('.change-task-row').filter({ hasText: '자사제품 C' })
  await exceptionRow.getByRole('button', { name: '재개' }).click()
  let dialog = page.getByRole('dialog', { name: '완료 처리를 다시 열까요?' })
  await dialog.getByPlaceholder('처리 사유를 입력해 주세요.').fill('전 제품 실제 적용 완료 E2E')
  await dialog.getByRole('button', { name: '다시 열기' }).click()

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: '적용 완료', exact: true }).first().click()
    dialog = page.getByRole('dialog', { name: '실제로 적용을 완료했습니까?' })
    await dialog.getByPlaceholder('예: 제품표준서 Rev.12 반영').fill(`E2E 제품 반영 ${index + 1}`)
    const proxyReason = dialog.getByPlaceholder('파트장이 담당자 대신 처리하는 사유')
    if (await proxyReason.count()) await proxyReason.fill('전 제품 완료 신호 E2E')
    await dialog.getByRole('button', { name: '완료 확인' }).click()
  }

  await expect(page.getByRole('button', { name: '완료된 변경 1건' })).toBeVisible()
  await expect(page.getByText('1건의 변경이 모든 제품에서 적용 완료되었습니다.')).toBeVisible()
  await page.getByRole('button', { name: '완료 변경 보기' }).click()
  await expect(page.getByRole('combobox', { name: '보관 상태' })).toHaveValue('all')
  await expect(page.getByText('모든 제품 담당자의 적용 완료 처리가 끝났습니다.')).toBeVisible()
  await expect(page.getByText('보관 사유: 모든 제품 적용이 완료되어 자동 보관됨')).toBeVisible()
})
