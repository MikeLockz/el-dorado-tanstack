import json
import logging
import os
from typing import Any, Dict, Optional

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from pythonjsonlogger import jsonlogger
from prometheus_client import Counter, Gauge, Histogram
import pyroscope

SERVICE_NAME = "mcts-ai"

# Prometheus metrics
REQUESTS_TOTAL = Counter(
    "mcts_requests_total",
    "Total MCTS requests processed",
    ["endpoint", "status"],
)
REQUEST_DURATION_MS = Histogram(
    "mcts_request_duration_ms",
    "End-to-end latency for MCTS requests",
    ["endpoint", "phase", "timeout_ms"],
    buckets=(50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000),
)
SEARCH_DURATION_MS = Histogram(
    "mcts_search_duration_ms",
    "Duration of MCTS search loop",
    ["endpoint", "timeout_ms"],
    buckets=(50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000),
)
DETERMINIZATION_DURATION_MS = Histogram(
    "mcts_determinization_duration_ms",
    "Time spent determinizing hidden information",
    ["endpoint"],
    buckets=(1, 5, 10, 20, 50, 100, 200, 400, 800),
)
ROLLOUT_DURATION_MS = Histogram(
    "mcts_rollout_duration_ms",
    "Time spent in rollout simulations",
    ["endpoint"],
    buckets=(1, 5, 10, 20, 50, 100, 200, 400, 800),
)
ITERATIONS_TOTAL = Counter(
    "mcts_iterations_total",
    "Total MCTS iterations performed",
    ["endpoint"],
)
ITERATIONS_PER_REQUEST = Histogram(
    "mcts_iterations_per_request",
    "Iterations completed per request",
    ["endpoint", "timeout_ms"],
    buckets=(1, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 1500),
)
TREE_DEPTH_MAX = Histogram(
    "mcts_tree_depth_max",
    "Maximum tree depth reached in a request",
    ["endpoint"],
    buckets=(1, 2, 4, 6, 8, 10, 12, 16, 20, 30),
)
TREE_NODES_CREATED = Histogram(
    "mcts_tree_nodes_created",
    "Number of nodes created per request",
    ["endpoint"],
    buckets=(1, 5, 10, 25, 50, 75, 100, 250, 500, 1000, 2500, 5000),
)
DETERMINIZATION_ATTEMPTS_TOTAL = Counter(
    "mcts_determinization_attempts_total",
    "Total determinization attempts across requests",
    ["endpoint"],
)
DETERMINIZATION_RETRIES = Histogram(
    "mcts_determinization_retries",
    "Retries needed to satisfy constraints during determinization",
    ["endpoint"],
    buckets=(0, 1, 2, 3, 5, 8, 13, 21, 34, 55),
)
DETERMINIZATION_SUCCESS_RATE = Gauge(
    "mcts_determinization_success_rate",
    "Success rate of determinization",
    ["endpoint"],
)
ERRORS_TOTAL = Counter(
    "mcts_errors_total",
    "Total errors encountered by endpoint",
    ["endpoint", "error_type"],
)
TIMEOUT_ERRORS_TOTAL = Counter(
    "mcts_timeout_errors_total",
    "Total timeout errors encountered",
    ["endpoint"],
)
VALIDATION_ERRORS_TOTAL = Counter(
    "mcts_validation_errors_total",
    "Total validation errors encountered",
    ["endpoint"],
)
CONCURRENT_REQUESTS = Gauge(
    "mcts_concurrent_requests",
    "Number of requests currently being processed",
    ["endpoint"],
)
QUEUE_DEPTH = Gauge(
    "mcts_queue_depth",
    "Requests waiting for processing (placeholder, no queue)",
    ["endpoint"],
)
BEST_MOVE_CONFIDENCE = Histogram(
    "mcts_best_move_confidence",
    "Confidence score of selected move",
    ["endpoint"],
    buckets=(0.0, 0.1, 0.25, 0.5, 0.65, 0.8, 0.9, 1.0),
)
ALTERNATIVE_MOVES_EVALUATED = Histogram(
    "mcts_alternative_moves_evaluated",
    "Number of moves considered before selecting best",
    ["endpoint"],
    buckets=(1, 2, 3, 4, 6, 8, 12, 16, 20, 30),
)
WIN_RATE_ESTIMATE = Histogram(
    "mcts_win_rate_estimate",
    "Estimated win rate from search result",
    ["endpoint"],
    buckets=(0.0, 0.1, 0.25, 0.5, 0.65, 0.8, 0.9, 1.0),
)

_otel_tracing_configured = False
_otel_metrics_configured = False


def _configure_tracing() -> None:
    global _otel_tracing_configured
    if _otel_tracing_configured:
        return

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return

    resource = Resource.create({"service.name": SERVICE_NAME})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    _otel_tracing_configured = True


def _configure_metrics() -> None:
    global _otel_metrics_configured
    if _otel_metrics_configured:
        return

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return

    resource = Resource.create({"service.name": SERVICE_NAME})
    reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(),
        export_interval_millis=5000,
    )
    provider = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(provider)
    _otel_metrics_configured = True


def _configure_profiling() -> None:
    """
    Configure Pyroscope continuous profiling.
    """
    pyroscope_address = os.getenv("PYROSCOPE_SERVER_ADDRESS")
    if not pyroscope_address:
        obs_ip = os.getenv("OBSERVABILITY_LXC_IP")
        if obs_ip:
            pyroscope_address = f"http://{obs_ip}:4040"
    
    if not pyroscope_address:
        return

    pyroscope.configure(
        application_name=SERVICE_NAME,
        server_address=pyroscope_address,
        tags={"hostname": os.getenv("HOSTNAME", "unknown")},
        enable_logging=True,
    )
    logging.getLogger(__name__).info(f"Pyroscope profiling enabled at {pyroscope_address}")


