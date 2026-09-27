import { Route, Routes } from "react-router-dom";

import AuditLogsPage from "../pages/AuditLogsPage";
import DashboardPage from "../pages/DashboardPage";
import LoginPage from "../pages/LoginPage";
import OrganisationsPage from "../pages/OrganisationsPage";
import RegisterPage from "../pages/RegisterPage";
import { colmadoRoutes } from "../modules/colmado/routes/colmadoRoutes";
import { discoRoutes } from "../modules/disco/routes/discoRoutes";
import { partnerNetworkRoutes } from "../modules/partner-network/routes/partnerNetworkRoutes";
import { ticketingRoutes } from "../modules/ticketing/routes/ticketingRoutes";
import { trainingRoutes } from "../modules/training/routes/trainingRoutes";


export default function AppRoutes() {
  return (
    <Routes>
      {/* Old SaaS platform routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/organisations" element={<OrganisationsPage />} />
      <Route path="/audit-logs" element={<AuditLogsPage />} />

      {trainingRoutes}
      {discoRoutes}
      {ticketingRoutes}
      {partnerNetworkRoutes}
      {colmadoRoutes}
    </Routes>
  );
}
