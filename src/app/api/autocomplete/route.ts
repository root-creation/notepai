import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

// Use Edge runtime for faster cold starts and no timeout limits
export const runtime = "edge";

// Max context to send to AI (characters)
const MAX_CONTEXT = 1000;

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ completion: "" });
    }

    // Don't autocomplete if text is too short (at least 5 characters)
    if (text.trim().length < 5) {
      return NextResponse.json({ completion: "" });
    }

    // Limit context to last MAX_CONTEXT characters for efficiency
    const contextText = text.length > MAX_CONTEXT 
      ? text.slice(-MAX_CONTEXT) 
      : text;

    const { text: completion } = await generateText({
      model: openai("gpt-4o-mini"),
      system: `You are an autocomplete assistant. Your job is to predict what the user will type next.

RULES:
- Return ONLY the completion text (the words/characters that come AFTER what's written)
- Keep it short: just a few words or complete the current sentence
- Match the writing style and language
- If text ends mid-word, complete that word first
- If text ends mid-sentence, complete the sentence
- Return empty string "" if you can't predict meaningfully
- Never repeat what's already written
- Be context-aware`,
      prompt: `Continue this text naturally:\n\n${contextText}`,
      providerOptions: {
        openai: {
          maxTokens: 50,
        },
      },
      temperature: 0.3,
    });

    // Clean up the completion
    let cleanedCompletion = completion
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^\.\.\.\s*/, "")
      .replace(/^:\s*/, "");

    // If AI repeated the context, extract only the new part
    if (cleanedCompletion.startsWith(contextText.slice(-50))) {
      cleanedCompletion = cleanedCompletion.slice(contextText.slice(-50).length);
    }

    return NextResponse.json({ completion: cleanedCompletion.trim() });
  } catch (error) {
    console.error("Autocomplete API error:", error);
    return NextResponse.json({ completion: "" });
  }
}
