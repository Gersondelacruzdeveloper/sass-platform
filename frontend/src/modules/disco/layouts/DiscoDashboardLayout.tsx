// src/modules/disco/layouts/DiscoDashboardLayout.tsx

import { Outlet } from "react-router-dom";
import DiscoSidebar from "../components/DiscoSidebar";
import DiscoTopbar from "../components/DiscoTopbar";

export default function DiscoDashboardLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <DiscoSidebar />

      <div className="min-h-screen lg:pl-72">
        <DiscoTopbar />

        <main className="px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}