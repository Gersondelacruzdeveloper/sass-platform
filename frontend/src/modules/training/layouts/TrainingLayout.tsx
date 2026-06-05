import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { Menu, X } from "lucide-react";

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

  useEffect(() => {
    if (!sidebarOpen) return;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-dvh bg-slate-100">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <div className="min-w-0">
          <h1 className="truncate text-base font-black text-slate-950">
            {branding.platform_name}
          </h1>
          <p className="truncate text-xs text-slate-500">
            {branding.company_name}
          </p>
        </div>

        <button
          onClick={() => setSidebarOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: branding.primary_color }}
        >
          <Menu size={18} />
          Menu
        </button>
      </header>

      <div className="flex min-h-[calc(100dvh-4rem)] lg:min-h-dvh">
        {/* Desktop Sidebar */}
        <div className="hidden shrink-0 lg:block">
          <TrainingSidebar />
        </div>

        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close sidebar overlay"
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />

            <div className="relative h-dvh w-80 max-w-[85vw] bg-white shadow-2xl">
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-2xl bg-white/90 p-2 text-slate-700 shadow-sm backdrop-blur"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>

              <TrainingSidebar onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}