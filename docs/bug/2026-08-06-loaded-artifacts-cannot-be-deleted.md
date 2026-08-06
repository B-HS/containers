# 한 번 로드한 아티팩트와 배포 자산을 지울 방법이 없다

- 발견일: 2026-08-06
- 심각도: major — 아티팩트 저장소가 무한히 늘어난다. 테스트 자산도 되돌릴 수 없다
- 발견 경로: 6.4 정리. 실측에 쓴 아티팩트·manifest·스택을 지우려다 전부 막혔다

## 증상

```
DELETE /api/artifacts/{id}  → 409 ARTIFACT_IN_USE  "배포가 참조 중인 artifact는 삭제할 수 없습니다."
DELETE /api/deployment-manifests/{id}  → 라우트 자체가 없다 (404)
DELETE /api/deployment-stacks/{id}     → 라우트 자체가 없다 (404)
```

## 원인

1. **아티팩트**: `removeArtifact` 와 `cleanupExpiredArtifacts` 가 둘 다 `countDeploymentsByArtifact(id) > 0` 이면 건너뛴다. 이미지 load 에 성공하면 `deployment` 행(=load 이력)이 영구히 남으므로 그 아티팩트는 **수동 삭제도 보존 정책도 영원히 통과하지 못한다.** tar 파일이 `artifacts/ready` 에 계속 쌓이고 업로드 quota 계산에도 계속 잡힌다.
2. **manifest·스택**: 조회와 생성만 있고 삭제 라우트가 없다. manifest 는 릴리스가 `restrict` FK 로 참조하고, 스택은 manifest 를 정참조한다.

`deployment.artifactId` 는 `restrict` FK 라 아티팩트만 지우는 것도 DB 수준에서 막힌다.

## 판단이 필요한 지점 (미결)

load 가 끝난 tar 는 **기능적으로는 필요 없다** — 이미지는 이미 Docker 에 있고, 릴리스는 manifest 의 image digest 를 참조한다. 남길 이유는 감사 추적뿐이다. 그래서 선택지는:

| 안                                         | 뜻                                                  | 비용                                   |
| ------------------------------------------ | --------------------------------------------------- | -------------------------------------- |
| A. load 이력을 남기되 아티팩트 파일만 회수 | `deployment.artifactId` 를 nullable 로, 파일은 삭제 | migration + 이력 표시가 "삭제됨" 이 됨 |
| B. load 이력을 아티팩트와 함께 지운다      | FK 를 cascade 로                                    | migration + 감사 추적 손실             |
| C. 지금처럼 보존                           | 변경 없음                                           | 저장소가 계속 증가, 정리 수단 없음     |

manifest·스택 삭제는 별개 결정이다(참조 중인 릴리스가 있으면 거부, 없으면 삭제).

## 지금 상태

이번 실측이 남긴 자산은 지우지 못하고 그대로 있다.

- artifact 2건: `nginx-alpine.tar`(25.6 MiB), `socat.tar`(4.5 MiB)
- manifest 4건: `verify-web`, `verify-internal`, `verifystack-cache`, `verifystack-web`
- 스택 1건: `verifystack`, 스택 배포 2건
- 배포 컨테이너·라우트는 정리했다(컨테이너 remove, 라우트 delete 200)
