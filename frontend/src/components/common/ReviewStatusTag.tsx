import { Tag, Tooltip, Typography } from 'antd';
import type { DrillHole, ReviewState } from '../../types/drill-hole';
import { REVIEW_STATUS_META } from '../../utils/review';

const { Text } = Typography;

export interface ReviewStatusTagProps {
  hole: DrillHole;
  /** 以 Tooltip 展示最近一次送审/退回详情 */
  showDetail?: boolean;
}

/** 地质复核状态标签：未送审 / 待复核·冻结 / 已退回 */
export default function ReviewStatusTag({ hole, showDetail = true }: ReviewStatusTagProps) {
  const review: ReviewState | undefined = hole.review;
  const status: ReviewState['status'] = review?.status ?? 'pending';
  const meta = REVIEW_STATUS_META[status];

  const detail =
    status === 'submitted' && review
      ? `送审人：${review.submittedBy ?? '-'}｜送审时间：${review.submittedAt ?? '-'}｜说明：${review.submitNote || '-'}`
      : status === 'returned' && review
        ? `退回人：${review.returnedBy ?? '-'}｜退回时间：${review.returnedAt ?? '-'}｜原因：${review.returnReason || '-'}`
        : undefined;

  const tag = <Tag color={meta.color}>{meta.label}</Tag>;

  if (!showDetail || !detail) return tag;

  return (
    <Tooltip title={<Text style={{ color: '#fff', whiteSpace: 'pre-line' }}>{detail}</Text>}>
      {tag}
    </Tooltip>
  );
}
