'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { useToast } from '@/components/Toast';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

interface TasksPanelProps {
  session: Session;
  currentUserId: string;
  isCoach: boolean;
}

export default function TasksPanel({ session, currentUserId, isCoach }: TasksPanelProps) {
  const { showToast } = useToast();
  const [taskTitle, setTaskTitle] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>(['', '', '', '', '']); // Exactly 5 subtasks
  const [isCreating, setIsCreating] = useState(false);
  const [existingTasks, setExistingTasks] = useState<CoachTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Fetch existing tasks for this session
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session: authSession } } = await supabase.auth.getSession();
        
        if (!authSession?.access_token) {
          setLoadingTasks(false);
          return;
        }

        const { data: tasks, error } = await supabase
          .from('coach_tasks')
          .select('*')
          .eq('user_id', session.user_id)
          .eq('coach_id', session.coach_id)
          .eq('source', 'session_room')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching tasks:', error);
        } else {
          setExistingTasks(tasks || []);
        }
      } catch (error) {
        console.error('Error fetching tasks:', error);
      } finally {
        setLoadingTasks(false);
      }
    };

    fetchTasks();
  }, [session.user_id, session.coach_id]);

  const updateSubtask = (index: number, value: string) => {
    const newSubtasks = [...subtasks];
    newSubtasks[index] = value;
    setSubtasks(newSubtasks);
  };

  const handleSubmit = async () => {
    // Only coaches can create tasks
    if (!isCoach) {
      showToast('Only coaches can create tasks', 'error');
      return;
    }

    if (!taskTitle.trim() || isCreating) {
      if (!taskTitle.trim()) {
        showToast('Task title is required', 'error');
      }
      return;
    }

    setIsCreating(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      
      if (!authSession?.access_token) {
        showToast('Session expired. Please refresh and try again.', 'error');
        setIsCreating(false);
        return;
      }

      // Filter empty subtasks
      const validSubtasks = subtasks.filter((s) => s.trim());

      // Insert into coach_tasks table with session_room source
      const { error } = await supabase.from('coach_tasks').insert({
        user_id: session.user_id,
        coach_id: session.coach_id,
        task_text: taskTitle.trim(),
        task_subtasks: validSubtasks.length > 0 ? validSubtasks : null,
        status: 'pending',
        completed_subtasks: [],
        source: 'session_room',
      });

      if (error) {
        console.error('Error creating task:', error);
        showToast('Failed to create task: ' + error.message, 'error');
        setIsCreating(false);
        return;
      }

      // Success
      showToast('Coach task created successfully!', 'success');
      setTaskTitle('');
      setSubtasks(['', '', '', '', '']);
      
      // Refresh tasks list
      const { data: tasks } = await supabase
        .from('coach_tasks')
        .select('*')
        .eq('user_id', session.user_id)
        .eq('coach_id', session.coach_id)
        .eq('source', 'session_room')
        .order('created_at', { ascending: false });
      if (tasks) setExistingTasks(tasks);
    } catch (error: any) {
      console.error('Error creating task:', error);
      showToast('Failed to create task: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4">
      <h2 className="text-lg font-semibold text-white mb-4">
        {isCoach ? 'Coach Tasks' : 'Coach Tasks (View Only)'}
      </h2>

      {/* Existing Tasks */}
      {loadingTasks ? (
        <div className="text-center text-white/60 text-sm py-4">Loading tasks...</div>
      ) : existingTasks.length > 0 ? (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-white/70">Assigned Tasks</h3>
          {existingTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3"
            >
              <p className="text-sm text-white font-medium mb-2">{task.task_text}</p>
              {task.task_subtasks && task.task_subtasks.length > 0 && (
                <ul className="space-y-1 pl-4">
                  {task.task_subtasks.map((subtask, idx) => (
                    <li key={idx} className="text-xs text-white/70 flex items-start gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      <span>{subtask}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-white/50 mt-2">
                Status: {task.status}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-white/60 text-sm py-4 mb-6">
          No coach tasks assigned yet
        </div>
      )}

      {/* Create Form - Only for coaches */}
      {isCoach && (
        <>
          <div className="border-t border-white/10 pt-4 mb-2">
            <h3 className="text-sm font-medium text-white/70 mb-3">Create New Coach Task</h3>
          </div>
          
          <div className="space-y-4">
        {/* Task Title */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Coach Task Title
          </label>
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Enter task title..."
            className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
          />
        </div>

        {/* Subtasks */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Subtasks
          </label>
          <div className="space-y-2">
            {subtasks.map((subtask, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-white/60 w-20 shrink-0">
                  Subtask {index + 1}:
                </span>
                <input
                  type="text"
                  value={subtask}
                  onChange={(e) => updateSubtask(index, e.target.value)}
                  placeholder={`Subtask ${index + 1}...`}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSubmit}
          disabled={!taskTitle.trim() || isCreating || !isCoach}
          className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white font-semibold transition-all active:scale-95 shadow-lg shadow-indigo-500/20 disabled:shadow-none"
        >
          {isCreating ? 'Creating...' : 'Save Coach Task'}
        </button>
          </div>
        </>
      )}
    </div>
  );
}
