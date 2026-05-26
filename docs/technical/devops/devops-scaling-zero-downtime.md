# 확장성과 무중단 배포 전략

## 개요

운영 매니페스트는 Kubernetes Deployment, HPA, PDB, readiness/liveness probe를 조합해 배포 중 가용성을 유지하고 트래픽 증가에 대응합니다.  
이 문서는 `be-devops` 저장소의 실제 매니페스트 값을 기준으로 정리합니다.

## Deployment 기본값

| 항목 | 실제 설정 |
|------|-----------|
| 기본 replica | 서비스별 `replicas: 2` |
| readinessProbe | Spring `/actuator/health`, AI `/health` |
| livenessProbe | Spring `/actuator/health`, AI `/health` |
| termination grace | `terminationGracePeriodSeconds: 60` |
| min ready | `minReadySeconds: 10` |

## RollingUpdate 설정

| Deployment | maxUnavailable | maxSurge |
|------------|----------------|----------|
| `gateway-depl` | 1 | 1 |
| `member-depl` | 1 | 0 |
| `salary-depl` | 1 | 0 |
| `approval-depl` | 1 | 0 |
| `goal-depl` | 1 | 0 |
| `search-depl` | 1 | 0 |
| `ai-depl` | 1 | 0 |

현재 실제 매니페스트 기준으로는 모든 서비스가 배포 중 최소 1개 Pod를 유지하는 방향입니다. Gateway만 `maxSurge: 1`로 새 Pod를 추가로 띄울 수 있고, 나머지 서비스는 기존 2개 중 1개를 교체하는 방식입니다.

## HPA 설정

`k8s/hpa.yml`은 7개 애플리케이션 Deployment를 CPU 사용률 기준으로 확장합니다.

| 항목 | 실제 설정 |
|------|-----------|
| API | `autoscaling/v2` |
| 대상 | gateway, member, salary, approval, goal, search, ai |
| minReplicas | 1 |
| maxReplicas | 2 |
| CPU target | 80% |
| scale down 안정화 | 300초 |
| scale up 안정화 | 60초 |

HPA는 각 컨테이너의 `resources.requests.cpu`를 기준으로 CPU 사용률을 계산하므로, 서비스별 Deployment에는 CPU request가 설정되어 있습니다.

## PodDisruptionBudget

`k8s/pdb.yml`은 각 서비스별로 `minAvailable: 1`을 설정합니다.

| 대상 | 목적 |
|------|------|
| Gateway/도메인/AI 서비스 | 노드 드레인, 클러스터 점검 등 자발적 중단 상황에서 최소 1개 Pod 유지 |

PDB는 RollingUpdate를 대신하지 않고, 클러스터 운영 중 자발적 중단으로 모든 Pod가 동시에 내려가는 상황을 줄이는 보호 장치입니다.

## 헬스체크 지연값

서비스별 초기화 시간이 달라 readiness/liveness 초기 지연값도 다르게 잡혀 있습니다.

| 서비스 | readiness initialDelay | liveness initialDelay |
|--------|------------------------|-----------------------|
| gateway | 90초 | 150초 |
| member | 240초 | 300초 |
| salary | 180초 | 240초 |
| approval | 120초 | 180초 |
| goal | 120초 | 180초 |
| search | 120초 | 180초 |
| ai | 30초 | 60초 |

특히 member/salary는 초기 로딩과 DB/캐시 의존성이 상대적으로 커서 더 긴 지연값을 사용합니다.

## 운영상 주의점

- `latest` 태그를 사용하므로 `rollout restart`가 필요합니다.
- HPA `minReplicas: 1`은 비용을 줄이는 방향이지만, 항상 2개 Pod를 유지하려면 HPA 설정과 Deployment replica 정책을 함께 조정해야 합니다.
- WebSocket/SSE, Kafka consumer, 장시간 요청은 Kubernetes 설정만으로 완전한 무중단을 보장하기 어렵기 때문에 애플리케이션 graceful shutdown 설계가 함께 필요합니다.
