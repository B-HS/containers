import { ERROR_CODE, type ErrorCode } from './error-code'

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
    [ERROR_CODE.BACKUP_TRAFFIC_CREATE_FAILED]: '트래픽 백업 생성에 실패했습니다.',
    [ERROR_CODE.BACKUP_TRAFFIC_INVALID]: '트래픽 백업 데이터가 올바르지 않습니다.',
    [ERROR_CODE.BACKUP_TRAFFIC_NOT_FOUND]: '트래픽 백업을 찾을 수 없습니다.',
    [ERROR_CODE.BACKUP_TRAFFIC_RESTORE_FAILED]: '트래픽 백업 복원에 실패했습니다.',
    [ERROR_CODE.DB_WRITE_FAILED]: '트래픽 이벤트 저장에 실패했습니다.',
    [ERROR_CODE.INTERNAL_ERROR]: '내부 오류가 발생했습니다.',
    [ERROR_CODE.TRAFFIC_STREAM_LIMIT]: '실시간 트래픽 연결 한도를 초과했습니다.',
    [ERROR_CODE.UNAUTHORIZED]: '인증이 필요합니다.',
    [ERROR_CODE.UNKNOWN_ERROR]: '알 수 없는 오류가 발생했습니다.',
    [ERROR_CODE.VALIDATION_ERROR]: '요청 검증에 실패했습니다.',
}
