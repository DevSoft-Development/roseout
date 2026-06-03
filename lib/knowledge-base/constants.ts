import type { KnowledgeBaseArticleType, KnowledgeBaseTemplateType, KnowledgeBaseVisibility } from "./types";

export const KB_PAGE_SIZE = 20;
export const kbStatuses = ["draft", "published", "archived"] as const;
export const kbVisibilities: KnowledgeBaseVisibility[] = ["internal", "public", "both"];
export const kbArticleTypes: KnowledgeBaseArticleType[] = ["article", "policy", "guide", "script", "checklist", "faq", "template"];
export const kbTemplateTypes: KnowledgeBaseTemplateType[] = ["sales_script", "email", "sms", "objection_response", "onboarding_checklist", "support_reply", "ambassador_script", "location_owner_guide", "user_help"];
export const internalKbRoles = ["superadmin", "admin", "editor", "viewer", "partner_ambassador", "experience_team"];
export const publicAudiences = ["user", "location_owner", "visitor"];
export const templateTypeLabels: Record<string, string> = {
  sales_script: "Sales Scripts",
  email: "Email Templates",
  sms: "SMS Templates",
  objection_response: "Objection Responses",
  onboarding_checklist: "Onboarding Checklists",
  support_reply: "Support Replies",
  ambassador_script: "Ambassador Scripts",
  location_owner_guide: "Location Owner Guides",
  user_help: "User Help",
};
