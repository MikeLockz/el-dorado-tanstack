import type http from 'node:http';
import { diag, DiagConsoleLogger, DiagLogLevel, type Meter, type Tracer, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

let initialized = false;
let tracerInstance: Tracer | null = null;
let meterInstance: Meter | null = null;
let metricsHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>) | null = null;

function createResource() {
  const attributes = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'el-dorado-server',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? 'dev',
  });
  return defaultResource().merge(attributes);
}

function createSpanExporter() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (endpoint) {
    return new OTLPTraceExporter({ url: endpoint });
  }
  return new ConsoleSpanExporter();
}

export function initTelemetry() {
  if (initialized) {
    return { tracer: tracerInstance!, meter: meterInstance!, metricsHandler: metricsHandler! };
  }

  const diagLevel = process.env.OTEL_DEBUG ? DiagLogLevel.DEBUG : DiagLogLevel.ERROR;
  diag.setLogger(new DiagConsoleLogger(), diagLevel);

  const resource = createResource();

  const spanExporter = createSpanExporter();
  const spanProcessor =
    spanExporter instanceof ConsoleSpanExporter
      ? new SimpleSpanProcessor(spanExporter)
      : new BatchSpanProcessor(spanExporter);
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [spanProcessor],
  });
  tracerProvider.register();

  tracerInstance = trace.getTracer('el-dorado-server');

  const prometheusExporter = new PrometheusExporter({ preventServerStart: true });
  const meterProvider = new MeterProvider({ resource, readers: [prometheusExporter] });
  meterInstance = meterProvider.getMeter('el-dorado-server');
  metricsHandler = (req, res) => prometheusExporter.getMetricsRequestHandler(req, res);

  initialized = true;

  console.log('OpenTelemetry initialized');

  return { tracer: tracerInstance, meter: meterInstance, metricsHandler };
}

export function getTracer(): Tracer {
  if (!initialized) {
    initTelemetry();
  }
  return tracerInstance!;
}

export function getMeter(): Meter {
  if (!initialized) {
    initTelemetry();
  }
  return meterInstance!;
}

export function getMetricsHandler() {
  if (!initialized) {
    initTelemetry();
  }
  return metricsHandler!;
}
