export type KnowledgeBaseArticleStatus = "draft" | "published" | "archived";
export type KnowledgeBaseVisibility = "internal" | "public" | "both";
export type KnowledgeBaseArticleType = "article" | "policy" | "guide" | "script" | "checklist" | "faq" | "template";
export type KnowledgeBaseTemplateType =
  | "sales_script"
  | "email"
  | "sms"
  | "objection_response"
  | "onboarding_checklist"
  | "support_reply"
  | "ambassador_script"
  | "location_owner_guide"
  | "user_help";
export type KnowledgeBaseAudienceRole =
  | "superadmin"
  | "admin"
  | "editor"
  | "viewer"
  | "partner_ambassador"
  | "experience_team"
  | "owner"
  | "user";

export type KnowledgeBaseCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  audience: "internal" | "public" | "both";
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeBaseArticle = {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  search_text?: string | null;
  status: KnowledgeBaseArticleStatus;
  visibility: KnowledgeBaseVisibility;
  allowed_roles: string[];
  article_type: KnowledgeBaseArticleType;
  template_type: KnowledgeBaseTemplateType | null;
  tags: string[];
  is_featured: boolean;
  ai_approved: boolean;
  public_audience: string[];
  helpful_count: number;
  not_helpful_count: number;
  view_count: number;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  knowledge_base_categories?: Pick<KnowledgeBaseCategory, "id" | "name" | "slug" | "audience"> | null;
};

export type KnowledgeBaseArticleSummary = Omit<KnowledgeBaseArticle, "content" | "search_text"> & {
  content?: string;
};

export type KnowledgeBaseTemplateVariable = {
  id: string;
  article_id: string;
  variable_key: string;
  label: string;
  placeholder: string | null;
  is_required: boolean;
  sort_order: number;
};
