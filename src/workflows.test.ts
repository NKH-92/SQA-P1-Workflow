import { describe, expect, it } from 'vitest'

const workflows = import.meta.glob('../.github/workflows/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function readWorkflow(name: string) {
  return workflows[`../.github/workflows/${name}`] ?? ''
}

describe('production workflow guards', () => {
  it.each(['deploy-worker.yml', 'db-migrate.yml', 'backup.yml'])(
    '%s fails before privileged work when manually dispatched from a non-main ref',
    (name) => {
      const workflow = readWorkflow(name)
      const guardPosition = workflow.indexOf('- name: Require main branch')
      const privilegedPosition = name === 'deploy-worker.yml'
        ? workflow.indexOf('- name: Deploy to Cloudflare Workers')
        : name === 'backup.yml'
          ? workflow.indexOf('- name: Check backup secrets')
          : workflow.indexOf('- name: Check secret')

      expect(guardPosition).toBeGreaterThan(-1)
      expect(workflow).toContain("github.ref != 'refs/heads/main'")
      expect(workflow).toContain('exit 1')
      expect(privilegedPosition).toBeGreaterThan(guardPosition)
    },
  )

  it('keeps the CI token read-only', () => {
    expect(readWorkflow('ci.yml')).toContain('permissions:\n  contents: read')
  })

  it.each(['ci.yml', 'deploy-worker.yml'])(
    '%s runs deterministic local Supabase RLS tests as a blocking job',
    (name) => {
      const workflow = readWorkflow(name)
      expect(workflow).toContain('supabase start')
      expect(workflow).toContain('supabase db reset')
      expect(workflow).toContain('node scripts/setup-rls-fixtures.mjs')
      expect(workflow).toContain('npm run test:rls')
      expect(workflow).toContain('select count(*) from private.review_status_events')
      expect(workflow).toContain('select count(*) from private.audit_events')
      expect(workflow).toContain('supabase stop --no-backup')
      if (name === 'ci.yml') expect(workflow).toContain('needs: [typecheck, lint, test, rls]')
      else expect(workflow).toContain('needs: rls')
    },
  )

  it('pins third-party Actions to full commit SHAs and avoids mutable Wrangler downloads', () => {
    for (const workflow of Object.values(workflows)) {
      const uses = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1])
      for (const action of uses) {
        expect(action, `${action} must use a full commit SHA`).toMatch(/@[0-9a-f]{40}$/)
      }
    }
    const deploy = readWorkflow('deploy-worker.yml')
    expect(deploy).toContain('npx --no-install wrangler deploy')
    expect(deploy).not.toMatch(/wrangler@(?:latest|4)(?:\s|$)/)
  })

  it('requires a recent successful encrypted backup before DB migration', () => {
    const workflow = readWorkflow('db-migrate.yml')
    expect(workflow).toContain('backup_run_id:')
    expect(workflow).toContain('required: true')
    expect(workflow).toContain('.github/workflows/backup.yml')
    expect(workflow).toContain('event" != "workflow_dispatch')
    expect(workflow).toContain('event" != "schedule')
    expect(workflow).toContain('head_sha" != "$GITHUB_SHA')
    expect(workflow).toContain('conclusion" != "success')
    expect(workflow).toContain('age_seconds" -gt 86400')
    expect(workflow).toContain('startswith')
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain('Migration history repair is intentionally excluded')
    expect(workflow).not.toContain('Repair migration history (optional)')
    expect(workflow).not.toContain('repair_applied:')
    expect(workflow).not.toContain('repair_reverted:')
  })

  it('verifies assignment migration versions and RPC security attributes', () => {
    const workflow = readWorkflow('db-migrate.yml')
    expect(workflow).toContain("version = '202607110001'")
    expect(workflow).toContain("version = '202607110002'")
    expect(workflow).toContain("version = '202607110003'")
    expect(workflow).toContain("version = '202607110004'")
    expect(workflow).toContain("version = '202607110005'")
    expect(workflow).toContain("version = '202607110006'")
    expect(workflow).toContain("version = '202607110007'")
    expect(workflow).toContain("version = '202607110008'")
    expect(workflow).toContain("version = '202607110009'")
    expect(workflow).toContain("version = '202607110010'")
    expect(workflow).toContain("version = '202607110011'")
    expect(workflow).toContain("to_regprocedure('public.add_product_assignment(uuid,uuid)')")
    expect(workflow).toContain("to_regprocedure('public.add_duty_assignment(uuid,uuid)')")
    expect(workflow).toContain("to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)')")
    expect(workflow).toContain('direct_write_gate=')
    expect(workflow).toContain('project_assignments_bump_project_revision')
    expect(workflow).toContain("to_regprocedure('public.bump_project_revision_from_assignment()')")
    expect(workflow).toContain('pg_get_function_result')
    expect(workflow).toContain("has_function_privilege('authenticated'")
    expect(workflow).toContain("has_function_privilege('anon'")
    expect(workflow).toContain('search_path=')
    expect(workflow).toContain('search_path=pg_catalog, public, private, pg_temp')
    expect(workflow).toContain("to_regprocedure('public.validate_assignment_user_active()')")
    expect(workflow).toContain("require_profile_role(new.user_id, ''member''")
    expect(workflow).toContain('product_assignments_validate_active')
    expect(workflow).toContain('duty_assignments_validate_active')
    expect(workflow).toContain("tgenabled in ('O', 'A')")
    expect(workflow).toContain('BEFORE INSERT OR UPDATE OF user_id')
    expect(workflow).toContain("pg_get_viewdef('public.public_leader_profiles'::regclass, true)")
    expect(workflow).toContain("not has_column_privilege('authenticated', 'public.review_requests', 'status', 'UPDATE')")
    expect(workflow).toContain("to_regclass('private.review_status_events')")
    expect(workflow).toContain("to_regclass('private.audit_events')")
    expect(workflow).toContain('count(*) >= 12')
    expect(workflow).toContain("tgname = 'profile_notes_private_audit'")
    expect(workflow).toContain('refusing a green drifted migration run')
    expect(workflow).not.toContain('::warning::remote schema_migrations count')
    expect(workflow).toContain("to_regprocedure('private.record_mutation_audit()')")
    expect(workflow).toContain("to_regprocedure('public.guard_last_active_leader_profile()')")
    expect(workflow).toContain("provolatile = 'v'")
    expect(workflow).toContain("to_regprocedure('public.count_active_leaders_except(uuid)')")
    expect(workflow).toContain("pg_advisory_xact_lock")
    expect(workflow).toContain('transactional review activity-log')
    expect(workflow).toContain("public.update_review_request_status(uuid,public.review_status)")
    expect(workflow).toContain("policyname = 'review_feedback_insert_leader'")
    expect(workflow).toContain("pg_get_functiondef(to_regprocedure('public.is_active_leader()')) like '%password_is_current()%'")
    expect(workflow).toContain('role-only leader RLS policy')
    expect(workflow).not.toContain("proacl::text not like '%=X%'")
  })

  it('blocks frontend deployment until the production DB has the required assignment contract', () => {
    const workflow = readWorkflow('deploy-worker.yml')
    const readinessPosition = workflow.indexOf('- name: Verify production DB readiness')
    const deployPosition = workflow.indexOf('- name: Deploy to Cloudflare Workers')
    expect(workflow).toContain('SUPABASE_DB_URL (secret; deploy DB-readiness gate)')
    expect(workflow).toContain("version = '202607110001'")
    expect(workflow).toContain("version = '202607110002'")
    expect(workflow).toContain("version = '202607110003'")
    expect(workflow).toContain("version = '202607110004'")
    expect(workflow).toContain("version = '202607110005'")
    expect(workflow).toContain("version = '202607110006'")
    expect(workflow).toContain("version = '202607110007'")
    expect(workflow).toContain("version = '202607110008'")
    expect(workflow).toContain("version = '202607110009'")
    expect(workflow).toContain("version = '202607110010'")
    expect(workflow).toContain("version = '202607110011'")
    expect(workflow).toContain("to_regprocedure('public.add_product_assignment(uuid,uuid)')")
    expect(workflow).toContain("to_regprocedure('public.add_duty_assignment(uuid,uuid)')")
    expect(workflow).toContain("to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)')")
    expect(workflow).toContain('project_assignments_bump_project_revision')
    expect(workflow).toContain("to_regprocedure('public.bump_project_revision_from_assignment()')")
    expect(workflow).toContain('pg_get_function_result')
    expect(readinessPosition).toBeGreaterThan(-1)
    expect(deployPosition).toBeGreaterThan(readinessPosition)
    expect(workflow).toContain("not coalesce(has_function_privilege('anon'")
    expect(workflow).toContain("provolatile = 'v'")
    expect(workflow).toContain('review_contract_ready=')
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain('leader_view_ready=')
    expect(workflow).toContain('transactional review activity-log contract')
    expect(workflow).toContain('count(*) >= 12')
    expect(workflow).toContain("tgname = 'profile_notes_private_audit'")
    expect(workflow).toContain("policyname = 'review_feedback_insert_leader'")
    expect(workflow).toContain('role-only leader RLS policy')
  })

  it('keeps production Worker promotion manual and explicitly confirmed', () => {
    const workflow = readWorkflow('deploy-worker.yml')
    expect(workflow).not.toMatch(/^\s*push:/m)
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('deploy_confirm:')
    expect(workflow).toContain('inputs.deploy_confirm != true')
    expect(workflow).toContain('refusing a green no-op production run')
    expect(workflow).not.toContain('DEPLOY_SKIP')
    expect(workflow).not.toContain('deployment was **skipped**')
    expect(workflow).toContain('deployment was **blocked and this workflow failed**')
  })

  it('runs encrypted backups daily at 05:00 KST', () => {
    const workflow = readWorkflow('backup.yml')
    expect(workflow).toContain("cron: '0 20 * * *'")
    expect(workflow).toContain('--pinentry-mode loopback --passphrase-fd 0')
    expect(workflow).toContain('--cipher-algo AES256')
    expect(workflow).toContain('--s2k-count 65011712')
    expect(workflow).toContain('gpg_temp')
    expect(workflow).toContain('--decrypt -- "$gpg_temp" | tar tzf -')
    expect(workflow).toContain('.tar.gz.gpg')
    expect(workflow).toContain('.tar.gz.enc')
    expect(workflow).toContain('unset PASSPHRASE')
  })

  it('opens or updates one issue when the daily backup job fails', () => {
    const workflow = readWorkflow('backup.yml')
    expect(workflow).toContain('notify-failure:')
    expect(workflow).toContain("always() && needs.backup.result == 'failure' && github.ref == 'refs/heads/main'")
    expect(workflow).toContain('issues: write')
    expect(workflow).toContain("title='[Backup] Daily DB backup failed'")
    expect(workflow).toContain('gh issue comment')
    expect(workflow).toContain('gh issue create')
  })

  it('fails a production deployment when the public Worker health contract is broken', () => {
    const workflow = readWorkflow('deploy-worker.yml')
    const deployPosition = workflow.indexOf('- name: Deploy to Cloudflare Workers')
    const healthPosition = workflow.indexOf('- name: Verify deployed Worker health')
    expect(workflow).toContain('WORKER_URL (variable; post-deploy health check)')
    expect(workflow).toContain('id="root"')
    expect(workflow).toContain('content-security-policy')
    expect(workflow).toContain('x-content-type-options:')
    expect(healthPosition).toBeGreaterThan(deployPosition)
  })

  it('probes the configured Supabase URL and anon key before building', () => {
    const workflow = readWorkflow('deploy-worker.yml')
    const probePosition = workflow.indexOf('- name: Verify Supabase public configuration')
    const buildPosition = workflow.indexOf('- name: Build')
    expect(workflow).toContain('${VITE_SUPABASE_URL%/}/auth/v1/settings')
    expect(workflow).toContain('--header "apikey: $VITE_SUPABASE_ANON_KEY"')
    expect(workflow).toContain('.disable_signup == true')
    expect(workflow).toContain('.mailer_autoconfirm == false')
    expect(workflow).toContain('.external.email == true')
    expect(workflow).toContain('.external.anonymous_users == false')
    expect(probePosition).toBeGreaterThan(-1)
    expect(buildPosition).toBeGreaterThan(probePosition)
  })
})
