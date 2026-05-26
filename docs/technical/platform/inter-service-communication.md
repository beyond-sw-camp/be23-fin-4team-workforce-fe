# 서비스 간 통신과 Feign Client

## 개요

도메인 서비스는 데이터 소유권을 나누기 때문에 필요한 정보는 Feign Client 또는 Kafka 이벤트를 통해 가져옵니다. 조회성 동기 통신은 Feign, 후속 처리와 비동기 반영은 Kafka를 사용합니다.

## 동기 통신

| 호출 예 | 목적 |
|---------|------|
| salary-service -> member-service | 급여/근태 계산에 필요한 구성원, 회사, 조직 정보 조회 |
| approval-service -> member-service | 결재선, 수신자, 계약 대상자 정보 조회 |
| approval-service -> salary-service | 계약서 자동 채움에 필요한 급여 정보 조회 |
| goal-service -> member-service | 평가자/피평가자, 조직 목표 범위 조회 |
| member-service -> ai-service | AI 회의록 변환, 챗봇 연동 |

## 비동기 통신

Kafka 이벤트는 승인 후 후속 처리, 검색 인덱스 갱신, RAG 동기화, 알림 발송에 사용합니다.

| 이벤트 성격 | 사용처 |
|-------------|--------|
| 결재 승인 | 근태/휴가/캘린더/인사 발령 반영 |
| 정책 변경 | AI RAG 문서 재생성 |
| 멤버/조직/결재 변경 | 검색 인덱스 갱신 |
| 도메인 알림 | Kafka -> member-service -> Redis/SSE |

## 헤더 전파

외부 요청은 Gateway에서 `X-User-*` 헤더를 받습니다. Feign Client로 내부 호출을 할 때도 회사 ID와 사용자 ID가 필요한 경우 명시적으로 전달해 데이터 범위를 유지합니다.

## 장애 격리 관점

- 즉시 응답이 필요한 조회는 Feign을 사용합니다.
- 승인 이후 후속 처리는 Kafka로 분리해 일부 서비스 장애가 원 트랜잭션을 막지 않도록 합니다.
- 캐시를 둔 조회는 Redis TTL을 사용해 반복 Feign 호출을 줄입니다.
