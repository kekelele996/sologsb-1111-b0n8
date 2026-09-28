import type { DrillHole, ReviewStatus } from '../types/drill-hole';

/** 该孔是否处于送审冻结状态（历史数据缺省 reviewStatus 视为未送审，不影响旧数据编辑） */
export function isHoleFrozen(hole: Pick<DrillHole, 'reviewStatus'> | undefined): boolean {
  return hole?.reviewStatus === 'submitted';
}

export function reviewStatusOf(hole: Pick<DrillHole, 'reviewStatus'> | undefined): ReviewStatus {
  return isHoleFrozen(hole) ? 'submitted' : 'draft';
}

/** 冻结提示文案（各业务页禁用入口时复用） */
export const FROZEN_TIP = '该钻孔已送审冻结，退回后方可新增、编辑或移除';

/** 未找到钻孔时的统一提示 */
export const HOLE_NOT_FOUND_TIP = '钻孔不存在或已被删除';

/** 校验钻孔可写，不可写时抛出带中文说明的错误（store 守卫统一调用） */
export async function assertHoleWritable(
  getHole: (holeId: string) => Promise<DrillHole | undefined>,
  holeId: string,
): Promise<void> {
  const hole = await getHole(holeId);
  if (!hole) {
    throw new Error(HOLE_NOT_FOUND_TIP);
  }
  if (isHoleFrozen(hole)) {
    throw new Error(`钻孔 ${hole.holeNo} 已送审冻结，退回后方可修改（${FROZEN_TIP}）`);
  }
}

/** 复核状态展示文案与颜色 */
export const REVIEW_STATUS_TEXT: Record<ReviewStatus, string> = {
  draft: '未送审',
  submitted: '复核冻结中',
};

/** 最近一次动作为退回（未送审但有过退回历史，页面提示「退回待改」） */
export function wasReturned(hole: Pick<DrillHole, 'reviewStatus' | 'reviewHistory'> | undefined): boolean {
  if (isHoleFrozen(hole)) return false;
  const history = hole?.reviewHistory ?? [];
  return history.length > 0 && history[history.length - 1].action === 'return';
}
