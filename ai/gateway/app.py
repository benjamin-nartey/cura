import os
import uuid
from contextlib import asynccontextmanager
from urllib.error import URLError
from urllib.request import urlopen

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

from observe import REQUESTS, correlation_id, gateway_log, tracer


def runtime_blockers():
    if os.environ.get("CURASPHERE_REQUIRE_TOKEN") == "true" and not os.environ.get("CURASPHERE_LOCAL_TOKEN", "").strip():
        return ["CURASPHERE_LOCAL_TOKEN is required"]
    return []


@asynccontextmanager
async def lifespan(_app):
    blockers = runtime_blockers()
    if blockers:
        raise RuntimeError(blockers[0])
    yield


app = FastAPI(title="CuraSphere AI gateway scaffold", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.middleware("http")
async def observe_request(request: Request, call_next):
    route = request.url.path
    request_id = correlation_id(request.headers.get("x-request-id")) or f"req-{uuid.uuid4().hex[:16]}"
    with tracer.start_as_current_span(f"{request.method} {route}") as span:
        span.set_attribute("correlation.id", request_id)
        span.set_attribute("http.route", route)
        response = await call_next(request)
        span.set_attribute("http.status_code", response.status_code)
        trace_id = f"{span.get_span_context().trace_id:032x}"
    REQUESTS.labels(request.method, route, str(response.status_code)).inc()
    fields = {
        "correlationId": request_id,
        "traceId": trace_id,
        "method": request.method,
        "route": route,
        "status": response.status_code,
    }
    gateway_log.info("request", extra=fields)
    if response.status_code >= 500:
        gateway_log.error("request failed", extra=fields)
    response.headers["x-request-id"] = request_id
    response.headers["x-trace-id"] = trace_id
    return response


@app.get("/health")
def health():
    if os.environ.get("CURASPHERE_HEALTH") == "fail":
        return JSONResponse(status_code=500, content={"status": "unavailable", "service": "ai-gateway"})
    dependency = os.environ.get("CURASPHERE_DEPENDENCY_URL", "").strip()
    if dependency:
        try:
            with urlopen(dependency, timeout=2) as response:
                if response.status >= 400:
                    raise URLError("dependency status")
        except Exception:
            return JSONResponse(status_code=503, content={"status": "dependency-unavailable", "service": "ai-gateway"})
    return {"status": "ok", "service": "ai-gateway", "clinicalGeneration": "refused"}


@app.get("/ready")
def ready():
    response = health()
    if isinstance(response, JSONResponse):
        return response
    return {"status": "ready", "service": "ai-gateway"}


@app.get("/metrics")
def metrics():
    from observe import metrics_payload

    payload, content_type = metrics_payload()
    return Response(content=payload, media_type=content_type)


@app.post("/v1/generate")
def generate():
    return JSONResponse(
        status_code=403,
        content={
            "code": "clinical-generation-refused",
            "message": "Clinical generation stays refused while intended use is pending.",
        },
    )
