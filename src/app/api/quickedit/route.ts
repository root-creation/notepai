import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

// Use Edge runtime for faster cold starts and no timeout limits
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { instruction, selectedText, beforeContext, afterContext } = await request.json();

    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      );
    }

    const isGenerating = !selectedText || selectedText.trim() === "";
    
    let prompt: string;
    let systemPrompt: string;

    if (isGenerating) {
      // No text selected - generate new content
      systemPrompt = `You are a writing assistant integrated into a notepad. 
The user wants you to generate content at their cursor position.

Rules:
- Generate content based on the user's instruction
- Consider the surrounding context to maintain flow
- Match the existing writing style if there is context
- Only return the generated content, no explanations
- Keep the language consistent with the existing text
- NEVER wrap your response in quotes - return raw text only`;

      prompt = `Context before cursor:
${beforeContext || "(start of document)"}

Context after cursor:
${afterContext || "(end of document)"}

User instruction: ${instruction}

Generate the content (no quotes):`;
    } else {
      // Text selected - edit/transform it
      systemPrompt = `You are a writing assistant integrated into a notepad.
The user has selected some text and wants you to edit or transform it.

Rules:
- Transform the selected text according to the user's instruction
- Only return the transformed text, no explanations
- Maintain appropriate formatting
- If asked to fix, improve, or rewrite - do exactly that
- Keep the response in the same language as the input
- NEVER wrap your response in quotes - return raw text only`;

      prompt = `Context before selection:
${beforeContext || "(start of document)"}

Selected text to edit:
${selectedText}

Context after selection:
${afterContext || "(end of document)"}

User instruction: ${instruction}

Return the edited text (no quotes):`;
    }

    const { text: result } = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      prompt,
      providerOptions: {
        openai: {
          maxTokens: 2000,
        },
      },
      temperature: 0.4,
    });

    // Clean up result - remove surrounding quotes if present
    let cleanedResult = result.trim();
    if ((cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) ||
        (cleanedResult.startsWith("'") && cleanedResult.endsWith("'"))) {
      cleanedResult = cleanedResult.slice(1, -1);
    }

    return NextResponse.json({ result: cleanedResult });
  } catch (error) {
    console.error("Quick edit API error:", error);
    return NextResponse.json(
      { error: "Failed to process quick edit" },
      { status: 500 }
    );
  }
}

