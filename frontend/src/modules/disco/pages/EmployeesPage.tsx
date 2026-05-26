import {
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  MoreVertical,
} from "lucide-react";

const employees = [
  {
    name: "Carlos Méndez",
    email: "carlos@disco.com",
    role: "Manager",
    status: "Active",
    lastLogin: "Today, 8:42 PM",
  },
  {
    name: "Ana Rivera",
    email: "ana@disco.com",
    role: "Cashier",
    status: "Active",
    lastLogin: "Today, 7:10 PM",
  },
  {
    name: "Luis Peña",
    email: "luis@disco.com",
    role: "Bartender",
    status: "Active",
    lastLogin: "Yesterday",
  },
  {
    name: "Maria Santos",
    email: "maria@disco.com",
    role: "Inventory Manager",
    status: "Inactive",
    lastLogin: "4 days ago",
  },
];

export default function EmployeesPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Team access
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Employees
          </h1>

          <p className="mt-2 text-gray-500">
            Create staff logins, assign roles, and control what each employee can access.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          Add Employee
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active employees</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">12</h2>
            </div>
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <UserCheck size={24} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Inactive accounts</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">2</h2>
            </div>
            <div className="rounded-2xl bg-red-100 p-3 text-red-700">
              <UserX size={24} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Plan limit</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">15</h2>
            </div>
            <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
              <ShieldCheck size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Staff Accounts</h2>
            <p className="text-sm text-gray-500">
              Manage employee roles, access, and account status.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search employee..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Employee</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Last Login</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {employees.map((employee) => {
                const isActive = employee.status === "Active";

                return (
                  <tr key={employee.email}>
                    <td className="py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white">
                          {employee.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)}
                        </div>

                        <div>
                          <p className="font-semibold text-gray-900">
                            {employee.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {employee.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-5 text-gray-700">{employee.role}</td>

                    <td className="py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {employee.status}
                      </span>
                    </td>

                    <td className="py-5 text-gray-500">
                      {employee.lastLogin}
                    </td>

                    <td className="py-5 text-right">
                      <button className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}