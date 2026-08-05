import { reverse } from 'node:dns/promises'
import { eq } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { trustedProxy } from '@containers/db-schema/schema'
import {
    createTrustedProxyService,
    type TrustedProxyRecord,
    type TrustedProxyServiceDb,
} from '../service/domain/trusted-proxy/create-trusted-proxy-service'

const REVERSE_LOOKUP_TIMEOUT_MS = 2_000

type ComposeTrustedProxyDependencies = {
    db: ControlDatabase
    listCandidates: (excluded: readonly string[]) => Promise<unknown>
    nginxClient: Parameters<typeof createTrustedProxyService>[0]['nginxClient']
    now: () => Date
}

export const buildTrustedProxyServiceDb = (db: ControlDatabase): TrustedProxyServiceDb => ({
    list: (): TrustedProxyRecord[] =>
        db
            .select()
            .from(trustedProxy)
            .all()
            .map((record) => ({ address: record.address, approvedAt: record.approvedAt, hostname: record.hostname, note: record.note })),
    remove: (address) => {
        db.delete(trustedProxy).where(eq(trustedProxy.address, address)).run()
    },
    save: ({ address, approvedAt, approvedBy, hostname, note }) => {
        const values = { address, approvedAt, approvedBy, hostname, note }
        db.insert(trustedProxy).values(values).onConflictDoUpdate({ set: values, target: trustedProxy.address }).run()
    },
})

const resolveHostname = async (address: string) => {
    const lookup = reverse(address).then((names) => names[0] ?? null)
    const timeout = Bun.sleep(REVERSE_LOOKUP_TIMEOUT_MS).then(() => null)
    return Promise.race([lookup, timeout]).catch(() => null)
}

export const composeTrustedProxy = ({ db, listCandidates, nginxClient, now }: ComposeTrustedProxyDependencies) => ({
    trustedProxyService: createTrustedProxyService({
        db: buildTrustedProxyServiceDb(db),
        listCandidates,
        nginxClient,
        now,
        resolveHostname,
    }),
})
