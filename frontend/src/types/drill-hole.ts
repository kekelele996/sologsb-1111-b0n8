/** 钻孔测斜点 */
export interface SurveyPoint {
  id: string;
  /** 测点深度（m） */
  depth: number;
  /** 倾角（°） */
  dip: number;
  /** 方位角（°） */
  azimuth: number;
}

/** 复核状态：未送审可编辑；已送审（待复核）期间整孔冻结 */
export type ReviewStatus = 'draft' | 'submitted';

/** 复核动作类型 */
export type ReviewActionType = 'submit' | 'return';

/** 复核流程历史条目（送审 / 退回均留存，退回不清除历史） */
export interface ReviewAction {
  id: string;
  /** 动作类型：送审 / 退回 */
  action: ReviewActionType;
  /** 送审时为送审人；退回时为复核人 */
  operator: string;
  /** 送审说明（送审动作） */
  note?: string;
  /** 退回原因（退回动作） */
  reason?: string;
  /** 操作时间 ISO */
  actedAt: string;
}

/** 钻孔台帐 */
export interface DrillHole {
  id: string;
  /** 孔号 */
  holeNo: string;
  /** 坐标 X */
  coordX: number;
  /** 坐标 Y */
  coordY: number;
  /** 孔口标高（m） */
  collarElevation: number;
  /** 设计孔深（m） */
  designDepth: number;
  /** 终孔深度（m），未终孔时为 0 */
  finalDepth: number;
  /** 开孔日期 ISO */
  startDate: string;
  /** 终孔日期 ISO，未终孔为空 */
  endDate?: string;
  /** 钻机号 */
  rigNo: string;
  /** 施工班组 */
  shift: string;
  /** 测斜数据 */
  surveyData: SurveyPoint[];
  /** 备注 */
  remark?: string;
  /** 复核状态：draft=未送审（可编辑），submitted=已送审（整孔冻结）。历史数据缺省按未送审计 */
  reviewStatus?: ReviewStatus;
  /** 当前/最近一次送审人 */
  reviewer?: string;
  /** 当前/最近一次送审说明 */
  reviewNote?: string;
  /** 送审时间 ISO */
  submittedAt?: string;
  /** 最近一次退回原因（已退回时展示） */
  returnReason?: string;
  /** 复核人（最近一次退回操作人） */
  returnReviewer?: string;
  /** 最近一次退回时间 ISO */
  returnedAt?: string;
  /** 送审/退回历史（按时间先后留存） */
  reviewHistory?: ReviewAction[];
}

export const RIG_NOS: string[] = ['XY-1', 'XY-2', 'XY-4', 'HGY-300'];
export const SHIFTS: string[] = ['甲班', '乙班', '丙班'];

/** 钻孔进度派生值 */
export interface HoleProgress {
  hole: DrillHole;
  /** 已完成（终孔）深度 */
  reachedDepth: number;
  /** 设计孔深达成率（%） */
  designRatio: number;
  /** 是否终孔 */
  finished: boolean;
  /** 是否未达设计（终孔深度 < 设计孔深） */
  belowDesign: boolean;
  /** 是否需要补勘 */
  needSupplement: boolean;
}
