import { describe, expect, test } from 'bun:test'
import { applyPanelHostname, readPanelServerNames } from './panel-hostname'

const CONFIG = `events {}
http {
    server {
        listen 8080 default_server;
        server_name _;
        return 444;
    }

    server {
        listen 8080;
        server_name panel.containers.local localhost 127.0.0.1;

        location /api/ {
            proxy_pass http://containers_api;
        }
    }

    server {
        listen 8080;
        server_name api.containers.local;
    }
}
`

describe('applyPanelHostname', () => {
    test('패널 server 블록에만 hostname 을 추가한다', () => {
        const next = applyPanelHostname(CONFIG, { add: 'panel.example.com' })

        expect(next).not.toBeNull()
        expect(readPanelServerNames(next ?? '')).toEqual(['panel.containers.local', 'localhost', '127.0.0.1', 'panel.example.com'])
        expect(next).toContain('server_name api.containers.local;')
        expect(next).toContain('server_name _;')
    })

    test('추가와 제거를 한 번에 처리한다', () => {
        const added = applyPanelHostname(CONFIG, { add: 'old.example.com' }) ?? ''
        const swapped = applyPanelHostname(added, { add: 'new.example.com', remove: 'old.example.com' })

        expect(readPanelServerNames(swapped ?? '')).toEqual(['panel.containers.local', 'localhost', '127.0.0.1', 'new.example.com'])
    })

    test('제거만 하면 내장 이름은 남는다', () => {
        const added = applyPanelHostname(CONFIG, { add: 'panel.example.com' }) ?? ''
        const removed = applyPanelHostname(added, { remove: 'panel.example.com' })

        expect(readPanelServerNames(removed ?? '')).toEqual(['panel.containers.local', 'localhost', '127.0.0.1'])
    })

    test('바뀔 것이 없으면 null 을 돌려준다', () => {
        expect(applyPanelHostname(CONFIG, { add: 'localhost' })).toBeNull()
        expect(applyPanelHostname(CONFIG, { remove: 'absent.example.com' })).toBeNull()
        expect(applyPanelHostname(CONFIG, {})).toBeNull()
    })

    test('내장 이름을 전부 지우려 해도 비우지 않는다', () => {
        const stripped = applyPanelHostname('events {} http { server { server_name panel.containers.local; } }', {
            remove: 'panel.containers.local',
        })

        expect(stripped).toBeNull()
    })

    test('패널 블록이 없으면 null 을 돌려준다', () => {
        expect(applyPanelHostname('events {} http { server { server_name other.local; } }', { add: 'panel.example.com' })).toBeNull()
        expect(readPanelServerNames('events {} http { }')).toBeNull()
    })

    test('다른 지시어와 들여쓰기를 보존한다', () => {
        const next = applyPanelHostname(CONFIG, { add: 'panel.example.com' }) ?? ''

        expect(next).toContain('        server_name panel.containers.local localhost 127.0.0.1 panel.example.com;')
        expect(next).toContain('            proxy_pass http://containers_api;')
        expect(next.split('\n')).toHaveLength(CONFIG.split('\n').length)
    })
})
