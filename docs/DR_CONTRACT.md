# 재해복구 패키지 계약

이 문서는 백업 파일의 존재와 서비스 복구 가능성을 구분한다. `dr-manifest.json`의
`backupClass`는 아래 등급 중 실제로 검증한 범위만 주장할 수 있으며,
`scripts/verify-dr-package.mjs`가 같은 규칙을 fail-closed로 집행한다.

## 공식 지원 범위 확인

2026-07-22에 Supabase 공식 changelog를 다시 확인했다. 지원 범위 판단에는 다음 공식 문서를 사용한다.

- [CLI `db dump`](https://supabase.com/docs/reference/cli/v1/supabase-db#supabase-db-dump)는
  기본 dump에서 `auth`, `storage`, extension이 만든 managed schema를 제외한다.
- [Auth 사용자 프로젝트 간 이전](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects)은
  `auth` schema 전체를 이전하면 사용자 UUID와 password hash를 보존할 수 있다고 설명하지만,
  Auth-only 범용 스크립트는 제공하지 않는다.
- [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)는
  유료 plan의 physical backup을 사용하는 beta 경로이며 Auth 사용자·hash를 옮긴다.
  Auth settings/API keys, Realtime settings, Storage objects/settings, Edge Functions 등은 별도다.
- [Database Backups](https://supabase.com/docs/guides/platform/backups)는 DB backup이
  Storage API의 실제 객체를 포함하지 않는다고 명시한다.
- [Supabase changelog](https://supabase.com/changelog)에는 위 계약을 무효화하는 변경이 없었다.

따라서 기본 CLI dump를 Auth 포함 full DR이라고 부르지 않는다. 공식 지원 경로를
폐기 가능한 project에서 검증하기 전에는 임의 SQL로 `auth` schema에 write하지 않는다.

## 등급

| 등급 | 목적 | 필수 증거 |
|---|---|---|
| L1 | migration 전 application DB rollback 자료 | `roles.sql`, custom `schema.sql`, `data.sql`, `migration-history.sql` |
| L2 | 데이터 추출·감사 보존 | L1 + 파일별 SHA-256/bytes + `public.profiles`, `private.audit_events`, migration history 확인 |
| L3 | 신규 Supabase project 업무 복구 | L2 + Auth UUID/hash/identity + Auth settings + Realtime/extension 설정 manifest |
| L4 | 완전 서비스 복구 | L3 + Storage 객체/설정 + Edge Functions + Worker/config + 실제 로그인/RLS smoke 증거 |

상위 등급은 모든 하위 등급 조건을 포함한다. `storageObjectCount=0`은 “Storage를
확인하지 않음”이 아니다. 현재 폐기된 Storage surface를 조회해 실제 0건임을 확인한 값이다.

현재 `backup.yml`은 **L2**만 생성한다. `authIdentityIncluded=false`이므로 L3/L4 또는
“신규 project full DR”을 주장할 수 없다. `sourceSha`는 백업 workflow를 실행한 Git SHA이며,
DB transaction 시점이나 운영 배포 SHA의 일치를 단독으로 증명하지 않는다.

## L2 패키지 구조

암호화 전 tar package의 루트는 다음 파일을 포함한다.

| 파일 | 내용 |
|---|---|
| `roles.sql` | `supabase db dump --role-only` 결과 |
| `schema.sql` | 기본 custom schema dump (`auth`/`storage` 제외) |
| `data.sql` | application data dump |
| `migration-history.sql` | `supabase_migrations.schema_migrations` data dump |
| `source-evidence.json` | Auth UUID 집합, 핵심 row/checksum, migration/config/FK를 raw row 없이 digest로 축약한 비교 기준 |
| `dr-manifest.json` | 등급, 출처 SHA, 생성 시각, 파일 digest/bytes, 필수 객체와 capability |

manifest schema version 1의 핵심 형태는 다음과 같다.

```json
{
  "schemaVersion": 1,
  "sourceSha": "40-character-git-sha",
  "createdAt": "2026-07-20T00:00:00Z",
  "backupClass": "L2",
  "files": [
    { "path": "roles.sql", "sha256": "64-character-sha256", "bytes": 123 }
  ],
  "requiredObjects": {
    "public.profiles": true,
    "private.audit_events": true,
    "supabase_migrations.schema_migrations": true
  },
  "authIdentityIncluded": false,
  "storageObjectCount": 0,
  "capabilities": {
    "authSettingsIncluded": false,
    "realtimeSettingsIncluded": false,
    "extensionSettingsIncluded": false,
    "storageObjectsIncluded": false,
    "storageSettingsIncluded": false,
    "edgeFunctionsIncluded": false,
    "workerConfigIncluded": false,
    "loginRlsSmokeVerified": false
  }
}
```

## Validator 규칙

```bash
node scripts/verify-dr-package.mjs <extracted-package-directory>
```

성공 시 `SQA_DR_PACKAGE_OK`를 출력한다. 다음 중 하나라도 발견하면 non-zero로 종료한다.

- manifest schema/version, SHA, ISO 시각, 등급 또는 capability type 오류
- 빈 파일, 실제 bytes 불일치, SHA-256 불일치, 누락 파일, symlink
- 중복·절대·하위 directory·`..` 경로
- `public.profiles` 또는 L2 이상의 `private.audit_events` schema 누락
- `public.profiles` data form 또는 `supabase_migrations.schema_migrations` 이력 누락
- manifest의 `requiredObjects` 주장과 실제 SQL 불일치
- Auth identity가 없는 L3/L4, 또는 등급별 설정/evidence 파일 누락

workflow는 manifest 생성 직후 한 번, `.gpg`와 `.enc`를 각각 실제 복호화한 뒤 한 번씩
validator를 실행한다. 모든 검증이 끝난 뒤 plaintext directory와 tar를 삭제하고 암호문 두
개만 artifact로 업로드한다. Backup DB, DB Migrate, Deploy Worker는 공통
`sqa-production-release` concurrency group을 사용한다.

`source-evidence.json`은 원본 row, 이메일, password hash를 보관하지 않는다. 정렬된 Auth UUID
집합과 핵심 table canonical row를 SHA-256으로 축약하고 row count, migration version 집합,
extension/Realtime 집합, Storage object count, FK orphan count만 남긴다. Full DR workflow는
target에서 같은 evidence를 다시 산출해 exact match를 요구한다.

## L3/L4 승격 조건

등급 문자열만 변경해서는 승격되지 않는다. 최소한 다음이 필요하다.

1. 공식 Auth 이전 경로로 UUID와 `encrypted_password`를 보존한 `auth.sql` 또는 platform clone 증거
2. Auth/API key, Realtime, extension 설정 manifest
3. L4라면 Storage 0건을 포함한 객체 inventory, Storage 설정, Edge Function, Worker/config 증거
4. 폐기 가능한 신규 project에서 실제 로그인, 업무 FK, leader/member RLS smoke 성공 증거

platform clone 전략에서는 원래 L2 package의 `backupClass`를 거짓으로 L3로 바꾸지 않는다.
대신 clone 완료 사실, Auth UUID exact match, 보존 계정 로그인, settings/RLS/business smoke를
`restored-project.json`에 결합한 성공 run이 L3 복구 증거가 된다.

이 증거는 폐기 가능한 target의 Full DR rehearsal에서만 생성한다. production restore, production SQL,
`migration repair`, project 전환은 이 계약 validator의 권한 범위가 아니다.
