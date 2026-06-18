import React from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

class LogErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("LogViewer crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            color: "#ff4d4f",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            日志查看器渲染出错：
          </div>
          <div>{this.state.error.message}</div>
          <div style={{ marginTop: 8, color: "#999" }}>
            {this.state.error.stack}
          </div>
          <button
            style={{ marginTop: 16, cursor: "pointer" }}
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default LogErrorBoundary;
