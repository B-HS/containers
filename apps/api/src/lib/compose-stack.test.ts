import { describe, expect, test } from 'bun:test'
import { composeRejectionListSchema } from '@containers/contracts/deployment-stack'
import { buildImageDigestByReference, convertComposeStack } from './compose-stack'
import { isAppError } from './error'

const IMAGE_DIGEST = `sha256:${'a'.repeat(64)}`
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`

const digests = new Map([
    ['app:1.0.0', IMAGE_DIGEST],
    ['db:16', OTHER_DIGEST],
])

const convert = (compose: string) => convertComposeStack({ compose, imageDigestByReference: digests, stackName: 'shop', stackVersion: '1.0.0' })

const captureCode = (execute: () => unknown) => {
    try {
        execute()
        return null
    } catch (error) {
        return isAppError(error) ? error.code : 'UNKNOWN'
    }
}

const captureRejections = (execute: () => unknown) => {
    try {
        execute()
        return []
    } catch (error) {
        return isAppError(error) ? composeRejectionListSchema.parse(error.details?.rejections) : []
    }
}

describe('compose 스택 변환', () => {
    test('의존 순서대로 manifest 를 만든다', () => {
        const preview = convert(`
services:
  app:
    image: app:1.0.0
    depends_on: [db]
    expose: ["8080"]
    labels:
      containers.route.hostname: shop.example.com
      containers.health-path: /healthz
  db:
    image: db:16
    expose: ["5432"]
