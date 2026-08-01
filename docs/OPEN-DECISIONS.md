# 구현 결정 현황

상태: **설계 결정 완료**  
확정일: 2026-07-31  
정식 기록: [acknowledge/0002-product-decisions.md](./acknowledge/0002-product-decisions.md)

이 파일명은 기존 문서 링크의 안정성을 위해 유지한다. 현재 구현을 막는 미확정 제품 결정은 없다. 아래 값은 구현·설치 시 구성으로 주입하며 설계 변경으로 취급하지 않는다.

## 확정 결정 요약

| 번호 | 확정안                                                                                     |
| ---: | ------------------------------------------------------------------------------------------ |
|    1 | 제품명 `Containers` 유지                                                                   |
|    2 | M1 Max macOS와 Docker Desktop 전용 production                                              |
|    3 | Docker Compose 다중 컨테이너                                                               |
|    4 | Phase 0에서 Next.js의 Bun production runtime 우선 검증, 실패 시 web만 Node.js              |
|    5 | 패널, 외부 API, wildcard workload, custom domain 분리                                      |
|    6 | remotely-managed Cloudflare Tunnel과 패널 Cloudflare Access                                |
|    7 | 단일 조직, `owner/admin/operator/viewer/auditor`, 공개 가입 없음                           |
|    8 | email/password와 초대 링크, MFA는 후속 단계                                                |
|    9 | typed Docker Engine operation 전 범위, host shell과 raw Docker CLI 금지                    |
|   10 | 위험 컨테이너 옵션 기본 금지, owner break-glass 개별 승인                                  |
|   11 | 외부 자동화 API는 애플리케이션 API 키만 사용                                               |
|   12 | image archive, OCI archive, rootfs, Compose bundle, Dockerfile build를 첫 버전에 모두 지원 |
|   13 | 기본 10GiB, 관리자 quota, 64MiB resumable chunk                                            |
|   14 | blue-green, health probe, 관찰 window, 자동 rollback                                       |
|   15 | secret·malware·critical vulnerability 검사, critical 차단과 owner 예외                     |
|   16 | 원본 client IP 저장                                                                        |
|   17 | raw file 7일, raw row 14일, minute 90일, hour 1년, audit 1년                               |
|   18 | 100 containers, 지속 1,000 req/s, burst 5,000 req/s, terminal 10, upload 2                 |
|   19 | 로컬 회전 backup 필수, Cloudflare R2 offsite backup 선택                                   |
|   20 | Discord webhook 알림, SMTP 없음                                                            |
|   21 | 한국어·영어·일본어 동시 제공, 독립 language pack 확장 구조                                 |
|   22 | 구조화 route와 전체 `nginx.conf` 편집을 함께 제공하되 다단계 유효성·생존 검증 적용         |

## 설치 시 입력할 값

- 보유 도메인에서 사용할 실제 패널, 외부 API, wildcard workload 호스트명
- Cloudflare Tunnel token과 Access application·policy 식별자
- Discord webhook URL
- 선택적으로 사용할 R2 endpoint, bucket, access key와 secret
- 운영자 초대 대상과 각 role
- Docker Desktop의 실제 384GB disk limit 확인값과 경고 임계치 조정값

이 값은 secret 저장소 또는 설치 설정으로 입력하며 문서나 저장소에 실제 값을 기록하지 않는다.

## 향후 별도 승인이 필요한 변경

- 다중 Docker host 또는 Linux production 지원
- 다중 조직·tenant
- TOTP·WebAuthn MFA
- host shell, raw Docker CLI, 임의 Engine request endpoint
- SMTP 또는 Discord 이외 알림 adapter
- Docker Desktop 밖 macOS host 전체를 조작하는 agent
