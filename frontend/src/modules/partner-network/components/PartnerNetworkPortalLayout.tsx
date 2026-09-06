import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { LayoutDashboard, QrCode, Settings2, WalletCards } from "lucide-react";

export default function PartnerNetworkPortalLayout() {
  const { organisationSlug = "" } = useParams();
  const base = `/ticketing/${organisationSlug}/concierge-partner`;
  const nav = [
    ["Dashboard", base, LayoutDashboard],
    ["My QR", `${base}/qr`, QrCode],
    ["Concierge Settings", `${base}/settings`, Settings2],
    ["Earnings", `${base}/earnings`, WalletCards],
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Punta Cana Discovery</div>
            <div className="text-lg font-black text-slate-950">AI Excursion Concierge</div>
          </div>
          <Link to="/" className="text-sm font-bold text-slate-500">Exit</Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto md:flex-col">
          {nav.map(([label, to, Icon]) => (
            <NavLink key={to} to={to} end={to === base} className={({ isActive }) =>
              `flex min-w-max items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black ${isActive ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`
            }>
              <Icon className="h-4 w-4" />{label}
            </NavLink>
          ))}
        </nav>
        <main><Outlet /></main>
      </div>
    </div>
  );
}
