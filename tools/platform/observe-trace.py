import logging
import os
import sys
from pathlib import Path

GATEWAY = Path(__file__).resolve().parents[2] / "ai" / "gateway"
sys.path.insert(0, str(GATEWAY))
os.chdir(GATEWAY)
os.environ.setdefault("CURASPHERE_OTEL_ENDPOINT", "http://127.0.0.1:14317")

from fastapi.testclient import TestClient

from app import app
from observe import flush_traces, gateway_log


class CaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(self.format(record))


def main():
    handler = CaptureHandler()
    handler.setFormatter(gateway_log.handlers[0].formatter)
    gateway_log.addHandler(handler)
    client = TestClient(app)
    response = client.post(
        "/v1/generate",
        headers={
            "x-request-id": "req-synthetic-01",
            "authorization": "Bearer local-sim-token",
        },
        json={"prompt": "diagnose this cough"},
    )
    if response.status_code != 403:
        print(f"unexpected status {response.status_code}", file=sys.stderr)
        return 1
    if not flush_traces():
        print("trace export failed", file=sys.stderr)
        return 1
    text = "\n".join(handler.lines)
    if "cough" in text or "local-sim-token" in text or "Bearer" in text:
        print("log contained sensitive text", file=sys.stderr)
        return 1
    print(f"trace_id={response.headers['x-trace-id']}")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
