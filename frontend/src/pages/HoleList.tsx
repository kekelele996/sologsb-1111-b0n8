import { useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import { HistoryOutlined, LockOutlined, RollbackOutlined, SendOutlined, UnlockOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import FilterBar from '../components/common/FilterBar';
import EmptyPanel from '../components/common/EmptyPanel';
import ReviewStatusTag from '../components/common/ReviewStatusTag';
import { useHoleFilter } from '../hooks/useHoleFilter';
import { useHoleStore } from '../stores/holeStore';
import { useRunStore } from '../stores/runStore';
import { useBoxStore } from '../stores/boxStore';
import { RIG_NOS, SHIFTS, type DrillHole, type ReviewHistoryEntry, type SurveyPoint } from '../types/drill-hole';
import { mergeRanges } from '../utils/recovery';
import { isHoleFrozen } from '../utils/review';
import { uid } from '../utils/id';

const { Title, Paragraph, Text } = Typography;

interface HoleFormValues {
  holeNo: string;
  coordX: number;
  coordY: number;
  collarElevation: number;
  designDepth: number;
  finalDepth: number;
  startDate: Dayjs;
  endDate?: Dayjs;
  rigNo: string;
  shift: string;
  surveyText?: string;
  remark?: string;
}

interface ReviewFormValues {
  operator: string;
  note: string;
}

/** 解析测斜文本：每行「深度,倾角,方位角」 */
function parseSurvey(text: string | undefined): SurveyPoint[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [depth, dip, azimuth] = line.split(/[,，\s]+/).map((v) => Number(v));
      return { id: uid('sv'), depth: depth || 0, dip: dip || 0, azimuth: azimuth || 0 };
    });
}

function surveyToText(points: SurveyPoint[]): string {
  return points.map((p) => `${p.depth},${p.dip},${p.azimuth}`).join('\n');
}

