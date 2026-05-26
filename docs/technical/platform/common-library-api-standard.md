# 공통 라이브러리와 표준 API 처리

## 개요

`common` 모듈은 여러 Spring 서비스가 반복해서 쓰는 응답, 예외, 이벤트, Redis, Kafka, S3, 권한, QueryDSL 기반 코드를 제공합니다. 각 서비스는 `com.4team:workforce-common` 패키지를 의존해 동일한 규칙을 공유합니다.

## 공통 구성

| 영역 | 구성 |
|------|------|
| 응답 | `ApiResponse<T>` 성공/실패 응답 표준화 |
| 예외 | `BusinessException`, `CommonExceptionHandler`, `CommonErrorDto` |
| 엔티티 | `BaseTimeEntity` 생성/수정 시간 공통 처리 |
| 권한 | `@CheckPermission`, `PermissionAspect`, `PermissionUtils` |
| 이벤트 | 도메인 이벤트 DTO, `NotificationMessage`, `NotificationType` |
| Kafka | 공통 Producer, `KafkaTemplate<String, Object>` |
| Redis | RT, 이메일 인증, 권한 캐시, Pub/Sub, ShedLock, 휴일/캐시 DB 분리 |
| S3 | `S3Config`, `S3Uploader` |
| QueryDSL | QueryDSL JPA 의존성과 generated source 설정 |

## API 응답 표준화

컨트롤러는 대체로 `ApiResponse.success(data, message)` 형태로 응답합니다. 프론트엔드는 도메인별 응답 모양이 달라지는 문제를 줄이고, 공통 에러 파서를 유지할 수 있습니다.

## 예외 처리

비즈니스 오류는 `BusinessException(HttpStatus, message)`으로 던지고, 공통 예외 핸들러가 HTTP 상태와 메시지를 일관된 형태로 변환합니다.  
검증 오류, 권한 오류, 도메인 규칙 위반이 컨트롤러마다 흩어지지 않게 하는 것이 목적입니다.

## Redis DB 역할

| 용도 | 사용 예 |
|------|---------|
| Refresh Token | 로그인 세션 유지와 AT 재발급 |
| 이메일 인증 | 비밀번호 재설정 코드 저장 |
| 권한 캐시 | `PERMISSION:{memberPositionId}` |
| Pub/Sub | 실시간 알림 브로드캐스트 |
| ShedLock | 스케줄러 중복 실행 방지 |
| 캐시 | 멤버 조회, 휴일 조회 등 서비스별 조회 최적화 |

## 파일 처리

공통 S3 업로더를 통해 프로필, 채팅 첨부, 계약/결재/PDF 파일을 저장합니다. 일부 도메인은 presigned URL을 사용해 브라우저가 직접 접근할 수 있도록 처리합니다.
