export type KnowledgeBaseArticleStatus = "draft" | "published" | "archived";
export type KnowledgeBaseVisibility = "internal" | "public" | "both";
export type KnowledgeBaseArticle = {
  id:string; category_id:string|null; title:string; slug:string; excerpt:string|null; content:string;
  status:KnowledgeBaseArticleStatus; visibility:KnowledgeBaseVisibility; allowed_roles:string[];
  article_type:string; template_type:string|null; tags:string[]; is_featured:boolean; ai_approved:boolean;
  public_audience:string[]; helpful_count:number; not_helpful_count:number; view_count:number;
  published_at:string|null; created_by:string|null; updated_by:string|null; created_at:string; updated_at:string;
  knowledge_base_categories?: {id:string;name:string;slug:string;audience:string}|null;
};
export type KnowledgeBaseCategory={id:string;name:string;slug:string;description:string|null;icon:string|null;audience:"internal"|"public"|"both";sort_order:number;is_active:boolean;created_at:string;updated_at:string};
