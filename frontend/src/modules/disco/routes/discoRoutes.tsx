import { Route } from "react-router-dom";
import DiscoDashboardLayout from "../layouts/DiscoDashboardLayout";
import DashboardHomePage from "../pages/DashboardHomePage";
import PosPage from "../pages/PosPage";
import SalesPage from "../pages/SalesPage";
import InventoryPage from "../pages/InventoryPage";
import EmployeesPage from "../pages/EmployeesPage";
import ExpensesPage from "../pages/ExpensesPage";
import ReportsPage from "../pages/ReportsPage";
import SubscriptionPage from "../pages/SubscriptionPage";
import SettingsPage from "../pages/SettingsPage";
import OpenTabsPage from "../pages/OpenTabsPage";
import EntryFeesPage from "../pages/EntryFeesPage";
import TablesPage from "../pages/TablesPage";

export const discoRoutes = (
  <Route path="/disco" element={<DiscoDashboardLayout />}>
    <Route path="dashboard" element={<DashboardHomePage />} />
    <Route path="pos" element={<PosPage />} />
    <Route path="tables" element={<TablesPage />} />
    <Route path="open-tabs" element={<OpenTabsPage />} />
    <Route path="entry-fees" element={<EntryFeesPage />} />
    <Route path="sales" element={<SalesPage />} />
    <Route path="inventory" element={<InventoryPage />} />
    <Route path="employees" element={<EmployeesPage />} />
    <Route path="expenses" element={<ExpensesPage />} />
    <Route path="reports" element={<ReportsPage />} />
    <Route path="subscription" element={<SubscriptionPage />} />
    <Route path="settings" element={<SettingsPage />} />
  </Route>
);