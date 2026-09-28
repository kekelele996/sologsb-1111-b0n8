import { create } from 'zustand';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import type { DrillHole, HoleProgress, ReviewAction, SurveyPoint } from '../types/drill-hole';
import type { DrillRun } from '../types/drill-run';
import { buildHoleProgress } from '../utils/recovery';
import { isHoleFrozen } from '../utils/review';

export interface HoleInput {
  holeNo: string;
  coordX: number;
  coordY: number;
  collarElevation: number;
  designDepth: number;
  finalDepth: number;
  startDate: string;
  endDate?: string;
  rigNo: string;
  shift: string;
  surveyData: SurveyPoint[];
  remark?: string;
}

interface HoleState {
  holes: DrillHole[];
  currentHoleId: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setCurrentHole: (id: string) => void;
  addHole: (input: HoleInput) => Promise<DrillHole>;
  updateHole: (id: string, patch: Partial<HoleInput>) => Promise<void>;
  removeHole: (id: string) => Promise<void>;
  /** 送审：编录员填写送审人与说明后整孔冻结 */
  submitForReview: (id: string, input: { reviewer: string; note: string }) => Promise<void>;
  /** 复核退回：复核人填写退回原因，解除冻结并保留历史 */
  returnFromReview: (id: string, input: { reviewer: string; reason: string }) => Promise<void>;
  /** 当前钻孔 */
  currentHole: () => DrillHole | undefined;
}

/** 钻孔台帐与当前孔 */
export const useHoleStore = create<HoleState>()((set, get) => ({
  holes: [],
  currentHoleId: '',
  hydrated: false,

  hydrate: async () => {
    const holes = await db.holes.orderBy('holeNo').toArray();
    set({ holes, currentHoleId: get().currentHoleId || holes[0]?.id || '', hydrated: true });
  },

  setCurrentHole: (id) => set({ currentHoleId: id }),

  addHole: async (input) => {
    const hole: DrillHole = {
      id: uid('hole'),
      holeNo: input.holeNo.trim(),
      coordX: Number(input.coordX) || 0,
      coordY: Number(input.coordY) || 0,
      collarElevation: Number(input.collarElevation) || 0,
      designDepth: Number(input.designDepth) || 0,
      finalDepth: Number(input.finalDepth) || 0,
      startDate: input.startDate,
      endDate: input.endDate || undefined,
      rigNo: input.rigNo,
      shift: input.shift,
      surveyData: input.surveyData,
      remark: input.remark?.trim() || undefined,
    };
    await db.holes.put(hole);
    set({ holes: [...get().holes, hole].sort((a, b) => a.holeNo.localeCompare(b.holeNo)), currentHoleId: hole.id });
    return hole;
  },

  updateHole: async (id, patch) => {
    const current = get().holes.find((h) => h.id === id);
    if (!current) return;
    if (isHoleFrozen(current)) {
      throw new Error(`钻孔 ${current.holeNo} 已送审冻结，台帐不允许编辑，请先由复核人退回`);
    }
    const next: DrillHole = { ...current, ...patch };
    await db.holes.put(next);
    set({ holes: get().holes.map((h) => (h.id === id ? next : h)) });
  },

  removeHole: async (id) => {
    const current = get().holes.find((h) => h.id === id);
    if (!current) return;
    if (isHoleFrozen(current)) {
      throw new Error(`钻孔 ${current.holeNo} 已送审冻结，不允许删除，请先由复核人退回`);
    }
    await db.holes.delete(id);
    set({ holes: get().holes.filter((h) => h.id !== id) });
  },

  submitForReview: async (id, input) => {
    const current = get().holes.find((h) => h.id === id);
    if (!current) throw new Error('钻孔不存在或已被删除');
    if (isHoleFrozen(current)) {
      throw new Error(`钻孔 ${current.holeNo} 已处于送审冻结状态，无需重复送审`);
    }
    const action: ReviewAction = {
      id: uid('rev'),
      action: 'submit',
      operator: input.reviewer.trim(),
      note: input.note.trim(),
      actedAt: new Date().toISOString(),
    };
    const next: DrillHole = {
      ...current,
      reviewStatus: 'submitted',
      reviewer: action.operator,
      reviewNote: action.note,
      submittedAt: action.actedAt,
      reviewHistory: [...(current.reviewHistory ?? []), action],
    };
    await db.holes.put(next);
    set({ holes: get().holes.map((h) => (h.id === id ? next : h)) });
  },

  returnFromReview: async (id, input) => {
    const current = get().holes.find((h) => h.id === id);
    if (!current) throw new Error('钻孔不存在或已被删除');
    if (!isHoleFrozen(current)) {
      throw new Error(`钻孔 ${current.holeNo} 当前未送审，无需退回`);
    }
    const actedAt = new Date().toISOString();
    const action: ReviewAction = {
      id: uid('rev'),
      action: 'return',
      operator: input.reviewer.trim(),
      reason: input.reason.trim(),
      actedAt,
    };
    const next: DrillHole = {
      ...current,
      reviewStatus: 'draft',
      returnReason: action.reason,
      returnReviewer: action.operator,
      returnedAt: actedAt,
      reviewHistory: [...(current.reviewHistory ?? []), action],
    };
    await db.holes.put(next);
    set({ holes: get().holes.map((h) => (h.id === id ? next : h)) });
  },

  currentHole: () => get().holes.find((h) => h.id === get().currentHoleId),
}));

/** 钻孔进度派生（终孔深度 / 未达设计 / 待补勘） */
export function holeProgressList(holes: DrillHole[], runs: DrillRun[]): HoleProgress[] {
  return holes.map((hole) => buildHoleProgress(hole, runs.filter((run) => run.holeId === hole.id)));
}
