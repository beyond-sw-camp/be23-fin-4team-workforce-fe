# 서비스 디스커버리와 Gateway 라우팅

## 개요

백엔드는 Spring Cloud Gateway를 외부 요청의 단일 진입점으로 사용합니다.  
로컬 개발 환경에서는 Eureka Server를 통해 서비스 디스커버리를 수행하고, 운영 Kubernetes 환경에서는 Eureka를 비활성화한 뒤 Kubernetes Service DNS로 라우팅합니다.

## 구성

| 모듈 | 역할 |
|------|------|
| `eureka` | 로컬 개발 환경의 서비스 디스커버리 서버 |
| `gateway` | JWT 검증, actor type 검증, CORS, 라우팅 |
| 도메인 서비스 | Gateway 뒤에서 API 제공, 운영에서는 K8S Service로 노출 |

## Gateway 책임

- CORS preflight 처리
- 공개 경로 통과
- JWT 검증
- SaaS 운영자와 일반 멤버 경로 분리
- 내부 서비스에 사용자/회사 컨텍스트 헤더 주입
- 서비스별 route로 요청 전달

## 공개 경로

대표적으로 로그인, 회사 온보딩, 비밀번호 재설정, STOMP 연결, 내부 정책 조회 API가 공개 경로에 포함되어 있습니다.  
공개 경로는 인증 필터를 우회하지만, 실제 운영에서는 Gateway 외부 노출 범위와 네트워크 정책을 함께 고려해야 합니다.

## 환경별 디스커버리 방식

| 환경 | 방식 | 이유 |
|------|------|------|
| 로컬 | Eureka | 서비스 포트를 랜덤으로 띄우고 `lb://service-name` 라우팅을 사용할 수 있음 |
| 운영 K8S | Kubernetes Service DNS | Pod IP 변경을 Service가 흡수하고, 클러스터 내부 DNS로 안정적인 라우팅 가능 |

운영 `application-prod.yml` 기준 Gateway route는 `http://member-service:8080`, `http://salary-service:8080`, `http://approval-service:8080`처럼 Service DNS를 직접 사용합니다.

## 운영 라우팅 예시

| 경로 | 대상 서비스 |
|------|-------------|
| `/member/**`, `/company/**`, `/organization/**`, `/notification/**`, `/esg/**`, `/calendar/**`, `/chat/**` | `member-service` |
| `/attendance/**`, `/work-schedules/**`, `/company-holidays/**`, `/leave-policies/**`, `/leave-promotions/**`, `/member-balance/**`, `/work-trip/**`, `/salary/**`, `/saas/tax-*`, `/saas/schedules/salary/**` | `salary-service` |
| `/approval/**`, `/contract/**` | `approval-service` |
| `/goal/**`, `/evaluation/**`, `/meeting/**` | `goal-service` |
| `/search/**` | `search-service` |
| `/ai/**` | `ai-service` |
