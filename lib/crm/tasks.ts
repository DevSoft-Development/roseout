// Compatibility facade for Phase 1 imports. New code should import from `lib/crm/tasks` modules.
export * from "./tasks/index";
import {queryWorkQueue} from "./tasks/queries";
export const listWorkQueue=(userId:string,view:string)=>queryWorkQueue(userId,view).then(x=>x.tasks);
