"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { getBearerToken } from "@/lib/api/clientAuth";
import { MessageSquare, Send, Loader2 } from "lucide-react";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

interface BacktestAnalysisChatProps {
  backtestId: string;
  backtest: any;
}

const SUGGESTED_QUESTIONS = [
  "Analyze my losing trades",
  "How can I improve my win rate?",
  "Which trades had the best setups?",
  "Should I adjust my SL or TP?",
  "What patterns led to losses?",
];

export function BacktestAnalysisChat({ backtestId, backtest }: BacktestAnalysisChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load chat history on mount
  useEffect(() => {
    if (historyLoaded) return;
    const loadHistory = async () => {
      try {
        const bearer = await getBearerToken();
        if (!bearer) return;
        const res = await fetch(`/api/backtest/${backtestId}/chat`, {
          headers: { Authorization: bearer },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch {}
      setHistoryLoaded(true);
    };
    loadHistory();
  }, [historyLoaded, backtestId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Not authenticated");

      const res = await fetch(`/api/backtest/${backtestId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: bearer,
        },
        body: JSON.stringify({ message: text.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send message");
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-[calc(100vh-9rem)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Strategy Analysis
        </h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="py-4">
            <p className="text-xs text-gray-500 text-center mb-3">
              AI has full context of your trades, candles, and strategy config.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-50 text-gray-800 border border-gray-200"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-500">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center">
            <p className="text-xs text-red-500 bg-red-50 inline-block px-3 py-1.5 rounded">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 px-3 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your trades..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            size="sm"
            className="bg-gray-900 hover:bg-gray-800 text-white px-3 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
