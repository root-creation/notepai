"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Loader2, Check, X, Send, Sparkles, Plus, Clock, MoreHorizontal, ChevronDown, AtSign, Globe, Image, ArrowUp, Search, Pencil, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Types for chat history
interface ChatSession {
  id: string;
  title: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  createdAt: number;
  updatedAt: number;
}

// Generate unique ID
const generateId = () => `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Get chat title from first user message or default
const getChatTitle = (messages: Array<{ role: "user" | "assistant"; content: string }>) => {
  const firstUserMessage = messages.find(m => m.role === "user");
  if (firstUserMessage) {
    const title = firstUserMessage.content.slice(0, 40);
    return title.length < firstUserMessage.content.length ? `${title}...` : title;
  }
  return "New Chat";
};

// Format relative time
const formatRelativeTime = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
};

// Group chats by date
const groupChatsByDate = (chats: ChatSession[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const lastWeek = today - 7 * 86400000;

  const groups: { [key: string]: ChatSession[] } = {
    "Today": [],
    "Yesterday": [],
    "Last 7 Days": [],
    "Older": [],
  };

  chats.forEach(chat => {
    const chatDate = new Date(chat.updatedAt).setHours(0, 0, 0, 0);
    if (chatDate >= today) {
      groups["Today"].push(chat);
    } else if (chatDate >= yesterday) {
      groups["Yesterday"].push(chat);
    } else if (chatDate >= lastWeek) {
      groups["Last 7 Days"].push(chat);
    } else {
      groups["Older"].push(chat);
    }
  });

  return groups;
};

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

  // Chat history state
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quickEditInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerMessagesRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historySearchRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAttemptedCompletionRef = useRef(false);
  const requestIdRef = useRef(0);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("notepai_chat_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setChatHistory(parsed);
      } catch (e) {
        console.error("Failed to parse chat history:", e);
      }
    }
  }, []);

  // Save chat history to localStorage when it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem("notepai_chat_history", JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  // Save current chat when messages change
  useEffect(() => {
    if (composerMessages.length > 0) {
      const now = Date.now();
      
      if (currentChatId) {
        // Update existing chat
        setChatHistory(prev => prev.map(chat => 
          chat.id === currentChatId 
            ? { ...chat, messages: composerMessages, title: getChatTitle(composerMessages), updatedAt: now }
            : chat
        ));
      } else {
        // Create new chat
        const newChat: ChatSession = {
          id: generateId(),
          title: getChatTitle(composerMessages),
          messages: composerMessages,
          createdAt: now,
          updatedAt: now,
        };
        setChatHistory(prev => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
      }
    }
  }, [composerMessages, currentChatId]);

  // Filter and group chats
  const filteredChats = useMemo(() => {
    let chats = chatHistory;
    if (historySearch.trim()) {
      const search = historySearch.toLowerCase();
      chats = chats.filter(chat => 
        chat.title.toLowerCase().includes(search) ||
        chat.messages.some(m => m.content.toLowerCase().includes(search))
      );
    }
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [chatHistory, historySearch]);

  const groupedChats = useMemo(() => groupChatsByDate(filteredChats), [filteredChats]);

  // Close history dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
        setEditingChatId(null);
      }
    };
    if (historyOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [historyOpen]);

  // Close menu dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Focus search when history opens
  useEffect(() => {
    if (historyOpen) {
      setTimeout(() => historySearchRef.current?.focus(), 50);
    } else {
      setHistorySearch("");
    }
  }, [historyOpen]);

  // Focus edit input when editing
  useEffect(() => {
    if (editingChatId) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingChatId]);

  // Create new chat
  const handleNewChat = useCallback(() => {
    setComposerMessages([]);
    setCurrentChatId(null);
    setComposerInput("");
    setHistoryOpen(false);
    setTimeout(() => composerInputRef.current?.focus(), 100);
  }, []);

  // Load a chat from history
  const handleLoadChat = useCallback((chat: ChatSession) => {
    setComposerMessages(chat.messages);
    setCurrentChatId(chat.id);
    setHistoryOpen(false);
    setTimeout(() => composerInputRef.current?.focus(), 100);
  }, []);

  // Delete a chat
  const handleDeleteChat = useCallback((chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatHistory(prev => prev.filter(c => c.id !== chatId));
    if (currentChatId === chatId) {
      setComposerMessages([]);
      setCurrentChatId(null);
    }
  }, [currentChatId]);

  // Start editing a chat title
  const handleStartEdit = useCallback((chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  }, []);

  // Save edited title
  const handleSaveTitle = useCallback(() => {
    if (editingChatId && editingTitle.trim()) {
      setChatHistory(prev => prev.map(chat =>
        chat.id === editingChatId
          ? { ...chat, title: editingTitle.trim() }
          : chat
      ));
    }
    setEditingChatId(null);
    setEditingTitle("");
  }, [editingChatId, editingTitle]);

  // Get current chat title for display
  const currentChatTitle = useMemo(() => {
    if (currentChatId) {
      const chat = chatHistory.find(c => c.id === currentChatId);
      return chat?.title || "New Chat";
    }
    return "New Chat";
  }, [currentChatId, chatHistory]);

  // Close current chat
  const handleCloseChat = useCallback(() => {
    setComposerOpen(false);
    setMenuOpen(false);
  }, []);

  // Clear all chats from history
  const handleClearAllChats = useCallback(() => {
    setChatHistory([]);
    setComposerMessages([]);
    setCurrentChatId(null);
    localStorage.removeItem("notepai_chat_history");
    setMenuOpen(false);
  }, []);

  // Close other chats (keep only current)
  const handleCloseOtherChats = useCallback(() => {
    if (currentChatId) {
      setChatHistory(prev => prev.filter(c => c.id === currentChatId));
    }
    setMenuOpen(false);
  }, [currentChatId]);

  // Export transcript
  const handleExportTranscript = useCallback(() => {
    if (composerMessages.length === 0) {
      setMenuOpen(false);
      return;
    }
    
    const transcript = composerMessages
      .map(m => `${m.role === "user" ? "You" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    
    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${currentChatTitle.slice(0, 20)}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }, [composerMessages, currentChatTitle]);

  // Copy chat ID
  const handleCopyRequestId = useCallback(() => {
    if (currentChatId) {
      navigator.clipboard.writeText(currentChatId);
    }
    setMenuOpen(false);
  }, [currentChatId]);

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
      }, 150);
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
          setHistoryOpen(false);
          setMenuOpen(false);
        }
      }} modal={false}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px] flex flex-col p-0 bg-notepad border-l border-[#D4C47A] shadow-xl" hideOverlay hideCloseButton>
          {/* Header */}
          <div className="flex items-center justify-between h-[42px] bg-[#E8D5A3] border-b border-[#D4C47A]">
            {/* Tab */}
            <div className="flex items-center h-full">
              <div className="flex items-center gap-2 px-3 h-full bg-notepad border-r border-[#D4C47A]">
                <span className="text-[13px] text-[#2D2A1F] font-medium truncate max-w-[140px]">{currentChatTitle}</span>
                <button 
                  onClick={() => setComposerOpen(false)}
                  className="p-0.5 rounded hover:bg-[#F0E68C] text-[#8B7355] hover:text-[#2D2A1F] transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* Right icons with history dropdown */}
            <div className="flex items-center gap-0.5 pr-2 relative">
              <button 
                onClick={() => {
                  handleNewChat();
                  setMenuOpen(false);
                }}
                className="p-1.5 rounded hover:bg-[#F0E68C] text-[#8B7355] hover:text-[#2D2A1F] transition-colors cursor-pointer"
                title="New Chat"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  setHistoryOpen(!historyOpen);
                  setMenuOpen(false);
                }}
                className={`p-1.5 rounded transition-colors cursor-pointer ${historyOpen ? 'bg-[#F0E68C] text-[#2D2A1F]' : 'hover:bg-[#F0E68C] text-[#8B7355] hover:text-[#2D2A1F]'}`}
                title="History"
              >
                <Clock className="w-4 h-4" />
              </button>
              <button 
                onClick={() => {
                  setMenuOpen(!menuOpen);
                  setHistoryOpen(false);
                }}
                className={`p-1.5 rounded transition-colors cursor-pointer ${menuOpen ? 'bg-[#F0E68C] text-[#2D2A1F]' : 'hover:bg-[#F0E68C] text-[#8B7355] hover:text-[#2D2A1F]'}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {/* Menu Dropdown */}
              {menuOpen && (
                <div 
                  ref={menuRef}
                  className="absolute top-full right-0 mt-1 w-[200px] bg-[#FFF9C4] rounded-lg border border-[#D4C47A] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="py-1">
                    <button
                      onClick={handleCloseChat}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left"
                    >
                      <span>Close Chat</span>
                      <kbd className="text-xs text-[#8B7355] bg-[#E8D5A3] px-1.5 py-0.5 rounded">⌘W</kbd>
                    </button>
                    <button
                      onClick={handleClearAllChats}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left"
                    >
                      <span>Clear All Chats</span>
                    </button>
                    <button
                      onClick={handleCloseOtherChats}
                      disabled={!currentChatId || chatHistory.length <= 1}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span>Close Other Chats</span>
                    </button>
                    
                    <div className="h-px bg-[#E8D5A3] my-1" />
                    
                    <button
                      onClick={handleExportTranscript}
                      disabled={composerMessages.length === 0}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span>Export Transcript</span>
                    </button>
                    <button
                      onClick={handleCopyRequestId}
                      disabled={!currentChatId}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span>Copy Request ID</span>
                    </button>
                    
                    <div className="h-px bg-[#E8D5A3] my-1" />
                    
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#2D2A1F] hover:bg-[#F5EBB5] transition-colors text-left"
                    >
                      <span>Agent Settings</span>
                    </button>
                  </div>
                </div>
              )}

              {/* History Dropdown */}
              {historyOpen && (
                <div 
                  ref={historyRef}
                  className="absolute top-full right-0 mt-1 w-[320px] bg-[#FFF9C4] rounded-lg border border-[#D4C47A] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  {/* Search */}
                  <div className="p-2 border-b border-[#E8D5A3]">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8B7355]" />
                      <input
                        ref={historySearchRef}
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-white text-[#2D2A1F] placeholder:text-[#A89968] rounded-md border border-[#D4C47A] outline-none focus:border-[#8B7355] transition-colors"
                      />
                    </div>
                  </div>

                  {/* Chat list */}
                  <div className="max-h-[400px] overflow-auto">
                    {filteredChats.length === 0 ? (
                      <div className="p-4 text-center text-sm text-[#8B7355]">
                        {historySearch ? "No chats found" : "No chat history yet"}
                      </div>
                    ) : (
                      Object.entries(groupedChats).map(([group, chats]) => 
                        chats.length > 0 && (
                          <div key={group}>
                            <div className="px-3 py-1.5 text-xs font-medium text-[#8B7355] bg-[#F5EBB5] sticky top-0">
                              {group}
                            </div>
                            {chats.map((chat) => (
                              <div
                                key={chat.id}
                                onClick={() => handleLoadChat(chat)}
                                className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                                  currentChatId === chat.id 
                                    ? 'bg-[#F0E68C]' 
                                    : 'hover:bg-[#F5EBB5]'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-[#8B7355]">💬</span>
                                  {editingChatId === chat.id ? (
                                    <input
                                      ref={editInputRef}
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveTitle();
                                        if (e.key === "Escape") {
                                          setEditingChatId(null);
                                          setEditingTitle("");
                                        }
                                      }}
                                      onBlur={handleSaveTitle}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 text-sm bg-white text-[#2D2A1F] border border-[#8B7355] rounded px-1.5 py-0.5 outline-none"
                                    />
                                  ) : (
                                    <span className="text-sm text-[#2D2A1F] truncate flex-1">{chat.title}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {currentChatId === chat.id && !editingChatId && (
                                    <span className="text-xs text-[#8B7355] mr-1">Current</span>
                                  )}
                                  {!editingChatId && (
                                    <>
                                      <span className="text-xs text-[#A89968] group-hover:hidden">{formatRelativeTime(chat.updatedAt)}</span>
                                      <div className="hidden group-hover:flex items-center gap-0.5">
                                        <button
                                          onClick={(e) => handleStartEdit(chat, e)}
                                          className="p-1 rounded hover:bg-[#E8D5A3] text-[#8B7355] hover:text-[#2D2A1F] transition-colors"
                                          title="Rename"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={(e) => handleDeleteChat(chat.id, e)}
                                          className="p-1 rounded hover:bg-[#E8D5A3] text-[#8B7355] hover:text-[#C41E3A] transition-colors"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={composerMessagesRef}
            className="flex-1 overflow-auto px-4 py-4 space-y-3 hide-scrollbar"
          >
            {composerMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <div className="w-16 h-16 rounded-2xl bg-[#F5EBB5] flex items-center justify-center mb-4 border border-[#E8D5A3]">
                  <Sparkles className="w-7 h-7 text-[#8B7355]" />
                </div>
                <p className="text-[#2D2A1F] text-sm font-medium mb-1">How can I help?</p>
                <p className="text-[#6B6349] text-xs text-center max-w-[200px]">
                  Ask questions, brainstorm ideas, or get help with your notes
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-[260px]">
                  {["Summarize my notes", "Help me brainstorm", "Fix grammar & spelling"].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setComposerInput(suggestion)}
                      className="px-3 py-2 text-xs text-[#6B6349] bg-[#F5EBB5] hover:bg-[#F0E68C] border border-[#E8D5A3] hover:border-[#D4C47A] rounded-lg transition-all text-left cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {composerMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-200`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-md bg-[#8B7355] flex items-center justify-center mr-2 mt-0.5 flex-shrink-0 shadow-sm">
                    <Sparkles className="w-3 h-3 text-[#FFF9C4]" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 text-[13px] font-sans leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#8B7355] text-[#FFF9C4] rounded-2xl rounded-br-md shadow-md"
                      : "bg-[#F5EBB5] text-[#2D2A1F] rounded-2xl rounded-tl-md border border-[#E8D5A3]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoadingComposer && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="w-6 h-6 rounded-md bg-[#8B7355] flex items-center justify-center mr-2 mt-0.5 flex-shrink-0 shadow-sm">
                  <Sparkles className="w-3 h-3 text-[#FFF9C4]" />
                </div>
                <div className="bg-[#F5EBB5] text-[#6B6349] px-4 py-3 rounded-2xl rounded-tl-md border border-[#E8D5A3]">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-[#8B7355] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#8B7355] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#8B7355] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area at Bottom */}
          <div className="p-3 border-t border-[#E8D5A3] bg-[#F5EBB5]">
            {/* Context Chip */}
            {composerContext && (
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#8B7355] rounded-lg">
                  <svg className="w-3.5 h-3.5 text-[#FFF9C4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className="text-xs text-[#FFF9C4] font-medium">
                    {composerContext.split('\n').length} {composerContext.split('\n').length === 1 ? 'line' : 'lines'} selected
                  </span>
                  <button 
                    onClick={() => setComposerContext(null)}
                    className="ml-1 text-[#D4C47A] hover:text-[#FFF9C4] transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Input container with border */}
            <div className="bg-white rounded-xl border border-[#D4C47A] overflow-hidden shadow-sm focus-within:border-[#8B7355] focus-within:ring-1 focus-within:ring-[#8B7355]/20 transition-all">
              {/* Textarea */}
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
                placeholder="Ask anything..."
                rows={2}
                className="w-full px-3 py-3 text-sm bg-transparent text-[#2D2A1F] placeholder:text-[#A89968] outline-none font-sans resize-none"
                disabled={isLoadingComposer}
              />
              
              {/* Bottom toolbar row */}
              <div className="flex items-center justify-between px-2 py-1.5 border-t border-[#E8D5A3]/50">
                {/* Left side controls */}
                <div className="flex items-center gap-1">
                  {/* Agent button with dropdown */}
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#2D2A1F] bg-[#F5EBB5] hover:bg-[#F0E68C] rounded-full transition-colors cursor-pointer">
                    <span className="text-[#8B7355] font-semibold">∞</span>
                    <span>Agent</span>
                    <ChevronDown className="w-3 h-3 text-[#8B7355]" />
                  </button>
                  
                  {/* Model selector dropdown */}
                  <button className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#6B6349] hover:text-[#2D2A1F] hover:bg-[#F5EBB5] rounded-md transition-colors cursor-pointer">
                    <span>Opus 4.5</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  
                  {/* Speed indicator */}
                  <span className="px-1.5 py-0.5 text-xs text-[#8B7355]">1x</span>
                </div>
                
                {/* Right side icons */}
                <div className="flex items-center gap-0.5">
                  <button className="p-1.5 text-[#8B7355] hover:text-[#2D2A1F] hover:bg-[#F5EBB5] rounded-md transition-colors cursor-pointer">
                    <AtSign className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-[#8B7355] hover:text-[#2D2A1F] hover:bg-[#F5EBB5] rounded-md transition-colors cursor-pointer">
                    <Globe className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-[#8B7355] hover:text-[#2D2A1F] hover:bg-[#F5EBB5] rounded-md transition-colors cursor-pointer">
                    <Image className="w-4 h-4" />
                  </button>
                  
                  {/* Send button - circular */}
                  <button 
                    type="button"
                    onClick={handleComposerSubmit}
                    disabled={isLoadingComposer || !composerInput.trim()}
                    className="ml-1 p-1.5 rounded-full bg-[#8B7355] hover:bg-[#7A6448] text-[#FFF9C4] disabled:opacity-30 disabled:hover:bg-[#8B7355] transition-all cursor-pointer shadow-sm disabled:shadow-none"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        </SheetContent>
      </Sheet>

      {/* Centered notepad */}
      <main className={`w-full max-w-4xl min-h-screen bg-notepad notepad-lines shadow-xl relative transition-all duration-300 ${composerOpen ? "mr-[400px]" : ""}`}>
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
          <div className="fixed bottom-10 right-4 text-xs text-muted-foreground/60 font-sans flex flex-col items-end gap-1.5">
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

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-2 bg-white border-t border-gray-200 text-center text-xs text-gray-500 font-sans z-40">
        Built by{" "}
        <a
          href="https://github.com/onurkanbakirci"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-900 font-medium hover:underline cursor-pointer"
        >
          onurkanbakirci
        </a>
      </footer>
    </div>
  );
}
