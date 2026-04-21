/**
 * 평가 설계 프리셋 — Design Create 모달에서 "추천 템플릿" 버튼으로 주입된다.
 *
 * 서버의 `EvaluationDesign.sectionsJson`/`gradeConfigJson` 포맷과 1:1 호환되며,
 * 사용자는 프리셋 주입 후 자유롭게 수정할 수 있다.
 */

export type DesignPreset = {
    key: string;
    label: string;
    description: string;
    name: string;
    sections: { title: string; weight: number; questions: { text: string; type: string }[] }[];
    gradeType: 'absolute' | 'relative';
    grades: { grade: string }[];
    targetDist?: { grade: string; pct: number }[];
};

export const DESIGN_PRESETS: DesignPreset[] = [
    {
        key: 'performance',
        label: '성과 중심 평가',
        description: '업무 성과와 목표 달성도 중심',
        name: '성과 평가',
        sections: [
            {
                title: '업무 성과', weight: 60,
                questions: [
                    {text: '핵심 목표(KPI) 달성도를 평가해 주세요.', type: 'SCALE'},
                    {text: '업무 품질과 완성도는 어떠했나요?', type: 'SCALE'},
                    {text: '주요 성과와 기여 내용을 서술해 주세요.', type: 'TEXT'},
                ],
            },
            {
                title: '역량 및 태도', weight: 40,
                questions: [
                    {text: '문제 해결 및 의사결정 역량을 평가해 주세요.', type: 'SCALE'},
                    {text: '협업 및 커뮤니케이션 역량을 평가해 주세요.', type: 'SCALE'},
                    {text: '자기 개발 및 성장 노력은 어떠했나요?', type: 'SCALE'},
                ],
            },
        ],
        gradeType: 'relative',
        grades: [{grade: 'S'}, {grade: 'A'}, {grade: 'B'}, {grade: 'C'}, {grade: 'D'}],
        targetDist: [
            {grade: 'S', pct: 10}, {grade: 'A', pct: 20}, {grade: 'B', pct: 40},
            {grade: 'C', pct: 20}, {grade: 'D', pct: 10},
        ],
    },
    {
        key: 'competency',
        label: '역량 평가',
        description: '직무 역량과 리더십 중심',
        name: '역량 평가',
        sections: [
            {
                title: '직무 전문성', weight: 35,
                questions: [
                    {text: '담당 직무에 필요한 전문 지식 수준을 평가해 주세요.', type: 'SCALE'},
                    {text: '업무 프로세스 이해도와 실행력은 어떠한가요?', type: 'SCALE'},
                ],
            },
            {
                title: '리더십·협업', weight: 35,
                questions: [
                    {text: '팀 내 협업과 소통에 얼마나 기여했나요?', type: 'SCALE'},
                    {text: '후배 육성 또는 동료 지원 활동은 어떠했나요?', type: 'SCALE'},
                    {text: '갈등 상황에서 조율 능력을 평가해 주세요.', type: 'SCALE'},
                ],
            },
            {
                title: '성장 가능성', weight: 30,
                questions: [
                    {text: '새로운 역할·도전에 대한 적응력을 평가해 주세요.', type: 'SCALE'},
                    {text: '향후 성장 가능성에 대해 종합적으로 서술해 주세요.', type: 'TEXT'},
                ],
            },
        ],
        gradeType: 'absolute',
        grades: [{grade: '탁월'}, {grade: '우수'}, {grade: '보통'}, {grade: '미흡'}],
    },
    {
        key: 'okr',
        label: 'OKR 달성도 평가',
        description: 'OKR 기반 분기별 성과 리뷰',
        name: 'OKR 리뷰',
        sections: [
            {
                title: 'OKR 달성률', weight: 50,
                questions: [
                    {text: '핵심 결과(KR) 달성률을 종합적으로 평가해 주세요.', type: 'SCALE'},
                    {text: '목표 달성 과정에서의 핵심 성과를 서술해 주세요.', type: 'TEXT'},
                ],
            },
            {
                title: '임팩트·기여도', weight: 30,
                questions: [
                    {text: '팀/조직 목표에 대한 기여 수준을 평가해 주세요.', type: 'SCALE'},
                    {text: '기대 이상의 성과나 추가 기여가 있었나요?', type: 'TEXT'},
                ],
            },
            {
                title: '학습·개선', weight: 20,
                questions: [
                    {text: '분기 중 새롭게 학습하거나 개선한 점은 무엇인가요?', type: 'TEXT'},
                    {text: '다음 분기 개선 계획을 서술해 주세요.', type: 'TEXT'},
                ],
            },
        ],
        gradeType: 'absolute',
        grades: [{grade: '초과 달성'}, {grade: '달성'}, {grade: '부분 달성'}, {grade: '미달성'}],
    },
    {
        key: 'multisource',
        label: '다면(360°) 평가',
        description: '상향·하향·동료 피드백 종합',
        name: '다면 평가',
        sections: [
            {
                title: '업무 수행', weight: 30,
                questions: [
                    {text: '주어진 업무를 기한 내에 완수하는 정도를 평가해 주세요.', type: 'SCALE'},
                    {text: '업무 결과물의 품질은 어떠한가요?', type: 'SCALE'},
                ],
            },
            {
                title: '소통·협력', weight: 30,
                questions: [
                    {text: '의견을 명확하고 정중하게 전달하나요?', type: 'SCALE'},
                    {text: '다른 팀/직군과의 협업 자세는 어떠한가요?', type: 'SCALE'},
                    {text: '건설적인 피드백을 주고 받는 태도를 평가해 주세요.', type: 'SCALE'},
                ],
            },
            {
                title: '조직 기여', weight: 20,
                questions: [
                    {text: '회사 가치(Core Value)에 부합하는 행동을 보여주나요?', type: 'SCALE'},
                    {text: '조직 문화 개선에 기여하는 점이 있었나요?', type: 'TEXT'},
                ],
            },
            {
                title: '종합 의견', weight: 20,
                questions: [
                    {text: '이 분을 한마디로 표현하면 어떤 동료인가요?', type: 'TEXT'},
                    {text: '앞으로 더 발전하면 좋겠다고 느끼는 점이 있나요?', type: 'TEXT'},
                ],
            },
        ],
        gradeType: 'relative',
        grades: [{grade: 'S'}, {grade: 'A'}, {grade: 'B'}, {grade: 'C'}, {grade: 'D'}],
        targetDist: [
            {grade: 'S', pct: 5}, {grade: 'A', pct: 20}, {grade: 'B', pct: 50},
            {grade: 'C', pct: 20}, {grade: 'D', pct: 5},
        ],
    },
];
