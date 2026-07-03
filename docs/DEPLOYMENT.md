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
2. `supabase/migrations` 아래 SQL 파일을 번호 순서대로 적용한다.
3. 첫 파트장 bootstrap은 SQL Editor에서 1회 수행한다.

```sql
insert into public.allowed_users (email, name, role)
values ('leader@example.com', '파트장 이름', 'leader')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role;
```

4. 해당 이메일로 앱에서 가입한다. `auth.users` 생성 시 trigger가 `profiles`를 만든다.
5. 이후 초대 사용자는 앱의 `기초데이터 > 초대 사용자`에서 등록한다.

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

`service_role` key는 Cloudflare Pages와 브라우저 번들에 절대 등록하지 않는다.

GitHub 저장소를 올린 뒤 Cloudflare Pages에서 다음 순서로 연결한다.

1. Cloudflare Dashboard > Workers & Pages > Pages > Connect to Git을 선택한다.
2. GitHub 저장소를 선택한다.
3. Framework preset은 Vite 또는 None으로 두고, build command와 output directory를 위 값으로 설정한다.
4. Production environment variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 등록한다.
5. 첫 배포가 끝난 뒤 발급된 Pages URL을 Supabase Auth의 Site URL 및 Redirect URLs에 추가한다.

## 운영 전 보호

- 운영 공개 전 Cloudflare Access를 Pages 도메인 앞단에 적용한다.
- Access는 URL 접근 보호이고, 앱 내부 권한은 Supabase RLS가 계속 담당한다.
- Supabase Pro 전환 기준:
  - 실제 업무에서 매일 사용하기 시작함
  - DB가 350-400MB에 접근함
  - 백업, 복구, 운영 안정성, 다중 관리자 운영이 필요함
