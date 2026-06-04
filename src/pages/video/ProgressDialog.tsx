import React from "react";
import { Modal, Progress, Typography } from "antd";

interface ProgressDialogProps {
  open: boolean;
  current: number;
  total: number;
  percent: number;
}

const ProgressDialog: React.FC<ProgressDialogProps> = ({
  open,
  current,
  total,
  percent,
}) => {
  return (
    <Modal
      open={open}
      title="正在切割..."
      footer={null}
      closable={false}
      centered
      width={400}
    >
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <Progress
          type="circle"
          percent={percent}
          size={120}
          format={(p) => <span style={{ fontSize: 24 }}>{p}%</span>}
        />
        <div style={{ marginTop: 16 }}>
          <Typography.Text>
            正在切割第 {current} / {total} 段
          </Typography.Text>
        </div>
      </div>
    </Modal>
  );
};

export default ProgressDialog;
