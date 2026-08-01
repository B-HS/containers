# 0020 — Registry credential·인증 image pull

날짜: 2026-08-01 KST
상태: 구현 완료
근거: Docker Engine API v1.52 registry authentication·`POST /images/create`, [0017](./0017-docker-command-completeness.md)

## 결정

### 1. Secret 소유 경계

- registry password 또는 access token은 API control DB에 저장하지 않는다.
- Engine Agent의 기존 `agent-credentials` named volume에 metadata와 AES-256-GCM ciphertext를 저장한다.
- master key는 같은 volume의 별도 0600 파일로 생성하며 container 밖 API와 Web에는 전달하지 않는다.
- API 목록·SSR·감사에는 ID, 이름, registry host, username, version, 시각만 노출한다.
- credential 생성·회전·삭제는 최근 인증 owner만, 목록과 선택 pull은 owner·admin만 수행한다.

### 2. Pull 경계

- `image.pull` durable job payload는 image reference와 선택 credential ID만 저장한다.
- worker가 Agent에 같은 payload를 전달하면 Agent가 실행 시점에 credential을 복호화한다.
- image reference가 명시적 registry를 갖지 않으면 `docker.io`, 첫 path component가 dot·colon 또는 `localhost`를 포함하면 그 component를 registry host로 정규화한다.
- 정규화 host와 credential `serverAddress`가 정확히 다르면 `REGISTRY_HOST_MISMATCH`로 Docker 호출 전에 거부한다.
- 일치할 때 username, password, serveraddress AuthConfig를 JSON→base64url로 만들고 Docker Engine 요청의 `X-Registry-Auth` header에만 전달한다.
- 공개 pull은 credential을 선택하지 않고 기존 동작을 유지한다.

### 3. UI와 운영

- 패널에서 public/credential pull을 선택하고 image reference를 durable job으로 등록한다.
- owner는 credential 생성, password/token 회전, 정확한 이름 확인 삭제를 수행한다.
- password input은 응답 성공 후 즉시 reset하며 서버 응답으로 다시 표시하지 않는다.

## 검증

- Agent 저장 파일에 password 원문이 없고 metadata 목록에도 secret이 없는지 검증했다.
- 올바른 registry reference는 복호화 AuthConfig를 반환하고 다른 host는 `REGISTRY_HOST_MISMATCH`로 거부한다.
- credential 회전 version 증가, 잘못된 삭제 확인문구 거부, 삭제 후 빈 목록을 검증했다.
- Engine control service가 credential ID를 Agent 내부에서 해석하고 Docker client의 auth 인자로만 전달하는지 검증했다.
- API route가 owner 최근 인증을 요구하고 audit에 password를 남기지 않으며 image.pull job payload에 credential ID만 저장하는지 검증했다.
- 전체 113 tests, 363 assertions, 30 files와 typecheck, ESLint, Prettier, backend bundle, Next.js webpack production build가 통과했다.
- Compose image 내부 Next.js Turbopack build와 API·Agent·Web 재배포가 성공했고 5개 service가 healthy다.
- live master key가 `600 bun:bun`, registry credential API 미인증 응답이 401임을 확인했다.
- owner 브라우저에서 metadata-only 빈 상태, public credential 선택, create/pull form과 console error 0건을 확인했다.
- 실제 private registry credential이 제공되지 않아 live authenticated pull은 수행하지 않았다. public pull E2E는 0017에서 완료됐고, 인증 header·host binding은 secret 없는 격리 테스트로 검증했다.
