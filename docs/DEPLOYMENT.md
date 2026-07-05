# 배포 및 운영 체크리스트

## GitHub 업로드

1. 로컬 저장소를 초기화한다.

```bash
git init
git add .
git commit -m "Initial part work management app"
```

2. GitHub에서 새 저장소를 만든다. 운영 전까지는 private 저장소를 권장한다.
3. GitHub가 안내하는 remote URL을 연결하고 push한다.

```bash
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

업로드 전에 `.env.local`, `node_modules`, `dist`는 커밋 대상에서 제외되어야 한다. 이 프로젝트는 `.gitignore`에서 해당 항목을 제외한다.

## Supabase

1. 새 Supabase 프로젝트를 만든다.
2. `supabase/migrations` 아래 SQL 파일을 번호 순서대로 적용한다. Phase 2~4 추가분은 [SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md)를 참고한다.
3. 첫 파트장 bootstrap은 SQL Editor에서 1회 수행한다.

```sql
insert into public.allowed_users (email, name, role)
values ('leader@example.com', '파트장 이름', 'leader')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role;
```

4. 해당 이메일로 앱에서 가입한다. `auth.users` 생성 시 trigger가 `profiles`를 만든다.
5. 이후 초대 사용자는 앱의 `마스터 > 초대 관리`에서 등록한다.
6. 여러 사용자를 한 번에 넣어야 하면 `supabase/private_seed.example.sql`을 `supabase/private_seed.local.sql`로 복사한 뒤 실제 이메일/이름으로 바꿔 SQL Editor에서 실행한다. `.local.sql` 파일은 커밋하지 않는다.

### 사용자 제거

초대 목록에서만 삭제하면 이미 가입한 계정은 계속 로그인할 수 있다. Supabase Dashboard > Authentication > Users에서 사용자를 삭제하면 `profiles`가 cascade로 함께 삭제된다. 자세한 절차는 [OPERATIONS.md](./OPERATIONS.md)를 참고한다.

## Cloudflare Workers (기본 배포)

이 저장소는 GitHub Actions로 **Cloudflare Workers**(`wrangler deploy --assets`)에 정적 SPA를 배포한다.

### GitHub Variables / Secrets

Repository Settings > Secrets and variables > Actions에 다음을 등록한다.

| 종류 | 이름 | 설명 |
|---|---|---|
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| Variable | `WORKER_NAME` | Worker 이름 (예: `part-ops`) |
| Variable | `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| Secret | `VITE_SUPABASE_ANON_KEY` | Supabase anon(publishable) key |
| Secret | `CLOUDFLARE_API_TOKEN` | Workers 배포 권한이 있는 API 토큰 |

Variables/Secrets가 하나라도 비어 있으면 CI는 **빌드·테스트만 수행**하고 배포는 스킵한다.

### 수동 배포

```bash
npm ci
npm test
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build
npx wrangler deploy --name <WORKER_NAME> --assets dist --keep-vars
```

### 롤백

GitHub Actions에서 이전 성공 워크플로 run을 **Re-run**하거나, 문제 커밋을 revert한 뒤 main에 push한다.

### SPA 라우팅

현재는 URL 해시(`#/reviews` 등) 기반이므로 Workers 추가 설정이 필요 없다. 추후 path 기반 라우터를 도입하면 `--assets` SPA fallback 설정이 필요하다.

`service_role` key는 Workers 빌드 env와 브라우저 번들에 **절대** 등록하지 않는다.

## Cloudflare Pages (대안)

Workers 대신 Pages를 쓰려면:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Pages URL을 Supabase Auth의 Site URL 및 Redirect URLs에 추가한다.

## 운영 전 보호

- 운영 공개 전 Cloudflare Access를 Worker(또는 Pages) 도메인 앞단에 적용한다.
- Access는 URL 접근 보호이고, 앱 내부 권한은 Supabase RLS가 계속 담당한다.
- 백업·복구·장애 대응은 [OPERATIONS.md](./OPERATIONS.md)를 참고한다.
- Supabase Pro 전환 기준:
  - 실제 업무에서 매일 사용하기 시작함
  - DB가 350-400MB에 접근함
  - 백업, 복구, 운영 안정성, 다중 관리자 운영이 필요함
