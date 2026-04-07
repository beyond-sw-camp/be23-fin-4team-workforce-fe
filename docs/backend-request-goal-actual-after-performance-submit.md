# goal-service: 실적 기반 목표 집계 (`Goal.actualValue` / `achievementPct`)

## 상태

**백엔드 반영 완료.** 실적 제출·검토(승인) 후 `GET /goal` 등으로 목표를 다시 조회하면 집계 필드가 갱신된 DTO를 받습니다.  
프론트엔드는 실적 제출/검토 성공 시 **목표 목록 쿼리 무효화(`invalidate`) 후 재조회**만 수행합니다. (캐시만 덮어쓰는 임시 로직 없음.)

---

## 당초 문제 (해결됨)

- 실적만 저장되고 `Goal`의 `actualValue` / `achievementPct`가 안 바뀌어, 목록 재조회해도 진행 UI가 그대로였음.

## 백엔드 구현 요약 (확정 정책)

1. **집계**  
   - `PerformanceRecordService#submitRecord`에서 레코드 저장 직후, `actualValue`가 있으면 **`goal.updateActualValue(...)`** 호출로 목표에 즉시 반영.  
   - 최신 제출분 기준으로 사용자가 제출 직후 목록에서 수치를 볼 수 있음.

2. **검토**  
   - `reviewRecord`에서 **승인(`confirmed: true`)** 시에도 동일하게 목표 실적/달성률과 동기화.  
   - 반려 시에는 우선 레코드 상태만 반려로 두고, 롤백·“마지막 승인분” 재집계 등은 필요 시 추후 고도화.

3. **도메인 응집**  
   - `Goal.updateActualValue` (및 관련 로직)에서 `measureType`(HIGHER_BETTER, LOWER_BETTER, TARGET_MATCH 등)에 따른 달성률·`capPct` 상한 반영.

4. **트랜잭션**  
   - 실적 저장/검토와 목표 갱신이 **같은 트랜잭션**에서 처리되어 실패 시 일관성 유지.

> 참고: 내부 설계 문서상 “정량 목표(QUANTITATIVE)” 표현은 **수치 목표**를 뜻하는 설명용 용어일 수 있으며, 코드상 지표 방향 enum은 `MeasureType`과 매핑됩니다.

---

## 프론트엔드 전제

| 동작 | 프론트 |
|------|--------|
| 실적 제출 성공 | `invalidateQueries(['goals', 'list'])` 등으로 목록 refetch |
| 실적 검토 성공 | 동일하게 목표 목록/필요 시 상세 refetch |
| 진행률 표시 | `GoalResDto.actualValue`, `targetValue` (및 API가 주는 `achievementPct` 활용 가능) |

집계의 **단일 소스는 백엔드 `Goal`** 입니다.

---

## 검수 체크리스트 (회귀 확인용)

- [ ] `ACTIVE` 목표에 실적 제출 후 `GET /goal`에서 해당 목표의 `actualValue` / `achievementPct`가 기대대로 갱신됨.  
- [ ] 실적 **승인** 후에도 동일.  
- [ ] 실적 **반려** 후 정책(현재: 롤백 없음 등)이 기획과 일치하는지 제품 측에서 확인.  
- [ ] 제출 실패 시 목표 집계가 바뀌지 않음.
