# 운영 의존성과 런타임 설정

## 개요

운영 환경은 Kubernetes 내부 의존성과 AWS 관리형 리소스를 함께 사용합니다. 애플리케이션 설정은 `prod` profile과 Kubernetes Secret/Service DNS를 기준으로 분리되어 있습니다.

## Kubernetes 내부 의존성

| 리소스 | 이미지/구성 | Service | 용도 |
|--------|-------------|---------|------|
| Kafka | `apache/kafka:3.7.0`, KRaft 단일 broker/controller | `kafka-service:9092` | 도메인 이벤트, 검색 동기화, RAG 동기화, 알림 |
| Redis | `redis` | `redis-service:6379` | Refresh Token, 권한 캐시, 이메일 인증, Pub/Sub, ShedLock, 캐시 |
| Redis Stack | `redis/redis-stack-server:latest` | `redis-stack-service:6380` | Redis Stack 기능이 필요한 별도 용도 |
| Elasticsearch | `docker.elastic.co/elasticsearch/elasticsearch:8.18.6` | `elasticsearch-service:9200` | 통합 검색 인덱스 |
| n8n | `n8nio/n8n:2.15.0` | `n8n-service:5678` | AI 챗봇 워크플로 오케스트레이션 |

## Elasticsearch 설정

- `single-node` 모드로 운영합니다.
- `analysis-nori` 플러그인을 initContainer에서 설치합니다.
- 데이터는 `es-data-pvc`에 저장합니다.
- `xpack.security.enabled`와 HTTP SSL은 비활성화되어 내부 ClusterIP 통신을 기준으로 사용합니다.

## n8n 설정

- 데이터는 `n8n-data-pvc`에 저장합니다.
- timezone은 `Asia/Seoul`입니다.
- `OPENAI_API_KEY`는 `workforce-secrets`에서 주입합니다.
- Ingress를 통해 `n8n.workforcehr.shop`으로 접근할 수 있습니다.

## Runtime Secret

Kubernetes Secret 이름은 `workforce-secrets`입니다.

| 범주 | Key |
|------|-----|
| DB | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| JWT | `JWT_SECRET_AT`, `JWT_SECRET_RT` |
| AWS | `AWS_ACCESS_KEY`, `AWS_SECRET_KEY` |
| Mail | `MAIL_USERNAME`, `MAIL_PASSWORD` |
| AI | `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` |
| External API | `NTS_API_KEY`, `HOLIDAY_API_KEY` |

## Prod profile 차이

| 항목 | 로컬 | 운영 Kubernetes |
|------|------|-----------------|
| Service Discovery | Eureka | Kubernetes Service DNS |
| Gateway route | `lb://service-name` | `http://service-name:port` |
| DB | 로컬 MariaDB | RDS endpoint |
| Kafka | 로컬 broker | `kafka-service:9092` |
| Redis | 로컬 Redis | `redis-service:6379` |
| Elasticsearch | 로컬 또는 개발용 | `elasticsearch-service:9200` |
| n8n | `localhost:5678` | `n8n-service:5678` |
| AI Gateway URL | 로컬 Gateway | `http://gateway-service:80` |

## Actuator와 헬스체크

Spring 서비스는 `/actuator/health`만 노출합니다. Kubernetes readiness/liveness probe는 이 엔드포인트를 기준으로 Pod의 트래픽 투입과 재시작 여부를 판단합니다. AI 서비스는 FastAPI의 `/health` 엔드포인트를 사용합니다.
