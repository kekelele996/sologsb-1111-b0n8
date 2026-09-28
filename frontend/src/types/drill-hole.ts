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

/** 地质复核状态：未送审 / 待复核（资料冻结）/ 已退回（解除冻结，可继续编录） */
export type ReviewStatus = 'pending' | 'submitted' | 'returned';

/** 送审 / 退回历史条目（按时间先后保留，退回后也不清除） */
export interface ReviewHistoryEntry {
  id: string;
  /** submit=编录员送审；return=复核人退回 */
  action: 'submit' | 'return';
  /** 操作人（送审人 / 复核人） */
  operator: string;
  /** 送审说明 / 退回原因 */
  note: string;
  /** 操作时间 ISO */
  at: string;
}

/** 钻孔地质复核状态（随钻孔记录一并持久化与备份） */
export interface ReviewState {
  status: ReviewStatus;
  /** 最近一次送审人 */
  submittedBy?: string;
  /** 最近一次送审时间 ISO */
  submittedAt?: string;
  /** 最近一次送审说明 */
  submitNote?: string;
  /** 最近一次退回的复核人 */
  returnedBy?: string;
  /** 最近一次退回时间 ISO */
  returnedAt?: string;
  /** 最近一次退回原因 */
  returnReason?: string;
  /** 送审 / 退回完整历史 */
  history: ReviewHistoryEntry[];
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
  /** 地质复核状态；旧数据与备份缺省视为未送审 */
  review?: ReviewState;
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
