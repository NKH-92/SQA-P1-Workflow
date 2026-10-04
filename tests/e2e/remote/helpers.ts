import { expect, type Page } from '@playwright/test'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

export function isRemoteE2EConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return false
  if (!env.REMOTE_E2E_LEADER_EMAIL || !env.REMOTE_E2E_LEADER_PASSWORD) return false
  if (!env.REMOTE_E2E_MEMBER_A_EMAIL || !env.REMOTE_E2E_MEMBER_A_PASSWORD) return false
  if (!env.REMOTE_E2E_UNINVITED_EMAIL || !env.REMOTE_E2E_UNINVITED_PASSWORD) return false
  try {
    const { hostname } = new URL(url)
    return LOCAL_HOSTS.has(hostname)
  } catch {
    return false
  }
}

export const REMOTE_E2E_SKIP_NOTE =
  'Requires local Supabase + REMOTE_E2E_* fixture credentials from scripts/run-remote-e2e.mjs'

export function assertNoServiceRoleInBrowserEnv(env: NodeJS.ProcessEnv = process.env) {
  const browserFacing = [
    env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    env.VITE_SERVICE_ROLE_KEY,
  ].filter(Boolean)
  if (browserFacing.length > 0) {
    throw new Error('SQA_REMOTE_E2E_SERVICE_ROLE_LEAK: service role must not reach the browser env')
  }
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/')
  const emailField = page.getByLabel(/이메일|email/i).first()
  const passwordField = page.getByLabel(/비밀번호|password/i).first()
  const logoutButton = page.getByRole('button', { name: /로그아웃|sign out/i }).first()
  // 전체 화면 사무실 홈에서는 로그아웃이 위 메뉴의 프로필 안에 있다.
  const officeProfile = page.locator('.office-hud-avatar')
  await expect(emailField.or(logoutButton).or(officeProfile)).toBeVisible({ timeout: 30_000 })
  if (!(await emailField.isVisible())) {
    if (!(await logoutButton.isVisible()) && (await officeProfile.isVisible())) await officeProfile.click()
    await page.getByRole('button', { name: /로그아웃|sign out/i }).first().click()
  }
  await expect(emailField).toBeVisible({ timeout: 30_000 })
  await emailField.fill(email)
  await passwordField.fill(password)
  await page.getByRole('button', { name: /로그인|sign in/i }).click()
}

export async function expectAppShell(page: Page) {
  const home = page.getByRole('button', { name: '홈', exact: true })
  const classicHome = page.getByRole('button', { name: '기존 화면' })
  const brief = page.getByRole('dialog', { name: '아침 조회', exact: true })
  // 첫 로그인 안내는 실제 사용자처럼 확인한다. 데이터가 늦게 도착해도 클릭을 막지 않게 한다.
  await page.addLocatorHandler(brief, async () => {
    await brief.getByRole('button', { name: '확인하기', exact: true }).click()
  })
  try {
    await expect(home.or(classicHome)).toBeVisible({ timeout: 45_000 })
    // 데스크톱 기본 홈은 전체 화면 사무실이다. 기존 화면 흐름을 확인하는 테스트는 사람이 하듯 기존 화면으로 바꿔 둔다.
    if (await classicHome.isVisible()) await classicHome.click()
    await expect(home).toBeVisible({ timeout: 45_000 })
  } finally {
    await page.removeLocatorHandler(brief)
  }
}

export async function expectAccessBlocked(page: Page) {
  const blocked = page.getByText(/접근|권한|초대|승인|비활성|비밀번호를 변경/i).first()
  await expect(blocked).toBeVisible({ timeout: 45_000 })
}

export function fixtureEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required remote E2E fixture env: ${name}`)
  return value
}
