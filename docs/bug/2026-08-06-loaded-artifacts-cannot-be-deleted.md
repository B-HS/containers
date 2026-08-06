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

## 결정과 수정 (2026-08-06)

**A 안을 택했다** — load 이력은 남기고 아티팩트 파일만 회수한다. 이력을 지우면(B) 어떤 아티팩트가 어떤 이미지를 넣었는지 추적할 수단이 사라지고, 그대로 두면(C) 저장소를 비울 방법이 영영 없다.

- `deployment.artifact_id` 를 nullable + `on delete set null` 로 바꿨다(migration `0022`, generate).
- 아티팩트 삭제·보존 정리는 이제 `status = 'loading'` 인 배포만 참조로 본다. load 가 끝났으면 이력 행의 `artifact_id` 를 null 로 만들고 파일을 지운다. 이력 자체는 남는다.
- `DELETE /api/deployment-manifests/:id` 를 추가했다. 릴리스나 스택이 참조하면 409 `DEPLOYMENT_MANIFEST_IN_USE`.
- `DELETE /api/deployment-stacks/:id` 를 추가했다. `releasing` 상태 릴리스가 있으면 409 `DEPLOYMENT_STACK_IN_USE`, 없으면 스택과 스택 릴리스 이력을 한 트랜잭션으로 지운다. manifest 는 남긴다(릴리스가 참조하므로 manifest 삭제는 별도 요청이다).
- 세 경로 모두 audit attempt/success/failure 를 남기고, 권한은 기존 쓰기 경로와 같다(recent owner·admin 또는 `deployment:write`).

## 판단이 필요했던 지점 (해소)

load 가 끝난 tar 는 **기능적으로는 필요 없다** — 이미지는 이미 Docker 에 있고, 릴리스는 manifest 의 image digest 를 참조한다. 남길 이유는 감사 추적뿐이다. 그래서 선택지는:

| 안                                         | 뜻                                                  | 비용                                   |
| ------------------------------------------ | --------------------------------------------------- | -------------------------------------- |
| A. load 이력을 남기되 아티팩트 파일만 회수 | `deployment.artifactId` 를 nullable 로, 파일은 삭제 | migration + 이력 표시가 "삭제됨" 이 됨 |
| B. load 이력을 아티팩트와 함께 지운다      | FK 를 cascade 로                                    | migration + 감사 추적 손실             |
| C. 지금처럼 보존                           | 변경 없음                                           | 저장소가 계속 증가, 정리 수단 없음     |

manifest·스택 삭제는 별개 결정이다(참조 중인 릴리스가 있으면 거부, 없으면 삭제).

## 실측 (2026-08-06, api 재빌드 후)

- artifact 2건 DELETE → 200. `GET /api/artifacts` 가 빈 배열이 됐고 load 이력 행은 그대로 남았다.
- 스택 `verifystack` DELETE → 200.
- manifest 4건 중 `verify-internal` 은 참조가 없어 200, 릴리스가 있는 나머지 3건은 409 `DEPLOYMENT_MANIFEST_IN_USE`. 감사 로그에 attempt/success/failure 가 남았다.
- **릴리스 이력이 있는 manifest 는 남는다(의도).** 릴리스가 manifest 를 참조하는 한 그 manifest 는 배포 이력의 일부다. manifest 행은 메타데이터라 저장소를 잠식하지 않는다.
- 저장소를 실제로 잠식하는 것(artifact 파일)은 수동 삭제와 보존 기간 정리 양쪽이 회수한다. job 이력은 `cleanupFinished` 가 종료 14일 뒤 지우고(event 는 cascade), audit 은 아카이브 후 정리된다. 남는 것은 배포 연혁 메타데이터뿐이다.
