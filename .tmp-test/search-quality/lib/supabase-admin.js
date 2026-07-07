"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
exports.getSupabaseAdminClient = getSupabaseAdminClient;
const supabase_js_1 = require("@supabase/supabase-js");
const ws_1 = __importDefault(require("next/dist/compiled/ws"));
const env_1 = require("./env");
let client = null;
function getSupabaseAdminClient() {
    if (!client) {
        client = (0, supabase_js_1.createClient)((0, env_1.requireSupabaseUrl)(), (0, env_1.requireSupabaseServiceRoleKey)(), {
            auth: { persistSession: false, autoRefreshToken: false },
            realtime: { transport: ws_1.default },
        });
    }
    return client;
}
exports.supabaseAdmin = new Proxy({}, {
    get(_target, prop, receiver) {
        return Reflect.get(getSupabaseAdminClient(), prop, receiver);
    },
});
