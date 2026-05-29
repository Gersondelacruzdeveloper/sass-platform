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

export const trainingRoutes = [
  {
    path: "/training",
    element: <TrainingLayout />,
    children: [
      {
        index: true,
        element: <TrainingDashboardPage />,
      },
      {
        path: "employees",
        element: <EmployeesPage />,
      },
      {
        path: "employees/:id",
        element: <EmployeeDetailPage />,
      },
      {
        path: "facilitators",
        element: <FacilitatorsPage />,
      },
      {
        path: "training-sessions",
        element: <TrainingSessionsPage />,
      },
      {
        path: "evaluations",
        element: <EvaluationsPage />,
      },
      {
        path: "standards",
        element: <StandardsPage />,
      },
      {
        path: "/training/evaluation-templates",
        element: <EvaluationTemplatesPage />,
      },
      {
        path: "outlets",
        element: <OutletsPage />,
      },
      {
        path: "analytics",
        element: <AnalyticsPage />,
      },
      {
        path: "reports",
        element: <ReportsPage />,
      },
      {
        path: "roadmap",
        element: <RoadmapPage />,
      },
    ],
  },
];
