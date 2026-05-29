import { Link } from "react-router-dom";
import type { Employee } from "../types/training";

type Props = {
  employees: Employee[];
};

export default function TopEmployees({
  employees,
}: Props) {
  if (!employees.length) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">
          Top Employees
        </h2>

        <p className="mt-4 text-gray-500">
          No employees found.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">
          Top Employees
        </h2>

        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Top Performers
        </span>
      </div>

      <div className="space-y-3">
        {employees.map((employee, index) => (
          <Link
            key={employee.id}
            to={`/training/employees/${employee.id}`}
            className="block"
          >
            <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 transition-all hover:border-black hover:bg-white">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black font-bold text-white">
                  {employee.photo ? (
                    <img
                      src={employee.photo}
                      alt={employee.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    employee.name.charAt(0)
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      #{index + 1}
                    </span>

                    <h3 className="font-semibold">
                      {employee.name}
                    </h3>
                  </div>

                  <p className="text-sm text-gray-500">
                    {employee.position}
                  </p>

                  <p className="text-xs text-gray-400">
                    {employee.outlet_name}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold">
                  {employee.total_score}%
                </div>

                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    employee.potential_level ===
                    "future_leader"
                      ? "bg-purple-100 text-purple-700"
                      : employee.potential_level ===
                        "high"
                      ? "bg-green-100 text-green-700"
                      : employee.potential_level ===
                        "medium"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {employee.potential_level
                    .replace("_", " ")
                    .toUpperCase()}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}