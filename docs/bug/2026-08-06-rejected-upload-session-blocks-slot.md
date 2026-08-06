# 검사에 실패한 업로드 세션이 동시 업로드 슬롯을 계속 차지한다

- 발견일: 2026-08-06
- 심각도: major — 잘못된 아카이브 두 개만 올리면 그 사용자는 **하루 동안 업로드를 못 한다**
- 발견 경로: 6.1 전 구간 재검증. 실제 이미지 아카이브를 올리려는데 `UPLOAD_CONCURRENCY_LIMIT` 로 막혔다

## 증상

```
POST /api/uploads/sessions → 409 UPLOAD_CONCURRENCY_LIMIT
upload_session: cancel-check.tar  status=uploading  received=25165824/25165824
                resume-check.tar  status=uploading  received=4194304/12582912
```

`cancel-check.tar` 는 전량 전송됐고 finalize 도 했지만 아카이브 검사에서 `ARCHIVE_INVALID` 로 거부됐다. 그런데 세션 상태는 `uploading` 그대로다.

## 원인

`finalizeSession` 이 `artifactInspectionService.inspect` 예외를 그대로 던지면서 세션 상태를 바꾸지 않았다. 활성 세션 수는 `status = 'uploading'` 으로 세고(사용자당 2개), 세션 TTL 은 24시간이다. 즉 검사에 실패한 업로드가 **24시간 동안 슬롯을 붙잡는다**.

digest 불일치(`ARTIFACT_DIGEST_MISMATCH`)도 같은 경로였다.

## 조치

- 검사 실패와 digest 불일치 시 세션을 `rejected` 로 전이시킨다. 활성 집계에서 빠지고 같은 사용자가 바로 다시 올릴 수 있다.
- `cleanupExpiredSessions` 가 `rejected` 도 정리 대상에 포함해 임시 파일을 지운다.
- 회귀 테스트: 검사 실패 후 세션이 `rejected` 이고 새 세션 2개를 더 만들 수 있는지 확인한다.

## 검증 (2026-08-06)

실행 중 스택에서 막혀 있던 세션을 다시 finalize 하니 `rejected` 로 전이했고, 곧바로 26MB 실제 이미지 아카이브 업로드가 통과했다.

## 남은 것

- 중간에 끊긴 세션(`uploading`, 부분 수신)은 그대로 남는다. 그게 재개의 전제이므로 의도한 동작이고, TTL 과 시작 시 정리가 회수한다.
- 사용자가 스스로 세션을 버릴 수 있는 API 는 없다. 필요해지면 `DELETE /api/uploads/sessions/:id` 를 검토한다.
