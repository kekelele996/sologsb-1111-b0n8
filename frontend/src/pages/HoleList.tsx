import { useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Card, DatePicker, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Timeline, Tooltip, Typography } from 'antd';
import { LockOutlined, SendOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import FilterBar from '../components/common/FilterBar';
import EmptyPanel from '../components/common/EmptyPanel';
import ReviewStatusTag from '../components/common/ReviewStatusTag';
import { useHoleFilter } from '../hooks/useHoleFilter';
import { useHoleStore } from '../stores/holeStore';
import { useRunStore } from '../stores/runStore';
import { useBoxStore } from '../stores/boxStore';
import { RIG_NOS, SHIFTS, type DrillHole, type ReviewAction, type SurveyPoint } from '../types/drill-hole';
import { mergeRanges } from '../utils/recovery';
import { FROZEN_TIP, isHoleFrozen } from '../utils/review';
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

interface SubmitFormValues {
  reviewer: string;
  note: string;
}

interface ReturnFormValues {
  reviewer: string;
  reason: string;
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

/** 复核流程时间线（送审 / 退回历史） */
function ReviewHistoryTimeline({ history }: { history: ReviewAction[] }) {
  if (history.length === 0) {
    return <Text type="secondary">暂无送审 / 退回记录</Text>;
  }
  return (
    <Timeline
      items={[...history]
        .sort((a, b) => (a.actedAt < b.actedAt ? 1 : -1))
        .map((item) => ({
          color: item.action === 'submit' ? 'blue' : 'orange',
          children: (
            <div>
              <Space size={8} wrap>
                <Tag color={item.action === 'submit' ? 'blue' : 'orange'}>{item.action === 'submit' ? '送审' : '退回'}</Tag>
                <Text strong>{item.action === 'submit' ? `送审人：${item.operator}` : `复核人：${item.operator}`}</Text>
                <Text type="secondary">{dayjs(item.actedAt).format('YYYY-MM-DD HH:mm')}</Text>
              </Space>
              <div style={{ marginTop: 4 }}>
                {item.action === 'submit' ? (
                  <Text>送审说明：{item.note || '-'}</Text>
                ) : (
                  <Text type="warning">退回原因：{item.reason || '-'}</Text>
                )}
              </div>
            </div>
          ),
        }))}
    />
  );
}

/** 钻孔台帐：新建钻孔并回显深度覆盖 */
export default function HoleList() {
  const { message } = AntApp.useApp();
  const holes = useHoleStore((s) => s.holes);
  const addHole = useHoleStore((s) => s.addHole);
  const updateHole = useHoleStore((s) => s.updateHole);
  const removeHole = useHoleStore((s) => s.removeHole);
  const submitForReview = useHoleStore((s) => s.submitForReview);
  const returnFromReview = useHoleStore((s) => s.returnFromReview);
  const runs = useRunStore((s) => s.runs);
  const removeRunsByHole = useRunStore((s) => s.removeByHole);
  const boxes = useBoxStore((s) => s.boxes);

  const filter = useHoleFilter();
  const [form] = Form.useForm<HoleFormValues>();
  const [submitForm] = Form.useForm<SubmitFormValues>();
  const [returnForm] = Form.useForm<ReturnFormValues>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DrillHole | null>(null);
  const [submitTarget, setSubmitTarget] = useState<DrillHole | null>(null);
  const [returnTarget, setReturnTarget] = useState<DrillHole | null>(null);
  const [historyTarget, setHistoryTarget] = useState<DrillHole | null>(null);

  const visible = useMemo(() => filter.apply(holes), [holes, filter]);

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
      message.warning(FROZEN_TIP);
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

  const openSubmitModal = (record: DrillHole) => {
    setSubmitTarget(record);
    submitForm.resetFields();
  };

  const openReturnModal = (record: DrillHole) => {
    setReturnTarget(record);
    returnForm.resetFields();
  };

  const confirmSubmit = async () => {
    if (!submitTarget) return;
    const values = await submitForm.validateFields();
    await submitForReview(submitTarget.id, { reviewer: values.reviewer, note: values.note });
    message.success(`钻孔 ${submitTarget.holeNo} 已送审，台帐、回次、岩芯箱、岩性记录已冻结`);
    setSubmitTarget(null);
  };

  const confirmReturn = async () => {
    if (!returnTarget) return;
    const values = await returnForm.validateFields();
    await returnFromReview(returnTarget.id, { reviewer: values.reviewer, reason: values.reason });
    message.success(`钻孔 ${returnTarget.holeNo} 已退回，冻结解除，可继续编录`);
    setReturnTarget(null);
  };

  const handleDelete = async (record: DrillHole) => {
    try {
      await removeRunsByHole(record.id);
      await removeHole(record.id);
      message.success('已删除钻孔及其回次');
    } catch (error) {
      message.error((error as Error).message);
    }
  };

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
    { title: '测斜点', width: 90, align: 'right', render: (_, row) => `${row.surveyData.length} 点` },
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
      width: 170,
      render: (_, row) => <ReviewStatusTag hole={row} />,
    },
    {
      title: '操作',
      width: 300,
      fixed: 'right',
      render: (_, record) => {
        const frozen = isHoleFrozen(record);
        const hasHistory = (record.reviewHistory?.length ?? 0) > 0;
        return (
          <Space size={2} wrap>
            {frozen ? (
              <Button size="small" type="link" danger icon={<LockOutlined />} onClick={() => openReturnModal(record)}>
                复核退回
              </Button>
            ) : (
              <Button size="small" type="link" icon={<SendOutlined />} onClick={() => openSubmitModal(record)}>
                送审
              </Button>
            )}
            <Button size="small" type="link" onClick={() => setHistoryTarget(record)} disabled={!hasHistory}>
              复核记录{hasHistory ? `（${record.reviewHistory?.length}）` : ''}
            </Button>
            {frozen ? (
              <Tooltip title={FROZEN_TIP}>
                <span>
                  <Button size="small" type="link" disabled>
                    编辑
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button size="small" type="link" onClick={() => openEdit(record)}>
                编辑
              </Button>
            )}
            {frozen ? (
              <Tooltip title={FROZEN_TIP}>
                <span>
                  <Button size="small" type="link" danger disabled>
                    删除
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Popconfirm title={`确认删除 ${record.holeNo}？（同时清除其回次）`} onConfirm={() => handleDelete(record)}>
                <Button size="small" type="link" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>
        钻孔台帐
      </Title>
      <Paragraph type="secondary">登记钻孔坐标、孔口标高、设计孔深与测斜数据，并回显回次深度覆盖与岩芯箱数量。</Paragraph>

      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message="地质复核冻结规则"
        description="编录员填写送审人与送审说明后，该孔的台帐、回次、岩芯箱、岩性记录全部进入冻结，新增/编辑/移除入口不可用；复核人填写退回原因即可解除冻结。其他未送审钻孔不受影响，退回历史在「复核记录」中可查。"
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
          <Table rowKey="id" size="small" columns={columns} dataSource={visible} pagination={{ pageSize: 8 }} scroll={{ x: 1860 }} />
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
        open={submitTarget !== null}
        title={submitTarget ? `送审 · ${submitTarget.holeNo}` : '送审'}
        onCancel={() => setSubmitTarget(null)}
        onOk={confirmSubmit}
        okText="确认送审并冻结"
        cancelText="取消"
        okButtonProps={{ danger: false }}
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          message="送审后该孔的台帐、回次、岩芯箱、岩性记录将全部冻结，任何人不能继续修改，直至复核人退回。"
        />
        <Form form={submitForm} layout="vertical">
          <Form.Item name="reviewer" label="送审人" rules={[{ required: true, message: '请填写送审人' }]}>
            <Input maxLength={16} placeholder="编录员姓名" />
          </Form.Item>
          <Form.Item name="note" label="送审说明" rules={[{ required: true, message: '请填写送审说明（随复核意见留存）' }]}>
            <Input.TextArea rows={3} maxLength={200} placeholder="如：本孔编录、回次、岩芯箱已全部完成，请地质复核" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={returnTarget !== null}
        title={returnTarget ? `复核退回 · ${returnTarget.holeNo}` : '复核退回'}
        onCancel={() => setReturnTarget(null)}
        onOk={confirmReturn}
        okText="确认退回并解除冻结"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="填写退回原因后冻结解除，编录员可继续修改；本次退回记录会保留在复核历史中。" />
        <Form form={returnForm} layout="vertical">
          <Form.Item name="reviewer" label="复核人" rules={[{ required: true, message: '请填写复核人' }]}>
            <Input maxLength={16} placeholder="复核人姓名" />
          </Form.Item>
          <Form.Item name="reason" label="退回原因" rules={[{ required: true, message: '请填写退回原因（复核意见）' }]}>
            <Input.TextArea rows={4} maxLength={300} placeholder="如：86~120m 岩性描述与采取率异常段不一致，请核对后重新送审" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        width={520}
        title={historyTarget ? `复核记录 · ${historyTarget.holeNo}` : '复核记录'}
      >
        {historyTarget ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card size="small">
              <Space direction="vertical" size={4}>
                <Text>
                  当前状态：
                  <ReviewStatusTag hole={historyTarget} showDetail={false} />
                </Text>
                <Text type="secondary">送审人：{historyTarget.reviewer || '-'}</Text>
                <Text type="secondary">
                  送审时间：{historyTarget.submittedAt ? dayjs(historyTarget.submittedAt).format('YYYY-MM-DD HH:mm') : '-'}
                </Text>
                <Text type="secondary">送审说明：{historyTarget.reviewNote || '-'}</Text>
                <Text type="warning">
                  最近退回：{historyTarget.returnedAt ? dayjs(historyTarget.returnedAt).format('YYYY-MM-DD HH:mm') : '-'}
                  {historyTarget.returnReviewer ? ` · 复核人 ${historyTarget.returnReviewer}` : ''}
                </Text>
                <Text type="warning">退回原因：{historyTarget.returnReason || '-'}</Text>
              </Space>
            </Card>
            <Card size="small" title={`送审 / 退回历史（${historyTarget.reviewHistory?.length ?? 0} 条）`}>
              <ReviewHistoryTimeline history={historyTarget.reviewHistory ?? []} />
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
