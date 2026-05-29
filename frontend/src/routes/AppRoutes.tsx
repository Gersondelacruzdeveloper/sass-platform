import { Routes, Route } from "react-router-dom";

import { discoRoutes } from "../modules/disco/routes/discoRoutes";

import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import DashboardPage from "../pages/DashboardPage";
import OrganisationsPage from "../pages/OrganisationsPage";
import SubscriptionsPage from "../pages/SubscriptionsPage";
import AuditLogsPage from "../pages/AuditLogsPage";
import { trainingRoutes } from "../modules/training/routes/trainingRoutes";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Old SaaS platform routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/organisations" element={<OrganisationsPage />} />
      <Route path="/subscriptions" element={<SubscriptionsPage />} />
      <Route path="/audit-logs" element={<AuditLogsPage />} />

      {trainingRoutes.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={route.element}
        >
          {route.children?.map((child) => (
            <Route
              key={child.path || "index"}
              index={child.index}
              path={child.path}
              element={child.element}
            />
          ))}
        </Route>
      ))}

      {discoRoutes}
    </Routes>
  );
}