import { useEffect, useMemo, useRef, type FC } from "react";
import { Modal } from "antd";

const KID_SSO_URL = "https://static-app.97kid.com/qkids-sso/index.html";
const KID_SSO_ORIGIN = new URL(KID_SSO_URL).origin;

interface KidSsoModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (accessToken: string, expiresIn?: number) => void;
}

interface KidSsoMessage {
  type?: unknown;
  data?: {
    access_token?: unknown;
    expires_in?: unknown;
  };
}

const KidSsoModal: FC<KidSsoModalProps> = ({ open, onClose, onSuccess }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeUrl = useMemo(() => {
    const params = new URLSearchParams({
      system: "admin",
      title: "扫码登录",
      background: "#ffffff",
      departments: "",
      api: "",
      integration: "0",
      passwordLogin: "0",
      extraParams: "{}",
    });

    return `${KID_SSO_URL}?${params.toString()}`;
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleMessage = (event: MessageEvent<KidSsoMessage>) => {
      if (
        event.origin !== KID_SSO_ORIGIN ||
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.type !== "sso_success"
      ) {
        return;
      }

      const accessToken = event.data.data?.access_token;
      if (typeof accessToken !== "string" || !accessToken.trim()) return;

      const expiresIn = Number(event.data.data?.expires_in);
      onSuccess(accessToken, Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSuccess, open]);

  return (
    <Modal open={open} title="久趣单点登录" footer={null} width={748} centered destroyOnHidden onCancel={onClose}>
      <iframe
        ref={iframeRef}
        title="久趣单点登录"
        src={iframeUrl}
        width="700"
        height="350"
        frameBorder="0"
        style={{ display: "block", maxWidth: "100%", margin: "0 auto", background: "#fff" }}
      />
    </Modal>
  );
};

export default KidSsoModal;
