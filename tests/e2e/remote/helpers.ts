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
  await expect(emailField.or(logoutButton)).toBeVisible({ timeout: 30_000 })
  if (!(await emailField.isVisible())) {
    await logoutButton.click()
  }
  await expect(emailField).toBeVisible({ timeout: 30_000 })
  await emailField.fill(email)
  await passwordField.fill(password)
  await page.getByRole('button', { name: /로그인|sign in/i }).click()
}

export async function expectAppShell(page: Page) {
  await expect(page.getByRole('button', { name: '홈', exact: true })).toBeVisible({
    timeout: 45_000,
  })
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
