import { Route } from "react-router-dom";

import ProtectedRoute from "../../../components/ProtectedRoute";

import TrainingDashboardPage from "../pages/TrainingDashboardPage";
import EmployeesPage from "../pages/EmployeesPage";
import EmployeeDetailPage from "../pages/EmployeeDetailPage";
import EvaluationsPage from "../pages/EvaluationsPage";
import TrainingSessionsPage from "../pages/TrainingSessionsPage";
import RoadmapPage from "../pages/RoadmapPage";
import FacilitatorsPage from "../pages/FacilitatorsPage";
import AnalyticsPage from "../pages/AnalyticsPage";
import OutletsPage from "../pages/OutletsPage";
import ReportsPage from "../pages/ReportsPage";
import StandardsPage from "../pages/StandardsPage";
import TrainingLayout from "../layouts/TrainingLayout";
import EvaluationTemplatesPage from "../pages/EvaluationTemplatesPage";
import TrainingLoginPage from "../pages/TrainingLoginPage";

import FacilitatorDashboardPage from "../pages/facilitator/FacilitatorDashboardPage";
import FacilitatorEmployeesPage from "../pages/facilitator/FacilitatorEmployeesPage";
import FacilitatorEvaluationsPage from "../pages/facilitator/FacilitatorEvaluationsPage";
import FacilitatorTrainingsPage from "../pages/facilitator/FacilitatorTrainingsPage";
import EditFacilitatorPage from "../pages/EditFacilitatorPage";
import CreateFacilitatorAccountPage from "../pages/CreateFacilitatorAccountPage";
import EditEvaluationTemplatePage from "../pages/EditEvaluationTemplatePage";
import TrainingResourcesPage from "../pages/TrainingResourcesPage";
import RecoveryPlansPage from "../pages/RecoveryPlansPage";
import AssignedTrainingsPage from "../pages/AssignedTrainingsPage";
import FacilitatorTrainingQueuePage from "../pages/FacilitatorTrainingQueuePage";

export const trainingRoutes = (
  <>
    <Route
      path="/training/:organisationSlug/login"
      element={<TrainingLoginPage />}
    />

    <Route element={<ProtectedRoute />}>
      <Route path="/training/:organisationSlug" element={<TrainingLayout />}>
        <Route index element={<TrainingDashboardPage />} />

        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />

        <Route path="facilitators" element={<FacilitatorsPage />} />
        <Route path="facilitators/create-account" element={<CreateFacilitatorAccountPage />} />
        <Route path="facilitators/:id/edit" element={<EditFacilitatorPage />} />

        <Route path="training-sessions" element={<TrainingSessionsPage />} />

        <Route path="training-sessions" element={<TrainingSessionsPage />} />
        <Route path="evaluations" element={<EvaluationsPage />} />
        <Route path="standards" element={<StandardsPage />} />
        <Route path="evaluation-templates" element={<EvaluationTemplatesPage />} />
        <Route
        path="evaluation-templates/:id/edit"
        element={<EditEvaluationTemplatePage />}
      />
        <Route path="outlets" element={<OutletsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="roadmap" element={<RoadmapPage />} />

        <Route path="facilitator" element={<FacilitatorDashboardPage />} />
        <Route path="facilitator/employees" element={<FacilitatorEmployeesPage />} />
        <Route path="facilitator/evaluations" element={<FacilitatorEvaluationsPage />} />
        <Route path="facilitator/trainings" element={<FacilitatorTrainingsPage />} />
        <Route path="resources" element={<TrainingResourcesPage />} />
        <Route path="recovery-plans" element={<RecoveryPlansPage />} />
        <Route path="assigned-trainings" element={<AssignedTrainingsPage />} />
        <Route
          path="facilitator-queue"
          element={<FacilitatorTrainingQueuePage />}
        />

      </Route>
    </Route>
  </>
);