import { Typography } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { PropsWithChildren, ReactNode } from 'react';

function spacedDocumentTitle(name: string) {
  return [...name].join(' ');
}

export type ApprovalFormPaperLayoutProps = PropsWithChildren<{
  documentName: string;
  /** 카테고리별 한글명 (예: 휴가) — 본문 헤더에는 생략하고 사이드 문서정보 등에서 사용 */
  categoryLabel: string;
  /** RequestType 코드 (예: VACATION) */
  requestTypeCode: string;
  drafterName?: string;
  drafterOrg?: string;
  drafterJobTitle?: string;
  /** 표시용 기안일 — 없으면 오늘 */
  writtenDate?: string;
  /** 문서번호 — 없으면 안내 문구 표시 */
  documentNumber?: string;
  /** 우측 결재란(신청/승인) */
  stampColumn?: ReactNode;
}>;

const cellBorder = 'tw-border tw-border-solid tw-border-black';
const labelBg = 'tw-bg-[#efefef]';
/** 본문 칸 안 Ant 입력·선택 — 연한 실선 테두리, 각진 그룹웨어 입력란 */
const paperFieldValueCellControls =
  '[&_textarea.ant-input]:tw-rounded-none [&_textarea.ant-input]:tw-border-[#bfbfbf] [&_input.ant-input]:tw-rounded-none [&_input.ant-input]:tw-border-[#bfbfbf] [&_.ant-input-affix-wrapper]:tw-rounded-none [&_.ant-input-affix-wrapper]:tw-border-[#bfbfbf] [&_.ant-select_.ant-select-selector]:tw-rounded-none [&_.ant-select_.ant-select-selector]:tw-border-[#bfbfbf] [&_.ant-select_.ant-select-selector]:tw-shadow-none [&_.ant-picker]:tw-rounded-none [&_.ant-picker]:tw-border-[#bfbfbf] [&_.ant-picker]:tw-shadow-none';

/**
 * 전자결재 기안서 본문 (그룹웨어 스타일: 좌측 문서표 + 우측 결재란).
 */
