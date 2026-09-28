import { Space, Tag, Tooltip, Typography } from 'antd';
import { LockOutlined, RollbackOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DrillHole } from '../../types/drill-hole';
import { isHoleFrozen, wasReturned } from '../../utils/review';

const { Text } = Typography;

export interface ReviewStatusTagProps {
  hole: Pick<
    DrillHole,
    'reviewStatus' | 'reviewer' | 'reviewNote' | 'submittedAt' | 'returnReason' | 'returnReviewer' | 'returnedAt' | 'reviewHistory'
  >;
  /** 是否以 Tooltip 展示送审人/说明/最近退回原因（台帐列用），默认开启 */
  showDetail?: boolean;
}

/** 钻孔复核状态：未送审 / 复核冻结中 / 退回待改（附带最近一次退回原因） */
export default function ReviewStatusTag({ hole, showDetail = true }: ReviewStatusTagProps) {
  const frozen = isHoleFrozen(hole);
  const returned = wasReturned(hole);

  if (frozen) {
    const tip = (
      <div>
        <div>送审人：{hole.reviewer || '-'}</div>
        <div>送审时间：{hole.submittedAt ? dayjs(hole.submittedAt).format('YYYY-MM-DD HH:mm') : '-'}</div>
        {hole.reviewNote ? <div style={{ maxWidth: 260 }}>说明：{hole.reviewNote}</div> : null}
      </div>
    );
    const tag = (
      <Tag icon={<LockOutlined />} color="gold">
        复核冻结中
      </Tag>
    );
    return showDetail ? <Tooltip title={tip}>{tag}</Tooltip> : tag;
  }

  if (returned) {
    const tip = (
      <div>
        <div>复核人：{hole.returnReviewer || '-'}</div>
        <div>退回时间：{hole.returnedAt ? dayjs(hole.returnedAt).format('YYYY-MM-DD HH:mm') : '-'}</div>
        <div style={{ maxWidth: 280 }}>退回原因：{hole.returnReason || '-'}</div>
      </div>
    );
    return (
      <Space size={4} direction="vertical">
        <Tooltip title={showDetail ? tip : undefined}>
          <Tag icon={<RollbackOutlined />} color="orange">
            退回待改
          </Tag>
        </Tooltip>
        {showDetail && hole.returnReason ? (
          <Text type="secondary" style={{ fontSize: 12, maxWidth: 180 }} ellipsis>
            {hole.returnReason}
          </Text>
        ) : null}
      </Space>
    );
  }

  return <Tag>未送审</Tag>;
}
