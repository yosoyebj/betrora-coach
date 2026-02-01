'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * ChatPanel Component
 * 
 * IMPORTANT: Chat messages are EPHEMERAL - they are NOT stored in the database.
 * Messages are only visible during the active session and are exchanged via
 * WebRTC data channel. Once the session ends or users disconnect, all chat
 * messages are lost. This is by design for privacy and simplicity.
 * 
 * If persistent chat history is needed in the future, a session_chat table
 * would need to be created and messages would need to be saved to the database
 * in addition to being sent via the data channel.
 */

interface Message {
  id: string;
  sender: 'local' | 'remote';
  text: string;
  timestamp: Date;
}

interface ChatPanelProps {
  sendMessage: (text: string) => void;
  messages: Message[];
}

export default function ChatPanel({ sendMessage, messages }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40 text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'local' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  message.sender === 'local'
                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40'
                    : 'bg-slate-800/50 text-white border border-slate-700/50'
                }`}
              >
                <p className="text-sm">{message.text}</p>
                <p className="text-[10px] opacity-60 mt-1">
                  {formatTime(message.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Always visible at bottom */}
      <div className="flex-shrink-0 border-t border-white/10 bg-slate-900/60 z-10">
        <form onSubmit={handleSubmit} className="p-3">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-5 py-2.5 rounded-lg bg-indigo-500 text-white font-semibold hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors text-sm whitespace-nowrap min-w-[70px] flex items-center justify-center"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
