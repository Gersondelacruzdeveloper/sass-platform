import { Route } from "react-router-dom";

import ProtectedRoute from "../../../components/ProtectedRoute";

import DiscoDashboardLayout from "../layouts/DiscoDashboardLayout";

import DiscoLoginPage from "../pages/DiscoLoginPage";
import DiscoDashboardPage from "../pages/DiscoDashboardPage";
import DiscoPOSPage from "../pages/DiscoPOSPage";

import DiscoProductsPage from "../pages/DiscoProductsPage";
import DiscoInventoryPage from "../pages/DiscoInventoryPage";
import DiscoStockMovementsPage from "../pages/DiscoStockMovementsPage";

import DiscoTablesPage from "../pages/DiscoTablesPage";
import DiscoReservationsPage from "../pages/DiscoReservationsPage";

import DiscoEmployeesPage from "../pages/DiscoEmployeesPage";
import DiscoCashShiftsPage from "../pages/DiscoCashShiftsPage";

import DiscoExpensesPage from "../pages/DiscoExpensesPage";
import DiscoReportsPage from "../pages/DiscoReportsPage";

import DiscoActivityLogsPage from "../pages/DiscoActivityLogsPage";
import DiscoSettingsPage from "../pages/DiscoSettingsPage";
import DiscoSignupPage from "../pages/DiscoSignupPage";
import SubscriptionSuccessPage from "../pages/DiscoSubscriptionSuccessPage";
import SubscriptionCancelPage from "../pages/DiscoSubscriptionCancelPage";
import DiscoBillingLockedPage from "../pages/DiscoBillingLockedPage";

export const discoRoutes = (
  <>
    {/* Public Login */}
    <Route
      path="/disco/:organisationSlug/login"
      element={<DiscoLoginPage />}
    />

    <Route
      path="/disco/signup"
      element={<DiscoSignupPage />}
    />
    <Route
    path="/disco/:organisationSlug/billing-locked"
    element={<DiscoBillingLockedPage />}
  />

    <Route
      path="/disco/subscription/success"
      element={<SubscriptionSuccessPage />}
    />

    <Route
      path="/disco/subscription/cancel"
      element={<SubscriptionCancelPage />}
    />

    {/* Protected Disco Module */}
    <Route element={<ProtectedRoute />}>
      <Route
        path="/disco/:organisationSlug"
        element={<DiscoDashboardLayout />}
      >
        <Route path="dashboard" element={<DiscoDashboardPage />} />

        <Route path="pos" element={<DiscoPOSPage />} />

        <Route path="products" element={<DiscoProductsPage />} />

        <Route path="inventory" element={<DiscoInventoryPage />} />

        <Route
          path="stock-movements"
          element={<DiscoStockMovementsPage />}
        />

        <Route path="tables" element={<DiscoTablesPage />} />

        <Route
          path="reservations"
          element={<DiscoReservationsPage />}
        />

        <Route
          path="employees"
          element={<DiscoEmployeesPage />}
        />

        <Route
          path="cash-shifts"
          element={<DiscoCashShiftsPage />}
        />

        <Route
          path="expenses"
          element={<DiscoExpensesPage />}
        />

        <Route
          path="reports"
          element={<DiscoReportsPage />}
        />

        <Route
          path="activity-logs"
          element={<DiscoActivityLogsPage />}
        />

        <Route
          path="settings"
          element={<DiscoSettingsPage />}
        />
      </Route>
    </Route>
  </>
);