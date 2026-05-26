import { Building2, Layers, ShieldCheck, Wine } from "lucide-react";
import { Link } from "react-router-dom";

const modules = [
  {
    title: "Disco Management",
    description: "Sales, drinks, stock, expenses and profit control.",
    path: "/dashboard/disco",
    icon: Wine,
  },
  {
    title: "Organisations",
    description: "Manage companies, memberships and roles.",
    path: "/dashboard/organisations",
    icon: Building2,
  },
  {
    title: "Subscriptions",
    description: "Basic, Pro and Premium plans.",
    path: "/dashboard/subscriptions",
    icon: Layers,
  },
  {
    title: "Security",
    description: "Audit logs and employee activity.",
    path: "/dashboard/auditlogs",
    icon: ShieldCheck,
  },
];

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Main Dashboard</h1>
        <p className="text-slate-500">
          One platform for many businesses and modules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {modules.map((module) => {
          const Icon = module.icon;

          return (
            <Link
              key={module.path}
              to={module.path}
              className="bg-white rounded-2xl shadow p-5 hover:shadow-lg transition"
            >
              <Icon className="mb-4 text-slate-900" size={32} />
              <h2 className="font-bold text-lg">{module.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{module.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}