# 브랜치 정리 (2026-08-06)

`dev` 하나만 남긴다. 지운 브랜치의 마지막 커밋을 여기 적어 두므로 필요하면 `git checkout <sha>` 로 되살릴 수 있다.

| 브랜치                              | 마지막 커밋 | 날짜       | 상태                                           |
| ----------------------------------- | ----------- | ---------- | ---------------------------------------------- |
| `feat/web-ui-refresh`               | `859f7c7`   | 2026-08-04 | `dev` 에 이미 포함(ancestor). 남길 이유가 없다 |
| `feat/web-panel-sidebar-navigation` | `efc1da3`   | 2026-08-03 | `dev` 가 구조를 다시 짜면서 대체됐다           |
| `rest-work/deepseekv4`              | `e1abb1a`   | 2026-08-02 | 같은 이유로 대체됐다                           |

## 대체됐다고 판단한 근거

두 브랜치에만 있던 파일은 아래 3~4개뿐이고, 전부 `dev` 에서 다른 이름·구조로 존재한다.

| 브랜치의 파일                                  | `dev` 의 대응                                         |
| ---------------------------------------------- | ----------------------------------------------------- |
| `apps/traffic-worker/src/lib/app-error.ts`     | `apps/traffic-worker/src/lib/error.ts` + `error-code` |
| `apps/web/src/shared/ui/inline-alert.tsx`      | `apps/web/src/shared/ui/alert.tsx`                    |
| `apps/web/src/entities/engine/engine-info.tsx` | `apps/web/src/widgets/engine/*`                       |
| `apps/web/src/widgets/control-plane-control/*` | `apps/web/src/widgets/control-plane/*`                |
| `apps/web/src/widgets/notification-control/*`  | `apps/web/src/widgets/notification/*`                 |

`scripts/setup-macos.sh` 처럼 diff 에 크게 잡히던 파일도 `dev` 에 그대로 있다. 차이의 대부분은 두 브랜치가 갈라진 뒤 `dev` 가 훨씬 앞서 나가면서 생긴 것이다.
