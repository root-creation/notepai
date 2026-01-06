"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Check, X, Send, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export default function Home() {
  const [content, setContent] = useState("");
  const [ghostText, setGhostText] = useState("");
  const [isLoadingCompletion, setIsLoadingCompletion] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Quick edit state
  const [quickEditMode, setQuickEditMode] = useState(false);
  const [quickEditPrompt, setQuickEditPrompt] = useState("");
  const [quickEditSelection, setQuickEditSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [quickEditPosition, setQuickEditPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isLoadingQuickEdit, setIsLoadingQuickEdit] = useState(false);

  // Diff preview state
  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [proposedText, setProposedText] = useState("");
  const [diffContext, setDiffContext] = useState<{
    before: string;
    after: string;
  } | null>(null);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInput, setComposerInput] = useState("");
  const [composerMessages, setComposerMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
  }>>([]);
  const [isLoadingComposer, setIsLoadingComposer] = useState(false);
  const [composerContext, setComposerContext] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quickEditInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerMessagesRef = useRef<HTMLDivElement>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAttemptedCompletionRef = useRef(false);
  const requestIdRef = useRef(0);

  // Check if cursor is at the end of content
  const isCursorAtEnd = useCallback(() => {
    return cursorPosition >= content.length;
  }, [cursorPosition, content.length]);

  // Fetch autocomplete suggestion (only once per pause)
  const fetchCompletion = useCallback(async (text: string, position: number, requestId: number) => {
    // Skip if already attempted for this pause
    if (hasAttemptedCompletionRef.current) return;

    // Need at least 5 characters
    if (!text.trim() || text.trim().length < 5) {
      return;
    }

    // Mark that we've attempted completion for this pause
    hasAttemptedCompletionRef.current = true;
    setIsLoadingCompletion(true);

    try {
      const response = await fetch("/api/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.substring(0, position)
        }),
      });

      if (!response.ok) throw new Error("Autocomplete failed");
      const data = await response.json();

      // Only set ghost text if this is still the latest request
      if (requestId === requestIdRef.current && data.completion && data.completion.trim()) {
        setGhostText(data.completion);
      }
    } catch (error) {
      console.error("Autocomplete error:", error);
    } finally {
      setIsLoadingCompletion(false);
    }
  }, []);

  // Handle text change with debounced autocomplete
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const newPosition = e.target.selectionStart;

    setContent(newContent);
    setCursorPosition(newPosition);

    // Clear ghost text and reset attempt flag when user types
    setGhostText("");
    hasAttemptedCompletionRef.current = false;

    // Increment request ID to invalidate any pending requests
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    // Clear any pending timeout
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }

    // Only auto-trigger autocomplete if cursor is at the END of the content
    const isAtEnd = newPosition >= newContent.length;

    if (newContent.trim().length >= 5 && isAtEnd) {
      completionTimeoutRef.current = setTimeout(() => {
        fetchCompletion(newContent, newPosition, currentRequestId);
      }, 300);
    }
  }, [fetchCompletion]);

  // Accept the proposed changes (for quick edit)
  const acceptChanges = useCallback(() => {
    if (!diffContext || !proposedText) return;

    const newContent = diffContext.before + proposedText + diffContext.after;
    setContent(newContent);

    // Reset diff state
    setShowDiffPreview(false);
    setOriginalText("");
    setProposedText("");
    setDiffContext(null);
    setQuickEditSelection(null);

    // Focus textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = diffContext.before.length + proposedText.length;
        textareaRef.current.selectionStart = newPosition;
        textareaRef.current.selectionEnd = newPosition;
        textareaRef.current.focus();
      }
    }, 0);
  }, [diffContext, proposedText]);

  // Reject the proposed changes (for quick edit)
  const rejectChanges = useCallback(() => {
    setShowDiffPreview(false);
    setOriginalText("");
    setProposedText("");
    setDiffContext(null);
    setQuickEditSelection(null);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  // Handle composer submit
  const handleComposerSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!composerInput.trim() || isLoadingComposer) return;

    const userMessage = composerInput.trim();
    const contextToSend = composerContext;
    
    setComposerInput("");
    setComposerMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoadingComposer(true);

    try {
      const response = await fetch("/api/composer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          noteContent: content,
          history: composerMessages,
          selectedContext: contextToSend,
        }),
      });

      if (!response.ok) throw new Error("Composer request failed");
      const data = await response.json();

      setComposerMessages(prev => [...prev, { role: "assistant", content: data.response }]);

      // If the AI suggests content changes, apply them
      if (data.newContent !== undefined && data.newContent !== content) {
        setContent(data.newContent);
      }
    } catch (error) {
      console.error("Composer error:", error);
      setComposerMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setIsLoadingComposer(false);
    }
  };

  // Scroll to bottom of composer messages
  useEffect(() => {
    if (composerMessagesRef.current) {
      composerMessagesRef.current.scrollTop = composerMessagesRef.current.scrollHeight;
    }
  }, [composerMessages]);

  // Focus composer input when opened
  useEffect(() => {
    if (composerOpen) {
      setTimeout(() => {
        composerInputRef.current?.focus();
      }, 100);
    }
  }, [composerOpen]);

  // Calculate position for quick edit popup based on selection
  const getSelectionPosition = useCallback(() => {
    if (!textareaRef.current) return null;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    
    // Create a temporary element to measure text position
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    
    // Copy textarea styles to the div
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      width: ${textarea.clientWidth}px;
      font-family: ${style.fontFamily};
      font-size: ${style.fontSize};
      line-height: ${style.lineHeight};
      padding: ${style.padding};
      border: ${style.border};
      box-sizing: border-box;
    `;
    
    // Get text before cursor
    const textBeforeCursor = content.substring(0, start);
    
    // Create span to measure position
    const span = document.createElement('span');
    span.textContent = textBeforeCursor || '.';
    div.appendChild(span);
    
    const marker = document.createElement('span');
    marker.textContent = '|';
    div.appendChild(marker);
    
    document.body.appendChild(div);
    
    const textareaRect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    
    // Calculate position relative to viewport
    const relativeTop = markerRect.top - divRect.top;
    const relativeLeft = markerRect.left - divRect.left;
    
    const top = textareaRect.top + relativeTop - textarea.scrollTop;
    const left = textareaRect.left + relativeLeft;
    
    document.body.removeChild(div);
    
    return { top, left };
  }, [content]);

  // Handle keydown for Tab, Cmd+K, Cmd+I, and diff Accept/Reject
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key handling - only works when cursor is at end
    if (e.key === "Tab") {
      // Only handle Tab if cursor is at end
      if (!isCursorAtEnd()) return;

      e.preventDefault();

      // If ghost text exists, accept it
      if (ghostText) {
        const newContent = content + ghostText;
        setContent(newContent);
        setCursorPosition(newContent.length);
        setGhostText("");

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newContent.length;
            textareaRef.current.selectionEnd = newContent.length;
          }
        }, 0);
        return;
      }

      // If no ghost text, trigger fetch manually
      if (content.trim().length >= 5 && !isLoadingCompletion) {
        hasAttemptedCompletionRef.current = false;
        requestIdRef.current += 1;
        fetchCompletion(content, cursorPosition, requestIdRef.current);
      }
      return;
    }

    // Cmd+K or Ctrl+K for quick edit
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      const start = textareaRef.current?.selectionStart ?? 0;
      const end = textareaRef.current?.selectionEnd ?? 0;

      // Calculate position before setting state
      const position = getSelectionPosition();
      
      setQuickEditSelection({ start, end });
      setQuickEditPosition(position);
      setQuickEditMode(true);
      setGhostText("");

      setTimeout(() => {
        quickEditInputRef.current?.focus();
      }, 50);
      return;
    }

    // Escape to cancel
    if (e.key === "Escape") {
      if (composerOpen) {
        setComposerOpen(false);
        textareaRef.current?.focus();
      } else if (showDiffPreview) {
        rejectChanges();
      } else if (quickEditMode) {
        setQuickEditMode(false);
        setQuickEditPrompt("");
        setQuickEditSelection(null);
        setQuickEditPosition(null);
        textareaRef.current?.focus();
      } else if (ghostText) {
        setGhostText("");
      }
    }
  }, [ghostText, content, cursorPosition, quickEditMode, showDiffPreview, composerOpen, rejectChanges, isCursorAtEnd, fetchCompletion, isLoadingCompletion, getSelectionPosition]);

  // Global keyboard handler for diff preview and composer
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd+I to toggle composer from anywhere
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        
        // Capture selected text as context if textarea is focused
        if (textareaRef.current) {
          const start = textareaRef.current.selectionStart;
          const end = textareaRef.current.selectionEnd;
          if (start !== end) {
            const selectedText = content.substring(start, end);
            setComposerContext(selectedText);
          }
        }
        
        setComposerOpen(prev => !prev);
        setGhostText("");
        return;
      }

      if (showDiffPreview) {
        // Cmd+Enter to accept
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          acceptChanges();
          return;
        }

        // Cmd+Backspace to reject
        if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
          e.preventDefault();
          rejectChanges();
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          rejectChanges();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showDiffPreview, acceptChanges, rejectChanges, content]);

  // Handle quick edit submission
  const handleQuickEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditPrompt.trim() || !quickEditSelection || isLoadingQuickEdit) return;

    setIsLoadingQuickEdit(true);

    const selectedText = content.substring(quickEditSelection.start, quickEditSelection.end);
    const beforeText = content.substring(0, quickEditSelection.start);
    const afterText = content.substring(quickEditSelection.end);

    try {
      const response = await fetch("/api/quickedit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: quickEditPrompt,
          selectedText,
          beforeContext: beforeText.slice(-500),
          afterContext: afterText.slice(0, 500),
        }),
      });

      if (!response.ok) throw new Error("Quick edit failed");
      const data = await response.json();

      if (data.result) {
        // Store for diff preview
        setOriginalText(selectedText);
        setProposedText(data.result);
        setDiffContext({ before: beforeText, after: afterText });
        setShowDiffPreview(true);
        setQuickEditMode(false);
        setQuickEditPrompt("");
        setQuickEditPosition(null);
      }
    } catch (error) {
      console.error("Quick edit error:", error);
      setQuickEditMode(false);
      setQuickEditPrompt("");
      setQuickEditSelection(null);
      setQuickEditPosition(null);
    } finally {
      setIsLoadingQuickEdit(false);
    }
  };

  // Track cursor position
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart);
    }
  }, []);

  // Auto-focus textarea on page load
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white flex justify-center">
      {/* Loading indicator for autocomplete */}
      {isLoadingCompletion && (
        <div className="fixed top-4 right-4 z-50">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Quick Edit Input Popup - positioned above selection */}
      {quickEditMode && quickEditPosition && (
        <form
          onSubmit={handleQuickEditSubmit}
          className="fixed z-50 bg-white rounded-lg shadow-2xl border border-border p-3 w-[420px]"
          style={{
            top: Math.max(8, quickEditPosition.top - 110),
            left: Math.max(8, Math.min(quickEditPosition.left - 60, window.innerWidth - 440)),
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                ref={quickEditInputRef}
                type="text"
                value={quickEditPrompt}
                onChange={(e) => setQuickEditPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setQuickEditMode(false);
                    setQuickEditPrompt("");
                    setQuickEditSelection(null);
                    setQuickEditPosition(null);
                    textareaRef.current?.focus();
                  }
                }}
                onBlur={(e) => {
                  // Close popup when clicking outside, but not if clicking within the form
                  if (!e.currentTarget.closest('form')?.contains(e.relatedTarget as Node)) {
                    setTimeout(() => {
                      if (!quickEditInputRef.current?.matches(':focus')) {
                        setQuickEditMode(false);
                        setQuickEditPrompt("");
                        setQuickEditSelection(null);
                        setQuickEditPosition(null);
                        textareaRef.current?.focus();
                      }
                    }, 100);
                  }
                }}
                placeholder={quickEditSelection?.start === quickEditSelection?.end
                  ? "What do you want to write?"
                  : "How should I edit this?"}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary/30 font-sans"
                disabled={isLoadingQuickEdit}
                autoFocus
              />
            </div>
            {isLoadingQuickEdit && (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-sans">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↵</kbd> submit • <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Esc</kbd> cancel
          </div>
        </form>
      )}

      {/* Diff Preview Modal (for Quick Edit) */}
      {showDiffPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-2xl border border-border w-full max-w-2xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground font-sans">Review Changes</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={rejectChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-white border border-border rounded-md hover:bg-secondary/50 transition-colors font-sans cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Reject
                  <kbd className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs">⌘⌫</kbd>
                </button>
                <button
                  onClick={acceptChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors font-sans cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Accept
                  <kbd className="ml-1 px-1.5 py-0.5 bg-green-700 rounded text-xs">⌘↵</kbd>
                </button>
              </div>
            </div>

            {/* Diff Content */}
            <div className="max-h-[60vh] overflow-auto">
              {/* Old version */}
              {originalText && (
                <div className="border-b border-border">
                  <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                    <span className="text-xs font-medium text-red-700 font-sans">ORIGINAL</span>
                  </div>
                  <div className="p-4 bg-red-50/50">
                    <pre className="whitespace-pre-wrap font-[var(--font-handwriting)] text-lg text-red-900 leading-relaxed">
                      <span className="bg-red-200/60 decoration-red-400">{originalText}</span>
                    </pre>
                  </div>
                </div>
              )}

              {/* New version */}
              <div>
                <div className="px-4 py-2 bg-green-50 border-b border-green-100">
                  <span className="text-xs font-medium text-green-700 font-sans">
                    {originalText ? "PROPOSED" : "NEW CONTENT"}
                  </span>
                </div>
                <div className="p-4 bg-green-50/50">
                  <pre className="whitespace-pre-wrap font-[var(--font-handwriting)] text-lg text-green-900 leading-relaxed">
                    <span className="bg-green-200/60">{proposedText}</span>
                  </pre>
                </div>
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-border bg-secondary/20 text-xs text-muted-foreground font-sans text-center">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">⌘↵</kbd> to accept • <kbd className="px-1.5 py-0.5 bg-muted rounded">⌘⌫</kbd> or <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd> to reject
            </div>
          </div>
        </div>
      )}

      {/* Composer Sheet - slides from right */}
      <Sheet open={composerOpen} onOpenChange={(open) => {
        setComposerOpen(open);
        if (!open) {
          setComposerContext(null);
        }
      }} modal={false}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px] flex flex-col p-0 bg-[#FDF8E8] border-l border-[#E8DFC0]" hideOverlay hideCloseButton>
          {/* Input Area at Top */}
          <div className="p-4">
            <div className="border border-[#DDD4B5] rounded-lg bg-white overflow-hidden shadow-sm">
              {/* Context Chip - shown above textarea */}
              {composerContext && (
                <div className="px-3 pt-3 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#2D2A26] rounded-md">
                    <svg className="w-3.5 h-3.5 text-[#C4A969]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <span className="text-xs text-[#E8E0D0] font-medium font-sans">
                      Selection ({composerContext.split('\n').length} {composerContext.split('\n').length === 1 ? 'line' : 'lines'})
                    </span>
                    <button 
                      onClick={() => setComposerContext(null)}
                      className="ml-0.5 text-[#8B8378] hover:text-[#E8E0D0] transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              <textarea
                ref={composerInputRef}
                value={composerInput}
                onChange={(e) => setComposerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleComposerSubmit();
                  }
                }}
                placeholder="Plan, ask questions, or chat..."
                rows={3}
                className="w-full px-4 py-3 text-sm bg-transparent text-[#3D3425] placeholder:text-[#A89070] outline-none font-sans resize-none"
                disabled={isLoadingComposer}
              />
              <div className="px-3 py-2 flex items-center justify-between border-t border-[#EDE5D0]">
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#F5ECD3] text-[#6B5845] text-xs font-medium hover:bg-[#EDE5D0] transition-colors">
                    <Sparkles className="w-3 h-3" />
                    Agent
                  </button>
                  <span className="text-[#A89070] text-xs">GPT-4o</span>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    type="button"
                    onClick={handleComposerSubmit}
                    disabled={isLoadingComposer || !composerInput.trim()}
                    className="p-1.5 rounded hover:bg-[#F5ECD3] text-[#A89070] hover:text-[#6B5845] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={composerMessagesRef}
            className="flex-1 overflow-auto px-4 space-y-4"
          >
            {composerMessages.length === 0 && (
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#F5ECD3] flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-[#A89070]" />
                </div>
                <p className="text-[#6B5845] text-sm">Start a conversation</p>
                <p className="text-[#A89070] text-xs mt-1">Ask anything about your notes</p>
              </div>
            )}
            {composerMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm font-sans ${
                    msg.role === "user"
                      ? "bg-[#C4A969] text-white"
                      : "bg-white text-[#3D3425] border border-[#E8DFC0]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoadingComposer && (
              <div className="flex justify-start">
                <div className="bg-white text-[#6B5845] px-3 py-2 rounded-lg border border-[#E8DFC0]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#E8DFC0]">
            <div className="text-xs text-[#A89070] text-center">
              <kbd className="px-1.5 py-0.5 bg-[#F5ECD3] rounded text-[#6B5845]">↵</kbd> to send • <kbd className="px-1.5 py-0.5 bg-[#F5ECD3] rounded text-[#6B5845]">⌘I</kbd> to close
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Centered notepad */}
      <main className={`w-full max-w-4xl min-h-screen bg-notepad notepad-lines shadow-xl relative transition-all duration-300 ${composerOpen ? "mr-96" : ""}`}>
        {/* Editor container with ghost text overlay */}
        <div className="relative w-full min-h-screen">
          {/* Selection highlight layer - show when quick edit is open with selection */}
          {quickEditMode && quickEditSelection && quickEditSelection.start !== quickEditSelection.end && (
            <div
              className="absolute inset-0 p-8 pt-10 pointer-events-none font-[var(--font-handwriting)] text-xl leading-8 whitespace-pre-wrap break-words overflow-hidden z-5"
              style={{ lineHeight: "32px" }}
              aria-hidden="true"
            >
              <span className="invisible">{content.substring(0, quickEditSelection.start)}</span>
              <span className="bg-yellow-300/50 text-transparent">{content.substring(quickEditSelection.start, quickEditSelection.end)}</span>
              <span className="invisible">{content.substring(quickEditSelection.end)}</span>
            </div>
          )}

          {/* Ghost text layer - only show when cursor is at end */}
          {isCursorAtEnd() && ghostText && (
            <div
              className="absolute inset-0 p-8 pt-10 pointer-events-none font-[var(--font-handwriting)] text-xl leading-8 whitespace-pre-wrap break-words overflow-hidden"
              style={{ lineHeight: "32px" }}
              aria-hidden="true"
            >
              <span className="invisible">{content}</span>
              <span className="text-muted-foreground/40">{ghostText}</span>
            </div>
          )}

          {/* Main textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onClick={handleSelect}
            placeholder=""
            spellCheck={false}
            disabled={showDiffPreview}
            className="relative z-10 w-full min-h-screen p-8 pt-10 bg-transparent resize-none outline-none hide-scrollbar font-[var(--font-handwriting)] text-xl leading-8 text-foreground placeholder:text-muted-foreground/50 disabled:opacity-50"
            style={{
              lineHeight: "32px",
              caretColor: "#8B7355",
            }}
          />
        </div>

        {/* Keyboard shortcuts hint */}
        {!showDiffPreview && !quickEditMode && !composerOpen && (
          <div className="fixed bottom-4 right-4 text-xs text-muted-foreground/60 font-sans flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <span>autocomplete</span>
              <kbd className="px-1.5 py-0.5 bg-white/70 border border-border/50 rounded shadow-sm">Tab</kbd>
            </div>
            <div className="flex items-center gap-2">
              <span>quick edit</span>
              <div className="flex gap-0.5">
                <kbd className="px-1.5 py-0.5 bg-white/70 border border-border/50 rounded shadow-sm">Cmd</kbd>
                <kbd className="px-1.5 py-0.5 bg-white/70 border border-border/50 rounded shadow-sm">K</kbd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span>composer</span>
              <div className="flex gap-0.5">
                <kbd className="px-1.5 py-0.5 bg-white/70 border border-border/50 rounded shadow-sm">Cmd</kbd>
                <kbd className="px-1.5 py-0.5 bg-white/70 border border-border/50 rounded shadow-sm">I</kbd>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
