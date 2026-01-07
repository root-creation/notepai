import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

// Use Edge runtime for faster cold starts and no timeout limits
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { message, noteContent, history, selectedContext, mode = "agent" } = await request.json();

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

    // Different system prompts based on mode
    const agentSystemPrompt = `You are a helpful AI assistant integrated into a notepad application called NotePAI.
You are in AGENT MODE - you can actively edit and modify the user's notes.

Current note content:
"""
${noteContent || "(empty note)"}
"""${selectedContextSection}

Guidelines:
- Be concise and helpful
- When the user asks you to modify, edit, add, or change the note, YOU MUST respond with the FULL new content wrapped in <new_content> tags
- Example: If asked to fix grammar, respond with your message AND include <new_content>the corrected full note content here</new_content>
- The content inside <new_content> tags will replace the entire note
- You can reference the current note content in your responses
- If the user has selected specific text, focus your changes on that selection while preserving the rest
- Keep responses focused and relevant
- Use the same language as the user
- Only include <new_content> tags when actually making changes to the note`;

    const chatSystemPrompt = `You are a helpful AI assistant integrated into a notepad application called NotePAI.
You are in CHAT MODE - you can answer questions and have conversations, but you CANNOT edit the user's notes.

Current note content (for reference only):
"""
${noteContent || "(empty note)"}
"""${selectedContextSection}

Guidelines:
- Be concise and helpful
- Answer questions, provide information, help brainstorm ideas
- You can reference the current note content in your responses
- If the user asks you to edit or modify the note, politely explain that you're in Chat mode and suggest they switch to Agent mode to make edits
- Keep responses focused and relevant
- Use the same language as the user
- NEVER include <new_content> tags - you cannot edit in this mode`;

    const systemPrompt = mode === "agent" ? agentSystemPrompt : chatSystemPrompt;

    const { text: response } = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      prompt: conversationHistory 
        ? `Previous conversation:\n${conversationHistory}\n\nUser: ${message}\n\nAssistant:`
        : message,
      providerOptions: {
        openai: {
          maxTokens: 2000,
        },
      },
      temperature: 0.7,
    });

    // Clean up response
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith("Assistant:")) {
      cleanedResponse = cleanedResponse.slice(10).trim();
    }

    // Extract new content if in agent mode and content tags are present
    let newContent: string | undefined;
    if (mode === "agent") {
      const contentMatch = cleanedResponse.match(/<new_content>([\s\S]*?)<\/new_content>/);
      if (contentMatch) {
        newContent = contentMatch[1].trim();
        // Remove the tags from the response shown to user
        cleanedResponse = cleanedResponse.replace(/<new_content>[\s\S]*?<\/new_content>/, "").trim();
      }
    }

    return NextResponse.json({ 
      response: cleanedResponse,
      ...(newContent !== undefined && { newContent })
    });
  } catch (error) {
    console.error("Composer API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

