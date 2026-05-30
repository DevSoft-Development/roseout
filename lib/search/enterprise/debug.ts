export function isDevDebug() { return process.env.NODE_ENV !== "production"; }
export function productionSafeDebug(debug: Record<string, unknown>) { return isDevDebug() ? debug : { search_system: "enterprise-search-v1", renderMode: debug.renderMode, timingMs: debug.timingMs }; }
