import { expect, test, type Page } from '@playwright/test'

/** 미리보기 역할 전환. 메뉴의 ‘파트원’ 항목과 이름이 겹치지 않게 역할 그룹 안에서 찾는다. */
function switchPreviewRole(page: Page, role: '파트장' | '팀장' | '파트원') {
  return page.getByRole('group', { name: '미리보기 역할' }).getByRole('button', { name: role, exact: true }).click()
}

/** 미리보기 계정. 데스크톱 기본 홈은 전체 화면 사무실이라, 기존 화면을 다루는 테스트는 기존 화면을 고른 사람으로 시작한다. */
const PREVIEW_PROFILE_IDS = ['demo-leader', 'member-01', 'demo-team-leader']

test('weekly menu accepts different screenshot ratios without cropping and survives reload', async ({ page }) => {
  await startWithDefaultHome(page)
  // Choose office explicitly so crossing the phone breakpoint does not switch
  // the default home mode (and unmount its open dialog).
  await page.getByRole('button', { name: '기존 화면' }).click()
  await page.getByRole('button', { name: '크게 보기' }).click()
  const appearance = (element: Element) => {
    const properties = ['width', 'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'boxShadow', 'fontFamily', 'fontSize', 'padding', 'gap'] as const
    return ['', '.modal-header', '.office-meeting-body', '.modal-footer', '.modal-footer .primary'].map((selector) => {
      const target = selector ? element.querySelector(selector)! : element
      const css = getComputedStyle(target)
      return Object.fromEntries(properties.map((property) => [property, css[property]]))
    })
  }
  await page.getByRole('button', { name: '회의실, 회의 열기' }).click()
  const meetingAppearance = await page.getByRole('dialog', { name: '회의 열기' }).evaluate(appearance)
  await page.getByRole('button', { name: '회의 창 닫기' }).click()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: '메뉴판, 이번 주 메뉴 보기·사진 올리기' }).click()
  const dialog = page.getByRole('dialog', { name: '이번 주 메뉴' })
  // The primary action label changes its width, but every visual style is shared.
  const menuAppearance = await dialog.evaluate(appearance)
  delete (meetingAppearance[4] as Partial<typeof meetingAppearance[4]>).width
  delete (menuAppearance[4] as Partial<typeof menuAppearance[4]>).width
  expect(menuAppearance).toEqual(meetingAppearance)
  const input = dialog.getByLabel('메뉴 사진 선택', { exact: true })
  // Exercise the production image policy without allowing blob: URLs.
  await page.evaluate(() => {
    const policy = document.createElement('meta')
    policy.httpEquiv = 'Content-Security-Policy'
    policy.content = "img-src 'self' data:"
    document.head.append(policy)
  })
  for (const [width, height] of [[1600, 650], [520, 1900], [900, 900]]) {
    const replace = dialog.getByRole('button', { name: '메뉴 사진 바꾸기' })
    if (await replace.isVisible()) await replace.click()
    const capture = await page.evaluate(({ width, height }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fffdf6'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#34497a'
      ctx.font = '24px sans-serif'
      ctx.fillText('테스트 메뉴표 (실제 식단 아님)', 16, 40)
      for (let row = 0; row < 5; row += 1) {
        ctx.fillText(['월요일 한식', '화요일 비빔밥', '수요일 국수', '목요일 생선구이', '금요일 카레'][row], 16, 90 + row * (height - 150) / 5)
      }
      ctx.fillRect(width - 12, height - 12, 12, 12)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { width, height })
    await expect(input).toBeEnabled()
    await input.setInputFiles({ name: `capture-${width}.png`, mimeType: 'image/png', buffer: Buffer.from(capture, 'base64') })
    await expect(dialog.getByText(`게시 전 미리보기 · ${width} × ${height}`)).toBeVisible()
    const image = dialog.getByRole('img', { name: /메뉴/ })
    await expect(image).toBeVisible()
    await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/)
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      const shape = await image.evaluate((img: HTMLImageElement) => ({
        w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height,
        nw: img.naturalWidth, nh: img.naturalHeight,
        scroll: document.documentElement.scrollWidth, viewport: window.innerWidth,
        fit: getComputedStyle(img).objectFit,
      }))
      expect(shape.w / shape.h).toBeCloseTo(width / height, 2)
      expect(shape.nw).toBe(width)
      expect(shape.nh).toBe(height)
      expect(shape.fit).toBe('contain')
      expect(shape.scroll).toBeLessThanOrEqual(shape.viewport)
      const frame = await dialog.getByRole('region', { name: /메뉴 사진/ }).evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }))
      expect(frame.content).toBeLessThanOrEqual(frame.height + 1)
    }
    await dialog.getByRole('button', { name: '확대 보기' }).click()
    await expect(dialog.getByRole('button', { name: '전체 보기' })).toHaveAttribute('aria-pressed', 'true')
    expect(await image.evaluate((img) => img.getBoundingClientRect().width)).toBeGreaterThanOrEqual(width)
    await dialog.getByRole('button', { name: '전체 보기' }).click()
    await dialog.getByRole('button', { name: '이번 주 메뉴로 게시' }).click()
    await expect(dialog.getByRole('status')).toHaveText('이 브라우저에 메뉴를 저장했어요.')
    const storedCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('sqa-weekly-menus', 2)
      request.onsuccess = () => {
        const db = request.result
        const count = db.transaction('menus').objectStore('menus').count()
        count.onsuccess = () => { resolve(count.result); db.close() }
        count.onerror = () => { reject(count.error); db.close() }
      }
      request.onerror = () => reject(request.error)
    }))
    expect(storedCount).toBe(1)
  }
  await page.screenshot({ path: 'artifacts/weekly-menu/mobile.png', animations: 'disabled' })
  await dialog.getByRole('button', { name: '닫기', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await switchPreviewRole(page, '팀장')
  await page.reload()
  await page.getByRole('button', { name: '메뉴판, 이번 주 메뉴 보기·사진 올리기' }).click()
  await expect(dialog.getByText('게시된 메뉴', { exact: true })).toBeVisible()
  expect(await dialog.getByRole('img', { name: /메뉴/ }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(900)
  await expect(dialog.getByRole('button', { name: '메뉴 사진 바꾸기' })).toBeEnabled()
  await page.screenshot({ path: 'artifacts/weekly-menu/desktop.png', animations: 'disabled' })
  expect(errors).toEqual([])
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript((ids) => {
    // 테스트마다 한 번만 기존 화면을 골라 둔다(테스트 안에서 바꾼 방식은 새로고침해도 유지된다).
    if (window.localStorage.getItem('e2e-home-mode-set')) return
    for (const id of ids) {
      window.localStorage.setItem(`sqa.home-mode.${id}`, 'classic')
      window.localStorage.setItem(`sqa.morning-brief-off.${id}`, '1')
    }
    window.localStorage.setItem('e2e-home-mode-set', '1')
  }, PREVIEW_PROFILE_IDS)
  await page.goto('/')
  await expect(page.getByRole('button', { name: '홈', exact: true })).toBeVisible()
})

/** 기본값(데스크톱: 전체 화면 사무실)으로 다시 시작한다. */
async function startWithDefaultHome(page: Page) {
  await page.evaluate((ids) => {
    for (const id of ids) window.localStorage.removeItem(`sqa.home-mode.${id}`)
  }, PREVIEW_PROFILE_IDS)
  await page.reload()
}

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
  const sidebar = page.locator('aside.sidebar')
  await expect(sidebar).toHaveClass(/open/)
  // 홈 사무실의 ‘공지 화면’ 기물과 겹치지 않게 서랍 메뉴 안에서 찾는다.
  await sidebar.getByRole('button', { name: /^공지/ }).click()
  await expect(page).toHaveURL(/#\/announcements/)
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

test('22 home office shows one shared layout and only the leader rearranges seats', async ({ page }) => {
  const office = page.getByRole('region', { name: '우리 파트 사무실' })
  await expect(office).toBeVisible()
  const seats = office.getByRole('list', { name: '자리 배치' })
  await expect(seats.getByRole('listitem')).toHaveCount(4)
  await expect(seats).toContainText('파트원 A, 2번 자리 · 창가 쪽 줄')
  // 캔버스에 실제로 도트가 그려진다(빈 캔버스가 아니다).
  await expect.poll(async () => office.locator('canvas.office-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx || canvas.width === 0 || canvas.height === 0) return false
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return data.some((value, index) => index % 4 === 3 && value > 0)
  })).toBe(true)

  await office.getByRole('button', { name: '자리 배치', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '사무실 자리 배치' })
  await dialog.getByLabel('1번 자리').selectOption({ label: '파트원 B · 지금 6번 자리' })
  await expect(dialog.getByText('6번 자리에서 옮겨 왔어요.')).toBeVisible()
  await dialog.getByRole('button', { name: '저장하기' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.toast').filter({ hasText: '사무실 자리 배치를 저장했어요.' })).toBeVisible()
  await expect(seats).toContainText('파트원 B, 1번 자리 · 창가 쪽 줄')
  await expect(seats).not.toContainText('6번 자리')

  await switchPreviewRole(page, '파트원')
  const memberOffice = page.getByRole('region', { name: '우리 파트 사무실' })
  await expect(memberOffice.getByRole('list', { name: '자리 배치' })).toContainText('파트원 B, 1번 자리 · 창가 쪽 줄')
  await expect(memberOffice.getByRole('button', { name: '자리 배치', exact: true })).toHaveCount(0)
})

test('23 home office objects and people open their screens', async ({ page }) => {
  // 돌아다니는 사람이 기물을 가리지 않도록 동작 줄이기로 모두 자리에 앉힌다.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const home = page.getByRole('button', { name: '홈', exact: true })
  const office = page.getByRole('region', { name: '우리 파트 사무실' })
  const shortcuts = office.getByRole('group', { name: '사무실 바로가기' })

  // 알림이 있으면 이름 가운데에 ‘새 검토요청 3건’ 같은 설명이 들어간다.
  for (const [name, hash] of [
    [/^검토요청 보드, (.+, )?검토요청으로 이동$/, /#\/reviews/],
    [/^공지 화면, (.+, )?공지로 이동$/, /#\/announcements/],
    [/^변경관리 문서함, (.+, )?변경 적용으로 이동$/, /#\/change-applications/],
    [/^프로젝트 보드, (.+, )?프로젝트로 이동$/, /#\/projects/],
  ] as const) {
    await shortcuts.getByRole('button', { name }).click()
    await expect(page).toHaveURL(hash)
    await home.click()
    await expect(office).toBeVisible()
  }

  // 파트장은 파트원을 누르면 그 사람의 팀 현황을 연다.
  const seats = office.getByRole('list', { name: '자리 배치' })
  await seats.getByRole('button', { name: '파트원 A 담당 보기' }).click()
  await expect(page).toHaveURL(/#\/team\?id=/)

  // 파트원은 자기 자리만 누를 수 있고, 누르면 내 담당으로 간다.
  await home.click()
  await switchPreviewRole(page, '파트원')
  await expect(seats.getByRole('button')).toHaveCount(1)
  await seats.getByRole('button', { name: '파트원 A(나) 담당 보기' }).click()
  await expect(page).toHaveURL(/#\/work/)
})

test('24 home office objects light up for new items and settle once checked', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const home = page.getByRole('button', { name: '홈', exact: true })
  const shortcuts = page.getByRole('region', { name: '우리 파트 사무실' }).getByRole('group', { name: '사무실 바로가기' })

  // 파트장: 새로 온 검토요청이 칸반 알림으로 뜨고, 누르면 그 요청을 바로 연다.
  const kanban = shortcuts.getByRole('button', { name: /^검토요청 보드, 새 검토요청 \d+건 · 피드백 대기 \d+건, 검토요청으로 이동$/ })
  await expect(kanban).toHaveAttribute('data-alert', 'new')
  await kanban.click()
  await expect(page).toHaveURL(/#\/reviews\?id=/)
  await home.click()

  // 파트원: 새 공지·새로 배정된 프로젝트가 알림으로 뜨고, 확인하면 알림이 꺼진다.
  await switchPreviewRole(page, '파트원')
  const notice = shortcuts.getByRole('button', { name: '공지 화면, 새 공지 1건, 공지로 이동' })
  await expect(notice).toHaveAttribute('data-alert', 'new')
  await expect(shortcuts.getByRole('button', { name: /^프로젝트 보드, 새로 배정된 프로젝트 1건/ })).toHaveAttribute('data-alert', 'new')
  await notice.click()
  await expect(page).toHaveURL(/#\/announcements\?id=announcement-01/)
  await home.click()
  await expect(shortcuts.getByRole('button', { name: '공지 화면, 공지로 이동' })).not.toHaveAttribute('data-alert')
  await expect(shortcuts.getByRole('button', { name: /^프로젝트 보드, 새로 배정된 프로젝트 1건/ })).toHaveAttribute('data-alert', 'new')
})

test('25 desktop home opens the full-screen office and remembers the classic view per person', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startWithDefaultHome(page)
  await expect(page.getByRole('heading', { level: 1, name: '우리 파트 사무실' })).toBeAttached()
  // 왼쪽 메뉴 대신 위 메뉴(HUD)가 있고, 모든 메뉴는 ‘전체 메뉴’ 서랍으로 연다.
  await expect(page.getByRole('button', { name: '홈', exact: true })).toBeHidden()
  const objects = page.getByRole('group', { name: '사무실 바로가기' })
  await objects.getByRole('button', { name: '출입 기록부, 활동 로그로 이동' }).click()
  await expect(page).toHaveURL(/#\/activity/)
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '우리 파트 사무실' })).toBeAttached()
  await page.getByRole('button', { name: '전체 메뉴' }).click()
  await page.getByRole('navigation', { name: '주 메뉴 항목' }).getByRole('button', { name: /^검토 통계/ }).click()
  await expect(page).toHaveURL(/#\/review-stats/)
  await page.getByRole('button', { name: '홈', exact: true }).click()

  // 기존 화면으로 바꾸면 이 사람에게는 새로고침해도 기존 화면이다.
  await page.getByRole('button', { name: '기존 화면' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /오늘 처리할 일/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: /오늘 처리할 일/ })).toBeVisible()
  await page.getByRole('button', { name: '크게 보기' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '우리 파트 사무실' })).toBeAttached()
  await expect(page.getByRole('complementary', { name: /오늘 처리할 일 \d+건/ })).toBeVisible()
})

test('26 anyone opens an instant meeting for seated people who confirm, and it disappears when done', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startWithDefaultHome(page)
  const objects = page.getByRole('group', { name: '사무실 바로가기' })

  // 파트장이 파트원 A를 불러 회의를 연다.
  await objects.getByRole('button', { name: '회의실, 회의 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '회의 열기' })
  await dialog.getByRole('textbox', { name: '회의 주제(선택)' }).fill('일탈 건 5분 논의')
  await dialog.getByRole('checkbox', { name: /파트원 A/ }).check()
  await dialog.getByRole('button', { name: '회의 시작' }).click()
  await expect(page.locator('.toast').filter({ hasText: '회의를 열었어요.' })).toBeVisible()
  await page.getByRole('dialog', { name: '일탈 건 5분 논의' }).getByRole('button', { name: '닫기', exact: true }).click()
  await expect(objects.getByRole('button', { name: '회의실, 회의 중 확인 1/2명, 회의 보기' })).toBeVisible()

  // 파트원 A는 어느 화면에서든 확인할 수 있다.
  await switchPreviewRole(page, '파트원')
  const banner = page.locator('.office-meeting-banner')
  await expect(banner).toContainText('미리보기 파트장님이 회의를 요청했어요')
  await banner.getByRole('button', { name: '확인했어요' }).click()
  await expect(banner).toContainText('확인 2/2명')
  await expect(banner.getByRole('button', { name: '회의 완료' })).toHaveCount(0)

  // 연 사람이 회의 완료를 누르면 회의실이 빈다.
  await switchPreviewRole(page, '파트장')
  await banner.getByRole('button', { name: '회의 완료' }).click()
  await expect(banner).toHaveCount(0)
  await expect(objects.getByRole('button', { name: '회의실, 회의 열기' })).toBeVisible()
})

test('27 people set their own status and the office shows it on their seat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startWithDefaultHome(page)
  const seats = page.getByRole('list', { name: '자리 배치' })
  // 미리보기: 파트원 B는 오늘부터 출장, 파트원 C는 실험실에 가 있다.
  await expect(seats.getByRole('listitem').filter({ hasText: /^파트원 B, / })).toContainText(/출장 · .+까지/)
  await expect(page.getByRole('group', { name: '자리 현황' })).toContainText('자리 비움 2명 · 출장 1 · 실험실 1')

  // 위 메뉴의 내 상태 단추로 현장에 간다고 표시하고, 다시 자리에 있음으로 돌린다.
  await page.getByRole('button', { name: '내 상태: 자리에 있음. 바꾸기' }).click()
  const dialog = page.getByRole('dialog', { name: '내 상태' })
  await dialog.getByRole('group', { name: '지금 상태 고르기' }).getByRole('button', { name: /현장/ }).click()
  await expect(page.locator('.toast').filter({ hasText: '내 상태를 ‘현장’으로 바꿨어요.' })).toBeVisible()
  await expect(seats.getByRole('listitem').filter({ hasText: /^미리보기 파트장/ })).toContainText('· 현장')

  // 내일 하루 출장을 등록했다가 취소한다.
  const tomorrow = await page.evaluate(() => {
    const date = new Date(Date.now() + 86_400_000)
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  })
  await dialog.getByRole('group', { name: '종류' }).getByRole('button', { name: '출장' }).click()
  await dialog.getByLabel('시작일').fill(tomorrow)
  await dialog.getByLabel('마지막 날').fill(tomorrow)
  await dialog.getByRole('textbox', { name: '메모(선택)' }).fill('오송 공장 실사')
  await dialog.getByRole('button', { name: '등록', exact: true }).click()
  await expect(page.locator('.toast').filter({ hasText: '내 출장을 등록했어요.' })).toBeVisible()
  const leaves = dialog.getByRole('list', { name: '등록한 휴가·출장' })
  await expect(leaves).toContainText('오송 공장 실사')
  await leaves.getByRole('button', { name: /출장 .* 취소/ }).click()
  await expect(dialog.getByText('등록한 휴가·출장이 없어요.')).toBeVisible()

  await dialog.getByRole('group', { name: '지금 상태 고르기' }).getByRole('button', { name: /자리에 있음/ }).click()
  await expect(page.getByRole('button', { name: '내 상태: 자리에 있음. 바꾸기' })).toBeVisible()
  await dialog.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(seats.getByRole('listitem').filter({ hasText: /^미리보기 파트장/ })).not.toContainText('· 현장')
})

test('28 work screens follow the pixel office only for people who use the office home', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startWithDefaultHome(page)
  // 사무실 화면을 쓰면 공지 머리말에 사무실 장면이, 작성자 이름 옆에 캐릭터 얼굴이 붙는다.
  await page.goto('/#/announcements')
  await expect(page.locator('.office-place[data-place="notice"] canvas')).toBeVisible()
  await expect(page.locator('.announcement-list-item .person-face').first()).toBeVisible()
  await page.goto('/#/reviews')
  await expect(page.locator('.office-place[data-place="kanban"]')).toBeVisible()

  // 기존 화면을 고르면 업무 화면도 예전 디자인 그대로다.
  await page.goto('/')
  await page.getByRole('button', { name: '기존 화면' }).click()
  await page.goto('/#/announcements')
  await expect(page.getByRole('heading', { level: 1, name: '공지' })).toBeVisible()
  await expect(page.locator('.office-place')).toHaveCount(0)
  await expect(page.locator('.person-face')).toHaveCount(0)
  // 상태 기능은 그대로 쓴다(왼쪽 메뉴 아래 내 상태 단추).
  await expect(page.getByRole('button', { name: '내 상태: 자리에 있음. 바꾸기' })).toBeVisible()
})

test('29 a meeting can be scheduled later today somewhere else and cancelled before it starts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startWithDefaultHome(page)
  const objects = page.getByRole('group', { name: '사무실 바로가기' })
  await objects.getByRole('button', { name: '회의실, 회의 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '회의 열기' })
  // 출장 중인 파트원 B는 고를 수 없다.
  await expect(dialog.getByRole('checkbox', { name: /파트원 B/ })).toBeDisabled()
  const later = dialog.getByRole('radio', { name: '오늘 시간 정하기' })
  test.skip(await later.isDisabled(), '자정 직전에는 오늘 안에 고를 시각이 없다.')
  await later.check()
  await dialog.getByRole('radio', { name: '다른 곳' }).check()
  await dialog.getByRole('combobox', { name: '장소 이름' }).fill('3층 대회의실')
  await dialog.getByRole('checkbox', { name: /파트원 A/ }).check()
  await dialog.getByRole('button', { name: '회의 잡기' }).click()
  await expect(page.locator('.toast').filter({ hasText: '회의를 잡았어요.' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click()

  const banner = page.locator('.office-meeting-banner')
  await expect(banner).toContainText('회의 예정')
  await expect(banner).toContainText('3층 대회의실')
  await expect(objects.getByRole('button', { name: /^회의실, 오후|^회의실, 오전/ })).toBeVisible()

  await switchPreviewRole(page, '파트원')
  await expect(banner).toContainText('미리보기 파트장님이 회의를 요청했어요')
  await banner.getByRole('button', { name: '확인했어요' }).click()
  await expect(page.locator('.toast').filter({ hasText: '3층 대회의실에서 만나요.' })).toBeVisible()

  await switchPreviewRole(page, '파트장')
  await banner.getByRole('button', { name: '회의 취소' }).click()
  await expect(page.locator('.toast').filter({ hasText: '회의를 취소했어요.' })).toBeVisible()
  await expect(banner).toHaveCount(0)
})


test('pixel settings stay independent and style dialogs outside the shell', async ({ page }) => {
  await page.goto('/#/reviews')
  await expect(page.locator('html')).not.toHaveAttribute('data-ui', 'pixel')
  await page.getByRole('button', { name: '도트 화면', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-ui', 'pixel')
  await expect(page.locator('.place-plate-name')).toHaveText('검토요청 보드')
  await page.getByRole('button', { name: '오늘 할 일', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '오늘 할 일', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '도트 화면', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-ui', 'pixel')
  await expect(page.locator('.office-place')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-ui', 'pixel')
})

test('morning brief shows once on the business day and can be turned off', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('sqa.morning-brief-off.demo-leader')
    localStorage.removeItem('sqa.morning-brief.demo-leader')
    localStorage.setItem('sqa.home-mode.demo-leader', 'office')
  })
  await page.reload()
  const dialog = page.getByRole('dialog', { name: '아침 조회', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '확인하기' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: '우리 파트 사무실' })).toBeAttached()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sqa.morning-brief.demo-leader'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('review meeting keeps its title and requester and office lookup focuses the seat', async ({ page }) => {
  await page.goto('/#/reviews')
  const title = await page.locator('.review-detail-pane h2').first().innerText()
  await page.locator('.review-detail-pane').getByRole('button', { name: /더보기/ }).click()
  await page.getByRole('menuitem', { name: '이 건으로 회의 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '회의 열기', exact: true })
  await expect(dialog.getByPlaceholder('예: 일탈 보고서 5분 논의')).toHaveValue(title.slice(0, 60))
  await expect(dialog.getByRole('checkbox', { name: /파트원 A/ })).toBeChecked()
  await page.keyboard.press('Escape')
  await page.goto('/#/team')
  await page.getByRole('button', { name: '파트원 A 더보기', exact: true }).click()
  await page.getByRole('menuitem', { name: '사무실에서 찾기' }).click()
  await expect(page).toHaveURL(/#\/dashboard\?id=member-01/)
  await expect(page.locator('.office-person[data-seat="2"]')).toBeFocused()
})
