import { expect, test, type Page } from '@playwright/test'

/** 미리보기 역할 전환. 메뉴의 ‘파트원’ 항목과 이름이 겹치지 않게 역할 그룹 안에서 찾는다. */
function switchPreviewRole(page: Page, role: '파트장' | '팀장' | '파트원') {
  return page.getByRole('group', { name: '미리보기 역할' }).getByRole('button', { name: role, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '홈', exact: true })).toBeVisible()
})

test('01 leader and member navigation scopes remain distinct', async ({ page }) => {
  await expect(page.getByRole('button', { name: '검토 통계', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^제품/ })).toBeVisible()
  await switchPreviewRole(page, '파트원')
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
  await page.goto('/#/reviews')
  const detail = page.getByRole('article').first()
  const approvedTitle = (await detail.locator('.request-title').innerText()).trim()
  await expect(detail.getByRole('button', { name: '승인하기', exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '승인하기', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /승인할까요\?$/ })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('승인하면 요청자에게 결과가 전달돼요.')
  await dialog.getByRole('button', { name: '승인하기', exact: true }).click()
  // 토스트는 하나, 대상 이름과 결과를 말한다. 상세는 다음 대기 중 요청으로 넘어간다.
  await expect(page.locator('.toast').filter({ hasText: `‘${approvedTitle}’` })).toHaveCount(1)
  await expect(page.locator('.toast').filter({ hasText: '승인했어요.' })).toBeVisible()
  await expect(page.locator('.review-detail-pane .request-title')).not.toHaveText(approvedTitle)
  await page.locator('.review-list-item', { hasText: approvedTitle }).click()
  await expect(page.getByRole('article').first().getByRole('button', { name: '다시 열기' })).toBeVisible()
})

test('04 project create update and delete remain one local workflow', async ({ page }) => {
  await page.goto('/#/projects')
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click()
  const composer = page.getByRole('dialog', { name: '무엇을 함께 만들까요?' })
  await composer.getByLabel('프로젝트 이름').fill('E2E 교정 프로젝트')
  await composer.getByRole('button', { name: /파트원 A/ }).click()
  await composer.getByRole('button', { name: /^프로젝트 만들기/ }).click()

  const created = page.locator('article[data-project-id]').filter({ hasText: 'E2E 교정 프로젝트' })
  await expect(created).toBeVisible()
  const projectId = await created.getAttribute('data-project-id')
  const card = page.locator(`article[data-project-id="${projectId}"]`)
  // 보드와 목록을 합친 카드: 카드 본문(투명 버튼)을 누르면 정보 수정 창이 열린다.
  await card.getByRole('button', { name: 'E2E 교정 프로젝트 수정' }).click()
  const editor = page.getByRole('dialog', { name: '프로젝트 정보 수정' })
  await editor.getByLabel('프로젝트 이름').fill('E2E 교정 프로젝트 수정')
  await editor.getByRole('button', { name: '저장하기' }).click()
  await expect(editor).toHaveCount(0)
  await expect(card.getByRole('heading', { name: 'E2E 교정 프로젝트 수정' })).toBeVisible()
  // 드문 행동(링크 복사·삭제)은 카드의 더보기(⋯) 메뉴에 있다.
  await card.getByRole('button', { name: 'E2E 교정 프로젝트 수정 더보기' }).click()
  await page.getByRole('menuitem', { name: '삭제' }).click()
  const deleteDialog = page.getByRole('dialog', { name: '‘E2E 교정 프로젝트 수정’을 삭제할까요?' })
  await deleteDialog.getByRole('textbox', { name: '삭제 사유' }).fill('E2E 프로젝트 정리')
  await deleteDialog.getByRole('button', { name: '삭제하기' }).click()
  await expect(card).toHaveCount(0)
})

test('05 product assignment exposes pending change-task transfer', async ({ page }) => {
  await page.goto('/#/products')
  await expect(page.getByRole('button', { name: '제품 배정', exact: true })).toHaveCount(0)
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '자사제품 B', exact: true }) })
  // 카드의 행동은 하나(담당자 변경)뿐이고, 정보 수정·삭제는 더보기(⋯)에 있다.
  await card.getByRole('button', { name: '자사제품 B 담당자 변경', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '제품 담당자 변경' })
  await expect(dialog.getByText('자사제품 B', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('combobox')).toHaveCount(1)
  const assignee = dialog.getByLabel('담당자', { exact: true })
  await assignee.selectOption({ label: '파트원 B' })
  // 새 담당자를 고르면 미완료 적용 업무 넘기기가 같은 창에서 바로 보인다(다시 열 필요 없음).
  const transfer = dialog.getByRole('checkbox', { name: /미완료 적용 업무도 새 담당자에게 넘기기/ })
  await expect(transfer).toBeVisible()
  await expect(dialog.getByRole('combobox')).toHaveCount(1)
  await transfer.check()
  await expect(transfer).toBeChecked()
  await dialog.getByRole('button', { name: '담당자 저장하기' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(card.getByText('파트원 B', { exact: true })).toBeVisible()
})

test('06 member can complete an assigned change task', async ({ page }) => {
  await switchPreviewRole(page, '파트원')
  await page.getByRole('button', { name: /^변경 적용/ }).click()
  await page.getByRole('button', { name: '적용 완료' }).first().click()
  const dialog = page.getByRole('dialog', { name: '이 제품에 변경을 적용했나요?' })
  await expect(dialog).toContainText('완료로 표시하면 미적용 목록에서 빠지고 처리 이력에 남아요.')
  await dialog.getByPlaceholder('예: 제품표준서 Rev.12 반영').fill('E2E 완료 증빙')
  await dialog.getByRole('button', { name: '적용 완료하기' }).click()
  await expect(page.getByText('자사제품 B 적용을 완료했어요.')).toBeVisible()
  await expect(page.getByRole('tab', { name: /^내 미적용/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '처리 이력' }).click()
  await expect(page.getByText('E2E 완료 증빙')).toBeVisible()
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
  await page.getByRole('button', { name: '촘촘하게 보기' }).click()
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
  const sidebar = page.locator('aside.sidebar')
  await expect(sidebar).not.toHaveClass(/open/)
  await expect(sidebar).toHaveAttribute('aria-hidden', 'true')
  await expect(sidebar).toHaveAttribute('inert', '')
  await expect(page.locator('.hamburger')).toBeFocused()
})

test('10 notification panel supports read acknowledgement and navigation', async ({ page }) => {
  await page.getByRole('button', { name: /^알림( \d+건)?$/ }).click()
  const panel = page.getByRole('dialog', { name: '알림' })
  await expect(panel).toBeVisible()
  const markAllRead = panel.getByRole('button', { name: '모두 읽음' })
  if (await markAllRead.count()) {
    await markAllRead.click()
    await expect(page.getByText('검토 알림을 모두 읽음으로 표시했어요.')).toBeVisible()
    await page.getByRole('button', { name: /^알림( \d+건)?$/ }).click()
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
  await expect(page.getByRole('article', { name: '요청 횟수 1회' })).toBeVisible()
  await expect(page.getByRole('article', { name: '대기 중 1건' })).toBeVisible()

  const table = page.getByRole('table')
  await expect(table.getByRole('row', { name: /파트원 A/ })).toBeVisible()
  await expect(table.getByRole('row', { name: /파트원 B/ })).toHaveCount(0)
  await expect(table.locator('tfoot')).toContainText('합계')
  await expect(table.locator('tfoot td')).toHaveText(['1', '1', '0', '1', '0', '0'])
})

test('12 a11y: closing a conditionally-unmounted modal returns focus to its trigger', async ({ page }) => {
  await page.goto('/#/change-applications')
  await switchPreviewRole(page, '파트원')
  await page.getByRole('button', { name: /^변경 적용/ }).click()
  const trigger = page.getByRole('button', { name: '적용 완료' }).first()
  await trigger.focus()
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '이 제품에 변경을 적용했나요?' })
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

test('13 leader finalizes a common change only after every assignee has processed their products', async ({ page }) => {
  await page.goto('/#/change-applications')

  for (const productName of ['위탁제품 D', '위탁제품 E']) {
    await page.getByRole('button', { name: `${productName} 담당자 변경` }).click()
    const reassignDialog = page.getByRole('dialog', { name: '이 업무의 담당자를 바꿀까요?' })
    await reassignDialog.getByRole('combobox', { name: '새 담당자' }).selectOption({ label: '파트원 A' })
    await reassignDialog.getByLabel('담당자를 바꾸는 이유').fill('공통변경 완료 점검 E2E')
    await reassignDialog.getByRole('button', { name: '담당자 변경', exact: true }).click()
    await expect(page.getByText(`${productName} 담당자를 바꿨어요.`)).toBeVisible()
  }

  await switchPreviewRole(page, '파트원')
  await page.getByRole('button', { name: /^변경 적용/ }).click()
  for (const productName of ['자사제품 B', '위탁제품 D', '위탁제품 E']) {
    await page.getByRole('tab', { name: /^내 미적용/ }).click()
    const productList = page.getByRole('navigation', { name: '적용대상 제품 목록' })
    await productList.getByRole('button', { name: new RegExp(productName) }).click()
    const detail = page.getByRole('region', { name: `${productName} 변경관리 내용` })
    await detail.getByRole('button', { name: '적용 완료', exact: true }).click()
    const completeDialog = page.getByRole('dialog', { name: '이 제품에 변경을 적용했나요?' })
    await completeDialog.getByPlaceholder('예: 제품표준서 Rev.12 반영').fill(`${productName} E2E 반영`)
    await completeDialog.getByRole('button', { name: '적용 완료하기' }).click()
    await expect(page.getByText(`${productName} 적용을 완료했어요.`)).toBeVisible()
  }

  await switchPreviewRole(page, '파트장')
  await page.getByRole('button', { name: /^변경 적용/ }).click()
  await page.getByRole('tab', { name: /^최종 확인 대기/ }).click()
  await expect(page.getByText('모든 제품 처리가 끝났어요. 처리 결과를 확인하고 공통변경을 완료해 주세요.')).toBeVisible()
  await page.getByRole('button', { name: '공통변경 완료하기', exact: true }).click()
  const finalizationDialog = page.getByRole('dialog', { name: '공통변경을 최종 완료할까요?' })
  await finalizationDialog.getByLabel('최종 확인 메모').fill('해당 없음 사유와 전 제품 처리 결과 확인')
  await finalizationDialog.getByRole('button', { name: '공통변경 완료하기' }).click()

  await expect(page.getByText('CC-2026-014 공통변경을 완료했어요.')).toBeVisible()
  await expect(page.getByRole('tab', { name: '완료 이력' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('해당 없음 사유와 전 제품 처리 결과 확인')).toBeVisible()
})

test('18 leader reviews an Excel product list before applying it to the composer', async ({ page }) => {
  await page.goto('/#/change-applications')
  await page.getByRole('button', { name: '공통변경 등록' }).click()
  const dialog = page.getByRole('dialog', { name: '공통변경 등록' })
  await dialog.getByLabel('변경번호').fill('CC-2026-E2E')
  await dialog.getByLabel('변경 제목').fill('Excel 일괄등록 확인')
  await dialog.getByLabel('변경 요약').fill('Excel 제품 매칭 검토 흐름을 확인합니다.')
  await dialog.getByLabel('시행일').fill('2026-09-01')
  await dialog.getByLabel('적용 내용').fill('제품표준서의 공통 내용을 개정합니다.')
  await dialog.getByLabel('적용 기한', { exact: true }).fill('2026-08-31')
  await dialog.getByRole('button', { name: /다음/ }).click()

  await expect(dialog.getByRole('link', { name: '양식 받기' })).toHaveAttribute('href', '/change-application-products-template.xlsx')
  // 제품명 검색에서 Enter를 눌러도 마지막 단계로 넘어가지 않는다(D-3).
  await dialog.getByRole('textbox', { name: '제품명 검색' }).fill('자사')
  await dialog.getByRole('textbox', { name: '제품명 검색' }).press('Enter')
  await expect(dialog.getByRole('link', { name: '양식 받기' })).toBeVisible()
  await dialog.getByRole('textbox', { name: '제품명 검색' }).fill('')
  await dialog.getByLabel('적용 제품 Excel 파일 선택').setInputFiles({
    name: '적용제품.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('제품명\n자사제품 B\n일치하지 않는 제품'),
  })
  const review = dialog.getByRole('region', { name: 'Excel 제품 가져오기 검토' })
  await expect(review).toContainText('자동 일치')
  const applyImport = review.getByRole('button', { name: '선택 제품에 반영' })
  await expect(applyImport).toBeDisabled()
  await review.getByRole('button', { name: '제외' }).click()
  await expect(applyImport).toBeEnabled()
  await review.getByText('제외한 행 1개 · 다시 포함할 수 있어요').click()
  await review.getByRole('button', { name: '다시 포함' }).click()
  await expect(applyImport).toBeDisabled()
  await review.getByRole('button', { name: '제외' }).click()
  await applyImport.click()
  await expect(dialog.getByRole('button', { name: /자사제품 B/ })).toHaveAttribute('aria-pressed', 'true')
})

test('14 visual invariants keep active counts distinct and native controls usable', async ({ page }) => {
  await page.goto('/#/reviews')
  const reviewNav = page.getByRole('button', { name: /^검토요청, 대기/ })
  await expect(reviewNav).toHaveClass(/active/)
  await expect(reviewNav.locator('.nav-badge')).toBeVisible()
  await expect(reviewNav.locator('.nav-unread-badge')).toBeVisible()

  const badgeStyles = await reviewNav.evaluate((element) => {
    const count = element.querySelector<HTMLElement>('.nav-badge')
    const unread = element.querySelector<HTMLElement>('.nav-unread-badge')
    if (!count || !unread) throw new Error('검토요청 배지를 찾을 수 없습니다.')
    const countStyle = getComputedStyle(count)
    const unreadStyle = getComputedStyle(unread)
    return {
      countColor: countStyle.color,
      unreadBackground: unreadStyle.backgroundColor,
      unreadColor: unreadStyle.color,
    }
  })
  expect(badgeStyles.unreadBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(badgeStyles.countColor).not.toBe(badgeStyles.unreadColor)

  await page.goto('/#/announcements')
  await page.getByRole('button', { name: '새 공지' }).click()
  const pin = page.getByRole('checkbox', { name: /상단에 고정/ })
  await expect(pin).toBeVisible()
  await expect.poll(async () =>
    pin.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }),
  ).toEqual({ width: 16, height: 16 })
})

test('15 filtered team results never leave a hidden member detail selected', async ({ page }) => {
  await page.goto('/#/team')
  await expect(page.locator('.team-member-detail')).toBeVisible()
  await page.getByPlaceholder('이름, 제품, 업무, 프로젝트 검색').fill('존재하지-않는-파트원')
  await expect(page.locator('.v2-team-card')).toHaveCount(0)
  await expect(page.locator('.team-member-detail')).toHaveCount(0)
})

test('16 leader history and member withdrawal archive keep distinct entry points', async ({ page }) => {
  await page.goto('/#/reviews')
  await expect(page.getByRole('button', { name: /^회수 보관함/ })).toHaveCount(0)
  const leaderHistory = page.getByRole('button', { name: '검토 이력', exact: true })
  await expect(leaderHistory).toHaveCount(1)
  await leaderHistory.click()
  const historyDialog = page.getByRole('dialog', { name: '검토 이력' })
  await expect(historyDialog).toBeVisible()
  await historyDialog.locator('.modal-close').click()
  await expect(historyDialog).toHaveCount(0)

  await switchPreviewRole(page, '파트원')
  // 홈의 할 일 행도 ‘내 검토요청 …’으로 시작하므로 주 메뉴 안에서 찾는다.
  await page.getByRole('navigation', { name: '주 메뉴 항목' }).getByRole('button', { name: /^내 검토요청/ }).click()
  await expect(page.getByRole('button', { name: '검토 이력', exact: true })).toHaveCount(0)
  const memberArchive = page.getByRole('button', { name: /^회수 보관함/ })
  await expect(memberArchive).toHaveCount(1)
  await memberArchive.click()
  await expect(memberArchive).toHaveAttribute('aria-pressed', 'true')
})

test('17 responsive boundary widths keep production-like topbar actions inside the viewport', async ({ page }) => {
  for (const width of [1081, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/#/change-applications')
    await expect(page.getByRole('heading', { name: '변경 적용', exact: true })).toBeVisible()
    await page.evaluate(() => {
      const actions = document.querySelector<HTMLElement>('.topbar-actions')
      if (!actions) throw new Error('topbar actions not found')

      const syncLabel = document.createElement('span')
      syncLabel.className = 'sync-label'
      syncLabel.dataset.e2eSynthetic = 'sync'
      syncLabel.textContent = '마지막 동기화 오후 10:45'

      const operationStatus = document.createElement('span')
      operationStatus.className = 'saving'
      operationStatus.dataset.e2eSynthetic = 'operation'
      operationStatus.setAttribute('role', 'status')
      operationStatus.setAttribute('aria-label', '저장 및 동기화 중')
      operationStatus.innerHTML = '<svg aria-hidden="true" width="14" height="14"></svg><span class="operation-status-label">저장 및 동기화 중</span>'

      actions.prepend(operationStatus)
      actions.prepend(syncLabel)
    })

    const layout = await page.evaluate(() => {
      const topbar = document.querySelector<HTMLElement>('.topbar')
      const actions = document.querySelector<HTMLElement>('.topbar-actions')
      const title = document.querySelector<HTMLElement>('.topbar .topbar-title')
      if (!topbar || !actions || !title) throw new Error('topbar layout nodes not found')
      const topbarRect = topbar.getBoundingClientRect()
      const actionsRect = actions.getBoundingClientRect()
      const titleRect = title.getBoundingClientRect()
      const visibleActionRects = [...actions.children]
        .map((element) => {
          const node = element as HTMLElement
          const style = getComputedStyle(node)
          const rect = node.getBoundingClientRect()
          return { display: style.display, height: rect.height, left: rect.left, right: rect.right, width: rect.width }
        })
        .filter((rect) => rect.display !== 'none' && rect.width > 1 && rect.height > 1)

      return {
        actionsInside:
          actionsRect.left >= topbarRect.left - 0.5
          && actionsRect.right <= Math.min(topbarRect.right, window.innerWidth) + 0.5
          && visibleActionRects.every(
            (rect) => rect.left >= topbarRect.left - 0.5
              && rect.right <= Math.min(topbarRect.right, window.innerWidth) + 0.5,
          ),
        rootInside: document.documentElement.scrollWidth <= window.innerWidth,
        titleBeforeActions: titleRect.right <= actionsRect.left + 0.5,
      }
    })

    expect(layout).toEqual({
      actionsInside: true,
      rootInside: true,
      titleBeforeActions: true,
    })
  }

  await page.locator('.hamburger').click()
  const sidebar = page.locator('aside.sidebar')
  await expect(sidebar).toHaveClass(/open/)
  await page.keyboard.press('Escape')
  await expect(sidebar).not.toHaveClass(/open/)
  await expect(sidebar).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.hamburger')).toBeFocused()
})

test('18 compact mobile screens reveal a selected review detail immediately', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/#/reviews')

  const target = page.locator('.review-list-item').nth(1)
  await target.click()

  const title = page.locator('.review-detail-pane .request-title')
  await expect(title).toBeFocused()
  await expect.poll(async () => {
    const box = await title.boundingBox()
    return box ? box.y >= 0 && box.y + box.height <= 640 : false
  }).toBe(true)
})

test('19 mobile operations surfaces prioritize work and keep topbar targets usable', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const firstPriority = page.locator('.priority-row').first()
    await expect(firstPriority).toBeVisible()
    await expect.poll(async () => {
      const box = await firstPriority.boundingBox()
      return box ? box.y < viewport.height : false
    }).toBe(true)

    // 휴대폰에서는 새로고침이 서랍 메뉴로 옮겨 가므로, 화면에 보이는 상단 버튼만 잰다.
    const targetSizes = await page.locator('.topbar-actions .icon-button:visible').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    )
    expect(targetSizes.length).toBeGreaterThan(0)
    expect(targetSizes.every(({ width, height }) => width >= 40 && height >= 40)).toBe(true)
  }
})

test('21 mobile bottom tab bar reaches frequent screens and the full menu, and Back closes the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const tabBar = page.getByRole('navigation', { name: '주요 메뉴 바로가기' })
  await expect(tabBar).toBeVisible()
  await expect(tabBar.getByRole('link', { name: /^홈/ })).toHaveAttribute('aria-current', 'page')

  await tabBar.getByRole('link', { name: /^검토요청/ }).click()
  await expect(page).toHaveURL(/#\/reviews/)
  await expect(page).toHaveTitle('검토요청 · SQA P1')
  await expect(tabBar.getByRole('link', { name: /^검토요청/ })).toHaveAttribute('aria-current', 'page')

  const fullMenu = tabBar.getByRole('button', { name: '전체 메뉴' })
  await fullMenu.click()
  await expect(page.locator('aside.sidebar')).toHaveClass(/open/)
  await expect(tabBar).toBeHidden()
  await page.goBack()
  await expect(page.locator('aside.sidebar')).not.toHaveClass(/open/)
  await expect(page).toHaveURL(/#\/reviews/)
  await expect(tabBar).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(tabBar).toBeHidden()
})

test('20 mobile member product board moves from list to detail without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.locator('.hamburger').click()
  await switchPreviewRole(page, '파트원')
  await page.getByRole('button', { name: /^변경 적용/ }).click()

  const productList = page.getByRole('navigation', { name: '적용대상 제품 목록' })
  await expect(productList).toBeVisible()
  const productButtons = productList.getByRole('button')
  expect(await productButtons.count()).toBeGreaterThan(0)
  await productButtons.nth(0).click()

  await expect(productList).toBeHidden()
  await expect(page.getByRole('button', { name: '제품 목록' })).toBeVisible()
  await expect(page.locator('.member-product-detail')).toBeVisible()
  const mobileLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    detailRight: document.querySelector('.member-product-detail')?.getBoundingClientRect().right ?? 0,
  }))
  expect(mobileLayout).toMatchObject({ viewport: 390, page: 390 })
  expect(mobileLayout.detailRight).toBeLessThanOrEqual(390)

  await page.getByRole('button', { name: '제품 목록' }).click()
  await expect(productList).toBeVisible()
  await expect(page.locator('.member-product-detail')).toBeHidden()
})
