import { NavLink } from "react-router-dom";

type TrainingSidebarProps = {
  onNavigate?: () => void;
};

const links = [
  { label: "Dashboard", path: "/training", icon: "📊" },
  { label: "Employees", path: "/training/employees", icon: "👥" },
  { label: "Facilitators", path: "/training/facilitators", icon: "🎓" },
  { label: "Training Sessions", path: "/training/training-sessions", icon: "📚" },
  { label: "Evaluations", path: "/training/evaluations", icon: "⭐" },
  { label: "Standards", path: "/training/standards", icon: "🏆" },
  { label: "Outlets", path: "/training/outlets", icon: "🍽️" },
  { label: "Analytics", path: "/training/analytics", icon: "📈" },
  { label: "Reports", path: "/training/reports", icon: "📄" },
  { label: "Roadmap", path: "/training/roadmap", icon: "🚀" },
  {
  label: "Templates",
  path: "/training/evaluation-templates",
  icon: "📝",
},
];

export default function TrainingSidebar({ onNavigate }: TrainingSidebarProps) {
  return (
    <aside className="h-full w-72 border-r bg-white">
      <div className="hidden border-b p-6 lg:block">
        <h1 className="text-xl font-bold">Hard Rock A&B</h1>
        <p className="text-sm text-gray-500">Training Platform</p>
      </div>

      <nav className="p-4">
        <div className="space-y-2">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.path === "/training"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-black text-white shadow-lg"
                    : "text-gray-600 hover:bg-gray-100 hover:text-black"
                }`
              }
            >
              <span className="text-lg">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
}