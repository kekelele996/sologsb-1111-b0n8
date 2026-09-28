import { Alert } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DrillHole } from '../../types/drill-hole';

export interface FrozenBannerProps {
  hole: DrillHole | undefined;
}

/** 送审冻结横幅：冻结期间新增、编辑、移除入口均不可用 */
export default function FrozenBanner({ hole }: FrozenBannerProps) {
  if (!hole || hole.reviewStatus !== 'submitted') return null;
  return (
    <Alert
      style={{ marginBottom: 12 }}
      type="warning"
      showIcon
      icon={<LockOutlined />}
      message={`钻孔 ${hole.holeNo} 已送审冻结，本页新增、编辑、移除入口均不可用`}
      description={
        <span>
          送审人：{hole.reviewer || '-'}
          {hole.submittedAt ? `（${dayjs(hole.submittedAt).format('YYYY-MM-DD HH:mm')}）` : ''}
          {hole.reviewNote ? `；说明：${hole.reviewNote}` : ''}。如需修改，请在「钻孔台帐」由复核人填写退回原因后解除冻结。
        </span>
      }
    />
  );
}
