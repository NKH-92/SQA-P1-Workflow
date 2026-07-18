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
