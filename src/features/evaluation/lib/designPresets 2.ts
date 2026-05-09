/**
 * 평가 설계 프리셋 — Design Create 모달에서 "추천 템플릿" 버튼으로 주입된다.
 *
 * 계약:
 * - 섹션 가중치 합 100%, 각 섹션에 scale|grade|gap 최소 1문항 (저장 시 문항 가중치 자동/검증)
 * - 상대평가: targetDist 퍼센트 합 100%
 * - 등급 라벨: 확정 API `Grade` 는 S/A/B/C 만 — 프리셋도 4단과 맞춤 (목표 등급 enum 과 정합)
 *
 * 목표의 S/A/B/C '달성 기준' 텍스트와는 역할이 다름(아래 사용자 안내 참고).
 */

export type PresetQuestion = { text: string; type: string };

export type PresetSection = {
    title: string;
    weight: number;
    /** 생략 시 MANUAL */
    type?: 'MANUAL' | 'PEER_FEEDBACK';
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
        label: '성과 중심 (정량 + 정성)',
        description:
            '목표 달성·핵심 과업·협업 역량을 균형 있게 평가하는 기본 템플릿. 가중치 합 100%.',
        name: '성과·역량 하이브리드 평가',
        sections: [
            {
                title: '목표 달성 수준',
                type: 'MANUAL',
                weight: 50,
                questions: [
                    { text: '평가 기간 목표 달성 수준을 종합적으로 평가해 주세요.', type: 'SCALE' },
                    { text: '주요 성과 근거를 간단히 작성해 주세요.', type: 'TEXT' },
                ],
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
        /** 목표 확정 등급(`Grade`)과 동일 4단 — 확정 API는 S/A/B/C만 허용 */
        grades: [{ grade: 'S' }, { grade: 'A' }, { grade: 'B' }, { grade: 'C' }],
        targetDist: [
            { grade: 'S', pct: 10 },
            { grade: 'A', pct: 20 },
            { grade: 'B', pct: 40 },
            { grade: 'C', pct: 30 },
        ],
    },
    {
        key: 'okr',
        label: '목표 달성',
        description:
            '목표 달성도와 성과 근거를 함께 보는 템플릿.',
        name: '목표 성과 리뷰',
        sections: [
            {
                title: 'O·KR 달성 수준',
                type: 'MANUAL',
                weight: 58,
                questions: [
                    { text: 'O·KR 목표 달성 수준을 종합적으로 평가해 주세요.', type: 'SCALE' },
                    { text: '주요 KR의 성과/미달 원인을 작성해 주세요.', type: 'TEXT' },
                ],
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
                    {
                        text: '이번 기간 회고·학습이 다음 업무에 전이될 가능성을 종합적으로 평가해 주세요.',
                        type: 'SCALE',
                    },
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
        label: '다면(360°) 평가',
        description:
            '동료·상·하 피드백과 정성 평가를 결합해 다면 관점으로 평가.',
        name: '다면 평가 (목표 앵커)',
        sections: [
            {
                title: '개인 목표 달성',
                type: 'MANUAL',
                weight: 22,
                questions: [
                    { text: '개인 목표 달성 수준을 종합적으로 평가해 주세요.', type: 'SCALE' },
                ],
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
        grades: [{ grade: 'S' }, { grade: 'A' }, { grade: 'B' }, { grade: 'C' }],
        targetDist: [
            { grade: 'S', pct: 10 },
            { grade: 'A', pct: 25 },
            { grade: 'B', pct: 45 },
            { grade: 'C', pct: 20 },
        ],
    },
    {
        key: 'kpi_dominant',
        label: '정량 우선',
        description:
            '정량 관점 비중이 높은 평가 템플릿.',
        name: '고정 KPI 비중 평가',
        sections: [
            {
                title: '목표 달성',
                type: 'MANUAL',
                weight: 70,
                questions: [
                    { text: '핵심 목표의 달성 수준을 정량 중심으로 평가해 주세요.', type: 'SCALE' },
                ],
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
        grades: [{ grade: 'S' }, { grade: 'A' }, { grade: 'B' }, { grade: 'C' }],
    },
];
