export type Coach = {
  id: string;
  user_id: string | null; // Optional - coaches are independent from users
  email: string | null; // Coach email - independent from users table
  full_name: string | null; // Coach name - independent from users table
  password: string | null; // Coach password - stored in coaches table
  avatar_url: string | null;
  timezone: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  bio: string | null;
  experience_years: number | null;
  industry_focus: string[] | null;
  status: string | null;
  availability_note: string | null;
  calendar_link: string | null;
  client_limit: number | null;
  current_clients: number | null;
  rating: number | null;
  onboarded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CoachAvailability = {
  id: string;
  coach_id: string;
  day_of_week: number;
  start_time_minutes: number;
  end_time_minutes: number;
  timezone: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CoachMessage = {
  id: string;
  user_id: string;
  coach_id: string;
  message: string;
  status: "pending" | "read" | "replied";
  created_at: string;
  updated_at: string | null;
};

export type User = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean | null;
  created_at: string | null;
};

export type CoachTask = {
  id: string;
  user_id: string;
  coach_id: string;
  task_text: string;
  task_subtasks: string[] | null;
  status: "pending" | "active" | "completed" | "skipped";
  completed_subtasks: number[] | null;
  notes: string | null;
  coach_feedback: string | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  priority: number | null;
};
export type CoachNote = {
  id: string;
  user_id: string;
  coach_id: string;
  note: string;
  created_at: string;
  updated_at: string;
};export type CoachSessionStatus =
  | "scheduled"
  | "rescheduled"
  | "pending_approval"
  | "completed"
  | "cancelled"
  | "no_show";export type CoachSessionUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};export type CoachSession = {
  id: string;
  user_id: string;
  coach_id: string;
  subscription_id: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  timezone: string | null;
  status: CoachSessionStatus;
  meeting_link: string | null;
  meeting_id: string | null;
  meeting_password: string | null;
  coach_notes: string | null;
  user_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  pending_approval_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  user?: CoachSessionUser | null;
};