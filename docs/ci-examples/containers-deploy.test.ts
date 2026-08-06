import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT_PATH = resolve(import.meta.dir, 'containers-deploy.sh')
const ARCHIVE_BYTES = 4096
const IMAGE_DIGEST = `sha256:${'a'.repeat(64)}`
const ARTIFACT_ID = '0f7b1f4a-1a3d-4a1e-9f7c-9a2f6a1b2c3d'
const MANIFEST_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const RELEASE_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const STACK_ID = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f'
const STACK_RELEASE_ID = '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

type RecordedRequest = {
    authorization: string | null
    body: string
    method: string
    path: string
}

const createStubServer = (existingArtifacts: { id: string; sha256: string; status: string }[] = []) => {
    const requests: RecordedRequest[] = []
    const server = Bun.serve({
        fetch: async (request) => {
            const url = new URL(request.url)
            const path = `${url.pathname}${url.search}`
            const body = request.method === 'GET' ? '' : await request.text()
            requests.push({ authorization: request.headers.get('authorization'), body, method: request.method, path })

            const json = (data: unknown) => Response.json({ data, success: true })

            if (url.pathname === '/api/artifacts' && request.method === 'GET') {
                return json(existingArtifacts)
            }
            if (url.pathname === '/api/uploads/sessions' && request.method === 'POST') {
                return json({ id: 'session-1', receivedBytes: 0, status: 'uploading' })
            }
            if (url.pathname.endsWith('/chunks') && request.method === 'PUT') {
                return json({ receivedBytes: ARCHIVE_BYTES })
            }
            if (url.pathname.endsWith('/finalize')) {
                return json({ job: { id: 'job-upload' } })
            }
            if (url.pathname === '/api/jobs/job-upload') {
                return json({ result: { artifactId: ARTIFACT_ID }, status: 'succeeded' })
            }
            if (url.pathname === `/api/artifacts/${ARTIFACT_ID}/load`) {
                return json({ job: { id: 'job-load' } })
            }
            if (url.pathname === '/api/images') {
                return json([{ id: IMAGE_DIGEST, repoDigests: [], repoTags: ['probe:1.0.0'] }])
            }
            if (url.pathname === '/api/deployment-manifests' && request.method === 'POST') {
                return json({ id: MANIFEST_ID })
            }
            if (url.pathname === `/api/deployment-manifests/${MANIFEST_ID}/releases`) {
                return json({ job: { id: 'job-release' }, release: { id: RELEASE_ID } })
            }
            if (url.pathname === `/api/deployment-releases/${RELEASE_ID}`) {
                return json({ id: RELEASE_ID, status: 'healthy' })
            }
            if (url.pathname === `/api/deployment-releases/${RELEASE_ID}/rollback`) {
                return json({ job: { id: 'job-rollback' } })
            }
            if (url.pathname === '/api/deployment-stacks/preview') {
                return json({ ignored: [], order: ['cache', 'web'], services: [] })
            }
            if (url.pathname === '/api/deployment-stacks' && request.method === 'POST') {
                return json({ id: STACK_ID })
            }
            if (url.pathname === `/api/deployment-stacks/${STACK_ID}/releases`) {
                return json({ job: { id: 'job-stack' }, stackRelease: { id: STACK_RELEASE_ID } })
            }
            if (url.pathname === `/api/deployment-stack-releases/${STACK_RELEASE_ID}`) {
                return json({ id: STACK_RELEASE_ID, status: 'healthy' })
            }
            if (url.pathname.startsWith('/api/jobs/')) {
                return json({ status: 'succeeded' })
            }
            return Response.json({ error: { code: 'NOT_FOUND', message: path }, success: false }, { status: 404 })
        },
        port: 0,
    })
    return { requests, server }
}

const createWorkspace = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-deploy-script-'))
    temporaryDirectories.push(directory)
    const archive = join(directory, 'image.tar')
    await writeFile(archive, new Uint8Array(ARCHIVE_BYTES))
    const manifestFile = join(directory, 'manifest.json')
    await writeFile(
        manifestFile,
        JSON.stringify({ healthcheck: { path: '/health' }, internalPort: 8080, name: 'probe', network: 'containers_edge', route: null }),
    )
    const composeFile = join(directory, 'compose.yaml')
    await writeFile(composeFile, 'services:\n  web:\n    image: probe:1.0.0\n    expose: ["8080"]\n')
    return { archive, composeFile, directory, manifestFile }
}

