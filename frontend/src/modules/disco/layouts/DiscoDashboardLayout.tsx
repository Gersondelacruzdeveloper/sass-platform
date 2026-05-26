import { Outlet } from "react-router-dom";
import DiscoSidebar from "../components/DiscoSidebar";

export default function DiscoDashboardLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <DiscoSidebar />

      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}