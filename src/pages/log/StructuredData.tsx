import React from "react";
import { Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { formatTimestamp } from "../../utils/timestamp";

const { Text } = Typography;

type AnyObj = Record<string, unknown>;

interface StructuredDataProps {
  data: unknown;
}

/**
 * 递归通用 JSON 渲染器：对象→键值、对象数组→表格、标量数组→顿号连接。
 * 时间戳（字段名以 At/Date 结尾，或值落 unix 秒/毫秒区间）自动格式化。
 */
export const StructuredData: React.FC<StructuredDataProps> = ({ data }) => (
  <div style={{ fontSize: 12, lineHeight: 1.6 }}>{renderNode(data)}</div>
);

function renderNode(data: unknown, field?: string): React.ReactNode {
  if (data === null || data === undefined) return <Text type="secondary">—</Text>;
  if (Array.isArray(data)) return renderArray(data);
  if (typeof data === "object") return renderObject(data as AnyObj);
  return renderScalar(field, data);
}

function renderScalar(field: string | undefined, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return <Text type="secondary">—</Text>;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") {
    const date = toLocalDate(field, value);
    if (date) return <Text type="secondary">{formatTimestamp(date)}</Text>;
    return String(value);
  }
  if (typeof value === "string") return value;
  return String(value);
}

/** 识别 unix 时间戳（秒或毫秒）。字段名命中优先，否则按值区间判断；0 视为未设置。 */
function toLocalDate(field: string | undefined, value: number): Date | null {
  if (!Number.isFinite(value) || value === 0) return null;
  const byName = Boolean(field && /(At|Date)$/i.test(field));
  const secs = value >= 1e9 && value < 2e9;
  const millis = value >= 1e12 && value < 2e12;
  if (byName || secs) return new Date(value * 1000);
  if (millis) return new Date(value);
  return null;
}

function renderObject(obj: AnyObj): React.ReactNode {
  const entries = Object.entries(obj);
  if (entries.length === 0) return <Text type="secondary">（空）</Text>;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        border: "1px solid #f0f0f0",
        borderRadius: 6,
        padding: 8,
      }}
    >
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Text type="secondary" style={{ flex: "0 0 auto", minWidth: 96, wordBreak: "break-all" }}>
            {key}
          </Text>
          <div style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{renderNode(value, key)}</div>
        </div>
      ))}
    </div>
  );
}

function renderArray(arr: unknown[]): React.ReactNode {
  if (arr.length === 0) return <Text type="secondary">（空）</Text>;

  const objects = arr.filter(
    (item): item is AnyObj => item !== null && typeof item === "object" && !Array.isArray(item)
  );

  if (objects.length === arr.length) {
    return renderObjectTable(objects);
  }

  return (
    <span>
      {arr.map((value, index) => (
        <span key={index}>
          {index > 0 ? "、" : ""}
          {renderScalar(undefined, value)}
        </span>
      ))}
    </span>
  );
}

function renderObjectTable(objects: AnyObj[]): React.ReactNode {
  const keys = Array.from(new Set(objects.flatMap((obj) => Object.keys(obj))));
  const columns: ColumnsType<AnyObj> = keys.map((key) => ({
    title: key,
    dataIndex: key,
    ellipsis: true,
    render: (value: unknown) => renderNode(value, key),
  }));

  return (
    <Table<AnyObj>
      size="small"
      pagination={false}
      rowKey={(_, index) => String(index)}
      dataSource={objects}
      columns={columns}
      scroll={{ y: 320, x: "max-content" }}
      style={{ width: "100%" }}
    />
  );
}

export default StructuredData;
