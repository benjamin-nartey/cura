import logging
import os
import unittest

from fastapi.testclient import TestClient

from app import app
from observe import JsonFormatter


class GatewayScaffoldTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_refuses_clinical_generation(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["service"], "ai-gateway")
        self.assertEqual(body["clinicalGeneration"], "refused")

    def test_generate_is_refused(self):
        response = self.client.post("/v1/generate", json={"prompt": "diagnose this cough"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "clinical-generation-refused")
        self.assertNotIn("cough", response.text)

    def test_failed_health_does_not_echo_a_token(self):
        os.environ["CURASPHERE_HEALTH"] = "fail"
        os.environ["CURASPHERE_LOCAL_TOKEN"] = "local-sim-token"
        try:
            response = self.client.get("/health")
            self.assertEqual(response.status_code, 500)
            self.assertNotIn("local-sim-token", response.text)
        finally:
            os.environ.pop("CURASPHERE_HEALTH", None)
            os.environ.pop("CURASPHERE_LOCAL_TOKEN", None)

    def test_missing_token_fails_closed(self):
        from app import runtime_blockers

        os.environ["CURASPHERE_REQUIRE_TOKEN"] = "true"
        os.environ.pop("CURASPHERE_LOCAL_TOKEN", None)
        try:
            self.assertEqual(runtime_blockers(), ["CURASPHERE_LOCAL_TOKEN is required"])
            with self.assertRaises(Exception):
                with TestClient(app):
                    pass
        finally:
            os.environ.pop("CURASPHERE_REQUIRE_TOKEN", None)

    def test_dependency_outage_hides_the_address(self):
        os.environ["CURASPHERE_DEPENDENCY_URL"] = "http://127.0.0.1:9/health"
        try:
            response = self.client.get("/health")
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("127.0.0.1", response.text)
        finally:
            os.environ.pop("CURASPHERE_DEPENDENCY_URL", None)

    def test_request_log_keeps_the_correlation_id_and_hides_the_prompt(self):
        handler = logging.Handler()
        handler.setFormatter(JsonFormatter())
        lines = []
        handler.emit = lambda record: lines.append(handler.format(record))
        log = logging.getLogger("curasphere.gateway")
        log.addHandler(handler)
        os.environ["CURASPHERE_LOCAL_TOKEN"] = "local-sim-token"
        try:
            response = self.client.post(
                "/v1/generate",
                headers={
                    "x-request-id": "req-synthetic-01",
                    "authorization": "Bearer local-sim-token",
                },
                json={"prompt": "diagnose this cough"},
            )
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.headers["x-request-id"], "req-synthetic-01")
            self.assertEqual(len(response.headers["x-trace-id"]), 32)
            text = "\n".join(lines)
            self.assertIn("req-synthetic-01", text)
            self.assertIn(response.headers["x-trace-id"], text)
            self.assertNotIn("cough", text)
            self.assertNotIn("local-sim-token", text)
            self.assertNotIn("Bearer", text)
        finally:
            log.removeHandler(handler)
            os.environ.pop("CURASPHERE_LOCAL_TOKEN", None)

    def test_ready_and_metrics_hide_the_token(self):
        os.environ["CURASPHERE_LOCAL_TOKEN"] = "local-sim-token"
        try:
            ready = self.client.get("/ready")
            self.assertEqual(ready.status_code, 200)
            self.assertEqual(ready.json()["status"], "ready")
            metrics = self.client.get("/metrics")
            self.assertEqual(metrics.status_code, 200)
            self.assertIn("curasphere_http_requests_total", metrics.text)
            self.assertNotIn("local-sim-token", metrics.text)
        finally:
            os.environ.pop("CURASPHERE_LOCAL_TOKEN", None)


if __name__ == "__main__":
    unittest.main()
