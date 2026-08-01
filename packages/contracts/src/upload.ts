import { z } from 'zod'

export const ARTIFACT_MEDIA_TYPE = {
    DOCKER_IMAGE_ARCHIVE: 'application/vnd.docker.image.rootfs.diff.tar',
    OCI_IMAGE_ARCHIVE: 'application/vnd.oci.image.layer.v1.tar',
} as const

export const uploadSessionCreateSchema = z.object({
    expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
    expectedSizeBytes: z.number().int().min(1).max(10_737_418_240),
    fileName: z
        .string()
        .min(1)
        .max(255)
        .refine((value) => !value.includes('/') && !value.includes('\\')),
    mediaType: z.enum([ARTIFACT_MEDIA_TYPE.DOCKER_IMAGE_ARCHIVE, ARTIFACT_MEDIA_TYPE.OCI_IMAGE_ARCHIVE]),
})

export const uploadSessionSchema = z.object({
    expiresAt: z.iso.datetime(),
    id: z.uuid(),
    maxChunkBytes: z.number().int().positive(),
    receivedBytes: z.number().int().nonnegative(),
    status: z.string(),
    warnings: z.array(z.enum(['DISK_SOFT_WATERMARK'])).default([]),
})

export const uploadChunkResultSchema = z.object({
    receivedBytes: z.number().int().nonnegative(),
    sessionId: z.uuid(),
})

export const artifactSchema = z.object({
    createdAt: z.iso.datetime(),
    fileName: z.string(),
    id: z.uuid(),
    mediaType: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive(),
    status: z.string(),
})

export const artifactListSchema = z.array(artifactSchema)

export const imageLoadRequestSchema = z.object({
    artifactPath: z
        .string()
        .min(1)
        .startsWith('/')
        .refine((value) => !value.includes('\0')),
})

export const imageLoadResultSchema = z.object({
    messages: z.array(z.string()),
    operation: z.literal('load-image'),
    targetId: z.uuid(),
})

export const deploymentSchema = z.object({
    artifactId: z.uuid(),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    messages: z.array(z.string()),
    status: z.enum(['failed', 'loaded', 'loading']),
    updatedAt: z.iso.datetime(),
})
