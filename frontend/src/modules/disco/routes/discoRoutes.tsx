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

export const discoRoutes = (
  <>
    {/* Public Login */}
    <Route
      path="/disco/:organisationSlug/login"
      element={<DiscoLoginPage />}
    />
    <Route path="/disco/signup" element={<DiscoSignupPage />} />

    {/* Protected Disco Module */}
    <Route element={<ProtectedRoute />}>
      <Route
        path="/disco/:organisationSlug"
        element={<DiscoDashboardLayout />}
      >
        {/* Dashboard */}
        <Route path="dashboard" element={<DiscoDashboardPage />} />

        {/* POS */}
        <Route path="pos" element={<DiscoPOSPage />} />

        {/* Products */}
        <Route path="products" element={<DiscoProductsPage />} />

        {/* Inventory */}
        <Route path="inventory" element={<DiscoInventoryPage />} />

        {/* Stock Movements */}
        <Route
          path="stock-movements"
          element={<DiscoStockMovementsPage />}
        />

        {/* Tables */}
        <Route path="tables" element={<DiscoTablesPage />} />

        {/* Reservations */}
        <Route
          path="reservations"
          element={<DiscoReservationsPage />}
        />

        {/* Employees */}
        <Route path="employees" element={<DiscoEmployeesPage />} />

        {/* Cash Shifts */}
        <Route path="cash-shifts" element={<DiscoCashShiftsPage />} />

        {/* Expenses */}
        <Route path="expenses" element={<DiscoExpensesPage />} />

        {/* Reports */}
        <Route path="reports" element={<DiscoReportsPage />} />

        {/* Activity Logs */}
        <Route
          path="activity-logs"
          element={<DiscoActivityLogsPage />}
        />

        {/* Settings */}
        <Route path="settings" element={<DiscoSettingsPage />} />
      </Route>
    </Route>
  </>
);