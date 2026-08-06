# 내부 서비스(route=null) 배포가 관찰 단계에서 항상 실패한다

- 발견일: 2026-08-06
- 심각도: major — compose 스택의 DB·캐시처럼 공개 라우트가 없는 서비스를 **한 번도 배포할 수 없다**
- 발견 경로: 6.2 compose 스택 실측. 2서비스 스택의 첫 서비스(`verifystack-cache`)가 `DEPLOYMENT_OBSERVATION_FAILED` 로 죽었다

## 증상

```
stack: rolled-back  releases=1  DEPLOYMENT_OBSERVATION_FAILED
  failed  verifystack-cache-1.0.0-46977d39  DEPLOYMENT_OBSERVATION_FAILED
```

컨테이너 자체는 정상 기동했고(`Exited (0)` 은 릴리스가 중지한 결과다) probe 단계도 통과했다. 마지막 관찰 probe 에서만 실패한다.

## 원인

릴리스는 probe 를 통과하면 대상 네트워크에 연결하고 **probe 네트워크를 끊는다**. 공개 서비스는 그 뒤 nginx 를 통해 `routeProbe` 로 관찰하므로 문제가 없다. 그런데 내부 서비스(3.1 에서 `route` 를 nullable 로 바꾸며 생긴 경로)는 관찰도 `probeContainer` 로 한다 — probe 를 보내는 engine-agent 는 `containers_control`·`containers_probe` 에만 있고, 컨테이너는 이미 `containers_edge` 만 남은 상태라 **닿을 수 없다**.

```
engine-agent networks : containers_control containers_probe
container networks    : containers_edge          ← probe 네트워크 이미 분리됨
```

3.1 은 `isPublished` 가드를 넣으면서 관찰 분기만 나눴고 네트워크 분리 시점은 그대로 뒀다. 단위 테스트는 probe 스텁이 네트워크 상태와 무관하게 항상 healthy 를 돌려줘 이 조합을 잡지 못했다.

## 조치

- 공개 서비스는 지금처럼 라우트 전환 직전에 probe 네트워크를 끊는다.
- **내부 서비스는 관찰 probe 가 성공한 뒤에 끊는다.** 관찰 동안 두 네트워크에 함께 붙어 있는 것은 probe 단계와 같은 상태다.
- 회귀 테스트: 릴리스 테스트의 probe 스텁이 **현재 네트워크 부착 상태를 반영**하게 바꿨다(probe 네트워크가 없으면 503). 수정 전 코드에서는 새 테스트가 실패한다.

## 검증 (2026-08-06)

수정 후 같은 스택을 다시 배포해 `verifystack-cache`(내부) healthy, `verifystack-web`(공개) healthy, 스택 상태 `healthy`, `https://b.hyuns.uk` 200 을 확인했다.

## 남은 것

- 내부 서비스는 관찰 시간 동안 probe 네트워크에 남는다. 관찰이 끝나면 분리하지만, 관찰 중 프로세스가 죽으면 `reconcileInterrupted` 가 컨테이너를 중지하며 정리한다.
