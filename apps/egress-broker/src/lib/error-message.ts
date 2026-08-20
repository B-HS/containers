import { ERROR_CODE, type ErrorCode } from './error-code'

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
    [ERROR_CODE.EGRESS_DELIVERY_FAILED]: '외부 전송에 실패했습니다.',
    [ERROR_CODE.EGRESS_TARGET_BLOCKED]: '허용되지 않는 대상 주소입니다.',
    [ERROR_CODE.INTERNAL_ERROR]: '내부 오류가 발생했습니다.',
    [ERROR_CODE.UNAUTHORIZED]: '인증이 필요합니다.',
    [ERROR_CODE.UNKNOWN_ERROR]: '알 수 없는 오류가 발생했습니다.',
    [ERROR_CODE.VALIDATION_ERROR]: '요청 검증에 실패했습니다.',
}
