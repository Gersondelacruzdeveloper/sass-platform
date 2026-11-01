import { Route, Routes } from "react-router-dom";

import PublicOrderTrackingPage from "../modules/colmado/pages/PublicOrderTrackingPage";
import PublicStorefrontPage from "../modules/colmado/pages/PublicStorefrontPage";
import { colmadoRoutes } from "../modules/colmado/routes/colmadoRoutes";
import { discoRoutes } from "../modules/disco/routes/discoRoutes";
import { careerRoutes } from "../modules/organisational-development/routes/careerRoutes";
import { partnerNetworkRoutes } from "../modules/partner-network/routes/partnerNetworkRoutes";
import { ticketingRoutes } from "../modules/ticketing/routes/ticketingRoutes";
import { trainingRoutes } from "../modules/training/routes/trainingRoutes";
import AuditLogsPage from "../pages/AuditLogsPage";
import DashboardPage from "../pages/DashboardPage";
import LoginPage from "../pages/LoginPage";
import OrganisationsPage from "../pages/OrganisationsPage";
import RegisterPage from "../pages/RegisterPage";


export default function AppRoutes() {
  return (
    <Routes>
      {/* Public colmado ordering routes — customers do not need an account. */}
      <Route
        element={<PublicOrderTrackingPage />}
        path="/pedir/:slug/pedido/:orderNumber"
      />
      <Route
        element={<PublicStorefrontPage />}
        path="/pedir/:slug"
      />

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

      {/* Desarrollo Organizacional */}
      {careerRoutes}
    </Routes>
  );
}
