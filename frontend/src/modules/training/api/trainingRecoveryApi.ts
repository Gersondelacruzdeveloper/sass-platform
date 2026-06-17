import api from "../../../api/axios";

export const trainingResourcesApi = {
  list: () =>
    api.get("/training/training-resources/"),

  create: (data: FormData) =>
    api.post("/training/training-resources/", data),

  update: (id: number, data: FormData) =>
    api.patch(`/training/training-resources/${id}/`, data),

  delete: (id: number) =>
    api.delete(`/training/training-resources/${id}/`),
};

export const recoveryPlansApi = {
  list: () =>
    api.get("/training/standard-recovery-plans/"),

  create: (data: any) =>
    api.post("/training/standard-recovery-plans/", data),

  update: (id: number, data: any) =>
    api.patch(`/training/standard-recovery-plans/${id}/`, data),

  delete: (id: number) =>
    api.delete(`/training/standard-recovery-plans/${id}/`),
};

export const assignedTrainingsApi = {
  list: (params?: any) =>
    api.get("/training/assigned-trainings/", { params }),

  create: (data: any) =>
    api.post("/training/assigned-trainings/", data),

  markCompleted: (id: number) =>
    api.post(`/training/assigned-trainings/${id}/mark_completed/`),

  close: (id: number, supervisor_notes?: string) =>
    api.post(`/training/assigned-trainings/${id}/close/`, {
      supervisor_notes,
    }),
};