const runScript = async (command: string[], environment: Record<string, string>) => {
    const child = Bun.spawn(['bash', SCRIPT_PATH, ...command], {
        env: { ...process.env, ...environment },
        stderr: 'pipe',
        stdout: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    return { exitCode, stderr, stdout }
}

describe('containers-deploy.sh', () => {
    test('deploy 는 업로드→load→manifest→release 를 순서대로 부르고 healthy 를 확인한다', async () => {
        const { requests, server } = createStubServer()
        const workspace = await createWorkspace()
        const result = await runScript(['deploy'], {
            API_BASE: server.url.origin,
            CONTAINERS_API_KEY: 'ctk_test',
            DEPLOY_NAME: 'probe',
            DEPLOY_VERSION: '1.0.0',
            IMAGE_ARCHIVE: workspace.archive,
            IMAGE_DIGEST,
            MANIFEST_FILE: workspace.manifestFile,
            WORK_DIR: workspace.directory,
        })
        await server.stop(true)

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe(RELEASE_ID)
        expect(requests.map((request) => `${request.method} ${request.path.split('?')[0]}`)).toEqual([
            'GET /api/artifacts',
            'POST /api/uploads/sessions',
            'PUT /api/uploads/sessions/session-1/chunks',
            'POST /api/uploads/sessions/session-1/finalize',
            'GET /api/jobs/job-upload',
            `POST /api/artifacts/${ARTIFACT_ID}/load`,
            'GET /api/jobs/job-load',
            'GET /api/images',
            'POST /api/deployment-manifests',
            `POST /api/deployment-manifests/${MANIFEST_ID}/releases`,
            'GET /api/jobs/job-release',
            `GET /api/deployment-releases/${RELEASE_ID}`,
        ])
        expect(requests.every((request) => request.authorization === 'Bearer ctk_test')).toBe(true)
    })

    test('업로드 세션은 이름·버전·해시를 idempotency-key 로 쓰고 manifest 에 digest·version 을 주입한다', async () => {
        const { requests, server } = createStubServer()
        const workspace = await createWorkspace()
        await runScript(['deploy'], {
            API_BASE: server.url.origin,
            CONTAINERS_API_KEY: 'ctk_test',
            DEPLOY_NAME: 'probe',
            DEPLOY_VERSION: '9.9.9',
            IMAGE_ARCHIVE: workspace.archive,
            IMAGE_DIGEST,
            MANIFEST_FILE: workspace.manifestFile,
            WORK_DIR: workspace.directory,
        })
        await server.stop(true)

        const session = requests.find((request) => request.path === '/api/uploads/sessions')
        const manifest = requests.find((request) => request.path === '/api/deployment-manifests')
        expect(JSON.parse(session?.body ?? '{}')).toMatchObject({
            expectedSizeBytes: ARCHIVE_BYTES,
            fileName: 'probe-9.9.9.tar',
            mediaType: 'application/vnd.docker.image.rootfs.diff.tar',
        })
        expect(JSON.parse(manifest?.body ?? '{}')).toMatchObject({ imageDigest: IMAGE_DIGEST, name: 'probe', version: '9.9.9' })
    })

    test('이미 같은 내용의 artifact 가 있으면 업로드를 건너뛴다', async () => {
        const workspace = await createWorkspace()
        const archiveSha = new Bun.CryptoHasher('sha256').update(await Bun.file(workspace.archive).bytes()).digest('hex')
        const { requests, server } = createStubServer([{ id: ARTIFACT_ID, sha256: archiveSha, status: 'ready' }])
        const result = await runScript(['deploy'], {
            API_BASE: server.url.origin,
            CONTAINERS_API_KEY: 'ctk_test',
            DEPLOY_NAME: 'probe',
            DEPLOY_VERSION: '1.0.0',
            IMAGE_ARCHIVE: workspace.archive,
            IMAGE_DIGEST,
            MANIFEST_FILE: workspace.manifestFile,
            WORK_DIR: workspace.directory,
        })
        await server.stop(true)

        expect(result.exitCode).toBe(0)
        expect(requests.some((request) => request.path.includes('/chunks'))).toBe(false)
        expect(requests.map((request) => `${request.method} ${request.path.split('?')[0]}`)).toEqual([
            'GET /api/artifacts',
            `POST /api/artifacts/${ARTIFACT_ID}/load`,
            'GET /api/jobs/job-load',
            'GET /api/images',
            'POST /api/deployment-manifests',
            `POST /api/deployment-manifests/${MANIFEST_ID}/releases`,
            'GET /api/jobs/job-release',
            `GET /api/deployment-releases/${RELEASE_ID}`,
        ])
    })

    test('stack 은 미리보기 뒤에 등록하고 스택 배포가 healthy 인지 확인한다', async () => {
        const { requests, server } = createStubServer()
        const workspace = await createWorkspace()
        const result = await runScript(['stack'], {
            API_BASE: server.url.origin,
            COMPOSE_FILE: workspace.composeFile,
            CONTAINERS_API_KEY: 'ctk_test',
            DEPLOY_NAME: 'probe',
            DEPLOY_VERSION: '1.0.0',
            STACK_NAME: 'probestack',
            WORK_DIR: workspace.directory,
        })
        await server.stop(true)

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe(STACK_RELEASE_ID)
        expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
            'POST /api/deployment-stacks/preview',
            'POST /api/deployment-stacks',
            `POST /api/deployment-stacks/${STACK_ID}/releases`,
            'GET /api/jobs/job-stack',
            `GET /api/deployment-stack-releases/${STACK_RELEASE_ID}`,
        ])
    })

    test('rollback 은 지정한 release 만 되돌린다', async () => {
        const { requests, server } = createStubServer()
        const workspace = await createWorkspace()
        const result = await runScript(['rollback', RELEASE_ID], {
            API_BASE: server.url.origin,
            CONTAINERS_API_KEY: 'ctk_test',
            DEPLOY_NAME: 'probe',
            DEPLOY_VERSION: '1.0.0',
            WORK_DIR: workspace.directory,
        })
        await server.stop(true)

        expect(result.exitCode).toBe(0)
        expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
            `POST /api/deployment-releases/${RELEASE_ID}/rollback`,
            'GET /api/jobs/job-rollback',
        ])
    })

    test('job 이 실패하면 0 이 아닌 코드로 끝난다', async () => {
        const workspace = await createWorkspace()
        const server = Bun.serve({
            fetch: async (request) => {
                const url = new URL(request.url)
                if (url.pathname === '/api/uploads/sessions') {
                    return Response.json({ data: { id: 'session-1', receivedBytes: 0, status: 'uploading' }, success: true })
                }
                if (url.pathname.endsWith('/chunks')) {
                    return Response.json({ data: { receivedBytes: ARCHIVE_BYTES }, success: true })
                }
                if (url.pathname.endsWith('/finalize')) {
                    return Response.json({ data: { job: { id: 'job-upload' } }, success: true })
                }
                if (url.pathname === '/api/jobs/job-upload/events') {
                    return Response.json({ data: [], success: true })
                }
                return Response.json({ data: { failureCode: 'ARCHIVE_INVALID', status: 'failed' }, success: true })
            },
            port: 0,
        })
        const result = await runScript(['deploy'], {
            API_BASE: server.url.origin,
            CONTAINERS_API_KEY: 'ctk_test',
            DEPLOY_NAME: 'probe',
            DEPLOY_VERSION: '1.0.0',
            IMAGE_ARCHIVE: workspace.archive,
            IMAGE_DIGEST,
            MANIFEST_FILE: workspace.manifestFile,
            WORK_DIR: workspace.directory,
        })
        await server.stop(true)

        expect(result.exitCode).not.toBe(0)
        expect(result.stderr).toContain('ARCHIVE_INVALID')
    })

    test('세션이 이어 올릴 수 없는 상태면 멈춘다', async () => {
        const workspace = await createWorkspace()
        const server = Bun.serve({
            fetch: async () => Response.json({ data: { id: 'session-1', receivedBytes: 0, status: 'rejected' }, success: true }),
            port: 0,
        })
        const result = await runScript(['deploy'], {
            API_BASE: server.url.origin,
            CONTAINERS_API_KEY: 'ctk_test',
            DEPLOY_NAME: 'probe',
            DEPLOY_VERSION: '1.0.0',
            IMAGE_ARCHIVE: workspace.archive,
            IMAGE_DIGEST,
            MANIFEST_FILE: workspace.manifestFile,
            WORK_DIR: workspace.directory,
        })
        await server.stop(true)

        expect(result.exitCode).not.toBe(0)
        expect(result.stderr).toContain('rejected')
    })
})
