import React from "react";
import { Button, Descriptions, Empty, Modal, Tabs, Typography } from "antd";
import type { DeviceInfo, DiagnosticInfo, LogAnalysisResult, RoomInfo } from "./logAnalysis";
import { formatTimestamp, tryParseTimestamp } from "../../utils/timestamp";

const { Text } = Typography;

const descriptionLabelStyle: React.CSSProperties = {
  width: 120,
  minWidth: 120,
};

interface LogAnalysisModalProps {
  open: boolean;
  result: LogAnalysisResult;
  onClose: () => void;
  onJumpToLine: (lineNumber: number) => void;
}

const LogAnalysisModal: React.FC<LogAnalysisModalProps> = ({ open, result, onClose, onJumpToLine }) => {
  return (
    <Modal
      open={open}
      title="日志分析"
      footer={null}
      onCancel={onClose}
      width={920}
      centered
      destroyOnHidden
    >
      <Tabs
        items={[
          {
            key: "device",
            label: "设备",
            children: (
              <div style={{ paddingTop: 16 }}>
                {result.device ? <DevicePanel device={result.device} /> : <Empty description="未匹配到设备信息" />}
              </div>
            ),
          },
          {
            key: "room",
            label: "房间",
            children: (
              <div style={{ paddingTop: 16 }}>
                {result.rooms.length > 0 ? (
                  <RoomPanel rooms={result.rooms} onJumpToLine={onJumpToLine} />
                ) : (
                  <Empty description="未匹配到房间信息" />
                )}
              </div>
            ),
          },
          {
            key: "diagnostic",
            label: "诊断",
            children: (
              <div style={{ paddingTop: 16 }}>
                <DiagnosticPanel diagnostic={result.diagnostic} />
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
};

const DevicePanel: React.FC<{ device: DeviceInfo }> = ({ device }) => {
  const gpuText = Array.isArray(device.gpu)
    ? device.gpu.map((item) => item.model).filter(Boolean).join("、")
    : "";
  const isMobile = device.deviceType === "mobile";
  const isPc = device.deviceType === "pc";
  const rows: Array<[string, React.ReactNode]> = [
    ["版本号", device.version],
    ["子版本号", device.subVersion],
    ["设备类型", isMobile ? "移动端" : isPc ? "PC" : undefined],
  ];

  if (isMobile) {
    rows.push(
      ["平台", device.platform],
      ["厂商", device.manufacturer],
      ["设备型号", device.model],
      ["型号标识", device.modelCode],
      ["系统", device.os],
      ["系统版本", device.osVersion],
      ["设备 id", device.deviceId],
      ["网络", device.network],
      ["电量", formatBatteryValue(device.battery)],
      ["可用磁盘", device.freeDisk],
      ["可用内存", device.freeMemory],
      ["屏幕尺寸", device.screenSize]
    );
  } else if (isPc) {
    rows.push(
      ["平台", device.platform],
      ["发行版", device.distro],
      ["架构", device.arch],
      ["系统版本", device.systemRelease],
      ["CPU", device.cpu],
      ["内存", formatBytesValue(device.memory)],
      ["GPU", gpuText]
    );
  }

  return (
    <Descriptions bordered column={1} size="small" labelStyle={descriptionLabelStyle}>
      {rows
        .filter(([, value]) => hasValue(value))
        .map(([label, value]) => (
          <Descriptions.Item key={label} label={label}>
            {value}
          </Descriptions.Item>
        ))}
    </Descriptions>
  );
};

const RoomPanel: React.FC<{ rooms: RoomInfo[]; onJumpToLine: (lineNumber: number) => void }> = ({ rooms, onJumpToLine }) => {
  return (
    <div style={{ maxHeight: 520, overflow: "auto", paddingRight: 4 }}>
      {rooms.map((room, index) => (
        <Descriptions
          key={`${room.lineNumber}-${room.roomId || index}`}
          bordered
          column={{ xs: 1, sm: 1, md: 2 }}
          size="small"
          labelStyle={descriptionLabelStyle}
          title={`房间 ${index + 1}`}
          style={{ marginBottom: index === rooms.length - 1 ? 0 : 16 }}
        >
          <Descriptions.Item label="日志行数">
            <Button type="link" size="small" style={{ padding: 0, height: "auto" }} onClick={() => onJumpToLine(room.lineNumber)}>
              {room.lineNumber}
            </Button>
          </Descriptions.Item>
          <Descriptions.Item label="房间 id">{formatValue(room.roomId)}</Descriptions.Item>
          <Descriptions.Item label="开始时间">{formatDateTime(room.startTime)}</Descriptions.Item>
          <Descriptions.Item label="结束时间">{formatDateTime(room.endTime)}</Descriptions.Item>
          <Descriptions.Item label="原始结束时间">{formatDateTime(room.originalEndTime)}</Descriptions.Item>
          <Descriptions.Item label="老师信息">{formatTeacher(room)}</Descriptions.Item>
          <Descriptions.Item label="班级 id">{formatValue(room.schoolId)}</Descriptions.Item>
        </Descriptions>
      ))}
    </div>
  );
};

const DiagnosticPanel: React.FC<{ diagnostic: DiagnosticInfo }> = ({ diagnostic }) => {
  return (
    <Descriptions bordered column={1} size="small" labelStyle={descriptionLabelStyle}>
      <Descriptions.Item label="disconnect 次数">{diagnostic.skynetDisconnectCount}</Descriptions.Item>
      <Descriptions.Item label="latency 统计次数">{diagnostic.latencyCount}</Descriptions.Item>
      <Descriptions.Item label="平均延迟">{formatLatency(diagnostic.averageLatency)}</Descriptions.Item>
    </Descriptions>
  );
};

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return <Text type="secondary">-</Text>;
  }
  return String(value);
}

function formatBytesValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  const gb = value / 1024 / 1024 / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatBatteryValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (numeric >= 0 && numeric <= 1) return `${Math.round(numeric * 100)}%`;
  return `${numeric}%`;
}

function hasValue(value: React.ReactNode) {
  return value !== undefined && value !== null && value !== "";
}

function formatLatency(value: number | null) {
  if (value === null) {
    return <Text type="secondary">-</Text>;
  }
  return `${value.toFixed(2)} ms`;
}

function formatDateTime(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return <Text type="secondary">-</Text>;
  }

  const timestamp = tryParseTimestamp(String(value));
  if (timestamp) return formatTimestamp(timestamp);

  const date = new Date(String(value));
  if (!Number.isNaN(date.getTime())) return formatTimestamp(date);

  return String(value);
}

function formatTeacher(room: RoomInfo) {
  if (!room.teacherNickname && !room.teacherId) {
    return <Text type="secondary">-</Text>;
  }
  if (!room.teacherId) return room.teacherNickname;
  if (!room.teacherNickname) return `(${room.teacherId})`;
  return `${room.teacherNickname}（${room.teacherId}）`;
}

export default LogAnalysisModal;
