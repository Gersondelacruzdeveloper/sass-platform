import {
  Bell,
  Search,
  Menu,
  ChevronDown,
} from "lucide-react";

export default function DiscoTopbar() {
  return (
    <header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-white/10 bg-white px-4 shadow-sm md:px-8">
      {/* Left Side */}
      <div className="flex items-center gap-4">
        {/* Mobile Menu */}
        <button className="rounded-xl border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-100 md:hidden">
          <Menu size={20} />
        </button>

        {/* Search */}
        <div className="hidden items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:flex md:w-[350px]">
          <Search size={18} className="text-gray-400" />

          <input
            type="text"
            placeholder="Search sales, inventory, employees..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        {/* Notification */}
        <button className="relative rounded-2xl border border-gray-200 bg-white p-3 transition hover:bg-gray-100">
          <Bell size={20} className="text-gray-700" />

          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* User Card */}
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white">
            GD
          </div>

          <div className="hidden md:block">
            <h3 className="text-sm font-semibold text-gray-900">
              Gerson Disco
            </h3>

            <p className="text-xs text-gray-500">
              Owner
            </p>
          </div>

          <ChevronDown
            size={18}
            className="hidden text-gray-500 md:block"
          />
        </div>
      </div>
    </header>
  );
}