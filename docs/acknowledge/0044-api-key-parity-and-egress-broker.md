# 0044 — API 키 패리티와 egress-broker

2026-08-20. Forgejo+MySQL 배포 시도에서 드러난 결함([API-PARITY-PLAN.md](../API-PARITY-PLAN.md))에 대한 사용자 결정.

## 결정

1. **패리티 범위**: 웹 세션으로 가능한 조작 전체를 API 키로도 가능하게 한다. 단 세 가지는 세션 전용으로 유지한다 — exec/TTY(대화형·최고 위험), API 키 관리 자체(키로 키를 만드는 권한 상승 차단), 계정·초대·bootstrap(신원 결합).
2. **스코프 모델**: 도메인별 read/write 스코프를 추가한다(container:write, image:write, nginx:write 등). API 키는 발급자의 비대화형 자격증명이다 — 키 보유자의 **현재 role** 이 라우트 role 요구에 그대로 적용되고(owner 전용 작업은 owner 키만), 세션의 recent 15분 요구는 키 경로에서 scope 보유로 대체한다.
3. **레지스트리 DNS 검증**: egress-broker 컨테이너를 신설한다. edge(egress 가능)와 control 네트워크에 걸치는 소형 내부 서비스로, DNS 해석 대행과 webhook 발송 대행을 제공한다. 이로써 2026-08-04 하드닝(2bdcc61, api 의 edge 제거) 이후 사문화된 SSRF DNS 사전검증과 Discord webhook 실전송이 모두 복구된다. api·agent 는 internal 격리를 유지한다.
4. **롤아웃**: 이번에는 코드·테스트·문서까지만. 실배포(호스트 재빌드)와 Forgejo 배포 완주는 별도로 진행한다.

## 파생 제약

- 신규 owner 전용 scope: backup:restore, maintenance:write, panel-setting:write, registry-credential:write, system:prune, trusted-proxy:write (기존 backup:write·secret:write 에 추가).
- API 키 경로의 mutating audit 에는 apiKeyId 를 함께 기록한다.
- egress-broker 는 shared-secret 내부 인증(engine-agent 패턴), read_only·no-new-privileges·자원 상한을 적용하고 포트를 publish 하지 않는다.
- 웹 UI: 컨테이너 생성 폼에 environment·volumes·entrypoint 입력 추가, API 키 위젯 기본 선택을 발급자 role 에 맞게 축소.
