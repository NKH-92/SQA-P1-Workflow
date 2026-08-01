import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  expectAppShell,
  fixtureEnv,
  isRemoteE2EConfigured,
  REMOTE_E2E_SKIP_NOTE,
  signIn,
} from './helpers'
import {
  cleanupChangeApprovalFixture,
  createChangeApprovalFixture,
  readChangeApprovalSnapshot,
  type ChangeApprovalFixture,
} from './change-application-final-approval.helpers'

const describeRemote = isRemoteE2EConfigured() ? test.describe : test.describe.skip

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function openChangeApplications(page: Page) {
  await page.goto('/#/change-applications')
  await expect(page.getByRole('heading', { name: '변경 적용', exact: true })).toBeVisible({ timeout: 45_000 })
}

async function searchActiveChange(page: Page, title: string) {
  const search = page.getByRole('textbox', { name: /공통변경 검색|변경 적용 검색/ }).first()
  await search.fill(title)
  return page.getByRole('button', { name: new RegExp(escapeRegExp(title)) }).first()
}

async function selectProduct(dialog: Locator, productName: string) {
  const search = dialog.getByRole('textbox', { name: '제품명 검색' })
  await search.fill(productName)
  const product = dialog.getByRole('button', { name: new RegExp(`^${escapeRegExp(productName)}(?:\\s|$)`) })
  await expect(product).toBeVisible()
  await product.click()
  await expect(dialog.getByRole('combobox', { name: `${productName} 적용 책임자` })).not.toHaveValue('')
}

async function registerTwoProductChange(page: Page, fixture: ChangeApprovalFixture) {
  await openChangeApplications(page)
  await page.getByRole('button', { name: /공통변경 등록|적용업무 등록/, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /공통변경 등록|변경 적용업무 등록/ })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('textbox', { name: '변경번호' }).fill(fixture.changeNumber)
  await dialog.getByRole('textbox', { name: '변경 제목' }).fill(fixture.title)
  await dialog.getByRole('textbox', { name: '변경 요약' }).fill('두 제품의 담당자 처리를 파트장이 최종 확인하는 E2E 검증입니다.')
  await dialog.getByLabel('시행일').fill('2099-03-01')
  await dialog.getByRole('textbox', { name: '적용 내용' }).fill('제품표준서의 공통 변경사항을 반영하고 처리 결과를 기록합니다.')
  await dialog.getByLabel('적용기한').fill('2099-03-10')

  await dialog.getByRole('button', { name: '다음', exact: true }).click()
  await selectProduct(dialog, fixture.products[0].name)
  await selectProduct(dialog, fixture.products[1].name)

  await dialog.getByRole('button', { name: '다음', exact: true }).click()
  await expect(dialog.locator('.change-review-summary article').filter({ hasText: '적용제품' })).toContainText('2개')
  await dialog.getByRole('button', { name: /2개 제품에 배포|공통변경 배포/ }).click()
  await expect(page.getByText('공통변경을 배포했습니다.', { exact: true })).toBeVisible({ timeout: 30_000 })
}

async function processOwnTask(
  page: Page,
  fixture: ChangeApprovalFixture,
  productName: string,
  action: 'complete' | 'not_applicable',
) {
  await openChangeApplications(page)
  await page.getByRole('button', { name: '변경건별', exact: true }).click()
  const change = await searchActiveChange(page, fixture.title)
  await expect(change).toBeVisible({ timeout: 45_000 })
  await change.click()
  const task = page.getByRole('article').filter({ hasText: productName }).filter({ hasText: fixture.changeNumber })
  await expect(task).toBeVisible()

  if (action === 'complete') {
    await task.getByRole('button', { name: '적용 완료', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '실제로 적용을 완료했습니까?' })
    await dialog.getByRole('textbox', { name: /완료 메모/ }).fill('E2E 제품표준서 반영 완료')
    await dialog.getByRole('button', { name: '완료 확인', exact: true }).click()
  } else {
    await task.getByRole('button', { name: '해당 없음', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '이 제품은 적용 대상이 아닙니까?' })
    await dialog.getByRole('textbox', { name: '해당 없음 사유' }).fill('E2E 제품 구성상 변경 대상이 아님')
    await dialog.getByRole('button', { name: '해당 없음 처리', exact: true }).click()
  }
}

