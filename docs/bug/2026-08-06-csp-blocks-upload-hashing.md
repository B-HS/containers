# CSP 가 업로드 해시 WebAssembly 를 막아 브라우저 업로드가 전부 실패한다

- 발견일: 2026-08-06
- 심각도: blocker — 패널의 첫 단계(tar 업로드)가 브라우저에서 아예 동작하지 않는다
- 발견 경로: `1.3 job 실패 표면화` 실측 중 브라우저로 파일을 올리다 확인

## 증상

`/ko/artifacts` 에서 파일을 고르고 업로드를 누르면 요청이 한 건도 나가지 않고 토스트만 뜬다.

```
WebAssembly.compile(): Compiling or instantiating WebAssembly module violates
the following Content Security policy directive because 'unsafe-eval' is not
an allowed source of script in the following Content Security Policy directive:
"script-src 'self' 'unsafe-inline'"
```

## 원인

업로드는 큰 파일을 청크로 나누며 sha256 을 **증분 계산**한다. 그 해시 구현이 `hash-wasm` 이고(`apps/web/src/entities/artifact/artifact.query.ts:4` `import { createSHA256 } from 'hash-wasm'`), WebAssembly 모듈을 컴파일한다.

그런데 `infra/nginx/nginx.conf:81` 의 CSP `script-src` 가 `'self' 'unsafe-inline'` 뿐이라 브라우저가 WebAssembly 컴파일을 거부한다. 해시 계산이 첫 줄에서 예외로 끝나므로 업로드 세션 생성까지 가지 못한다.

API 경로(CI·스크립트)는 브라우저 CSP 와 무관해 정상 동작했다. 그래서 API key 전 구간 실측(2026-08-05)에서는 드러나지 않았고, 저장돼 있던 artifact 도 전부 API 로 올린 것이었다.

## 조치

CSP `script-src` 에 **`'wasm-unsafe-eval'`** 을 추가한다. 이 지시어는 WebAssembly 컴파일만 허용하고 `eval()` 같은 임의 문자열 실행은 계속 막는다 — `'unsafe-eval'` 을 추가하는 것과 다르다.

```
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
```

- `infra/nginx/nginx.conf`, `infra/nginx/nginx-tls.conf.example` 두 파일 모두.
- 회귀 방지: `packages/config/src/nginx-defaults.test.ts` 에 "CSP 가 WebAssembly 컴파일을 허용한다" 와 "임의 스크립트 eval 은 허용하지 않는다" 두 테스트를 추가했다.

### 실행 중 스택에는 별도 적용이 필요하다

nginx 설정의 정본은 저장소 파일이 아니라 **관리 볼륨의 `current.conf`** 다. 저장소 파일 수정만으로는 실행 중 스택에 반영되지 않는다. 패널의 Nginx 설정 화면 또는 `POST /api/nginx/config/apply` 로 적용해야 한다.

## 검토한 대안

| 대안                                                     | 판단                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `'unsafe-eval'` 추가                                     | 과하다. 임의 문자열 실행까지 열린다. `'wasm-unsafe-eval'` 이 정확히 이 용도의 좁은 지시어다                       |
| `hash-wasm` 을 Web Crypto `crypto.subtle.digest` 로 교체 | Web Crypto 에는 증분(streaming) 해시 API 가 없다. 수 GB tar 를 통째로 메모리에 올려야 해서 대용량 업로드가 깨진다 |
| 순수 JS sha256 구현으로 교체                             | 대용량에서 현저히 느리다. 업로드가 주 용도인 화면에서 체감 저하가 크다                                            |

## 남은 것

- 실행 중 스택 적용은 운영자 판단이 필요해 사용자에게 확인 요청한 상태다.
- 적용 후 브라우저 업로드와 `1.3` 실패 배너를 실측해야 한다.
