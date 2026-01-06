import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { message, noteContent, history, selectedContext } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Build conversation history for context
    const conversationHistory = history
      ?.map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`)
      .join("\n") || "";

    // Build selected context section
    const selectedContextSection = selectedContext 
      ? `\n\nUser's selected text (they are likely asking about this):
"""
${selectedContext}
"""`
      : "";

    const { text: response } = await generateText({
      model: openai("gpt-4o-mini"),
      system: `You are a helpful AI assistant integrated into a notepad application called NotePAI.
You help users with their writing - you can answer questions, provide suggestions, help edit content, brainstorm ideas, and more.

Current note content:
"""
${noteContent || "(empty note)"}
"""${selectedContextSection}

Guidelines:
- Be concise and helpful
- If the user asks you to modify the note, describe what changes you'd make
- You can reference the current note content in your responses
- If the user has selected specific text, focus your response on that selection
- Keep responses focused and relevant
- Use the same language as the user`,
      prompt: conversationHistory 
        ? `Previous conversation:\n${conversationHistory}\n\nUser: ${message}\n\nAssistant:`
        : message,
      maxTokens: 1000,
      temperature: 0.7,
    });

    // Clean up response
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith("Assistant:")) {
      cleanedResponse = cleanedResponse.slice(10).trim();
    }

    return NextResponse.json({ response: cleanedResponse });
  } catch (error) {
    console.error("Composer API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

