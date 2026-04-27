/**
 * 평가 설계 프리셋 — Design Create 모달에서 "추천 템플릿" 버튼으로 주입된다.
 *
 * 서버 `sectionsJson` / `gradeConfigJson` 과 호환.
 * `KPI_SCORE` 섹션은 시즌 시작 시 캡처된 목표 스냅샷으로 점수가 산출되며 문항은 비워도 됨.
 */

export type PresetQuestion = { text: string; type: string };

export type PresetSection = {
    title: string;
    weight: number;
    /** 생략 시 MANUAL */
    type?: 'MANUAL' | 'KPI_SCORE' | 'PEER_FEEDBACK';
    /** KPI_SCORE 일 때만 의미 있음 (ALL / TEMPLATE_ONLY / kpiTemplateId) */
    kpiFilter?: string;
    questions: PresetQuestion[];
};

export type DesignPreset = {
    key: string;
    label: string;
    description: string;
    name: string;
    sections: PresetSection[];
    gradeType: 'absolute' | 'relative';
    grades: { grade: string }[];
    targetDist?: { grade: string; pct: number }[];
};

export const DESIGN_PRESETS: DesignPreset[] = [
    {
        key: 'performance',
        label: '성과 중심 (정량 KPI + 정성)',
        description:
            '섹션 1은 KPI_SCORE: 피평가자 목표 스냅샷 가중 평균으로 자동 집계. 섹션 2~3은 리더의 정성 판단. 가중치 합 100%. 상대등급 분포는 강등·캘리브레이션 전제.',
        name: '성과·역량 하이브리드 평가',
        sections: [
            {
                title: '목표 달성률 (시스템 집계)',
                type: 'KPI_SCORE',
                weight: 50,
                kpiFilter: 'ALL',
                questions: [],
            },
            {
                title: '핵심 과업·산출물',
                type: 'MANUAL',
                weight: 28,
                questions: [
                    {
                        text: '분기/기간 내 약속한 핵심 과제를 기한·품질 기준으로 이행했는가? (난이도·리스크를 고려해 평가)',
                        type: 'SCALE',
                    },
                    {
                        text: '정량 지표에 잡히지 않는 임팩트(비용 절감, 품질 개선, 고객 만족 등)가 있었다면 구체적으로 서술',
                        type: 'TEXT',
                    },
                ],
            },
            {
                title: '협업·커뮤니케이션·태도',
                type: 'MANUAL',
                weight: 22,
                questions: [
                    { text: '이해관계자와의 합의·정렬을 얼마나 신속·정확하게 이끌었는가?', type: 'SCALE' },
                    { text: '갈등·이슈 상황에서 문제를 확대하지 않고 해결 지향적으로 대응했는가?', type: 'SCALE' },
                    { text: '팀/조직에 긍정적 영향을 준 구체 사례(있다면)', type: 'TEXT' },
                ],
            },
        ],
        gradeType: 'relative',
        grades: [{ grade: 'S' }, { grade: 'A' }, { grade: 'B' }, { grade: 'C' }, { grade: 'D' }],
        targetDist: [
            { grade: 'S', pct: 10 },
            { grade: 'A', pct: 20 },
            { grade: 'B', pct: 40 },
            { grade: 'C', pct: 20 },
            { grade: 'D', pct: 10 },
        ],
    },
    {
        key: 'okr',
        label: 'OKR·목표 달성 (KPI 자동 비중 높음)',
        description:
            'OKR은 KR 달성이 본질이므로 KPI_SCORE 비중을 높임(시스템 집계). 임팩트·난이도 보정과 회고는 MANUAL. KPI 필터는 ALL 기본 — 템플릿만 묶고 싶으면 섹션에서 TEMPLATE_ONLY 로 변경.',
        name: 'OKR 리뷰 (정량 우선)',
        sections: [
            {
                title: 'O·KR 달성률 (시스템 집계)',
                type: 'KPI_SCORE',
                weight: 58,
                kpiFilter: 'ALL',
                questions: [],
            },
            {
                title: '임팩트·난이도·기여도 보정',
                type: 'MANUAL',
                weight: 22,
                questions: [
                    {
                        text: '동일 달성률이라도 목표 난이도·스코프·조직 임팩트를 고려할 때 결과를 어떻게 평가하는가?',
                        type: 'SCALE',
                    },
                    { text: '기대를 상회한 성과 또는 조직에 남긴 변화를 근거와 함께 서술', type: 'TEXT' },
                ],
            },
            {
                title: '학습·회고·다음 기간',
                type: 'MANUAL',
                weight: 20,
                questions: [
                    { text: '이번 기간에서 배운 점·재발 방지·재사용 가능한 자산(프로세스, 문서, 코드 등)', type: 'TEXT' },
                    { text: '다음 기간에 가장 우선해야 할 개선 과제 1~2가지', type: 'TEXT' },
                ],
            },
        ],
        gradeType: 'absolute',
        grades: [{ grade: '초과 달성' }, { grade: '달성' }, { grade: '부분 달성' }, { grade: '미달성' }],
    },
    {
        key: 'competency',
        label: '역량·행동 중심 (KPI 미포함)',
        description:
            '직무 역량·리더십만 평가. 개인 목표 스냅샷을 총점에 넣지 않음 — KPI와 분리된 순수 역량 리뷰에 적합.',
        name: '역량 평가',
        sections: [
            {
                title: '직무 전문성·실행력',
                type: 'MANUAL',
                weight: 36,
                questions: [
                    { text: '직무에 요구되는 지식·기술 깊이와 업무 정확도', type: 'SCALE' },
                    { text: '불완전한 정보 하에서도 합리적 의사결정을 내렸는가?', type: 'SCALE' },
                    { text: '도메인 난제를 해결한 대표 사례(기간·역할·결과)', type: 'TEXT' },
                ],
            },
            {
                title: '리더십·영향력·협업',
                type: 'MANUAL',
                weight: 34,
                questions: [
                    { text: '타인의 성과를 끌어올리거나 시너지를 만든 정도', type: 'SCALE' },
                    { text: '이해관계자(상·하·동료)와의 신뢰 형성·갈등 관리', type: 'SCALE' },
                    { text: '피드백 수용·전달 태도에서 기억에 남는 구체 행동', type: 'TEXT' },
                ],
            },
            {
                title: '성장·적응·학습 속도',
                type: 'MANUAL',
                weight: 30,
                questions: [
                    { text: '새로운 요구·환경 변화에 대한 학습 곡선과 실행 속도', type: 'SCALE' },
                    { text: '향후 12개월 관점에서 투자 가치가 높은 강점·보완점', type: 'TEXT' },
                ],
            },
        ],
        gradeType: 'absolute',
        grades: [{ grade: '탁월' }, { grade: '우수' }, { grade: '보통' }, { grade: '미흡' }],
    },
    {
        key: 'multisource',
        label: '다면(360°) + 목표 앵커',
        description:
            '동료·상·하 피드백 정성 평가에 더해, 동일인에 대한 평가 간 왜곡을 줄이기 위해 개인 목표 달성(KPI_SCORE)을 일정 비중으로 고정 앵커로 둠.',
        name: '다면 평가 (목표 앵커)',
        sections: [
            {
                title: '개인 목표 달성 (시스템 집계)',
                type: 'KPI_SCORE',
                weight: 22,
                kpiFilter: 'ALL',
                questions: [],
            },
            {
                title: '업무 수행·신뢰',
                type: 'MANUAL',
                weight: 28,
                questions: [
                    { text: '맡은 책임 범위에서 기한·품질·재작업 없이 결과를 냈는가?', type: 'SCALE' },
                    { text: '약속·커뮤니케이션에서 신뢰를 깨는 행동이 있었는가? (없음/경미/있음 관점)', type: 'SCALE' },
                ],
            },
            {
                title: '소통·협력·영향',
                type: 'MANUAL',
                weight: 28,
                questions: [
                    { text: '의견을 구조화해 전달하고, 상대방 관점을 반영했는가?', type: 'SCALE' },
                    { text: '타 직군·팀과의 협업에서 병목을 줄인 사례', type: 'TEXT' },
                    { text: '건설적 피드백 문화에 기여한 정도', type: 'SCALE' },
                ],
            },
            {
                title: '가치·종합',
                type: 'MANUAL',
                weight: 22,
                questions: [
                    { text: '조직 가치·규범에 부합하는 행동 일관성', type: 'SCALE' },
                    { text: '이 동료를 계속 함께하고 싶은 이유 / 보완하면 좋을 한 가지', type: 'TEXT' },
                ],
            },
        ],
        gradeType: 'relative',
        grades: [{ grade: 'S' }, { grade: 'A' }, { grade: 'B' }, { grade: 'C' }, { grade: 'D' }],
        targetDist: [
            { grade: 'S', pct: 5 },
            { grade: 'A', pct: 20 },
            { grade: 'B', pct: 50 },
            { grade: 'C', pct: 20 },
            { grade: 'D', pct: 5 },
        ],
    },
    {
        key: 'kpi_dominant',
        label: '정량 우선 (KPI 70%)',
        description:
            '총점의 대부분을 KPI_SCORE에 할당. 남은 비중은 최소한의 정성 체크리스트. 스냅샷 시점 이후 목표가 크게 바뀐 조직은 설계 수정·시즌 정책을 함께 검토.',
        name: '고정 KPI 비중 평가',
        sections: [
            {
                title: '목표·KPI 달성 (시스템 집계)',
                type: 'KPI_SCORE',
                weight: 70,
                kpiFilter: 'ALL',
                questions: [],
            },
            {
                title: '최소 정성 확인',
                type: 'MANUAL',
                weight: 30,
                questions: [
                    { text: '정량 결과만으로 설명되지 않는 리스크·윤리·협업 이슈가 있었는가?', type: 'SCALE' },
                    { text: '있다면 사실 관계와 평가자 의견을 짧게 기술 (없으면 "해당 없음")', type: 'TEXT' },
                ],
            },
        ],
        gradeType: 'absolute',
        grades: [{ grade: 'S' }, { grade: 'A' }, { grade: 'B' }, { grade: 'C' }, { grade: 'D' }],
    },
];