function formatTime(iso?: string): string {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

/** 钻孔台帐：新建钻孔、回显深度覆盖，并管理地质复核送审 / 退回 / 历史 */
export default function HoleList() {
  const { message } = AntApp.useApp();
  const holes = useHoleStore((s) => s.holes);
  const addHole = useHoleStore((s) => s.addHole);
  const updateHole = useHoleStore((s) => s.updateHole);
  const removeHole = useHoleStore((s) => s.removeHole);
  const submitReview = useHoleStore((s) => s.submitReview);
  const returnReview = useHoleStore((s) => s.returnReview);
  const runs = useRunStore((s) => s.runs);
  const removeRunsByHole = useRunStore((s) => s.removeByHole);
  const boxes = useBoxStore((s) => s.boxes);

  const filter = useHoleFilter();
  const [form] = Form.useForm<HoleFormValues>();
  const [reviewForm] = Form.useForm<ReviewFormValues>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DrillHole | null>(null);
  /** 复核操作弹窗：submit=编录员送审；return=复核人退回 */
  const [reviewOpen, setReviewOpen] = useState<null | { mode: 'submit' | 'return'; hole: DrillHole }>(null);
  const [historyHoleId, setHistoryHoleId] = useState<string | null>(null);

  const visible = useMemo(() => filter.apply(holes), [holes, filter]);
  const historyHole = useMemo(() => holes.find((h) => h.id === historyHoleId) ?? null, [holes, historyHoleId]);

  const coverageText = (holeId: string) => {
    const merged = mergeRanges(runs.filter((run) => run.holeId === holeId).map((run) => ({ from: run.fromDepth, to: run.toDepth })));
    if (merged.length === 0) return '尚无回次';
    return merged.map((range) => `${range.from}~${range.to}m`).join('、');
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      coordX: 512340,
      coordY: 3210880,
      collarElevation: 1240,
      designDepth: 200,
      finalDepth: 0,
      startDate: dayjs(),
      rigNo: 'XY-1',
      shift: '甲班',
      surveyText: '50,88.5,132',
    } as unknown as HoleFormValues);
    setOpen(true);
  };

  const openEdit = (record: DrillHole) => {
    if (isHoleFrozen(record)) {
      message.warning('该钻孔资料已送审冻结，需经复核人退回后才能编辑');
      return;
    }
    setEditing(record);
    form.setFieldsValue({
      holeNo: record.holeNo,
      coordX: record.coordX,
      coordY: record.coordY,
      collarElevation: record.collarElevation,
      designDepth: record.designDepth,
      finalDepth: record.finalDepth,
      startDate: dayjs(record.startDate),
      endDate: record.endDate ? dayjs(record.endDate) : undefined,
      rigNo: record.rigNo,
      shift: record.shift,
      surveyText: surveyToText(record.surveyData),
      remark: record.remark,
    } as unknown as HoleFormValues);
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      holeNo: values.holeNo,
      coordX: Number(values.coordX) || 0,
      coordY: Number(values.coordY) || 0,
      collarElevation: Number(values.collarElevation) || 0,
      designDepth: Number(values.designDepth) || 0,
      finalDepth: Number(values.finalDepth) || 0,
      startDate: values.startDate.toISOString(),
      endDate: values.endDate ? values.endDate.toISOString() : undefined,
      rigNo: values.rigNo,
      shift: values.shift,
      surveyData: parseSurvey(values.surveyText),
      remark: values.remark,
    };
    if (editing) {
      await updateHole(editing.id, payload);
      message.success(`已更新钻孔 ${payload.holeNo}`);
    } else {
      await addHole(payload);
      message.success(`已建孔 ${payload.holeNo}`);
    }
    setOpen(false);
  };

  const openReview = (mode: 'submit' | 'return', hole: DrillHole) => {
    setReviewOpen({ mode, hole });
    reviewForm.resetFields();
    if (mode === 'submit' && hole.review?.status === 'returned') {
      reviewForm.setFieldsValue({ note: hole.review.returnReason ? `针对退回意见修改：${hole.review.returnReason}` : '' });
    }
  };

  const submitReviewForm = async () => {
    if (!reviewOpen) return;
    const values = await reviewForm.validateFields();
    const { mode, hole } = reviewOpen;
    try {
      if (mode === 'submit') {
        await submitReview(hole.id, values.operator, values.note);
        message.success(`钻孔 ${hole.holeNo} 已送审，台帐、回次、岩芯箱、岩性记录全部冻结`);
      } else {
        await returnReview(hole.id, values.operator, values.note);
        message.success(`钻孔 ${hole.holeNo} 已退回，冻结解除，编录员可继续修改`);
      }
      setReviewOpen(null);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const handleRemove = async (record: DrillHole) => {
    try {
      await removeRunsByHole(record.id);
      await removeHole(record.id);
      message.success('已删除钻孔及其回次');
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const historyItems = (history: ReviewHistoryEntry[]) =>
    [...history]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((entry) => ({
        color: entry.action === 'submit' ? 'purple' : 'orange',
        children: (
          <div>
            <Space size={8} wrap>
              <Tag color={entry.action === 'submit' ? 'purple' : 'orange'}>{entry.action === 'submit' ? '送审' : '退回'}</Tag>
              <Text strong>{entry.operator}</Text>
              <Text type="secondary">{formatTime(entry.at)}</Text>
            </Space>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">{entry.action === 'submit' ? '送审说明：' : '退回原因：'}</Text>
              {entry.note || <Text type="secondary">（未填写）</Text>}
            </div>
          </div>
        ),
      }));

  const columns: TableColumnsType<DrillHole> = [
    { title: '孔号', dataIndex: 'holeNo', width: 110, render: (v: string) => <Text strong>{v}</Text> },
    { title: '钻机', dataIndex: 'rigNo', width: 90 },
    { title: '班组', dataIndex: 'shift', width: 80 },
    { title: '坐标(X, Y)', width: 200, render: (_, row) => `${row.coordX}, ${row.coordY}` },
    { title: '孔口标高(m)', dataIndex: 'collarElevation', width: 110, align: 'right' },
    { title: '设计孔深(m)', dataIndex: 'designDepth', width: 110, align: 'right' },
    { title: '终孔深度(m)', dataIndex: 'finalDepth', width: 110, align: 'right', render: (v: number) => (v > 0 ? v : '-') },
    {
      title: '深度覆盖（回次）',
      width: 260,
      render: (_, row) => <span style={{ fontSize: 12 }}>{coverageText(row.id)}</span>,
    },
    { title: '岩芯箱', width: 90, align: 'right', render: (_, row) => `${boxes.filter((b) => b.holeId === row.id).length} 箱` },
    { title: '测斜点', width: 80, align: 'right', render: (_, row) => `${row.surveyData.length} 点` },
    {
      title: '施工状态',
      width: 130,
      render: (_, row) => {
        if (row.endDate && row.finalDepth > 0 && row.finalDepth < row.designDepth) return <Tag color="red">未达设计 · 待补勘</Tag>;
        if (row.endDate) return <Tag color="green">已终孔</Tag>;
        return <Tag color="blue">在钻</Tag>;
      },
    },
    {
      title: '复核状态',
      width: 130,
      render: (_, row) => <ReviewStatusTag hole={row} />,
    },
    {
      title: '操作',
      width: 330,
      fixed: 'right',
      render: (_, record) => {
        const frozen = isHoleFrozen(record);
        const status = record.review?.status ?? 'pending';
        return (
          <Space size={2} wrap>
            {frozen ? (
              <Tooltip title="已送审冻结，待复核人退回后可编辑">
                <span>
                  <Button size="small" type="link" disabled icon={<LockOutlined />}>
                    编辑
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button size="small" type="link" onClick={() => openEdit(record)} icon={<UnlockOutlined />}>
                编辑
              </Button>
            )}
            {frozen ? (
              <Tooltip title="冻结期间不可删除钻孔">
                <span>
                  <Button size="small" type="link" danger disabled icon={<LockOutlined />}>
                    删除
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Popconfirm title={`确认删除 ${record.holeNo}？（同时清除其回次）`} onConfirm={() => handleRemove(record)}>
                <Button size="small" type="link" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
            {frozen ? (
              <Button size="small" type="link" onClick={() => openReview('return', record)} icon={<RollbackOutlined />}>
                复核退回
              </Button>
            ) : (
              <Button size="small" type="link" onClick={() => openReview('submit', record)} icon={<SendOutlined />}>
                {status === 'returned' ? '重新送审' : '送审'}
              </Button>
            )}
            <Button size="small" type="link" onClick={() => setHistoryHoleId(record.id)} icon={<HistoryOutlined />}>
              复核记录
            </Button>
          </Space>
        );
      },
    },
  ];

  const frozenCount = holes.filter((h) => isHoleFrozen(h)).length;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>
        钻孔台帐
      </Title>
      <Paragraph type="secondary">
        登记钻孔坐标、孔口标高、设计孔深与测斜数据，并回显回次深度覆盖与岩芯箱数量。编录员送审后该孔台帐、回次、岩芯箱、岩性记录全部冻结，复核人可填写退回原因解除冻结，送审与退回历史永久保留。
      </Paragraph>

      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message="地质复核流程"
        description={
          <Space size={24} wrap>
            <Text>① 编录员填写送审人与说明 → ② 状态变为「待复核 · 冻结」，本孔所有新增 / 编辑 / 移除入口不可用 → ③ 复核人填写退回原因后解除冻结，历史可在「复核记录」查看</Text>
            <Tag color="purple">冻结中 {frozenCount} 孔</Tag>
          </Space>
        }
      />

      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={openCreate}>
          新建钻孔
        </Button>
      </Space>

      <FilterBar
        fields={[
          { key: 'rig', label: '钻机', options: RIG_NOS, width: 110 },
          { key: 'shift', label: '施工班组', options: SHIFTS, width: 110 },
        ]}
        keywordPlaceholder="搜索孔号 / 钻机 / 备注"
        resultCount={visible.length}
        totalCount={holes.length}
      />

      {visible.length === 0 ? (
        <EmptyPanel description="没有符合条件的钻孔" actionText="重置筛选条件" onAction={filter.reset}>
          <div style={{ marginTop: 8 }}>
            <Button type="link" onClick={openCreate}>
              或直接新建一个钻孔
            </Button>
          </div>
        </EmptyPanel>
      ) : (
        <Card size="small">
          <Table rowKey="id" size="small" columns={columns} dataSource={visible} pagination={{ pageSize: 8 }} scroll={{ x: 1750 }} />
        </Card>
      )}

      <Modal
        open={open}
        title={editing ? `编辑钻孔 · ${editing.holeNo}` : '新建钻孔'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="holeNo" label="孔号" rules={[{ required: true, message: '请输入孔号' }]}>
            <Input placeholder="如：ZK-2406" maxLength={20} />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="coordX" label="坐标 X" rules={[{ required: true, message: '请输入坐标 X' }]}>
              <InputNumber style={{ width: 180 }} placeholder="坐标 X" />
            </Form.Item>
            <Form.Item name="coordY" label="坐标 Y" rules={[{ required: true, message: '请输入坐标 Y' }]}>
              <InputNumber style={{ width: 180 }} placeholder="坐标 Y" />
            </Form.Item>
            <Form.Item name="collarElevation" label="孔口标高(m)" rules={[{ required: true, message: '请输入孔口标高' }]}>
              <InputNumber style={{ width: 160 }} placeholder="孔口标高" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="designDepth" label="设计孔深(m)" rules={[{ required: true, message: '请输入设计孔深' }]}>
              <InputNumber min={0} style={{ width: 160 }} placeholder="设计孔深" />
            </Form.Item>
            <Form.Item name="finalDepth" label="终孔深度(m)" rules={[{ required: true, message: '请输入终孔深度' }]}>
              <InputNumber min={0} style={{ width: 160 }} placeholder="未终孔填 0" />
            </Form.Item>
            <Form.Item name="rigNo" label="钻机号" rules={[{ required: true, message: '请选择钻机号' }]}>
              <Select style={{ width: 150 }} options={RIG_NOS.map((v) => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="shift" label="施工班组" rules={[{ required: true, message: '请选择班组' }]}>
              <Select style={{ width: 140 }} options={SHIFTS.map((v) => ({ label: v, value: v }))} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="startDate" label="开孔日期" rules={[{ required: true, message: '请选择开孔日期' }]}>
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="endDate" label="终孔日期（未终孔留空）">
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item name="surveyText" label="测斜数据（每行：深度,倾角,方位角）">
            <Input.TextArea rows={3} placeholder={'50,88.5,132\n100,87.2,133.5'} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={80} placeholder="设计见矿层位等" />
          </Form.Item>
        </Form>
        <Alert type="info" showIcon message="终孔深度小于设计孔深时，将自动计入「未达设计 · 待补勘」清单。" />
      </Modal>

      <Modal
        open={reviewOpen !== null}
        title={
          reviewOpen
            ? reviewOpen.mode === 'submit'
              ? `送审 · ${reviewOpen.hole.holeNo}`
              : `复核退回 · ${reviewOpen.hole.holeNo}`
            : ''
        }
        onCancel={() => setReviewOpen(null)}
        onOk={submitReviewForm}
        okText={reviewOpen?.mode === 'submit' ? '确认送审并冻结' : '确认退回并解冻'}
        cancelText="取消"
        width={560}
      >
        {reviewOpen ? (
          <>
            <Alert
              style={{ marginBottom: 12 }}
              type={reviewOpen.mode === 'submit' ? 'warning' : 'info'}
              showIcon
              message={
                reviewOpen.mode === 'submit'
                  ? '送审后该孔台帐、回次、岩芯箱、岩性记录立即冻结，所有新增 / 编辑 / 移除入口不可用；其他未送审钻孔不受影响。'
                  : '退回后冻结立即解除，编录员可继续修改；本次退回原因与此前送审记录都会保留在复核记录中。'
              }
            />
            <Form form={reviewForm} layout="vertical">
              <Form.Item
                name="operator"
                label={reviewOpen.mode === 'submit' ? '送审人（编录员）' : '复核人'}
                rules={[{ required: true, message: reviewOpen.mode === 'submit' ? '请填写送审人' : '请填写复核人' }]}
              >
                <Input maxLength={16} placeholder={reviewOpen.mode === 'submit' ? '如：陈立' : '如：高工'} />
              </Form.Item>
              <Form.Item
                name="note"
                label={reviewOpen.mode === 'submit' ? '送审说明' : '退回原因'}
                rules={[{ required: true, message: reviewOpen.mode === 'submit' ? '请填写送审说明' : '请填写退回原因' }]}
              >
                <Input.TextArea
                  rows={4}
                  maxLength={200}
                  showCount
                  placeholder={
                    reviewOpen.mode === 'submit'
                      ? '如：ZK-2402 全孔 250m 回次、岩芯箱与岩性编录已完成，请复核'
                      : '如：96~132m 岩性描述与采取率异常段对应关系不清，请补充后重新送审'
                  }
                />
              </Form.Item>
            </Form>
          </>
        ) : null}
      </Modal>

      <Modal
        open={historyHole !== null}
        title={historyHole ? `复核记录 · ${historyHole.holeNo}` : ''}
        footer={null}
        onCancel={() => setHistoryHoleId(null)}
        width={620}
      >
        {historyHole ? (
          <>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="当前复核状态">
                <ReviewStatusTag hole={historyHole} showDetail={false} />
              </Descriptions.Item>
              <Descriptions.Item label="最近送审">
                {historyHole.review?.submittedAt
                  ? `${historyHole.review.submittedBy ?? '-'} · ${formatTime(historyHole.review.submittedAt)} · ${historyHole.review.submitNote || '-'}`
                  : '暂无'}
              </Descriptions.Item>
              <Descriptions.Item label="最近退回">
                {historyHole.review?.returnedAt
                  ? `${historyHole.review.returnedBy ?? '-'} · ${formatTime(historyHole.review.returnedAt)} · ${historyHole.review.returnReason || '-'}`
                  : '暂无'}
              </Descriptions.Item>
            </Descriptions>
            <Divider orientation="left" orientationMargin={0}>
              送审 / 退回历史
            </Divider>
            {historyHole.review?.history?.length ? (
              <Timeline items={historyItems(historyHole.review.history)} />
            ) : (
              <Text type="secondary">该孔尚未送审，暂无复核记录。</Text>
            )}
          </>
        ) : null}
      </Modal>
    </div>
  );
}
