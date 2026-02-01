'use client';

import { useState, useEffect } from 'react';
import ChatPanel from './ChatPanel';
import TasksPanel from './TasksPanel';

type Session = {
  id: string;
  user_id: string;
  coach_id: string;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string | null;
  status: string;
  coach?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
  user?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
};

interface Message {
  id: string;
  sender: 'local' | 'remote';
  text: string;
  timestamp: Date;
}

interface SidebarProps {
  activeTab: 'chat' | 'tasks';
  onTabChange: (tab: 'chat' | 'tasks') => void;
  session: Session;
  currentUserId: string;
  sendMessage: (text: string) => void;
  messages: Message[];
  isCoach: boolean;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  session,
  currentUserId,
  sendMessage,
  messages,
  isCoach,
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Tab Navigation */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => onTabChange('chat')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-slate-800/50 text-white border-b-2 border-indigo-500'
              : 'text-white/60 hover:text-white hover:bg-slate-800/30'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => onTabChange('tasks')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'tasks'
              ? 'bg-slate-800/50 text-white border-b-2 border-indigo-500'
              : 'text-white/60 hover:text-white hover:bg-slate-800/30'
          }`}
        >
          Tasks
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'chat' ? (
          <ChatPanel sendMessage={sendMessage} messages={messages} />
        ) : (
          <TasksPanel session={session} currentUserId={currentUserId} isCoach={isCoach} />
        )}
      </div>
    </div>
  );
}
