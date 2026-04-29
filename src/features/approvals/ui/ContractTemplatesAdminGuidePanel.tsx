import { Alert, Card, Divider, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const CODE_BLOCK_CLASS =
  'tw-max-h-80 tw-overflow-auto tw-whitespace-pre-wrap tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3 tw-font-mono tw-text-xs tw-leading-relaxed tw-text-slate-800';

const COMMON_HEADERS: { key: string; name: string; type: string; desc: string }[] = [
  { key: '1', name: 'X-User-CompanyId', type: 'UUID', desc: '소속 회사 ID' },
  { key: '2', name: 'X-User-UUID', type: 'UUID', desc: '로그인한 멤버 UUID' },
];

const HTTP_STATUS_ROWS: { key: string; code: string; desc: string }[] = [
  { key: '400', code: '400 Bad Request', desc: '유효성 검증 실패, 비활성 템플릿으로 발송 시도 등' },
  { key: '403', code: '403 Forbidden', desc: 'CONTRACT 권한 없음 또는 타사 접근' },
  { key: '404', code: '404 Not Found', desc: '대상 리소스 없음' },
  { key: '503', code: '503 Service Unavailable', desc: 'salary-service 연결 실패' },
];

const CONTRACT_TYPE_ROWS: { key: string; value: string; desc: string }[] = [
  { key: 'EMPLOYMENT', value: 'EMPLOYMENT', desc: '근로계약서' },
  { key: 'SALARY', value: 'SALARY', desc: '연봉계약서' },
  { key: 'NDA', value: 'NDA', desc: '비밀유지서약서' },
  { key: 'PRIVACY_CONSENT', value: 'PRIVACY_CONSENT', desc: '개인정보 수집·이용 동의서' },
];

const CONTRACT_STATUS_ROWS: { key: string; value: string; desc: string }[] = [
  { key: 'CREATED', value: 'CREATED', desc: '생성됨 (발송 전)' },
  { key: 'SENT', value: 'SENT', desc: '발송됨 (직원 서명 대기)' },
  { key: 'SIGNED', value: 'SIGNED', desc: '체결완료 (양쪽 서명 완료)' },
  { key: 'REJECTED', value: 'REJECTED', desc: '거절됨' },
];

const SIGN_STATUS_ROWS: { key: string; value: string; desc: string }[] = [
  { key: 'PENDING', value: 'PENDING', desc: '서명 대기' },
  { key: 'SIGNED', value: 'SIGNED', desc: '서명 완료' },
  { key: 'REJECTED', value: 'REJECTED', desc: '거절' },
];

const PARTY_ROLE_ROWS: { key: string; value: string; desc: string }[] = [
  { key: 'COMPANY', value: 'COMPANY', desc: '회사 측 (발송 시 자동 서명)' },
  { key: 'EMPLOYEE', value: 'EMPLOYEE', desc: '직원 측' },
];

const FORM_SCHEMA_SOURCE_ROWS: { key: string; source: string; desc: string }[] = [
  { key: 'AUTO', source: 'AUTO', desc: '시스템이 salary/member API에서 자동으로 채움 (이름, 사번, 부서, 연봉 등)' },
  { key: 'ADMIN_INPUT', source: 'ADMIN_INPUT', desc: '인사담당자가 발송 시 입력하는 값 (신규 연봉, 적용일, 특약사항 등)' },
  { key: 'EMPLOYEE_INPUT', source: 'EMPLOYEE_INPUT', desc: '직원이 직접 입력하는 값 (필요 시)' },
];

const TEMPLATE_CREATE_BODY_FIELDS: { key: string; field: string; type: string; req: string; desc: string }[] = [
  { key: '1', field: 'templateName', type: 'String', req: '필수', desc: '템플릿 이름' },
  { key: '2', field: 'contractType', type: 'Enum', req: '필수', desc: 'EMPLOYMENT / SALARY / NDA / PRIVACY_CONSENT' },
  { key: '3', field: 'formSchema', type: 'String(JSON)', req: '필수', desc: '양식 필드 정의. source별로 자동/수동 입력 구분' },
];

const TEMPLATE_UPDATE_BODY_FIELDS: { key: string; field: string; type: string; req: string; desc: string }[] = [
  { key: '1', field: 'templateName', type: 'String', req: '선택', desc: '변경할 이름 (null이면 기존 유지)' },
  { key: '2', field: 'formSchema', type: 'String(JSON)', req: '선택', desc: '변경할 양식 (null이면 기존 유지)' },
];

const ACTIVATE_PATCH_ROWS: { key: string; action: string; method: string; path: string }[] = [
  { key: 'a', action: '활성화', method: 'PATCH', path: '/contract/templates/{templateId}/activate' },
  { key: 'b', action: '비활성화', method: 'PATCH', path: '/contract/templates/{templateId}/deactivate' },
];

const jsonCreateBody = `{
  "templateName": "연봉계약서",
  "contractType": "SALARY",
  "formSchema": "{\\"fields\\":[{\\"key\\":\\"employeeName\\",\\"label\\":\\"성명\\",\\"type\\":\\"text\\",\\"source\\":\\"AUTO\\",\\"sourceField\\":\\"name\\",\\"editable\\":false},{\\"key\\":\\"currentSalary\\",\\"label\\":\\"현재 연봉\\",\\"type\\":\\"number\\",\\"source\\":\\"AUTO\\",\\"sourceField\\":\\"baseSalary\\",\\"editable\\":false},{\\"key\\":\\"newSalary\\",\\"label\\":\\"변경 연봉\\",\\"type\\":\\"number\\",\\"source\\":\\"ADMIN_INPUT\\",\\"editable\\":false},{\\"key\\":\\"effectiveDate\\",\\"label\\":\\"적용일\\",\\"type\\":\\"date\\",\\"source\\":\\"ADMIN_INPUT\\",\\"editable\\":false}]}"
}`;

const jsonCreate201 = `{
  "success": true,
  "message": "계약서 템플릿이 생성되었습니다.",
  "data": {
    "templateId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "companyId": "99999999-9999-9999-9999-999999999999",
    "templateName": "연봉계약서",
    "contractType": "SALARY",
    "formSchema": "{...}",
    "isActiveYn": "Y",
    "createdAt": "2026-04-29T10:00:00",
    "updatedAt": "2026-04-29T10:00:00"
  }
}`;

const jsonUpdateBody = `{
  "templateName": "연봉계약서 (수정)",
  "formSchema": "{...}"
}`;

const jsonActiveList = `{
  "success": true,
  "message": "활성 계약서 템플릿 목록 조회 성공",
  "data": [
    { "templateId": "...", "templateName": "근로계약서", "contractType": "EMPLOYMENT", "isActiveYn": "Y", "..." },
    { "templateId": "...", "templateName": "연봉계약서", "contractType": "SALARY", "isActiveYn": "Y", "..." }
  ]
}`;

const jsonSuccess = `{
  "success": true,
  "message": "계약서 템플릿 조회 성공",
  "data": { ... }
}`;

const jsonError = `{
  "success": false,
  "message": "계약서 템플릿을 찾을 수 없습니다.",
  "data": null
}`;

export function ContractTemplatesAdminGuidePanel() {
  const headerColumns: ColumnsType<(typeof COMMON_HEADERS)[number]> = [
    { title: '헤더명', dataIndex: 'name', key: 'name', width: 180 },
    { title: '타입', dataIndex: 'type', key: 'type', width: 100 },
    { title: '설명', dataIndex: 'desc', key: 'desc' },
  ];

  const enumColumns: ColumnsType<{ key: string; value: string; desc: string }> = [
    { title: '값', dataIndex: 'value', key: 'value', width: 200, render: (v) => <Tag>{v}</Tag> },
    { title: '설명', dataIndex: 'desc', key: 'desc' },
  ];

  const sourceColumns: ColumnsType<(typeof FORM_SCHEMA_SOURCE_ROWS)[number]> = [
    { title: 'source 값', dataIndex: 'source', key: 'source', width: 160, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: '설명', dataIndex: 'desc', key: 'desc' },
  ];

  const bodyFieldColumns: ColumnsType<(typeof TEMPLATE_CREATE_BODY_FIELDS)[number]> = [
    { title: '필드', dataIndex: 'field', key: 'field', width: 140 },
    { title: '타입', dataIndex: 'type', key: 'type', width: 120 },
    { title: '필수', dataIndex: 'req', key: 'req', width: 72 },
    { title: '설명', dataIndex: 'desc', key: 'desc' },
  ];

  const patchColumns: ColumnsType<(typeof ACTIVATE_PATCH_ROWS)[number]> = [
    { title: '동작', dataIndex: 'action', key: 'action', width: 100 },
    { title: 'Method', dataIndex: 'method', key: 'method', width: 100 },
    { title: 'Path', dataIndex: 'path', key: 'path', render: (t: string) => <Typography.Text code>{t}</Typography.Text> },
  ];

  return (
    <Card className="tw-border-slate-200/80 tw-shadow-sm">
      <Space direction="vertical" size={20} className="tw-w-full">
        <div>
          <Typography.Title level={4} className="!tw-mb-2 !tw-mt-0">
            전자계약 API 가이드
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-sm tw-leading-relaxed">
            프론트 화면과 백엔드(<Typography.Text code>approval-service</Typography.Text> 내{' '}
            <Typography.Text code>contract</Typography.Text> 패키지)를 연결하기 위한 API 명세입니다.
          </Typography.Paragraph>
          <ul className="tw-mt-2 tw-mb-0 tw-list-disc tw-space-y-1 tw-pl-5 tw-text-sm tw-text-slate-600">
            <li>
              관리자 전용 엔드포인트는{' '}
              <Typography.Text code>@CheckPermission(resource = CONTRACT, ...)</Typography.Text> 로 보호됩니다.
            </li>
            <li>권한이 없는 사용자는 게이트웨이/필터 단계에서 403 Forbidden을 받습니다.</li>
            <li>응답 포맷은 공통으로 ApiResponse&lt;T&gt; 래퍼를 사용합니다.</li>
          </ul>
        </div>

        <Divider className="!tw-my-0">1. 공통 사항</Divider>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            1-1. 공통 요청 헤더
          </Typography.Title>
          <Table size="small" pagination={false} columns={headerColumns} dataSource={COMMON_HEADERS} />
          <Typography.Paragraph type="secondary" className="!tw-mt-2 !tw-mb-0 tw-text-xs">
            프론트 axios 인스턴스에서 <Typography.Text code>Authorization: Bearer {'{token}'}</Typography.Text> 만 실어내면,
            게이트웨이가 위 헤더를 자동으로 주입합니다.
          </Typography.Paragraph>
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            1-2. 공통 응답 포맷
          </Typography.Title>
          <pre className={CODE_BLOCK_CLASS}>{jsonSuccess}</pre>
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            1-3. 에러 응답 예시
          </Typography.Title>
          <pre className={CODE_BLOCK_CLASS}>{jsonError}</pre>
          <Typography.Paragraph className="!tw-mt-2 !tw-mb-1 tw-text-sm tw-font-medium">주요 상태코드</Typography.Paragraph>
          <Table
            size="small"
            pagination={false}
            columns={[
              { title: '코드', dataIndex: 'code', key: 'code', width: 220 },
              { title: '설명', dataIndex: 'desc', key: 'desc' },
            ]}
            dataSource={HTTP_STATUS_ROWS}
          />
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            1-4. Enum 정리
          </Typography.Title>
          <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">ContractType (계약 유형)</Typography.Text>
          <Table className="tw-mb-3" size="small" pagination={false} columns={enumColumns} dataSource={CONTRACT_TYPE_ROWS} />
          <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">ContractStatus (계약 상태)</Typography.Text>
          <Table className="tw-mb-3" size="small" pagination={false} columns={enumColumns} dataSource={CONTRACT_STATUS_ROWS} />
          <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">SignStatus (서명 상태)</Typography.Text>
          <Table className="tw-mb-3" size="small" pagination={false} columns={enumColumns} dataSource={SIGN_STATUS_ROWS} />
          <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">PartyRole (당사자 역할)</Typography.Text>
          <Table size="small" pagination={false} columns={enumColumns} dataSource={PARTY_ROLE_ROWS} />
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            1-5. formSchema의 source 타입
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-sm">
            계약서 템플릿의 formSchema 내 각 필드에는 <Typography.Text code>source</Typography.Text>가 지정됩니다.
          </Typography.Paragraph>
          <Table size="small" pagination={false} columns={sourceColumns} dataSource={FORM_SCHEMA_SOURCE_ROWS} />
        </div>

        <Divider className="!tw-my-0">2. 계약서 템플릿 관리 (/contract/templates)</Divider>

        <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-sm">
          인사팀 관리자 화면의 <strong>「계약서 양식 관리」</strong> 메뉴용 API입니다.
        </Typography.Paragraph>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            2-1. 템플릿 생성
          </Typography.Title>
          <Typography.Paragraph className="!tw-mb-2 tw-text-sm">
            화면 시나리오: <strong>새 계약서 양식 만들기</strong> 버튼 → 모달 제출
          </Typography.Paragraph>
          <Space wrap className="tw-mb-2">
            <Tag color="blue">POST</Tag>
            <Typography.Text code>/contract/templates</Typography.Text>
            <Tag>권한: CONTRACT : CREATE</Tag>
          </Space>
          <Typography.Text className="tw-mb-1 tw-block tw-text-sm tw-font-medium">Request Body</Typography.Text>
          <pre className={CODE_BLOCK_CLASS}>{jsonCreateBody}</pre>
          <Table className="tw-mt-2" size="small" pagination={false} columns={bodyFieldColumns} dataSource={TEMPLATE_CREATE_BODY_FIELDS} />
          <Typography.Text className="tw-mb-1 tw-mt-3 tw-block tw-text-sm tw-font-medium">Response 201 Created</Typography.Text>
          <pre className={CODE_BLOCK_CLASS}>{jsonCreate201}</pre>
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            2-2. 템플릿 수정
          </Typography.Title>
          <Space wrap className="tw-mb-2">
            <Tag color="blue">PUT</Tag>
            <Typography.Text code>/contract/templates/{'{templateId}'}</Typography.Text>
            <Tag>권한: CONTRACT : UPDATE</Tag>
          </Space>
          <pre className={CODE_BLOCK_CLASS}>{jsonUpdateBody}</pre>
          <Table className="tw-mt-2" size="small" pagination={false} columns={bodyFieldColumns} dataSource={TEMPLATE_UPDATE_BODY_FIELDS} />
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            2-3. 템플릿 단건 조회
          </Typography.Title>
          <Space wrap>
            <Tag color="green">GET</Tag>
            <Typography.Text code>/contract/templates/{'{templateId}'}</Typography.Text>
            <Tag>권한: CONTRACT : READ</Tag>
          </Space>
          <Typography.Paragraph type="secondary" className="!tw-mt-2 !tw-mb-0 tw-text-sm">
            Response 200 OK — 2-1과 동일한 ContractTemplateResDto 구조.
          </Typography.Paragraph>
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            2-4. 활성 템플릿 목록 (드롭다운용)
          </Typography.Title>
          <Typography.Paragraph className="!tw-mb-2 tw-text-sm">
            화면 시나리오: 계약서 발송 시 템플릿 선택 드롭다운
          </Typography.Paragraph>
          <Space wrap className="tw-mb-2">
            <Tag color="green">GET</Tag>
            <Typography.Text code>/contract/templates/active</Typography.Text>
            <Tag color="default">로그인만 되어 있으면 조회 가능</Tag>
          </Space>
          <pre className={CODE_BLOCK_CLASS}>{jsonActiveList}</pre>
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            2-5. 전체 템플릿 목록 (관리자용)
          </Typography.Title>
          <Space wrap>
            <Tag color="green">GET</Tag>
            <Typography.Text code>/contract/templates</Typography.Text>
            <Tag>권한: CONTRACT : READ</Tag>
          </Space>
          <Typography.Paragraph type="secondary" className="!tw-mt-2 !tw-mb-0 tw-text-sm">
            비활성 템플릿까지 모두 반환합니다.
          </Typography.Paragraph>
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            2-6. 템플릿 활성화 / 비활성화
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-2 tw-text-sm">
            권한: CONTRACT : UPDATE · Body 없음 · Response: 갱신된 ContractTemplateResDto
          </Typography.Paragraph>
          <Table size="small" pagination={false} columns={patchColumns} dataSource={ACTIVATE_PATCH_ROWS} />
        </div>

        <div>
          <Typography.Title level={5} className="!tw-mb-2 !tw-mt-0">
            2-7. 기본 템플릿 초기화 (내부용)
          </Typography.Title>
          <Space wrap className="tw-mb-2">
            <Tag color="blue">POST</Tag>
            <Typography.Text code>/contract/templates/init?companyId={'{companyId}'}</Typography.Text>
          </Space>
          <Alert
            type="info"
            showIcon
            message="프론트에서 직접 호출하지 않습니다."
            description="권한 없음(내부 호출 전용). 회사 생성 시 기본 템플릿 4종(근로계약서, 연봉계약서, NDA, 개인정보동의서)을 자동 등록합니다."
          />
        </div>
      </Space>
    </Card>
  );
}
