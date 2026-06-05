import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Eye, Users } from "lucide-react";

import api from "../../../../api/axios";
import type { Employee } from "../../types/training";

export default function FacilitatorEmployeesPage() {
  const { organisationSlug } = useParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadEmployees() {
    try {
      setLoading(true);
      const response = await api.get("/training/employees/");
      setEmployees(response.data);
    } catch (error) {
      console.error("Error loading assigned employees:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  if (loading) {
    return <p className="p-4 font-bold text-slate-500">Loading employees...</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Users className="text-slate-700" />
          <div>
            <h1 className="text-2xl font-black text-slate-950">
              My Assigned Employees
            </h1>
            <p className="text-sm text-slate-500">
              These are the employees assigned to you for follow-up and evaluation.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {employees.map((employee) => (
          <div
            key={employee.id}
            className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-black text-slate-950">
              {employee.name}
            </h2>

            <p className="text-sm text-slate-500">
              {employee.position}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              {employee.outlet_name || "No outlet"}
            </p>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-400">
                Total Score
              </p>
              <p className="text-3xl font-black text-slate-950">
                {employee.total_score || 0}%
              </p>
            </div>

            <Link
              to={`/training/${organisationSlug}/employees/${employee.id}`}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >
              <Eye size={16} />
              View Profile
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}