import { defineConfig, devices } from '@playwright/test'

const previewBaseURL = 'http://127.0.0.1:4173'
const remoteBaseURL = process.env.REMOTE_E2E_BASE_URL ?? 'http://127.0.0.1:4174'
const remoteConfigured = Boolean(
  process.env.SUPABASE_URL
  && process.env.SUPABASE_ANON_KEY
  && process.env.REMOTE_E2E_LEADER_EMAIL
  && process.env.REMOTE_E2E_LEADER_PASSWORD,
)

if (process.env.REMOTE_E2E_REQUIRED === '1' && !remoteConfigured) {
  throw new Error(
    'REMOTE_E2E_REQUIRED=1 but local Supabase remote E2E credentials are not configured.',
  )
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    {
      name: 'preview',
      testMatch: /preview-workflows\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: previewBaseURL,
        channel: process.env.CI ? undefined : 'chrome',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
    {
      name: 'remote',
      testMatch: /remote\/.*\.spec\.ts$/,
      timeout: 120_000,
      retries: 0,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: remoteBaseURL,
        channel: process.env.CI ? undefined : 'chrome',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
  ],
  webServer: process.env.REMOTE_E2E_USE_BUILT_SERVER === '1'
    ? {
        command: `npm run preview -- --host 127.0.0.1 --port ${new URL(remoteBaseURL).port || 4174}`,
        url: remoteBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          VITE_APP_MODE: 'remote',
          VITE_SUPABASE_URL: process.env.SUPABASE_URL ?? '',
          VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
        },
      }
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: previewBaseURL,
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          VITE_APP_MODE: 'preview',
          VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'your-public-anon-key',
        },
      },
})
