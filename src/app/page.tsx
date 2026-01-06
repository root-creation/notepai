"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Check, X } from "lucide-react";

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
  const [isLoadingQuickEdit, setIsLoadingQuickEdit] = useState(false);
  
  // Diff preview state
  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [proposedText, setProposedText] = useState("");
  const [diffContext, setDiffContext] = useState<{
    before: string;
    after: string;
  } | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quickEditInputRef = useRef<HTMLInputElement>(null);
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

  // Handle keydown for Tab, Cmd+K, and diff Accept/Reject
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
      
      setQuickEditSelection({ start, end });
      setQuickEditMode(true);
      setGhostText("");
      
      setTimeout(() => {
        quickEditInputRef.current?.focus();
      }, 50);
      return;
    }

    // Escape to cancel
    if (e.key === "Escape") {
      if (showDiffPreview) {
        rejectChanges();
      } else if (quickEditMode) {
        setQuickEditMode(false);
        setQuickEditPrompt("");
        setQuickEditSelection(null);
        textareaRef.current?.focus();
      } else if (ghostText) {
        setGhostText("");
      }
    }
  }, [ghostText, content, cursorPosition, quickEditMode, showDiffPreview, rejectChanges, isCursorAtEnd, fetchCompletion, isLoadingCompletion]);

  // Global keyboard handler for diff preview
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!showDiffPreview) return;

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
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showDiffPreview, acceptChanges, rejectChanges]);

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
      }
    } catch (error) {
      console.error("Quick edit error:", error);
      setQuickEditMode(false);
      setQuickEditPrompt("");
      setQuickEditSelection(null);
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

      {/* Quick Edit Input Modal */}
      {quickEditMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <form
            onSubmit={handleQuickEditSubmit}
            className="bg-white rounded-lg shadow-2xl border border-border p-4 w-full max-w-lg mx-4"
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
                      textareaRef.current?.focus();
                    }
                  }}
                  placeholder={quickEditSelection?.start === quickEditSelection?.end 
                    ? "What do you want to write?" 
                    : "How should I edit this?"}
                  className="w-full px-3 py-2 text-base bg-secondary/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary/30 font-sans"
                  disabled={isLoadingQuickEdit}
                  autoFocus
                />
              </div>
              {isLoadingQuickEdit && (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground font-sans">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd> to submit • <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Esc</kbd> to cancel
            </div>
          </form>
        </div>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-white border border-border rounded-md hover:bg-secondary/50 transition-colors font-sans"
                >
                  <X className="w-4 h-4" />
                  Reject
                  <kbd className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs">⌘⌫</kbd>
                </button>
                <button
                  onClick={acceptChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors font-sans"
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

      {/* Centered notepad */}
      <main className="w-full max-w-4xl min-h-screen bg-notepad notepad-lines shadow-xl relative">
        {/* Editor container with ghost text overlay */}
        <div className="relative w-full min-h-screen">
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
        {!showDiffPreview && !quickEditMode && (
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
          </div>
        )}
      </main>
    </div>
  );
}
