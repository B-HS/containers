import { successResponse } from './response'

const pending = Promise.resolve({ ok: true })
successResponse(pending)
