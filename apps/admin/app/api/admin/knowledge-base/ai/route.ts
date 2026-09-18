import { NextRequest } from "next/server";
import OpenAI from "openai";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { filterArticleForRole } from "@/lib/knowledge-base/server";
import { roleCanUseKbAi } from "@/lib/knowledge-base/access";
import type { KnowledgeBaseArticle } from "@/lib/knowledge-base/types";

function fallback(question:string,articles:KnowledgeBaseArticle[]){
  if(!articles.length)return "I could not find that in the approved knowledge base.";
  return `I found approved knowledge base articles related to “${question}”.\n${articles.slice(0,3).map(a=>`• ${a.title}: ${a.excerpt||a.content.slice(0,220)}`).join("\n")}`;
}

export async function POST(request:NextRequest){
  const auth=await requireAdminApiRole(["superadmin","admin","editor","reviewer","ambassador","experience_team","partner_ambassador","marketing_intern","marketing_specialist","marketing_manager","viewer"]);
  if(auth.error)return auth.error;
  if(!roleCanUseKbAi(auth.adminUser!.role))return Response.json({error:"Forbidden"},{status:403});
  const body=await request.json();
  const question=String(body.question||"").trim();
  if(question.length<3)return Response.json({error:"Question is required"},{status:400});
  const safe=question.replace(/[%_,]/g,"").slice(0,160);
  const db=getAdminDatabaseClient();
  const{data}=await db.from("knowledge_base_articles").select("*, knowledge_base_categories(id,name,slug)").eq("status","published").eq("ai_approved",true).or(`title.ilike.%${safe}%,excerpt.ilike.%${safe}%,content.ilike.%${safe}%`).limit(6);
  const articles=((data??[])as KnowledgeBaseArticle[]).filter(a=>filterArticleForRole(a,auth.adminUser!.role,auth.adminUser!.user_id,false));
  let answer=fallback(question,articles);
  let status:"answered"|"no_answer"|"error"=articles.length?"answered":"no_answer";
  if(process.env.OPENAI_API_KEY&&articles.length){
    try{
      const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
      const context=articles.map((a,i)=>`SOURCE ${i+1}: ${a.title}\n${a.content}`).join("\n\n---\n\n");
      const response=await client.chat.completions.create({model:process.env.OPENAI_MODEL||"gpt-4o-mini",messages:[
        {role:"system",content:"Answer only from the provided approved TheOutHaven knowledge base sources. If the answer is not explicitly in the sources, say: I could not find that in the approved knowledge base. Cite source article titles used."},
        {role:"user",content:`Question: ${question}\n\nApproved sources:\n${context}`}
      ],temperature:0.2});
      answer=response.choices[0]?.message.content?.trim()||answer;
      if(answer.includes("I could not find that"))status="no_answer";
    }catch{status="error"}
  }
  await db.from("knowledge_base_ai_questions").insert({user_id:auth.adminUser!.user_id,question,answer,source_article_ids:articles.map(a=>a.id),status});
  return Response.json({success:true,answer,status,sources:articles.map(a=>({id:a.id,title:a.title,slug:a.slug,excerpt:a.excerpt}))});
}
