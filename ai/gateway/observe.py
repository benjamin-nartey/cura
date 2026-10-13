import json
import logging
import os
import re

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

REQUESTS = Counter(
    "curasphere_http_requests_total",
    "HTTP requests handled by the AI gateway scaffold.",
    ["method", "route", "status"],
)
CORRELATION_ID = re.compile(r"[A-Za-z0-9_-]{8,80}")
LOG_FIELDS = ("correlationId", "traceId", "method", "route", "status")


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "level": record.levelname,
            "service": "ai-gateway",
            "message": record.getMessage(),
        }
        for key in LOG_FIELDS:
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, separators=(",", ":"))


def configure_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    log = logging.getLogger("curasphere.gateway")
    log.handlers.clear()
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False
    return log


def configure_tracing():
    endpoint = os.environ.get("CURASPHERE_OTEL_ENDPOINT", "").strip()
    provider = TracerProvider(resource=Resource.create({"service.name": "ai-gateway"}))
    if endpoint:
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True))
        )
    trace.set_tracer_provider(provider)
    return trace.get_tracer("ai-gateway")


def correlation_id(header):
    if header and CORRELATION_ID.fullmatch(header):
        return header
    return None


def flush_traces():
    provider = trace.get_tracer_provider()
    flush = getattr(provider, "force_flush", None)
    if flush is None:
        return True
    return bool(flush(timeout_millis=10000))


def metrics_payload():
    return generate_latest(), CONTENT_TYPE_LATEST


gateway_log = configure_logging()
tracer = configure_tracing()
