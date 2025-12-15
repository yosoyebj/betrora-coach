export type Coach = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
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