export function ApprovalFormPaperLayout({
  documentName,
  drafterName = '—',
  drafterOrg = '—',
  writtenDate,
  documentNumber,
  stampColumn,
  children,
}: ApprovalFormPaperLayoutProps) {
  const dateD = (writtenDate ? dayjs(writtenDate) : dayjs()).locale('ko');
  const dateLine = `${dateD.format('YYYY-MM-DD')}(${dateD.format('ddd')})`;

  return (
    <div className="tw-mb-2 tw-rounded-none tw-border-0 tw-bg-white tw-px-3 tw-py-4 sm:tw-px-6 sm:tw-py-5">
      <header className="tw-mb-5 tw-text-center">
        <Typography.Title
          level={3}
          className="!tw-mb-0 !tw-mt-0 !tw-text-xl !tw-font-bold !tw-tracking-wide !tw-text-black sm:!tw-text-2xl"
        >
          {spacedDocumentTitle(documentName)}
        </Typography.Title>
      </header>

      <div
        className={
          stampColumn
            ? 'tw-mb-5 tw-flex tw-flex-col tw-gap-3 lg:tw-flex-row lg:tw-items-stretch lg:tw-justify-between'
            : 'tw-mb-5'
        }
      >
        <div className="tw-min-w-0 tw-w-full tw-max-w-[17rem] tw-shrink-0 sm:tw-max-w-[17.5rem] lg:tw-w-auto lg:tw-pr-3">
          <table className="tw-w-full tw-table-fixed tw-border-collapse tw-text-sm">
            <tbody>
              <tr>
                <th
                  scope="row"
                  className={`tw-w-[38%] ${cellBorder} ${labelBg} tw-px-1.5 tw-py-1.5 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-text-black sm:tw-w-[34%] sm:tw-px-2 sm:tw-text-xs`}
                >
                  기안자
                </th>
                <td
                  className={`${cellBorder} tw-bg-white tw-px-1.5 tw-py-1.5 tw-text-left tw-align-middle tw-text-[11px] tw-text-black sm:tw-px-2`}
                  colSpan={3}
                >
                  <span className="tw-whitespace-normal [word-break:keep-all]">{drafterName}</span>
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  className={`${cellBorder} ${labelBg} tw-px-1.5 tw-py-1.5 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-text-black sm:tw-px-2 sm:tw-text-xs`}
                >
                  소속
                </th>
                <td
                  className={`${cellBorder} tw-bg-white tw-px-1.5 tw-py-1.5 tw-text-left tw-align-middle tw-text-[11px] tw-text-black sm:tw-px-2`}
                  colSpan={3}
                >
                  {drafterOrg}
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  className={`${cellBorder} ${labelBg} tw-px-1.5 tw-py-1.5 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-text-black sm:tw-px-2 sm:tw-text-xs`}
                >
                  기안일
                </th>
                <td
                  className={`${cellBorder} tw-bg-white tw-px-1.5 tw-py-1.5 tw-text-left tw-align-middle tw-text-[11px] tw-text-black sm:tw-px-2`}
                  colSpan={3}
                >
                  {dateLine}
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  className={`${cellBorder} ${labelBg} tw-px-1.5 tw-py-1.5 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-text-black sm:tw-px-2 sm:tw-text-xs`}
                >
                  문서번호
                </th>
                <td
                  className={`${cellBorder} tw-bg-white tw-px-1.5 tw-py-1.5 tw-text-left tw-align-middle tw-text-[11px] tw-text-black sm:tw-px-2`}
                  colSpan={3}
                >
                  {documentNumber?.trim() || '(제출 시 부여)'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {stampColumn ? (
          <div className="tw-w-full tw-shrink-0 tw-min-w-0 lg:tw-ml-auto lg:tw-w-auto lg:tw-max-w-none">
            {stampColumn}
          </div>
        ) : null}
      </div>

      <table className="tw-w-full tw-table-fixed tw-border-collapse tw-text-sm">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const stampLine = cellBorder;
const stampLabelBg = labelBg;
const stampVertLabelClass = `${stampLine} ${stampLabelBg} tw-w-[1.85rem] tw-min-w-[1.85rem] tw-max-w-[2rem] tw-px-0 tw-py-2 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-text-black`;
/** 신청·승인 공통: 데이터 열 넓이·행 높이 */
const stampDataColW =
  'tw-w-[3.35rem] tw-min-w-[3.35rem] tw-max-w-[3.6rem] sm:tw-w-[3.5rem] sm:tw-min-w-[3.5rem] sm:tw-max-w-[3.75rem]';
const stampDataColOnlyW = 'tw-w-[3.35rem] sm:tw-w-[3.5rem]';
const stampRowTopRole = `${stampLine} ${stampLabelBg} tw-min-h-[1.5rem] tw-px-0.5 tw-py-1 tw-text-center tw-align-middle tw-text-[10px] tw-font-normal tw-text-black [word-break:keep-all] ${stampDataColW}`;
const stampRowMidName = `${stampLine} tw-bg-white tw-px-0.5 tw-py-1 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-leading-tight tw-text-black [word-break:keep-all] ${stampDataColW} tw-h-[3.35rem] tw-min-h-[3.2rem] tw-max-h-[3.6rem] sm:tw-h-[3.5rem] sm:tw-max-h-[3.75rem]`;
const stampRowBotEmpty = `${stampLine} tw-bg-white tw-min-h-[1.5rem] tw-px-0.5 tw-py-0.5 tw-text-center tw-align-middle ${stampDataColW}`;
const stampRowBotDate = `${stampLine} tw-bg-white tw-min-h-[1.5rem] tw-px-0.5 tw-py-0.5 tw-text-center tw-align-middle tw-text-[9px] tw-font-normal tw-leading-tight tw-text-black sm:tw-text-[10px] ${stampDataColW}`;

/** 승인·반려 처리일 — 미처리·기타 상태는 빈 칸 */
export function formatApprovalStampActionDate(actedAt: string | null | undefined, approvalStatus: string | undefined): string {
  const st = String(approvalStatus ?? '').trim().toUpperCase();
  if (st !== 'APPROVED' && st !== 'REJECTED') return '';
  const raw = actedAt?.trim();
  if (!raw) return '';
  const d = dayjs(raw);
  return d.isValid() ? d.format('YYYY/MM/DD') : '';
}

export type ApprovalStampApproverItem = {
  id: string;
  memberName: string;
  jobTitleName?: string;
  /** 승인 후 서버가 저장한 서명 이미지 URL — 있으면 성명 칸에 이미지 표시 */
  signatureImageUrl?: string | null;
  /** 대리결재(부재 위임) 건 */
  isProxy?: boolean;
  /** 처리일(승인·반려) 표시 시 이름 아래 `(대결: …)` — 값 없으면 `(대결)`만 */
  proxyActorName?: string;
  /** 승인·반려 시 처리일시(API `actedAt`) */
  actedAt?: string | null;
  approvalStatus?: string;
};

/** 신청란 하단: 기안일 등 (YYYY/MM/DD) */
function formatApplicationStampDate(isoDate: string | undefined): string {
  if (!isoDate?.trim()) return '';
  const d = dayjs(isoDate.trim());
  return d.isValid() ? d.format('YYYY/MM/DD') : '';
}

/** 신청 블록: 세로「신 청」+ 3행(직위·성명 / 하 기안일) */
function ApprovalStampApplicationTable({
  name,
  jobTitleName,
  writtenDateIso,
}: {
  name: string;
  /** 상단 칸 직위 — 없으면 빈 칸 */
  jobTitleName?: string;
  /** 하단 YYYY/MM/DD — `YYYY-MM-DD` 등 dayjs 파싱 가능 문자열 */
  writtenDateIso?: string;
}) {
  const nbsp = '\u00a0';
  const displayName = name.trim() || '—';
  const topRole = jobTitleName?.trim() ?? '';
  const bottomDate = formatApplicationStampDate(writtenDateIso);
  return (
    <table className="tw-h-full tw-w-auto tw-table-fixed tw-border-collapse tw-text-sm">
      <colgroup>
        <col className="tw-w-[1.85rem]" />
        <col className={stampDataColOnlyW} />
      </colgroup>
      <tbody>
        <tr>
          <td
            rowSpan={3}
            className={stampVertLabelClass}
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {'\uC2E0 \uCCAD'}
          </td>
          <td className={stampRowTopRole}>{topRole ? topRole : nbsp}</td>
        </tr>
        <tr>
          <td className={stampRowMidName}>{displayName}</td>
        </tr>
        <tr>
          <td className={bottomDate ? stampRowBotDate : stampRowBotEmpty}>{bottomDate || nbsp}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** 승인 블록: 세로「승 인」한 번 + 결재자별 열(직위 / 성명 / 처리일) */
function ApprovalStampApprovalTable({ approvers }: { approvers: ApprovalStampApproverItem[] }) {
  const nbsp = '\u00a0';
  const columns =
    approvers.length > 0
      ? approvers.map((a) => ({
          key: a.id,
          role: a.jobTitleName?.trim() ?? '',
          name: a.memberName?.trim() || '—',
          signatureImageUrl: a.signatureImageUrl?.trim() ?? '',
          isProxy: a.isProxy === true,
          proxyActorName: a.proxyActorName?.trim() || '',
          bottom: formatApprovalStampActionDate(a.actedAt, a.approvalStatus),
        }))
      : [
          {
            key: 'placeholder',
            role: '',
            name: '\uBBF8\uC9C0\uC815',
            signatureImageUrl: '',
            isProxy: false,
            proxyActorName: '',
            bottom: '',
          },
        ];

  return (
    <table className="tw-h-full tw-w-auto tw-table-fixed tw-border-collapse tw-text-sm">
      <colgroup>
        <col className="tw-w-[1.85rem]" />
        {columns.map((c) => (
          <col key={c.key} className={stampDataColOnlyW} />
        ))}
      </colgroup>
      <tbody>
        <tr>
          <td
            rowSpan={3}
            className={stampVertLabelClass}
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {'\uC2B9 \uC778'}
          </td>
          {columns.map((c) => (
            <td key={`${c.key}-t`} className={stampRowTopRole}>
              {c.role.trim() ? c.role : nbsp}
            </td>
          ))}
        </tr>
        <tr>
          {columns.map((c) => (
            <td key={`${c.key}-m`} className={stampRowMidName}>
              <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-0.5 tw-leading-tight">
                {c.signatureImageUrl ? (
                  <>
                    <span className="tw-inline-block tw-max-w-full tw-text-center [word-break:keep-all] tw-text-[10px] tw-font-semibold tw-leading-tight tw-text-black sm:tw-text-[11px]">
                      {c.name}
                    </span>
                    <img
                      src={c.signatureImageUrl}
                      alt=""
                      className="tw-mx-auto tw-max-h-[2rem] tw-w-full tw-max-w-[3.25rem] tw-object-contain tw-object-center"
                      aria-hidden
                    />
                    {c.isProxy && c.bottom ? (
                      <span className="tw-inline-block tw-max-w-full tw-whitespace-normal tw-text-center [word-break:keep-all] tw-text-[9px] tw-font-normal tw-leading-tight tw-text-black sm:tw-text-[10px]">
                        {c.proxyActorName ? '(대결: ' + c.proxyActorName + ')' : '(대결)'}
                      </span>
                    ) : null}
                  </>
                ) : c.isProxy && c.bottom ? (
                  <>
                    <span className="tw-inline-block tw-max-w-full tw-whitespace-normal tw-text-center [word-break:keep-all] tw-text-[11px] tw-font-semibold tw-leading-tight tw-text-black">
                      {c.name}
                    </span>
                    <span className="tw-inline-block tw-max-w-full tw-whitespace-normal tw-text-center [word-break:keep-all] tw-text-[9px] tw-font-normal tw-leading-tight tw-text-black sm:tw-text-[10px]">
                      {c.proxyActorName ? '(대결: ' + c.proxyActorName + ')' : '(대결)'}
                    </span>
                  </>
                ) : (
                  <span className="tw-font-semibold">{c.name}</span>
                )}
              </div>
            </td>
          ))}
        </tr>
        <tr>
          {columns.map((c) => (
            <td key={`${c.key}-b`} className={c.bottom ? stampRowBotDate : stampRowBotEmpty}>
              {c.bottom || nbsp}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** 우측 결재란: 신청·승인 두 테이블 + 간격, 그룹웨어식 1px 검정 실선 */
export function ApprovalFormStampColumn({
  drafterName,
  drafterJobTitle,
  approvers,
  onOpenEdit,
  /** 신청란 하단 날짜 — 없으면 비움 */
  applicationWrittenDateIso,
}: {
  drafterName: string;
  drafterJobTitle?: string;
  approvers: ApprovalStampApproverItem[];
  onOpenEdit?: () => void;
  applicationWrittenDateIso?: string;
}) {
  const nm = drafterName?.trim() || '—';
  const dTitle = drafterJobTitle?.trim();

  const inner = (
    <>
      <div className="tw-flex tw-flex-row tw-flex-nowrap tw-items-stretch tw-justify-end tw-gap-1.5 tw-overflow-x-auto tw-rounded-none sm:tw-gap-2">
        <div className="tw-w-auto tw-shrink-0">
          <ApprovalStampApplicationTable
            name={nm}
            jobTitleName={dTitle}
            writtenDateIso={applicationWrittenDateIso}
          />
        </div>
        <div className="tw-w-auto tw-shrink-0">
          <ApprovalStampApprovalTable approvers={approvers} />
        </div>
      </div>
      {onOpenEdit ? (
        <div className="tw-mt-1.5 tw-text-center tw-text-[10px] tw-text-slate-400">클릭하여 편집</div>
      ) : null}
    </>
  );

  if (!onOpenEdit) {
    return <div className="tw-block tw-w-fit tw-max-w-full tw-border-0 tw-bg-transparent tw-p-0 tw-text-left">{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpenEdit}
      className="tw-block tw-w-fit tw-max-w-full tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-transition-opacity hover:tw-opacity-95 focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-blue-500 focus-visible:tw-ring-offset-1"
    >
      {inner}
    </button>
  );
}

/** 기안지·계약서 본문 표에서 조항·안내 문구(2열 통합, 입력란과 동일한 실선 표 스타일) */
export function ApprovalFormPaperStaticNoteRow({
  title,
  body,
  onActivate,
  selected,
}: {
  title?: string;
  body: string;
  /** 미리보기 등에서 행 선택용 */
  onActivate?: () => void;
  selected?: boolean;
}) {
  const t = title?.trim();
  const b = body.trim();
  const interactive = Boolean(onActivate);
  const empty = !t && !b;
  return (
    <tr>
      <td
        colSpan={2}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? () => onActivate?.() : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                onActivate?.();
              }
            : undefined
        }
        className={`${cellBorder} tw-bg-white tw-px-2 tw-py-3 tw-align-top sm:tw-px-3 sm:tw-py-3.5 ${
          interactive ? 'tw-cursor-pointer tw-outline-none hover:tw-bg-slate-50/90' : ''
        } ${selected ? 'tw-bg-blue-50/70 tw-ring-2 tw-ring-blue-500 tw-ring-inset' : ''}`}
      >
        {t ? (
          <Typography.Text
            strong
            className="!tw-mb-2 tw-block tw-text-left tw-text-sm tw-font-bold tw-leading-snug tw-tracking-tight tw-text-black sm:tw-text-[15px]"
          >
            {t}
          </Typography.Text>
        ) : null}
        <Typography.Paragraph
          className={`!tw-mb-0 tw-text-left tw-text-[13px] tw-font-normal tw-leading-[1.75] tw-text-black sm:tw-text-sm ${
            b ? 'tw-whitespace-pre-wrap [word-break:keep-all]' : ''
          } ${empty ? 'tw-text-slate-400' : ''}`}
        >
          {empty ? '(안내 문구 없음)' : b}
        </Typography.Paragraph>
      </td>
    </tr>
  );
}

export type ApprovalFormPaperFieldRowProps = {
  label: string;
  required?: boolean;
  selected?: boolean;
  children: ReactNode;
};

export function ApprovalFormPaperFieldRow({ label, required, selected, children }: ApprovalFormPaperFieldRowProps) {
  return (
    <tr className={selected ? 'tw-outline tw-outline-2 tw-outline-blue-500 tw-outline-offset-[-2px]' : undefined}>
      <th
        scope="row"
        className={`tw-w-[28%] ${cellBorder} ${
          selected ? 'tw-bg-blue-100' : labelBg
        } tw-px-2 tw-py-2.5 tw-text-center tw-align-middle tw-text-xs tw-font-semibold ${
          selected ? 'tw-text-blue-900' : 'tw-text-black'
        } sm:tw-w-[22%] sm:tw-px-3 sm:tw-text-sm`}
      >
        {required ? <span className="tw-text-red-600">* </span> : null}
        <span className="tw-inline-block tw-text-center [word-break:keep-all]">{label}</span>
      </th>
      <td
        className={`${cellBorder} ${
          selected ? 'tw-bg-blue-50/70' : 'tw-bg-white'
        } tw-px-2 tw-py-2 tw-align-middle sm:tw-px-3 ${paperFieldValueCellControls}`}
      >
        {children}
      </td>
    </tr>
  );
}
