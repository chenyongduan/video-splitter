import React from "react";
import { Table, Button, Popconfirm, Typography } from "antd";
import { DeleteOutlined, PlayCircleOutlined } from "@ant-design/icons";
import type { Segment } from "../../types";
import { formatTime } from "../../utils/format";
import { useAppStore } from "../../store/segmentStore";

interface SegmentTableProps {
  segments: Segment[];
  onRemove: (id: string) => void;
}

const SegmentTable: React.FC<SegmentTableProps> = ({
  segments,
  onRemove,
}) => {
  const previewSegment = useAppStore((s) => s.previewSegment);

  const columns = [
    {
      title: "#",
      key: "index",
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: "开始时间",
      dataIndex: "start",
      key: "start",
      width: 130,
      render: (start: number) => (
        <Typography.Text code>{formatTime(start)}</Typography.Text>
      ),
    },
    {
      title: "结束时间",
      dataIndex: "end",
      key: "end",
      width: 130,
      render: (end: number) => (
        <Typography.Text code>{formatTime(end)}</Typography.Text>
      ),
    },
    {
      title: "时长",
      key: "duration",
      width: 90,
      render: (_: unknown, record: Segment) => (
        <Typography.Text>
          {formatTime(record.end - record.start)}
        </Typography.Text>
      ),
    },
    {
      title: "文件名",
      dataIndex: "filename",
      key: "filename",
      render: (filename: string) => (
        <Typography.Text>{filename}</Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_: unknown, record: Segment) => (
        <div style={{ display: "flex", gap: 4 }}>
          <Button
            type="link"
            icon={<PlayCircleOutlined />}
            size="small"
            onClick={() => previewSegment(record.start, record.end)}
            title="预览此区间"
          />
          <Popconfirm
            title="确定删除此区间？"
            onConfirm={() => onRemove(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              title="删除"
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <Table
      dataSource={segments}
      columns={columns}
      rowKey="id"
      size="small"
      pagination={false}
      locale={{ emptyText: "暂无分割区间，请添加" }}
    />
  );
};

export default SegmentTable;
