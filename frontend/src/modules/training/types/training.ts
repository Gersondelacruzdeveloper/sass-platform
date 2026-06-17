export type Outlet = {
  id: number;
  name: string;
  area?: string;
  manager?: string;
  description?: string;
  active: boolean;
  employees_count: number;
  average_score: number;
  hard_rock_score: number;
};

export type Standard = {
  id: number;
  title: string;
  category: string;
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
  active: boolean;
  created_at?: string;
};

export type Employee = {
  id: number;
  name: string;
  photo?: string;
  employee_code?: string;
  department: string;
  outlet?: number | null;
  outlet_name?: string;
  position: string;
  supervisor?: number | null;
  supervisor_name?: string;
  hire_date?: string | null;
  career_goal?: string;
  languages: string[];
  strengths: string[];
  weaknesses: string[];
  service_score: number;
  leadership_score: number;
  attitude_score: number;
  upselling_score: number;
  hard_rock_standard_score: number;
  total_score: number;
  potential_level: string;
  promotion_ready: boolean;
  active: boolean;
  notes?: string;
};

export type Facilitator = {
  id: number;
  employee: number;
  employee_name: string;
  employee_position?: string;
  assigned_employees: number[];
  assigned_count: number;
  specialties: string[];
  active: boolean;
};

export type TrainingSession = {
  id: number;
  title: string;
  topic: string;
  description?: string;
  facilitator?: number | null;
  facilitator_name?: string;
  outlet?: number | null;
  outlet_name?: string;
  start_datetime: string;
  end_datetime: string;
  expected_attendees: number;
  attendance_percentage: number;
  attendees: number[];
  status: string;
};

export type Evaluation = {
  id: number;
  employee: number;
  employee_name?: string;
  evaluator?: number | null;
  standard?: number | null;
  standard_title?: string;
  smile: number;
  eye_contact: number;
  speed_of_service: number;
  product_knowledge: number;
  attitude: number;
  upselling: number;
  hard_rock_standards: number;
  final_score: number;
  notes?: string;
  created_at: string;
};

export type GuestFeedback = {
  id: number;
  employee: number;
  employee_name?: string;
  outlet: number;
  outlet_name?: string;
  rating: number;
  comment?: string;
  source?: string;
  created_at: string;
};

export type RoadmapItem = {
  id: number;
  title: string;
  description?: string;
  period: "30_days" | "60_days" | "90_days";
  priority: string;
  completed: boolean;
  owner?: number | null;
  owner_name?: string;
};

export type OutletAnalytics = {
  name: string;
  employees_count: number;
  score: number;
  hard_rock_score: number;
};

export type TrainingAnalytics = {
  employees_total: number;
  facilitators_total: number;
  trainings_total: number;
  completed_trainings: number;
  training_completion: number;
  ab_performance_score: number;
  hard_rock_score: number;
  evaluations_total: number;
  top_outlets: OutletAnalytics[];
  bottom_outlets: OutletAnalytics[];
  top_employees: Employee[];
  low_performers: Employee[];
};

export type TrainingDashboard = {
  employees_total: number;
  facilitators_total: number;
  trainings_today: number;
  people_training_today: number;
  next_training: TrainingSession | null;
  training_sessions_today?: TrainingSession[];
  ab_performance_score: number;
  top_employees: Employee[];
  roadmap_30: RoadmapItem[];
  roadmap_60: RoadmapItem[];
  roadmap_90: RoadmapItem[];
};

export type EvaluationTemplate = {
  id: number;
  name: string;
  description?: string;
  outlet?: number | null;
  outlet_name?: string;
  active: boolean;
  questions?: EvaluationQuestion[];
  created_at?: string;
};

export type EvaluationQuestion = {
  id: number;
  template: number;
  standard?: number | null;
  standard_title?: string;
  question: string;
  score_type: "score" | "yes_no" | "text";
  weight: number;
  order: number;
};

export type EmployeeEvaluation = {
  id: number;
  employee: number;
  employee_name?: string;
  template: number;
  template_name?: string;
  evaluator?: number | null;
  notes?: string;
  final_score: number;
  answers?: EvaluationAnswer[];
  created_at: string;
};

export type EvaluationAnswer = {
  id: number;
  evaluation: number;
  question: number;
  question_text?: string;
  score_type?: string;
  score: number;
  text_answer?: string;
  yes_no_answer?: boolean | null;
};



export type TrainingResource = {
  id: number;
  organisation?: number;
  title: string;
  standard?: number | null;
  standard_title?: string;
  resource_type: "visual_poster" | "microlearning" | "checklist" | "facilitator_guide";
  incorrect_image?: string | null;
  correct_image?: string | null;
  short_explanation?: string;
  facilitator_notes?: string;
  estimated_minutes: number;
  active: boolean;
  created_at?: string;
};

export type StandardRecoveryPlan = {
  id: number;
  organisation?: number;
  standard: number;
  standard_title?: string;
  resource?: number | null;
  resource_title?: string;
  trigger_fail_count: number;
  reevaluation_after_days: number;
  instructions?: string;
  active: boolean;
};

export type EmployeeAssignedTraining = {
  id: number;
  organisation?: number;
  employee: number;
  employee_name?: string;
  standard: number;
  standard_title?: string;
  resource?: number | null;
  resource_title?: string;
  assigned_by?: number | null;
  assigned_by_name?: string;
  reason?: string;
  status: "assigned" | "in_progress" | "completed" | "reevaluation_pending" | "closed";
  assigned_at: string;
  completed_at?: string | null;
  reevaluation_due_date?: string | null;
  reevaluated_at?: string | null;
  supervisor_notes?: string;
};