`)

        expect(preview.order).toEqual(['db', 'app'])
        expect(preview.services.map((plan) => plan.manifest.name)).toEqual(['shop-db', 'shop-app'])
        expect(preview.services[0]?.manifest.route).toBeNull()
        expect(preview.services[1]?.manifest.route).toEqual({ hostname: 'shop.example.com', path: '/', stripPrefix: false })
        expect(preview.services[1]?.manifest.healthcheck.path).toBe('/healthz')
        expect(preview.services[1]?.manifest.imageDigest).toBe(IMAGE_DIGEST)
        expect(preview.services[1]?.manifest.version).toBe('1.0.0')
    })

    test('자원 상한과 healthcheck 타이밍을 옮긴다', () => {
        const preview = convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    restart: always
    healthcheck:
      interval: 30s
      timeout: 5s
      retries: 4
      start_period: 1m
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.5"
`)
        const manifest = preview.services[0]?.manifest

        expect(manifest?.healthcheck).toEqual({ intervalSeconds: 30, path: '/', retries: 4, startPeriodSeconds: 60, timeoutSeconds: 5 })
        expect(manifest?.memoryBytes).toBe(536_870_912)
        expect(manifest?.nanoCpus).toBe(1_500_000_000)
        expect(manifest?.restartPolicy).toBe('unless-stopped')
    })

    test('secret 참조만 환경변수로 받는다', () => {
        const preview = convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    environment:
      DATABASE_URL: secret:apps/shop/database-url
`)

        expect(preview.services[0]?.manifest.secrets).toEqual([{ environmentKey: 'DATABASE_URL', reference: 'apps/shop/database-url' }])
    })

    test('평문 환경변수는 거부한다', () => {
        expect(
            captureCode(() =>
                convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    environment:
      TOKEN: plain-value
`),
            ),
        ).toBe('DEPLOYMENT_STACK_REJECTED')
    })

    test('특권과 호스트 네임스페이스를 거부한다', () => {
        expect(
            captureCode(() =>
                convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    privileged: true
    pid: host
`),
            ),
        ).toBe('DEPLOYMENT_STACK_REJECTED')
    })

    test('호스트 bind mount 와 docker socket 을 거부한다', () => {
        expect(
            captureCode(() =>
                convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
`),
            ),
        ).toBe('DEPLOYMENT_STACK_REJECTED')
    })

    test('금지 capability 를 거부한다', () => {
        expect(
            captureCode(() =>
                convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    cap_add: [SYS_ADMIN]
`),
            ),
        ).toBe('DEPLOYMENT_STACK_REJECTED')
    })

    test('명명 볼륨은 그대로 옮긴다', () => {
        const preview = convert(`
services:
  db:
    image: db:16
    expose: ["5432"]
    volumes:
      - db-data:/var/lib/postgresql/data
`)

        expect(preview.services[0]?.manifest.volumes).toEqual([{ mountPath: '/var/lib/postgresql/data', name: 'db-data', readOnly: false }])
    })

    test('무시하는 키를 목록으로 알려준다', () => {
        const preview = convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    ports:
      - "8080:8080"
    build: .
    profiles: [dev]
`)

        expect(preview.ignored.map((entry) => entry.key).sort()).toEqual(['build', 'ports', 'profiles'])
    })

    test('의존 순환을 거부한다', () => {
        expect(
            captureCode(() =>
                convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    depends_on: [db]
  db:
    image: db:16
    expose: ["5432"]
    depends_on: [app]
`),
            ),
        ).toBe('DEPLOYMENT_STACK_DEPENDENCY_CYCLE')
    })

    test('없는 이미지와 포트 미상을 각각 구분해 거부한다', () => {
        expect(captureCode(() => convert('services:\n  app:\n    image: missing:1\n    expose: ["8080"]\n'))).toBe(
            'DEPLOYMENT_IMAGE_DIGEST_NOT_FOUND',
        )
        expect(captureCode(() => convert('services:\n  app:\n    image: app:1.0.0\n'))).toBe('DEPLOYMENT_STACK_PORT_MISSING')
    })

    test('services 가 없으면 거부한다', () => {
        expect(captureCode(() => convert('version: "3"\n'))).toBe('DEPLOYMENT_STACK_SERVICES_MISSING')
    })

    test('셸 형식 command 를 거부한다', () => {
        expect(captureCode(() => convert('services:\n  app:\n    image: app:1.0.0\n    expose: ["8080"]\n    command: npm start\n'))).toBe(
            'DEPLOYMENT_STACK_SHELL_FORM_UNSUPPORTED',
        )
    })

    test('값 없는 환경변수 키를 어느 서비스의 어느 키인지 밝혀 거부한다', () => {
        const rejections = captureRejections(() =>
            convert(`
services:
  app:
    image: app:1.0.0
    expose: ["8080"]
    environment:
      - LOG_LEVEL
      - EMPTY_VALUE=
`),
        )

        expect(rejections).toEqual([
            { detail: 'LOG_LEVEL 에 값이 없다. secret:<reference> 형식으로 적는다.', rule: 'environment-value-missing', service: 'app' },
            { detail: 'EMPTY_VALUE 에 값이 없다. secret:<reference> 형식으로 적는다.', rule: 'environment-value-missing', service: 'app' },
        ])
    })
})

describe('이미지 태그 digest 맵', () => {
    const image = {
        createdAt: '2026-08-06T00:00:00.000Z',
        id: IMAGE_DIGEST,
        repoDigests: [`app@${OTHER_DIGEST}`],
        repoTags: ['app:1.0.0', 'app:latest', '<none>:<none>'],
        sharedSizeBytes: 0,
        sizeBytes: 1,
    }

    test('태그와 태그 생략형과 digest 참조를 모두 키로 만든다', () => {
        const byReference = buildImageDigestByReference([image])

        expect(byReference.get('app:1.0.0')).toBe(IMAGE_DIGEST)
        expect(byReference.get('app:latest')).toBe(IMAGE_DIGEST)
        expect(byReference.get('app')).toBe(IMAGE_DIGEST)
        expect(byReference.get(`app@${OTHER_DIGEST}`)).toBe(IMAGE_DIGEST)
    })

    test('태그를 잃은 이미지는 키로 만들지 않는다', () => {
        expect(buildImageDigestByReference([image]).has('<none>:<none>')).toBe(false)
        expect(buildImageDigestByReference([{ ...image, repoDigests: [], repoTags: [] }]).size).toBe(0)
    })
})
