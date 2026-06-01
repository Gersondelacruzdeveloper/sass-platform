import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import TrainingSidebar from "../components/TrainingSidebar";
import {
  defaultBranding,
  getPublicBranding,
  type Branding,
} from "../../../api/brandingApi";

export default function TrainingLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branding, setBranding] = useState<Branding>(defaultBranding);
  const { organisationSlug } = useParams();

  useEffect(() => {
    async function loadBranding() {
      if (!organisationSlug) return;

      const data = await getPublicBranding("hotel", organisationSlug);
      setBranding(data);
      document.title = data.platform_name;
    }

    loadBranding();
  }, [organisationSlug]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur lg:hidden">
        <div>
          <h1 className="text-base font-bold text-slate-950">
            {branding.platform_name}
          </h1>
          <p className="text-xs text-slate-500">
            {branding.company_name}
          </p>
        </div>

        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-2xl px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: branding.primary_color }}
        >
          Menu
        </button>
      </header>

      <div className="flex">
        <div className="hidden lg:block">
          <TrainingSidebar />
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />

            <div className="relative h-full w-80 max-w-[85vw] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <h2 className="font-bold">
                    {branding.platform_name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {branding.company_name}
                  </p>
                </div>

                <button
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <TrainingSidebar onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}