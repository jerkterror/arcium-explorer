type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(level: LogLevel, component: string, message: string, extra?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    component,
    msg: message,
  };
  if (extra) Object.assign(entry, extra);
  return JSON.stringify(entry);
}

export function createLogger(component: string) {
  return {
    debug(msg: string, extra?: Record<string, unknown>) {
      if (shouldLog("debug")) console.log(formatLog("debug", component, msg, extra));
    },
    info(msg: string, extra?: Record<string, unknown>) {
      if (shouldLog("info")) console.log(formatLog("info", component, msg, extra));
    },
    warn(msg: string, extra?: Record<string, unknown>) {
      if (shouldLog("warn")) console.warn(formatLog("warn", component, msg, extra));
    },
    error(msg: string, extra?: Record<string, unknown>) {
      if (shouldLog("error")) console.error(formatLog("error", component, msg, extra));
    },
  };
}
