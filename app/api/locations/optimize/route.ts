import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      type,
      name,
      description,
      city,
      neighborhood,
      cuisine,
      activity_type,
      atmosphere,
      best_for,
      special_features,
      signature_items,
      primary_tag,
      date_style_tags,
      search_keywords,
    } = body;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 }
      );
    }

    const prompt = `
You are helping optimize a TheOutHaven location profile so it appears better in AI outing recommendations.

Location type: ${type}
Name: ${name}
City: ${city}
Neighborhood: ${neighborhood}
Cuisine: ${cuisine}
Activity type: ${activity_type}
Current description: ${description}
Atmosphere: ${atmosphere}
Best for: ${best_for}
Special features: ${special_features}
Signature items/highlights: ${signature_items}
Primary tag: ${primary_tag}
Date style tags: ${date_style_tags}
Search keywords: ${search_keywords}

Return ONLY valid JSON with this shape:
{
  "description": "short polished description under 20 words",
  "primary_tag": "one strong tag",
  "date_style_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "best_for": ["use case 1", "use case 2", "use case 3"],
  "special_features": ["feature 1", "feature 2", "feature 3"],
  "search_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"]
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You are a concise location profile optimization assistant for TheOutHaven. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No optimization returned." },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(content));
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Optimization failed." },
      { status: 500 }
    );
  }
}