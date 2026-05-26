# 기술 문서 인덱스

기술 문서는 발표 흐름과 구현 책임 기준으로 폴더를 나눴습니다.  
README에서는 핵심 목차만 보고, 세부 검토는 아래 폴더로 들어가면 됩니다.

## 폴더 구조

| 폴더 | 성격 | 문서 |
|------|------|------|
| `platform` | 모든 서비스의 기반 구조 | 아키텍처, 인증/인가, 공통 라이브러리, 권한, Gateway, Feign |
| `devops` | 배포와 운영 인프라 | Kubernetes/AWS, CI/CD, HPA/PDB/무중단 배포, 런타임 의존성 |
| `event-runtime` | 비동기/실시간/자동화 흐름 | Kafka 이벤트, 알림/SSE, 배치, 스케줄러, 채팅 |
| `domain` | HR 업무 도메인 | 회원/조직, 정책, 결재/계약, 근태/휴가, 급여, 목표/평가, ESG |
| `ai-search-docs` | AI, 검색, 문서 처리 | RAG, AI 액션, 회의록, Elasticsearch, 파일/PDF |
| `ops-quality` | 백업 장표와 운영 대응 | ERD, 트러블슈팅 |

## 빠른 이동

### Platform

- [시스템 아키텍처](platform/system-architecture.md)
- [인증·인가·멀티테넌시](platform/auth-authorization-multitenancy.md)
- [공통 라이브러리와 표준 API 처리](platform/common-library-api-standard.md)
- [권한 모델과 역할 설계](platform/permission-role-model.md)
- [서비스 디스커버리와 Gateway 라우팅](platform/gateway-eureka-routing.md)
- [서비스 간 통신과 Feign Client](platform/inter-service-communication.md)

### DevOps

- [Kubernetes와 AWS 운영 인프라](devops/devops-kubernetes-aws.md)
- [CI/CD와 컨테이너 배포](devops/devops-cicd-container.md)
- [확장성과 무중단 배포 전략](devops/devops-scaling-zero-downtime.md)
- [운영 의존성과 런타임 설정](devops/devops-runtime-dependencies.md)

### Event Runtime

- [이벤트 기반 시스템 연동](event-runtime/event-driven-flow.md)
- [알림·SSE·Redis Pub/Sub](event-runtime/notification-realtime-pipeline.md)
- [업무 자동화와 배치 처리](event-runtime/hr-automation-batch.md)
- [스케줄러와 운영자 콘솔](event-runtime/scheduler-saas-operations.md)
- [실시간 채팅과 파일 처리](event-runtime/member-chat-websocket.md)

### Domain

- [회원·회사·조직 온보딩](domain/member-company-organization.md)
- [정책 커스터마이징과 동적 결재 양식](domain/policy-customization.md)
- [전자결재와 전자계약](domain/approval-contract.md)
- [근태·휴가 도메인](domain/attendance-leave-domain.md)
- [급여·상여·퇴직금 도메인](domain/payroll-salary-domain.md)
- [목표·평가·면담 도메인](domain/goal-evaluation-meeting.md)
- [ESG 활동 관리](domain/esg-management.md)

### AI Search Docs

- [AI 챗봇 및 RAG 아키텍처](ai-search-docs/ai-rag-chatbot.md)
- [AI 액션 오케스트레이션](ai-search-docs/ai-action-orchestration.md)
- [AI 회의록과 음성 처리](ai-search-docs/ai-recording-transcribe.md)
- [통합 검색과 인덱싱](ai-search-docs/search-indexing.md)
- [문서·파일·PDF 처리](ai-search-docs/document-file-pdf.md)

### Ops Quality

- [데이터 모델과 ERD](ops-quality/data-model-erd.md)
- [트러블슈팅](ops-quality/troubleshooting.md)
