import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";

import api from "../../../../api/axios";
import type { Employee, EvaluationTemplate } from "../../types/training";

export default function FacilitatorEvaluationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [form, setForm] = useState({
    employee: "",
    template: "",
    notes: "",
  });

  async function loadData() {
    const [employeesRes, templatesRes] = await Promise.all([
      api.get("/training/employees/"),
      api.get("/training/evaluation-templates/"),
    ]);

    setEmployees(employeesRes.data);
    setTemplates(templatesRes.data);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await api.post("/training/employee-evaluations/", {
      employee: Number(form.employee),
      template: Number(form.template),
      notes: form.notes,
    });

    setForm({
      employee: "",
      template: "",
      notes: "",
    });

    alert("Evaluation created.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="text-slate-700" />
          <div>
            <h1 className="text-2xl font-black text-slate-950">
              Create Evaluation
            </h1>
            <p className="text-sm text-slate-500">
              Select an assigned employee and evaluation template.
            </p>
          </div>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-700">
              Employee
            </span>
            <select
              required
              value={form.employee}
              onChange={(e) =>
                setForm({ ...form, employee: e.target.value })
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.position}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-700">
              Template
            </span>
            <select
              required
              value={form.template}
              onChange={(e) =>
                setForm({ ...form, template: e.target.value })
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <textarea
          value={form.notes}
          onChange={(e) =>
            setForm({ ...form, notes: e.target.value })
          }
          placeholder="Observations, service behavior, customer interaction, training needs..."
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          rows={5}
        />

        <button className="mt-5 w-full rounded-2xl bg-slate-950 px-6 py-4 font-black text-white md:w-auto">
          Save Evaluation
        </button>
      </form>
    </div>
  );
}