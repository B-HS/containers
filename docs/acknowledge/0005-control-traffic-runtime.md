# ADR 0005 — Docker 제어·트래픽 관측 기준선

- 상태: 1차 구현 완료
- 날짜: 2026-07-31

## 결정

- API와 Engine Agent·Traffic Worker의 내부 요청은 공유 파일 비밀키의 HMAC-SHA256, 30초 timestamp, UUID nonce, body hash로 인증한다.
- nonce는 프로세스 메모리에서 허용 시간 동안 재사용을 거부한다.
- container lifecycle은 typed action만 허용하고 raw Docker HTTP·host shell은 노출하지 않는다.
- container·image 삭제는 owner/admin, 대상명 재입력, 최근 15분 session을 요구한다.
- 비대화형 exec는 owner와 최근 session을 요구하며 shell 문자열 대신 command array만 받는다.
- exec stdout·stderr는 Docker 8-byte multiplex frame을 분리하고 output 상한과 timeout을 적용한다.
- 변경 명령은 실행 전 `attempt`, 실행 후 `success` 또는 `failure`를 append-only audit row로 남긴다.
- Nginx JSONL은 Traffic Worker가 offset tail하고 Zod 검증 후 별도 SQLite에 raw IP와 함께 저장한다.
- traffic raw retention은 14일이며 집계 API와 Nginx status는 application session 뒤에서만 공개한다.
- Nginx stub_status는 host에 publish하지 않는 container 내부 8081 포트에만 둔다.

## 검증 결과

- 정적 검사와 unit·integration test 21개 통과
- unsigned internal 요청 401, signed 요청 성공, nonce replay 거부 확인
- 실제 owner exec `printf` 결과 exit 0, stdout·stderr 분리, audit attempt·success 확인
- 실제 Nginx 로그 491건 수집, invalid 0건 확인
- 60분 traffic 383건, 4xx 14건, 5xx 10건, 평균 246.9ms 집계 확인
- browser UI exec 성공, console error 0, mobile horizontal overflow 수정 후 0
