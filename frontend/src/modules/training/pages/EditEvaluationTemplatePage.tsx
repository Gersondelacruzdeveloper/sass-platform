import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, PlusCircle, Save, Trash2 } from "lucide-react";
import api from "../../../api/axios";

type Standard = {
  id: number;
  title: string;
};

type QuestionForm = {
  id?: number;
  question: string;
  standard: number | "";
  score_type: "score" | "yes_no" | "text";
  weight: number;
  order: number;
};

export default function EditEvaluationTemplatePage() {
  const { organisationSlug, id } = useParams();
  const navigate = useNavigate();

  const [standards, setStandards] = useState<Standard[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const [templateRes, standardsRes] = await Promise.all([
      api.get(`/training/evaluation-templates/${id}/`),
      api.get("/training/standards/"),
    ]);

    const template = templateRes.data;

    setTemplateName(template.name);
    setDescription(template.description || "");
    setActive(template.active);
    setStandards(standardsRes.data);

    setQuestions(
      (template.questions || []).map((q: any, index: number) => ({
        id: q.id,
        question: q.question,
        standard: q.standard || "",
        score_type: q.score_type || "score",
        weight: q.weight || 1,
        order: q.order ?? index + 1,
      })),
    );

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [id]);

  function updateQuestion(index: number, field: keyof QuestionForm, value: any) {
    setQuestions((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        question: "",
        standard: "",
        score_type: "score",
        weight: 1,
        order: prev.length + 1,
      },
    ]);
  }

  async function removeQuestion(index: number) {
    const question = questions[index];

    if (question.id) {
      await api.delete(`/training/evaluation-questions/${question.id}/`);
    }

    setQuestions((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await api.patch(`/training/evaluation-templates/${id}/`, {
      name: templateName,
      description,
      active,
    });

    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];

      const payload = {
        template: Number(id),
        question: question.question,
        standard: question.standard || null,
        score_type: question.score_type,
        weight: Number(question.weight),
        order: index + 1,
      };

      if (question.id) {
        await api.patch(`/training/evaluation-questions/${question.id}/`, payload);
      } else {
        await api.post("/training/evaluation-questions/", payload);
      }
    }

    navigate(`/training/${organisationSlug}/evaluation-templates`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="rounded-3xl bg-white p-6 font-black text-slate-950">
          Loading template...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <Link
          to={`/training/${organisationSlug}/evaluation-templates`}
          className="inline-flex items-center gap-2 font-bold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={18} />
          Back to templates
        </Link>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="text-3xl font-black text-slate-950">
                Edit Template
              </h1>
              <p className="text-sm text-slate-500">
                Update template info, questions, standards, score type and weight.
              </p>
            </div>

            <label className="flex w-fit cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 accent-slate-950"
              />
              <span className="font-bold text-slate-700">Active template</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                Template Name
              </span>
              <input
                required
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
            </label>
          </div>

          <section className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  Questions
                </h2>
                <p className="text-sm text-slate-500">
                  Edit, add or remove questions from this template.
                </p>
              </div>

              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white"
              >
                <PlusCircle size={18} />
                Add Question
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((item, index) => (
                <div
                  key={item.id || index}
                  className="rounded-[1.5rem] border border-slate-200 bg-white p-4"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-slate-400">
                        Question {index + 1}
                      </p>
                      <p className="text-sm font-bold text-slate-500">
                        Weight {item.weight} · {item.score_type}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeQuestion(index)}
                      className="rounded-2xl bg-red-50 p-3 text-red-500 hover:bg-red-100"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <label className="space-y-2 lg:col-span-2">
                      <span className="text-sm font-bold text-slate-700">
                        Question
                      </span>
                      <input
                        required
                        value={item.question}
                        onChange={(e) =>
                          updateQuestion(index, "question", e.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-bold text-slate-700">
                        Standard
                      </span>
                      <select
                        value={item.standard}
                        onChange={(e) =>
                          updateQuestion(
                            index,
                            "standard",
                            e.target.value ? Number(e.target.value) : "",
                          )
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                      >
                        <option value="">Select Standard</option>
                        {standards.map((standard) => (
                          <option key={standard.id} value={standard.id}>
                            {standard.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-bold text-slate-700">
                        Score Type
                      </span>
                      <select
                        value={item.score_type}
                        onChange={(e) =>
                          updateQuestion(index, "score_type", e.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                      >
                        <option value="score">Score 1-10</option>
                        <option value="yes_no">Yes / No</option>
                        <option value="text">Text</option>
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-bold text-slate-700">
                        Weight
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={item.weight}
                        onChange={(e) =>
                          updateQuestion(index, "weight", Number(e.target.value))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 md:w-auto">
            <Save size={18} />
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}