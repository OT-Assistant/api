// Base Models
export interface User {
  id: string; // Internal ID
  clerk_user_id: string;
  role: 'therapist' | 'client' | 'admin';
  name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  therapist_user_id: string;
  client_user_id: string;
  display_name: string;
  status: 'active' | 'inactive' | 'invited';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Intake {
  id: string;
  client_id: string;
  goals_json: string; // JSON string of goals
  daily_challenges: string | null;
  age_range: string | null;
  available_equipment: string | null;
  session_length_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  client_id: string;
  created_by_user_id: string;
  source: 'ai' | 'manual';
  title: string;
  summary: string | null;
  status: 'active' | 'archived' | 'draft';
  created_at: string;
  updated_at: string;
}

export interface PlanActivity {
  id: string;
  plan_id: string;
  title: string;
  instructions: string;
  frequency: string;
  duration_minutes: number;
  sort_order: number;
}

export interface ActivityCompletion {
  id: string;
  activity_id: string;
  client_id: string;
  completed_at: string;
  effort: string | null;
  note: string | null;
}

export interface Message {
  id: string;
  client_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

// API Request/Response Types
export interface GeneratePlanRequest {
  client_id: string;
  therapist_notes?: string;
}

export interface UpdateRoleRequest {
  role: 'therapist' | 'client' | 'admin';
}
