import { Route } from "react-router-dom";
import ProtectedRoute from "../../../components/ProtectedRoute";
import PartnerNetworkPortalLayout from "../components/PartnerNetworkPortalLayout";
import ReferralPartnerDashboardPage from "../pages/ReferralPartnerDashboardPage";
import ReferralPartnerQrPage from "../pages/ReferralPartnerQrPage";
import ReferralPartnerSettingsPage from "../pages/ReferralPartnerSettingsPage";
import ReferralPartnerEarningsPage from "../pages/ReferralPartnerEarningsPage";
import PartnerNetworkOwnerPage from "../pages/PartnerNetworkOwnerPage";

export const partnerNetworkRoutes = (
  <Route element={<ProtectedRoute />}>
    <Route path="/ticketing/:organisationSlug/partner-network" element={<PartnerNetworkOwnerPage />} />
    <Route path="/ticketing/:organisationSlug/concierge-partner" element={<PartnerNetworkPortalLayout />}>
      <Route index element={<ReferralPartnerDashboardPage />} />
      <Route path="qr" element={<ReferralPartnerQrPage />} />
      <Route path="settings" element={<ReferralPartnerSettingsPage />} />
      <Route path="earnings" element={<ReferralPartnerEarningsPage />} />
    </Route>
  </Route>
);
