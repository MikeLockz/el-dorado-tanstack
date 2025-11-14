import { context as otelContext, trace } from '@opentelemetry/api';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  gameId?: string | null;
  playerId?: string | null;
  eventIndex?: number | null;
  context?: Record<string, unknown>;
  error?: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
const LEVEL_THRESHOLD = LEVEL_ORDER[LOG_LEVEL] ?? LEVEL_ORDER.info;

function serializeError(error: unknown) {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === 'object') {
    return error;
  }
  return { message: String(error) };
}

function mergeContexts(base: LogContext | undefined, override: LogContext | undefined) {
  if (!base) return override ?? {};
  if (!override) return base;
  const merged: LogContext = { ...base, ...override };
  merged.context = { ...(base.context ?? {}), ...(override.context ?? {}) };
  return merged;
}

class StructuredLogger {
  constructor(private readonly defaults: LogContext = {}) {}

  child(extra: LogContext = {}) {
    return new StructuredLogger(mergeContexts(this.defaults, extra));
  }

  debug(message: string, meta?: LogContext) {
    this.emit('debug', message, meta);
  }

  info(message: string, meta?: LogContext) {
    this.emit('info', message, meta);
  }

  warn(message: string, meta?: LogContext) {
    this.emit('warn', message, meta);
  }

  error(message: string, meta?: LogContext) {
    this.emit('error', message, meta);
  }

  private emit(level: LogLevel, message: string, meta?: LogContext) {
    if (LEVEL_ORDER[level] < LEVEL_THRESHOLD) {
      return;
    }

    const payload = mergeContexts(this.defaults, meta);

    const span = trace.getSpan(otelContext.active());
    const spanContext = span?.spanContext();

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      gameId: payload?.gameId ?? null,
      playerId: payload?.playerId ?? null,
      eventIndex: payload?.eventIndex ?? null,
      context: payload?.context ?? {},
      traceId: spanContext?.traceId ?? null,
      spanId: spanContext?.spanId ?? null,
      error: serializeError(payload?.error),
    };

    const serialized = JSON.stringify(logEntry);
    if (level === 'error' || level === 'warn') {
      process.stderr.write(`${serialized}\n`);
    } else {
      process.stdout.write(`${serialized}\n`);
    }
  }
}

export const logger = new StructuredLogger();
