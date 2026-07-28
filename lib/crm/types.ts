export const accountTypes = ["independent_business","multi_location_operator","hospitality_group","venue_group","partner","agency","vendor","internal","other"] as const;
export const lifecycleStages = ["prospect","engaged","qualified","claiming","onboarding","customer","expansion","renewal","churn_risk","churned","inactive"] as const;
export const taskStatuses = ["open","in_progress","blocked","completed","cancelled"] as const;
export type AccountType = typeof accountTypes[number];
export type LifecycleStage = typeof lifecycleStages[number];
export type TaskStatus = typeof taskStatuses[number];
export type CrmAccount = { id:string; name:string; legal_name:string|null; account_type:AccountType; lifecycle_stage:LifecycleStage; status:string; owner_user_id:string|null; health_status:string|null; next_action:string|null; next_action_at:string|null; last_activity_at:string|null; created_at:string };
export type CrmTask = { id:string; title:string; task_type:string; status:TaskStatus; priority:"low"|"normal"|"high"|"urgent"; account_id:string|null; location_id:string|null; assigned_to_user_id:string|null; due_at:string|null };

