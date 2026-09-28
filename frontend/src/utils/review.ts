import type { DrillHole, ReviewHistoryEntry, ReviewState } from '../types/drill-hole';
import { uid } from './id';

/** 未送审（初始）复核状态 */
export function emptyReview(): ReviewState {
  return { status: 'pending', history: [] };
}

/** 读取钻孔复核状态，缺省（旧数据）视为未送审 */
export function reviewOf(hole: DrillHole | undefined): ReviewState | undefined {
  return hole?.review;
}

/** 钻孔资料是否处于复核冻结（待复核）状态 */
export function isHoleFrozen(hole: DrillHole | undefined): boolean {
  return hole?.review?.status === 'submitted';
}

/** 按 holeId 判断是否冻结（供各业务 store 写保护使用） */
export function assertHoleWritable(hole: DrillHole | undefined): void {
  if (isHoleFrozen(hole)) {
    throw new Error(`钻孔 ${hole?.holeNo ?? ''} 已送审冻结，需经复核人退回后才能修改`);
  }
}

/** 送审：历史追加送审条目，状态置为待复核（最近一次退回信息保留在历史中） */
export function nextSubmitReview(
  previous: ReviewState | undefined,
  submittedBy: string,
  submitNote: string,
  at: string = new Date().toISOString(),
): ReviewState {
  const entry: ReviewHistoryEntry = { id: uid('rvw'), action: 'submit', operator: submittedBy, note: submitNote, at };
  return {
    status: 'submitted',
    submittedBy,
    submittedAt: at,
    submitNote,
    returnedBy: undefined,
    returnedAt: undefined,
    returnReason: undefined,
    history: [...(previous?.history ?? []), entry],
  };
}

/** 退回：历史追加退回条目（保留送审条目），状态置为已退回并解除冻结 */
export function nextReturnReview(
  previous: ReviewState | undefined,
  returnedBy: string,
  returnReason: string,
  at: string = new Date().toISOString(),
): ReviewState {
  const entry: ReviewHistoryEntry = { id: uid('rvw'), action: 'return', operator: returnedBy, note: returnReason, at };
  return {
    status: 'returned',
    submittedBy: previous?.submittedBy,
    submittedAt: previous?.submittedAt,
    submitNote: previous?.submitNote,
    returnedBy,
    returnedAt: at,
    returnReason,
    history: [...(previous?.history ?? []), entry],
  };
}

/** 复核状态在各页面的统一文案与颜色 */
export const REVIEW_STATUS_META: Record<
  ReviewState['status'],
  { label: string; color: string }
> = {
  pending: { label: '未送审', color: 'default' },
  submitted: { label: '待复核 · 冻结', color: 'purple' },
  returned: { label: '已退回', color: 'orange' },
};
