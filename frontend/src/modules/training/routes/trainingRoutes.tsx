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
        <Route path="training-sessions" element={<TrainingSessionsPage />} />
        <Route path="evaluations" element={<EvaluationsPage />} />
        <Route path="standards" element={<StandardsPage />} />
        <Route path="evaluation-templates" element={<EvaluationTemplatesPage />} />
        <Route path="outlets" element={<OutletsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="roadmap" element={<RoadmapPage />} />
      </Route>
    </Route>
  </>
);