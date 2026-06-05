import api from "../../../api/axios";
import type {
  Employee,
  Facilitator,
  GuestFeedback,
  Outlet,
  RoadmapItem,
  Standard,
  TrainingAnalytics,
  TrainingDashboard,
  TrainingSession,
  EvaluationTemplate,
  EvaluationQuestion,
  EmployeeEvaluation,
  EvaluationAnswer,
} from "../types/training";

export async function getTrainingDashboard() {
  const res = await api.get<TrainingDashboard>("/training/dashboard/");
  return res.data;
}

export async function getTrainingAnalytics() {
  const res = await api.get<TrainingAnalytics>("/training/analytics/");
  return res.data;
}

export async function getEmployees() {
  const res = await api.get<Employee[]>("/training/employees/");
  return res.data;
}

export async function getEmployee(id: number) {
  const res = await api.get<Employee>(`/training/employees/${id}/`);
  return res.data;
}

export async function createEmployee(data: FormData) {
  const res = await api.post<Employee>("/training/employees/", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getTrainingSessions() {
  const res = await api.get<TrainingSession[]>("/training/training-sessions/");
  return res.data;
}

export async function getOutlets() {
  const res = await api.get<Outlet[]>("/training/outlets/");
  return res.data;
}

export async function createOutlet(data: Partial<Outlet>) {
  const res = await api.post<Outlet>("/training/outlets/", data);
  return res.data;
}

export async function updateOutlet(id: number, data: Partial<Outlet>) {
  const res = await api.patch<Outlet>(`/training/outlets/${id}/`, data);
  return res.data;
}

export async function getStandards() {
  const res = await api.get<Standard[]>("/training/standards/");
  return res.data;
}

export async function createStandard(data: Partial<Standard>) {
  const res = await api.post<Standard>("/training/standards/", data);
  return res.data;
}

export async function updateStandard(id: number, data: Partial<Standard>) {
  const res = await api.patch<Standard>(`/training/standards/${id}/`, data);
  return res.data;
}

export async function getFacilitators() {
  const res = await api.get<Facilitator[]>("/training/facilitators/");
  return res.data;
}

export async function createFacilitator(data: Partial<Facilitator>) {
  const res = await api.post<Facilitator>("/training/facilitators/", data);
  return res.data;
}

export async function updateFacilitator(id: number, data: Partial<Facilitator>) {
  const res = await api.patch<Facilitator>(`/training/facilitators/${id}/`, data);
  return res.data;
}

export async function getGuestFeedback() {
  const res = await api.get<GuestFeedback[]>("/training/guest-feedback/");
  return res.data;
}

export async function createGuestFeedback(data: Partial<GuestFeedback>) {
  const res = await api.post<GuestFeedback>("/training/guest-feedback/", data);
  return res.data;
}

export async function getRoadmap() {
  const res = await api.get<RoadmapItem[]>("/training/roadmap/");
  return res.data;
}



export async function getEvaluationTemplates() {
  const res = await api.get<EvaluationTemplate[]>("/training/evaluation-templates/");
  return res.data;
}

export async function createEvaluationTemplate(data: Partial<EvaluationTemplate>) {
  const res = await api.post<EvaluationTemplate>("/training/evaluation-templates/", data);
  return res.data;
}

export async function updateEvaluationTemplate(id: number, data: Partial<EvaluationTemplate>) {
  const res = await api.patch<EvaluationTemplate>(`/training/evaluation-templates/${id}/`, data);
  return res.data;
}

export async function deleteEvaluationTemplate(id: number) {
  await api.delete(`/training/evaluation-templates/${id}/`);
}

export async function createEvaluationQuestion(data: Partial<EvaluationQuestion>) {
  const res = await api.post<EvaluationQuestion>("/training/evaluation-questions/", data);
  return res.data;
}

export async function createEmployeeEvaluation(data: Partial<EmployeeEvaluation>) {
  const res = await api.post<EmployeeEvaluation>("/training/employee-evaluations/", data);
  return res.data;
}

export async function createEvaluationAnswer(data: Partial<EvaluationAnswer>) {
  const res = await api.post<EvaluationAnswer>("/training/evaluation-answers/", data);
  return res.data;
}

export async function getEmployeeEvaluations() {
  const res = await api.get<EmployeeEvaluation[]>("/training/employee-evaluations/");
  return res.data;
}

export type CreateFacilitatorAccountPayload = {
  employee: number;
  username: string;
  email: string;
  password: string;
  assigned_employees: number[];
  assigned_outlets: number[];
  specialties: string[];
  can_create_employees: boolean;
  can_create_trainings: boolean;
  can_create_evaluations: boolean;
  can_view_reports: boolean;
  active: boolean;
};

export async function createFacilitatorAccount(
  data: CreateFacilitatorAccountPayload
) {
  const res = await api.post<Facilitator>(
    "/training/facilitators/create_account/",
    data
  );

  return res.data;
}