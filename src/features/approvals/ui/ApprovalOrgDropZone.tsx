import clsx from 'clsx';
import { useRef, useState, type ReactNode } from 'react';

export const APPROVAL_ORG_DRAG_MIME = 'application/x-approval-org-picker';

export function parseApprovalOrgDrag(
  e: React.DragEvent,
): { kind: 'member'; memberId: string } | { kind: 'org'; organizationId: string } | null {
  try {
    const raw = e.dataTransfer.getData(APPROVAL_ORG_DRAG_MIME);
    if (!raw) return null;
    const o = JSON.parse(raw) as { kind?: string; memberId?: string; organizationId?: string };
    if (o.kind === 'member' && o.memberId) return { kind: 'member', memberId: o.memberId };
    if (o.kind === 'org' && o.organizationId) return { kind: 'org', organizationId: o.organizationId };
  } catch {
    /* ignore */
  }
  return null;
}

export function ApprovalOrgDropZone(props: {
  children: ReactNode;
  onDropMember: (memberId: string) => void;
  onDropOrg: (organizationId: string) => void;
}) {
  const [over, setOver] = useState(false);
  const depthRef = useRef(0);
  return (
    <div
      className={clsx(
        'tw-min-h-0 tw-min-w-0 tw-flex-1 tw-rounded-lg tw-transition-colors',
        over && 'tw-bg-blue-50/50 tw-ring-2 tw-ring-blue-200',
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        depthRef.current += 1;
        setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depthRef.current -= 1;
        if (depthRef.current <= 0) {
          depthRef.current = 0;
          setOver(false);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        depthRef.current = 0;
        setOver(false);
        const parsed = parseApprovalOrgDrag(e);
        if (!parsed) return;
        if (parsed.kind === 'member') props.onDropMember(parsed.memberId);
        else props.onDropOrg(parsed.organizationId);
      }}
    >
      {props.children}
    </div>
  );
}
