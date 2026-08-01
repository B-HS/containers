# 요구사항 추적표

사용자의 최초 요구를 설계와 인수 항목에 연결한다. 구현 중 어느 요구도 문서 연결 없이 완료 처리하지 않는다.

| 번호 | 사용자 요구                                              | 설계 단일 출처                                                                                                             |   구현 Phase | 인수 영역           |
| ---: | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -----------: | ------------------- |
|    1 | Nginx가 가장 앞에서 요청 분석                            | [NGINX-TRAFFIC.md](./NGINX-TRAFFIC.md) 1~3                                                                                 |            6 | ACCEPTANCE 1, 6     |
|    2 | Nginx와 별개로 정확한 traffic logging·분석·API·dashboard | [NGINX-TRAFFIC.md](./NGINX-TRAFFIC.md) 5~10                                                                                |            7 | ACCEPTANCE 7        |
|    3 | Nginx 설정 저장·reload·현황 Next.js SSR webpage          | [NGINX-TRAFFIC.md](./NGINX-TRAFFIC.md) 3~4, 9와 [UI-UX.md](./UI-UX.md)                                                     |         2, 6 | ACCEPTANCE 6, 9     |
|    4 | Hono API, Next.js+Hono monorepo, Hono RPC type safety    | [TECH-STACK.md](./TECH-STACK.md) 2~4와 [API-DATA-AUTH.md](./API-DATA-AUTH.md)                                              |         1, 3 | ACCEPTANCE 2, 11    |
|    5 | tar 등 artifact를 API key 또는 login panel로 upload      | [UPLOAD-DEPLOYMENT.md](./UPLOAD-DEPLOYMENT.md)                                                                             |            8 | ACCEPTANCE 8        |
|    6 | Drizzle + SQLite login                                   | [API-DATA-AUTH.md](./API-DATA-AUTH.md) 5, 7                                                                                |            3 | ACCEPTANCE 2        |
|    7 | Node 관련 Bun 우선                                       | [TECH-STACK.md](./TECH-STACK.md) 1, 3과 [OPEN-DECISIONS.md](./OPEN-DECISIONS.md) 4                                         |         0, 1 | ACCEPTANCE 11       |
|    8 | Bun monorepo                                             | [TECH-STACK.md](./TECH-STACK.md) 1~2                                                                                       |            1 | ACCEPTANCE 11       |
|    9 | shadcn docs의 component 선목록화·최대 사용               | [SHADCN-COMPONENTS.md](./SHADCN-COMPONENTS.md)                                                                             |            2 | ACCEPTANCE 9        |
|   10 | panel·API에서 container 상태 정확히 인지                 | [ARCHITECTURE.md](./ARCHITECTURE.md) 4와 [DOCKER-CONTROL.md](./DOCKER-CONTROL.md) 2                                        |            4 | ACCEPTANCE 3        |
|   11 | exec, status, rm, rmi 등 Docker 명령 실행                | [DOCKER-CONTROL.md](./DOCKER-CONTROL.md) 3~~8과 [OPEN-DECISIONS.md](./OPEN-DECISIONS.md) 9~~10                             |            5 | ACCEPTANCE 4~5      |
|   12 | 완성도 높은 UI/UX, 레퍼런스 정독                         | [UI-UX.md](./UI-UX.md)와 `flunti-otel` 디자인 ADR                                                                          |     2, 9, 11 | ACCEPTANCE 9        |
|   13 | 호스트를 직접 조작하지 않고 웹·API로 완전 운영           | [PRODUCT-REQUIREMENTS.md](./PRODUCT-REQUIREMENTS.md)와 [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)                  |     전 Phase | ACCEPTANCE 12       |
|   14 | 기술·구현·테스트 docs와 checklist 먼저 작성              | 이 `docs/` 전체                                                                                                            | 구현 전 완료 | DOCUMENT-AUDIT 전체 |
|   15 | 모호점·고도화·추가 기능을 다방향 질문                    | [OPEN-DECISIONS.md](./OPEN-DECISIONS.md)                                                                                   | Phase 0 이전 | 사용자 합의 ADR     |
|   16 | M1 Max macOS·Docker Desktop production                   | [ARCHITECTURE.md](./ARCHITECTURE.md) 8과 [DOCKER-CONTROL.md](./DOCKER-CONTROL.md)                                          |      0, 1, 4 | ACCEPTANCE 1, 3, 11 |
|   17 | 모든 artifact 형식과 10GiB chunk upload                  | [UPLOAD-DEPLOYMENT.md](./UPLOAD-DEPLOYMENT.md)                                                                             |            8 | ACCEPTANCE 8        |
|   18 | 원본 IP와 정교한 개인정보 test                           | [SECURITY.md](./SECURITY.md) 12와 [TESTING.md](./TESTING.md)                                                               |    7, 10, 11 | ACCEPTANCE 7        |
|   19 | 로컬 backup, R2 선택, Discord webhook, SMTP 제외         | [BACKUP-RESTORE.md](./BACKUP-RESTORE.md), [acknowledge/0002-product-decisions.md](./acknowledge/0002-product-decisions.md) |            9 | ACCEPTANCE 10, 12   |
|   20 | 여러 운영자 초대 링크                                    | [API-DATA-AUTH.md](./API-DATA-AUTH.md) 5, 7                                                                                |            3 | ACCEPTANCE 2        |
|   21 | 한국어·영어·일본어와 후속 language pack                  | [TECH-STACK.md](./TECH-STACK.md) 7과 [UI-UX.md](./UI-UX.md) 11                                                             |      2, 3, 9 | ACCEPTANCE 9        |
|   22 | 구조화 route와 전체 Nginx config 편집                    | [NGINX-TRAFFIC.md](./NGINX-TRAFFIC.md) 3~4                                                                                 |            6 | ACCEPTANCE 6        |

## 변경 통제

- 요구가 추가되면 이 표에 행을 먼저 추가한다.
- 구현 Phase와 인수 항목이 없는 요구는 구현을 시작하지 않는다.
- 사용자가 요구를 제외하면 삭제하지 않고 ADR에서 제외 이유와 영향을 기록한다.
- 테스트에서 발견한 필수 보완은 인수 체크리스트와 구현 Phase를 함께 갱신한다.