def configure_logging() -> None:
    """
    Configure JSON logging with trace correlation.
    """
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logger = logging.getLogger()
    logger.setLevel(log_level)

    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    handler.setFormatter(formatter)
    logger.handlers = [handler]


def instrument_app(app) -> None:
    """
    Apply FastAPI instrumentation and set up tracing/logging.
    """
    configure_logging()
    _configure_tracing()
    _configure_metrics()
    _configure_profiling()
    try:
        FastAPIInstrumentor.instrument_app(app)
    except Exception:
        # Continue without FastAPI instrumentation if it fails; app should still work.
        logging.getLogger(__name__).warning("FastAPI instrumentation skipped")


def record_request_start(endpoint: str) -> None:
    CONCURRENT_REQUESTS.labels(endpoint=endpoint).inc()
    REQUESTS_TOTAL.labels(endpoint=endpoint, status="inflight").inc()
    QUEUE_DEPTH.labels(endpoint=endpoint).set(0)


def record_request_end(
    *,
    endpoint: str,
    phase: str,
    timeout_ms: int,
    duration_ms: float,
    iterations: int,
    tree_depth: int,
    nodes_created: int,
    determinization_attempts: int,
    determinization_retries: int,
    determinization_success: bool,
    search_duration_ms: float,
    rollout_duration_ms: float,
    best_confidence: Optional[float] = None,
    alternative_moves: Optional[int] = None,
    win_rate_estimate: Optional[float] = None,
    status: str = "success",
    error_type: Optional[str] = None,
) -> None:
    REQUEST_DURATION_MS.labels(
        endpoint=endpoint, phase=phase, timeout_ms=str(timeout_ms)
    ).observe(duration_ms)
    SEARCH_DURATION_MS.labels(
        endpoint=endpoint, timeout_ms=str(timeout_ms)
    ).observe(search_duration_ms)
    ROLLOUT_DURATION_MS.labels(endpoint=endpoint).observe(rollout_duration_ms)
    ITERATIONS_PER_REQUEST.labels(
        endpoint=endpoint, timeout_ms=str(timeout_ms)
    ).observe(iterations)
    ITERATIONS_TOTAL.labels(endpoint=endpoint).inc(iterations)
    TREE_DEPTH_MAX.labels(endpoint=endpoint).observe(tree_depth)
    TREE_NODES_CREATED.labels(endpoint=endpoint).observe(nodes_created)

    REQUESTS_TOTAL.labels(endpoint=endpoint, status=status).inc()
    if error_type:
        ERRORS_TOTAL.labels(endpoint=endpoint, error_type=error_type).inc()
        if error_type == "timeout":
            TIMEOUT_ERRORS_TOTAL.labels(endpoint=endpoint).inc()
        if error_type == "validation":
            VALIDATION_ERRORS_TOTAL.labels(endpoint=endpoint).inc()

    if best_confidence is not None:
        BEST_MOVE_CONFIDENCE.labels(endpoint=endpoint).observe(best_confidence)
    if alternative_moves is not None:
        ALTERNATIVE_MOVES_EVALUATED.labels(endpoint=endpoint).observe(
            alternative_moves
        )
    if win_rate_estimate is not None:
        WIN_RATE_ESTIMATE.labels(endpoint=endpoint).observe(win_rate_estimate)

    CONCURRENT_REQUESTS.labels(endpoint=endpoint).dec()


def record_determinization(
    *,
    endpoint: str,
    duration_ms: float,
    attempts: int,
    retries: int,
    success: bool,
) -> None:
    DETERMINIZATION_DURATION_MS.labels(endpoint=endpoint).observe(duration_ms)
    DETERMINIZATION_ATTEMPTS_TOTAL.labels(endpoint=endpoint).inc(attempts)
    DETERMINIZATION_RETRIES.labels(endpoint=endpoint).observe(retries)
    DETERMINIZATION_SUCCESS_RATE.labels(endpoint=endpoint).set(1.0 if success else 0.0)


def record_error(endpoint: str, error_type: str) -> None:
    ERRORS_TOTAL.labels(endpoint=endpoint, error_type=error_type).inc()
    REQUESTS_TOTAL.labels(endpoint=endpoint, status="error").inc()
    if error_type == "timeout":
        TIMEOUT_ERRORS_TOTAL.labels(endpoint=endpoint).inc()
    if error_type == "validation":
        VALIDATION_ERRORS_TOTAL.labels(endpoint=endpoint).inc()


def structured_log(level: str, message: str, context: Optional[Dict[str, Any]] = None):
    logger = logging.getLogger(SERVICE_NAME)
    span = trace.get_current_span()
    span_ctx = span.get_span_context() if span else None
    trace_id = None
    span_id = None
    if span_ctx and span_ctx.is_valid:
        trace_id = format(span_ctx.trace_id, "032x")
        span_id = format(span_ctx.span_id, "016x")

    payload = {
        "service": SERVICE_NAME,
        "message": message,
        "trace_id": trace_id,
        "span_id": span_id,
        "context": context or {},
    }
    log_method = getattr(logger, level, logger.info)
    log_method(json.dumps(payload))
