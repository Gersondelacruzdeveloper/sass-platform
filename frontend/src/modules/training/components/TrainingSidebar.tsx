import { useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { LogOut } from "lucide-react";

import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch } from "../../../store/hooks";

import {
  defaultBranding,
  getPublicBranding,
  type Branding,
} from "../../../api/brandingApi";

type TrainingSidebarProps = {
  onNavigate?: () => void;
};

export default function TrainingSidebar({ onNavigate }: TrainingSidebarProps) {
  const navigate = useNavigate();
  const { organisationSlug } = useParams();
  const dispatch = useAppDispatch();

  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    async function loadBranding() {
      if (!organisationSlug) return;

      const data = await getPublicBranding("hotel", organisationSlug);
      setBranding(data);
    }

    loadBranding();
  }, [organisationSlug]);

  const basePath = `/training/${organisationSlug}`;

  const links = [
    { label: "Dashboard", path: basePath, icon: "📊" },
    { label: "Employees", path: `${basePath}/employees`, icon: "👥" },
    { label: "Facilitators", path: `${basePath}/facilitators`, icon: "🎓" },
    {
      label: "Training Sessions",
      path: `${basePath}/training-sessions`,
      icon: "📚",
    },
    { label: "Evaluations", path: `${basePath}/evaluations`, icon: "⭐" },
    { label: "Standards", path: `${basePath}/standards`, icon: "🏆" },
    {
      label: "Templates",
      path: `${basePath}/evaluation-templates`,
      icon: "📝",
    },
    { label: "Outlets", path: `${basePath}/outlets`, icon: "🍽️" },
    { label: "Analytics", path: `${basePath}/analytics`, icon: "📈" },
    { label: "Reports", path: `${basePath}/reports`, icon: "📄" },
    { label: "Roadmap", path: `${basePath}/roadmap`, icon: "🚀" },
    {
      label: "My Workspace",
      path: `${basePath}/facilitator`,
      icon: "🧑‍🏫",
    },
    {
      label: "My Employees",
      path: `${basePath}/facilitator/employees`,
      icon: "👥",
    },
    {
      label: "Create Evaluation",
      path: `${basePath}/facilitator/evaluations`,
      icon: "✅",
    },
    {
      label: "My Trainings",
      path: `${basePath}/facilitator/trainings`,
      icon: "📚",
    },
  ];

  const handleLogout = async () => {
    try {
      await dispatch(logoutUser()).unwrap();
    } catch (error) {
      console.error(error);
    } finally {
      navigate(`/training/${organisationSlug}/login`, { replace: true });
    }
  };

  return (
    <aside className="flex h-dvh w-72 max-w-[85vw] flex-col overflow-hidden border-r border-slate-200 bg-white">
      {/* Branding */}
      <div className="shrink-0 border-b border-slate-200 p-5 lg:p-6">
        {branding.logo_url ? (
          <img
            src={branding.logo_url}
            alt={branding.company_name}
            className="mb-4 h-14 w-auto object-contain"
          />
        ) : (
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white"
            style={{ backgroundColor: branding.accent_color }}
          >
            {branding.company_name?.charAt(0)?.toUpperCase()}
          </div>
        )}

        <h1 className="text-xl font-bold text-slate-950">
          {branding.platform_name}
        </h1>

        <p className="text-sm text-slate-500">{branding.company_name}</p>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="space-y-2 pb-6">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={
                link.path === basePath ||
                link.path === `${basePath}/facilitator`
              }
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "text-white shadow-lg"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
              style={({ isActive }) =>
                isActive ? { backgroundColor: branding.primary_color } : {}
              }
            >
              <span className="text-lg">{link.icon}</span>
              <span className="truncate">{link.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mb-4 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Platform
          </p>

          <h3 className="mt-1 truncate font-semibold text-slate-950">
            {branding.platform_name}
          </h3>

          <p className="truncate text-sm text-slate-500">
            {branding.company_name}
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-red-500 hover:text-white"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
