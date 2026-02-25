'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { useToast } from '@/components/Toast';

const POLL_INTERVAL_MS = 5000;

type CoachTask = {
  id: string;
  task_text: string;
  task_subtasks: string[] | null;
  status: string;
  completed_subtasks: number[];
  created_at: string;
};

type Session = {
  id: string;
  user_id: string;
  coach_id: string;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string | null;
  status: string;
  coach?: { id: string; full_name: string | null; email: string | null };
  user?: { id: string; full_name: string | null; email: string | null };
};

interface TasksPanelProps {
  session: Session;
  currentUserId: string;
  isCoach: boolean;
}

// ── Coach Task Card ───────────────────────────────────────────────────────────
function CoachTaskCard({
  task,
  index,
  isJustAdded,
  onEdit,
  onDelete,
  isDeleting,
}: {
  task: CoachTask;
  index: number;
  isJustAdded: boolean;
  onEdit: (task: CoachTask) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const isCompleted = task.status === 'completed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        boxShadow: isJustAdded
          ? [
              '0 8px 32px rgba(0,0,0,0.5)',
              '0 0 32px rgba(59,130,246,0.3), 0 8px 32px rgba(0,0,0,0.5)',
              '0 0 14px rgba(59,130,246,0.12), 0 8px 32px rgba(0,0,0,0.5)',
            ]
          : '0 8px 32px rgba(0,0,0,0.5)',
      }}
      exit={{ opacity: 0, scale: 0.96, y: -10 }}
      transition={{
        duration: 0.45,
        delay: isJustAdded ? 0 : index * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94],
        boxShadow: { duration: 2, ease: 'easeOut' },
      }}
      className="relative overflow-hidden rounded-[18px]"
      style={{
        background: 'linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(20,32,60,0.95) 100%)',
        border: isCompleted
          ? '1px solid rgba(59,130,246,0.3)'
          : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Breathing glow — active tasks only */}
      {!isCompleted && (
        <motion.div
          className="absolute inset-x-0 top-0 h-24 pointer-events-none"
          animate={{ opacity: [0, 0.1, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.5 }}
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, #3B82F6 0%, transparent 75%)',
            borderRadius: '18px 18px 0 0',
          }}
        />
      )}

      {/* Entry shimmer for just-added cards */}
      {isJustAdded && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-[18px]"
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.1 }}
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.12) 50%, transparent 100%)',
          }}
        />
      )}

      <div className="relative p-4 space-y-3">
        {/* Title row + action buttons */}
        <div className="flex items-start justify-between gap-3">
          <h3
            className="text-[15px] font-bold leading-snug tracking-tight flex-1"
            style={{ color: isCompleted ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.92)' }}
          >
            {task.task_text}
          </h3>

          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
            <motion.button
              whileHover={{ scale: 1.15, color: '#93C5FD' }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onEdit(task)}
              title="Edit"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.15, color: '#F87171' }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onDelete(task.id)}
              disabled={isDeleting}
              title="Delete"
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </motion.button>
          </div>
        </div>

        {/* Subtask steps */}
        {task.task_subtasks && task.task_subtasks.length > 0 && (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-1.5 pl-1"
          >
            {task.task_subtasks.map((sub, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-xs mt-0.5 shrink-0" style={{ color: '#3B82F6' }}>›</span>
                <span className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {sub}
                </span>
              </li>
            ))}
          </motion.ul>
        )}

        {/* Thin progress bar */}
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <motion.div
            className="h-full rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: isCompleted ? '100%' : '0%' }}
            transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              background: 'linear-gradient(90deg, #3B82F6, #6366F1)',
              boxShadow: isCompleted ? '0 0 10px rgba(59,130,246,0.5)' : 'none',
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ── Inline Edit Form ──────────────────────────────────────────────────────────
function InlineEditForm({
  task,
  onSave,
  onCancel,
  isSaving,
}: {
  task: CoachTask;
  onSave: (id: string, title: string, subtasks: string[]) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [title, setTitle] = useState(task.task_text);
  const [subs, setSubs] = useState<string[]>(
    Array.from({ length: 5 }, (_, i) => task.task_subtasks?.[i] ?? '')
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-[18px] p-4 space-y-3"
      style={{
        background: 'linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(20,32,60,0.95) 100%)',
        border: '1px solid rgba(59,130,246,0.25)',
        boxShadow: '0 0 24px rgba(59,130,246,0.08), 0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-blue-400/50">
        Editing
      </p>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl text-sm font-bold text-white placeholder:text-white/20 outline-none focus:ring-1 focus:ring-blue-500/30"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        placeholder="Task title..."
        autoFocus
      />
      <div className="space-y-2">
        {subs.map((sub, idx) => (
          <div key={idx} className="flex items-center gap-2.5">
            <span className="text-[10px] text-white/25 w-14 shrink-0">Step {idx + 1}</span>
            <input
              type="text"
              value={sub}
              onChange={(e) => { const n = [...subs]; n[idx] = e.target.value; setSubs(n); }}
              placeholder={`Step ${idx + 1}...`}
              className="flex-1 px-3 py-2 rounded-lg text-xs text-white placeholder:text-white/20 outline-none focus:ring-1 focus:ring-blue-500/20"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: '0 0 16px rgba(59,130,246,0.25)' }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSave(task.id, title, subs)}
          disabled={!title.trim() || isSaving}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold tracking-wide disabled:opacity-30"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))',
            border: '1px solid rgba(59,130,246,0.3)',
            color: '#93C5FD',
          }}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
        >
          Cancel
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Main Coach Panel ──────────────────────────────────────────────────────────
export default function TasksPanel({ session, currentUserId, isCoach }: TasksPanelProps) {
  const { showToast } = useToast();

  const [existingTasks, setExistingTasks] = useState<CoachTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>(['', '', '', '', '']);
  const [isCreating, setIsCreating] = useState(false);

  const [editingTask, setEditingTask] = useState<CoachTask | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async (isInitial = false) => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) { if (isInitial) setLoadingTasks(false); return; }

      const res = await fetch(
        `/api/coach-tasks?user_id=${session.user_id}&coach_id=${session.coach_id}`,
        { headers: { Authorization: `Bearer ${authSession.access_token}` } }
      );
      if (res.ok) {
        const body = await res.json();
        setExistingTasks(body.tasks ?? []);
      } else {
        const body = await res.json().catch(() => ({}));
        console.error('[TasksPanel] fetchTasks error:', res.status, body);
      }
    } catch (err) {
      console.error('[TasksPanel] fetchTasks unexpected error:', err);
    } finally {
      if (isInitial) setLoadingTasks(false);
    }
  }, [session.user_id, session.coach_id]);

  useEffect(() => {
    fetchTasks(true);
    intervalRef.current = setInterval(() => fetchTasks(), POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchTasks]);

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!isCoach || !taskTitle.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) { showToast('Session expired', 'error'); return; }

      const validSubs = subtasks.filter((s) => s.trim());
      const res = await fetch('/api/coach-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
        body: JSON.stringify({
          session_id: session.id,
          user_id: session.user_id,
          coach_id: session.coach_id,
          task_text: taskTitle.trim(),
          task_subtasks: validSubs.length > 0 ? validSubs : null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast('Failed: ' + (body.error || res.status), 'error');
        return;
      }

      const { task: newTask } = await res.json();
      const task: CoachTask = newTask ?? {
        id: `temp-${Date.now()}`,
        task_text: taskTitle.trim(),
        task_subtasks: validSubs.length > 0 ? validSubs : null,
        status: 'pending',
        completed_subtasks: [],
        created_at: new Date().toISOString(),
      };

      setExistingTasks((prev) => [task, ...prev]);
      setJustAddedId(task.id);
      setTimeout(() => setJustAddedId(null), 3000);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setTaskTitle('');
      setSubtasks(['', '', '', '', '']);
      fetchTasks();
    } catch (err: any) {
      showToast('Failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleSaveEdit = async (id: string, title: string, editSubs: string[]) => {
    if (!title.trim()) return;
    setIsSavingEdit(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) { showToast('Session expired', 'error'); return; }

      const valid = editSubs.filter((s) => s.trim());
      const res = await fetch('/api/coach-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
        body: JSON.stringify({ id, task_text: title.trim(), task_subtasks: valid.length > 0 ? valid : [] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast('Failed: ' + (body.error || res.status), 'error');
        return;
      }
      setEditingTask(null);
      await fetchTasks();
    } catch (err: any) {
      showToast('Failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    setDeletingId(id);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) { showToast('Session expired', 'error'); return; }

      const res = await fetch(`/api/coach-tasks?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast('Failed: ' + (body.error || res.status), 'error');
        return;
      }
      if (editingTask?.id === id) setEditingTask(null);
      await fetchTasks();
    } catch (err: any) {
      showToast('Failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={scrollRef}
      className="flex flex-col h-full overflow-y-auto"
      style={{ background: '#0B1220', padding: '20px 16px' }}
    >
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-[12px] font-semibold tracking-[0.18em] uppercase text-white/30 mb-3">
          Tasks
        </h2>
        <div
          className="h-px w-full"
          style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.4) 0%, transparent 70%)' }}
        />
      </div>

      {/* Task list */}
      {loadingTasks ? (
        <motion.div
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-sm text-white/25 text-center py-10"
        >
          Loading...
        </motion.div>
      ) : (
        <motion.div layout className="space-y-3 flex-1">
          <AnimatePresence initial={false}>
            {existingTasks.map((task, idx) =>
              editingTask?.id === task.id ? (
                <InlineEditForm
                  key={`edit-${task.id}`}
                  task={editingTask}
                  onSave={handleSaveEdit}
                  onCancel={() => setEditingTask(null)}
                  isSaving={isSavingEdit}
                />
              ) : (
                <CoachTaskCard
                  key={task.id}
                  task={task}
                  index={idx}
                  isJustAdded={justAddedId === task.id}
                  onEdit={setEditingTask}
                  onDelete={handleDelete}
                  isDeleting={deletingId === task.id}
                />
              )
            )}
          </AnimatePresence>

          {existingTasks.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-center justify-center gap-3 py-10"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.15)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </motion.div>
              <p className="text-xs text-white/20 text-center">No tasks yet</p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Add Task form — coaches only */}
      {isCoach && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mt-6 pt-5 space-y-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/25">
            Add Task
          </p>

          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleCreate(); }}
            placeholder="Task title..."
            className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white placeholder:text-white/20 outline-none focus:ring-1 focus:ring-blue-500/30 transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          />

          <div className="space-y-2">
            {subtasks.map((sub, idx) => (
              <div key={idx} className="flex items-center gap-2.5">
                <span className="text-[10px] text-white/22 w-14 shrink-0">Step {idx + 1}</span>
                <input
                  type="text"
                  value={sub}
                  onChange={(e) => {
                    const next = [...subtasks];
                    next[idx] = e.target.value;
                    setSubtasks(next);
                  }}
                  placeholder={`Step ${idx + 1}...`}
                  className="flex-1 px-3 py-2 rounded-lg text-xs text-white placeholder:text-white/18 outline-none focus:ring-1 focus:ring-blue-500/20 transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                />
              </div>
            ))}
          </div>

          <motion.button
            onClick={handleCreate}
            disabled={!taskTitle.trim() || isCreating}
            whileHover={taskTitle.trim() ? {
              scale: 1.02,
              boxShadow: '0 0 22px rgba(59,130,246,0.28)',
            } : {}}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all disabled:opacity-25"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.18) 100%)',
              border: '1px solid rgba(59,130,246,0.28)',
              color: '#93C5FD',
            }}
          >
            {isCreating ? (
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                Saving...
              </motion.span>
            ) : 'Save Task'}
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
