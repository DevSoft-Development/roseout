import OpenAI from "openai";

export type CareerInterviewQuestion = {
  id: string;
  competency: string;
  question: string;
  follow_up: string;
  evidence_prompt: string;
};

type JobInput = {
  title?: string | null;
  summary?: string | null;
  overview?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
};

const DEFAULT_MODEL = "gpt-4o-mini";

function clean(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeQuestion(value: unknown, index: number): CareerInterviewQuestion | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const question = clean(row.question, 500);
  const competency = clean(row.competency, 120);
  if (!question || !competency) return null;
  return {
    id: `q${index + 1}`,
    competency,
    question,
    follow_up: clean(row.follow_up, 400),
    evidence_prompt: clean(row.evidence_prompt, 400) || "Record specific, job-related evidence from the candidate's answer.",
  };
}

function parseQuestions(content: string) {
  try {
    const parsed = JSON.parse(content);
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
    const questions = source.map(normalizeQuestion).filter(Boolean) as CareerInterviewQuestion[];
    return questions.length >= 5 ? questions.slice(0, 10) : null;
  } catch {
    return null;
  }
}

export function buildFallbackInterviewGuide(job: JobInput): CareerInterviewQuestion[] {
  const title = clean(job.title, 120) || "this role";
  return [
    { id: "q1", competency: "Role understanding", question: `What interests you about the ${title} role, and which parts of the work are you most prepared to take on?`, follow_up: "Ask for one concrete example that supports their answer.", evidence_prompt: "Capture evidence tied to the posted responsibilities." },
    { id: "q2", competency: "Relevant experience", question: "Tell me about a project or responsibility that is most similar to the work described in this role.", follow_up: "What was your specific contribution and what was the result?", evidence_prompt: "Record the candidate's specific actions and outcomes." },
    { id: "q3", competency: "Execution", question: "Describe how you organize your work when you have several priorities and limited time.", follow_up: "How do you decide what to do first and how do you communicate progress?", evidence_prompt: "Capture observable planning, prioritization, and follow-through evidence." },
    { id: "q4", competency: "Communication", question: "Give an example of a time you had to communicate an idea, update, or recommendation clearly to someone else.", follow_up: "How did you adjust your communication for that audience?", evidence_prompt: "Capture job-related communication evidence only." },
    { id: "q5", competency: "Problem solving", question: "Tell me about a time something did not go as planned. How did you identify the problem and what did you do next?", follow_up: "What would you do differently now?", evidence_prompt: "Record the reasoning, actions, and result." },
    { id: "q6", competency: "Learning agility", question: "Describe a time you had to learn a new tool, process, or subject quickly in order to complete your work.", follow_up: "How did you know you had learned enough to execute well?", evidence_prompt: "Capture evidence of learning and independent execution." },
    { id: "q7", competency: "Role requirements", question: "Which requirement in this role best matches your strengths, and where would you expect to need the most ramp-up time?", follow_up: "What would your plan be for closing that gap?", evidence_prompt: "Tie the answer directly to documented job requirements." },
    { id: "q8", competency: "Candidate questions", question: "What questions do you have about the role, team, expectations, or how success will be measured?", follow_up: "Clarify role expectations without requesting protected or prohibited information.", evidence_prompt: "Note substantive role-related questions or clarifications." },
  ];
}

export async function generateInterviewGuide(job: JobInput): Promise<{ source: "ai" | "fallback"; questions: CareerInterviewQuestion[] }> {
  const fallback = buildFallbackInterviewGuide(job);
  if (!process.env.OPENAI_API_KEY) return { source: "fallback", questions: fallback };

  const model = process.env.CAREERS_AI_MODEL || DEFAULT_MODEL;
  const prompt = `Create exactly 8 structured interview questions for this job. Return JSON only as {"questions":[{"competency":"...","question":"...","follow_up":"...","evidence_prompt":"..."}]}. Questions must be based only on documented job responsibilities and requirements, use the same core questions for all candidates for this role, and produce job-related evidence a human interviewer can evaluate. Never ask about salary history, criminal history, arrests, convictions, background checks, race, color, religion, sex, pregnancy, sexual orientation, gender identity, national origin, citizenship or immigration status, age, disability, medical information, genetic information, family status, caregiver status, marital status, height, weight, credit history, or accommodation details. Do not make or recommend an employment decision. Do not use culture fit.\nJob:${JSON.stringify({ title: clean(job.title,120), summary: clean(job.summary), overview: clean(job.overview), responsibilities: clean(job.responsibilities), requirements: clean(job.requirements) })}`;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Return valid JSON only. Generate structured, job-related interview questions. Do not include chain-of-thought." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1400,
      temperature: 0.25,
    });
    const questions = parseQuestions(completion.choices[0]?.message.content || "");
    return questions ? { source: "ai", questions } : { source: "fallback", questions: fallback };
  } catch {
    return { source: "fallback", questions: fallback };
  }
}
