"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanEnvValue = cleanEnvValue;
exports.getOptionalEnv = getOptionalEnv;
exports.requireServerEnv = requireServerEnv;
exports.requirePublicEnv = requirePublicEnv;
exports.requireSupabaseUrl = requireSupabaseUrl;
exports.requireSupabaseServiceRoleKey = requireSupabaseServiceRoleKey;
exports.requireAnyServerEnv = requireAnyServerEnv;
require("server-only");
function cleanEnvValue(value) {
    const cleaned = value?.trim().replace(/^["']|["']$/g, "");
    return cleaned || undefined;
}
function getOptionalEnv(name) {
    return cleanEnvValue(process.env[String(name)]);
}
function requireServerEnv(name) {
    const value = getOptionalEnv(name);
    if (!value) {
        throw new Error(`Missing required server environment variable: ${String(name)}. Configure it in Vercel/Supabase runtime environment variables; do not hardcode secrets.`);
    }
    return value;
}
function requirePublicEnv(name) {
    return requireServerEnv(name);
}
function requireSupabaseUrl() {
    const url = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
    try {
        const parsed = new URL(url);
        if (!parsed.protocol.startsWith("http"))
            throw new Error();
    }
    catch {
        throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL. Expected a full URL like https://xxxx.supabase.co.");
    }
    return url;
}
function requireSupabaseServiceRoleKey() {
    return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
}
function requireAnyServerEnv(names) {
    for (const name of names) {
        const value = getOptionalEnv(name);
        if (value)
            return value;
    }
    throw new Error(`Missing one of required server environment variables: ${names.join(", ")}.`);
}
