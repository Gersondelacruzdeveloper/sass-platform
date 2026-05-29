import { useState } from "react";
import { Outlet } from "react-router-dom";
import TrainingSidebar from "../components/TrainingSidebar";

export default function TrainingLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur lg:hidden">
        <div>
          <h1 className="text-base font-bold text-slate-950">
            Hard Rock A&B
          </h1>
          <p className="text-xs text-slate-500">Training Platform</p>
        </div>

        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Menu
        </button>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <TrainingSidebar />
        </div>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />

            <div className="relative h-full w-80 max-w-[85vw] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <h2 className="font-bold">Hard Rock A&B</h2>
                  <p className="text-xs text-slate-500">Training Platform</p>
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