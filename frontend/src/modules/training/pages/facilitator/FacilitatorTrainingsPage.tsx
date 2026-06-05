import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";

import api from "../../../../api/axios";
import type { Outlet } from "../../types/training";

export default function FacilitatorTrainingsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [form, setForm] = useState({
    title: "",
    topic: "",
    description: "",
    outlet: "",
    start_datetime: "",
    end_datetime: "",
    expected_attendees: 0,
  });

  useEffect(() => {
    api.get("/training/outlets/").then((response) => {
      setOutlets(response.data);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await api.post("/training/training-sessions/", {
      ...form,
      outlet: form.outlet ? Number(form.outlet) : null,
      expected_attendees: Number(form.expected_attendees),
      status: "scheduled",
    });

    setForm({
      title: "",
      topic: "",
      description: "",
      outlet: "",
      start_datetime: "",
      end_datetime: "",
      expected_attendees: 0,
    });

    alert("Training session created.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <GraduationCap className="text-slate-700" />
          <div>
            <h1 className="text-2xl font-black text-slate-950">
              My Trainings
            </h1>
            <p className="text-sm text-slate-500">
              Create training sessions based on opportunities you detect.
            </p>
          </div>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Title"
            value={form.title}
            onChange={(value) => setForm({ ...form, title: value })}
          />

          <Input
            label="Topic"
            value={form.topic}
            onChange={(value) => setForm({ ...form, topic: value })}
          />

          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-700">
              Outlet
            </span>
            <select
              value={form.outlet}
              onChange={(e) =>
                setForm({ ...form, outlet: e.target.value })
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="">Select outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Expected Attendees"
            type="number"
            value={String(form.expected_attendees)}
            onChange={(value) =>
              setForm({ ...form, expected_attendees: Number(value) })
            }
          />

          <Input
            label="Start Date/Time"
            type="datetime-local"
            value={form.start_datetime}
            onChange={(value) =>
              setForm({ ...form, start_datetime: value })
            }
          />

          <Input
            label="End Date/Time"
            type="datetime-local"
            value={form.end_datetime}
            onChange={(value) =>
              setForm({ ...form, end_datetime: value })
            }
          />
        </div>

        <textarea
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
          placeholder="Describe the training need..."
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          rows={5}
        />

        <button className="mt-5 w-full rounded-2xl bg-slate-950 px-6 py-4 font-black text-white md:w-auto">
          Create Training
        </button>
      </form>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">
        {label}
      </span>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      />
    </label>
  );
}