describeRemote(`change-application final approval E2E (${REMOTE_E2E_SKIP_NOTE})`, () => {
  test('leader registration through selective reopen remains complete and role-safe', async ({ page }) => {
    test.setTimeout(240_000)
    const fixture = await createChangeApprovalFixture()

    try {
      await test.step('leader registers one common change for two owned products', async () => {
        await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
        await expectAppShell(page)
        await registerTwoProductChange(page, fixture)
      })

      await test.step('member A sees the product badge and only completes their own task', async () => {
        await signIn(page, fixtureEnv('REMOTE_E2E_MEMBER_A_EMAIL'), fixtureEnv('REMOTE_E2E_MEMBER_A_PASSWORD'))
        await expectAppShell(page)
        await expect(page.getByRole('button', {
          name: new RegExp(`${escapeRegExp(fixture.products[0].name)}.*미적용 공통변경 1건`),
        })).toBeVisible({ timeout: 45_000 })
        await openChangeApplications(page)
        await expect(page.getByRole('button', { name: /공통변경 등록|적용업무 등록/, exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: /^최종 확인 대기/ })).toHaveCount(0)
        await expect(page.getByRole('combobox', { name: '이력 담당자' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: /담당자 변경/ })).toHaveCount(0)
        await expect(page.getByRole('article').filter({ hasText: fixture.products[1].name })).toHaveCount(0)
        await processOwnTask(page, fixture, fixture.products[0].name, 'complete')
      })

      await test.step('member B marks their product not applicable and creates final-review readiness', async () => {
        await signIn(page, fixtureEnv('REMOTE_E2E_MEMBER_B_EMAIL'), fixtureEnv('REMOTE_E2E_MEMBER_B_PASSWORD'))
        await expectAppShell(page)
        await processOwnTask(page, fixture, fixture.products[1].name, 'not_applicable')
        await expect(page.getByRole('article').filter({ hasText: fixture.products[0].name })).toHaveCount(0)
        await expect(page.getByText(/파트장.*최종 확인 대기|최종 확인 대기.*파트장/).first()).toBeVisible({ timeout: 30_000 })

        const snapshot = await readChangeApprovalSnapshot(fixture)
        expect(snapshot.application.final_completed_at).toBeNull()
        expect(snapshot.tasks.map((task) => task.status).sort()).toEqual(['completed', 'not_applicable'])
      })

      await test.step('leader finalizes after reviewing the recorded exception', async () => {
        await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
        await expectAppShell(page)
        await openChangeApplications(page)
        await page.getByRole('tab', { name: /^최종 확인 대기/ }).click()
        const change = await searchActiveChange(page, fixture.title)
        await expect(change).toBeVisible({ timeout: 45_000 })
        await change.click()
        await page.getByRole('button', { name: '변경 완료', exact: true }).click()

        const dialog = page.getByRole('dialog', { name: '공통변경을 최종 완료할까요?' })
        await expect(dialog.getByRole('region', { name: '예외 사유 확인' })).toContainText(fixture.products[1].name)
        await expect(dialog.getByText('E2E 제품 구성상 변경 대상이 아님')).toBeVisible()
        await dialog.getByRole('textbox', { name: '최종 확인 메모' }).fill('해당 없음 사유를 확인하고 공통변경을 종결합니다.')
        await dialog.getByRole('button', { name: '변경 완료', exact: true }).click()
        await expect(page.getByText(/공통변경.*완료|변경을 완료했습니다/).first()).toBeVisible({ timeout: 30_000 })

        const snapshot = await readChangeApprovalSnapshot(fixture)
        expect(snapshot.application.final_completed_at).toBeTruthy()
      })

      await test.step('completed change leaves active work and remains server-searchable in history', async () => {
        await page.getByRole('tab', { name: /^진행 중/ }).click()
        await expect(page.getByText(fixture.title, { exact: true })).toHaveCount(0)
        await page.getByRole('tab', { name: /^완료 이력/ }).click()
        await page.getByRole('textbox', { name: '완료 이력 검색' }).fill(fixture.changeNumber)
        await page.getByRole('button', { name: '검색', exact: true }).click()
        const historyRow = page.getByRole('button', { name: new RegExp(escapeRegExp(fixture.title)) })
        await expect(historyRow).toBeVisible({ timeout: 45_000 })
        await expect(historyRow).toContainText(fixture.changeNumber.toUpperCase())
        await historyRow.click()
      })

      await test.step('leader cancels completion and reopens only member A product', async () => {
        await page.getByRole('button', { name: '완료 취소', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '완료를 취소하고 업무를 다시 열까요?' })
        await expect(dialog).toBeVisible({ timeout: 15_000 })
        await dialog.getByRole('textbox', { name: '완료 취소 사유' }).fill('제품 A 추가 반영이 필요해 선택적으로 재개합니다.')
        await dialog.getByRole('checkbox', { name: new RegExp(escapeRegExp(fixture.products[0].name)) }).check()
        await dialog.getByRole('combobox', { name: `${fixture.products[0].name} 재개 책임자` }).selectOption(fixture.memberA.id)
        await dialog.getByRole('button', { name: '완료 취소 및 업무 재개', exact: true }).click()
        await expect(page.getByText(/완료.*취소|업무.*재개/).first()).toBeVisible({ timeout: 30_000 })

        const snapshot = await readChangeApprovalSnapshot(fixture)
        const productA = snapshot.tasks.find((task) => task.product_id === fixture.products[0].id)
        const productB = snapshot.tasks.find((task) => task.product_id === fixture.products[1].id)
        expect(snapshot.application.final_completed_at).toBeNull()
        expect(productA).toMatchObject({ status: 'pending', assignee_id: fixture.memberA.id })
        expect(productB).toMatchObject({ status: 'not_applicable', assignee_id: fixture.memberB.id })

        await page.getByRole('tab', { name: /^진행 중/ }).click()
        await expect(page.getByText(fixture.title, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
      })
    } finally {
      await cleanupChangeApprovalFixture(fixture)
    }
  })

  test('mobile common-change composer has no horizontal overflow and keeps footer actions reachable', async ({ page }) => {
    await signIn(page, fixtureEnv('REMOTE_E2E_LEADER_EMAIL'), fixtureEnv('REMOTE_E2E_LEADER_PASSWORD'))
    await expectAppShell(page)

    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport)
      await openChangeApplications(page)
      await page.getByRole('button', { name: /공통변경 등록|적용업무 등록/, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: /공통변경 등록|변경 적용업무 등록/ })
      await expect(dialog).toBeVisible()
      const primaryAction = dialog.getByRole('button', { name: '다음', exact: true })
      await expect(primaryAction).toBeVisible()

      const layout = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          dialogInsideViewport: rect.left >= -0.5 && rect.right <= window.innerWidth + 0.5
            && rect.top >= -0.5 && rect.bottom <= window.innerHeight + 0.5,
          dialogHasNoHorizontalOverflow: element.scrollWidth <= element.clientWidth + 1,
          documentHasNoHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        }
      })
      expect(layout).toEqual({
        dialogInsideViewport: true,
        dialogHasNoHorizontalOverflow: true,
        documentHasNoHorizontalOverflow: true,
      })
      const actionBox = await primaryAction.boundingBox()
      expect(actionBox).not.toBeNull()
      expect(actionBox!.x).toBeGreaterThanOrEqual(0)
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(actionBox!.y).toBeGreaterThanOrEqual(0)
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewport.height)

      await dialog.getByRole('button', { name: /공통변경 등록 닫기|변경 적용업무 등록 닫기|닫기/, exact: true }).first().click()
      await expect(dialog).toHaveCount(0)
    }
  })
})
