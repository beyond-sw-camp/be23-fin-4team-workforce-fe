# 통합 검색과 인덱싱

## 개요

`search-service`는 Elasticsearch를 이용해 구성원, 조직, 결재 문서를 검색합니다. 데이터 변경은 Kafka 이벤트를 통해 검색 인덱스에 반영합니다.

## 인덱스 대상

| Document | 데이터 |
|----------|--------|
| MemberDocument | 구성원 이름, 이메일, 사번, 조직 등 |
| OrganizationDocument | 조직명, 회사 ID, 계층 정보 |
| ApprovalDocument | 결재 문서 제목, 상태, 요청자, 문서함 검색 정보 |

## 동기화 이벤트

| 이벤트 | 처리 |
|--------|------|
| `member-saved` | 구성원 색인 생성/갱신 |
| `member-deleted` | 구성원 색인 삭제 |
| `organization-saved` | 조직 색인 갱신 |
| `organization-deleted` | 조직 색인 삭제 |
| `approval-saved` | 결재 문서 색인 갱신 |
| `approval-deleted` | 결재 문서 색인 삭제 |

## 검색 처리

- 회사 ID 기준으로 필터링합니다.
- 문서함 검색은 결재자/요청자/참조자/부서 등 접근 조건을 함께 적용합니다.
- ElasticsearchRepository와 ElasticsearchClient를 함께 사용해 기본 CRUD와 복합 bool query를 처리합니다.
