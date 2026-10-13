import type {AssistAuthenticatedIdentity,AssistPrivilegedDatabase} from "./trusted-database-port";
import type {AssistRelayRuntime} from "./relay-session-controller";
import type {AuthenticatedSupportReader} from "./support-runtime-read-model";
export type AssistServerRuntime={
 identity:AssistAuthenticatedIdentity;
 database:AssistPrivilegedDatabase;
 relay:AssistRelayRuntime;
 reader:AuthenticatedSupportReader;
 featureEnabled:boolean;
};
/** Runtime injection point. Never expose database, identity or relay secrets to clients. */
export function requireEnabledAssistRuntime(runtime:AssistServerRuntime):AssistServerRuntime{
 if(!runtime.featureEnabled)throw new Error("remote_assist_disabled");
 return runtime;
}
