import { useEffect, useState } from "react";
import api from "../../../api/axios";

type Standard = {
  id: number;
  title: string;
};

type EvaluationTemplate = {
  id: number;
  name: string;
  description: string;
  active: boolean;
};

export default function EvaluationTemplatesPage() {
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);

  const [form, setForm] = useState({
    name: "",
    description: "",
    active: true,
  });

  const [questions, setQuestions] = useState([
    {
      question: "",
      standard: "",
      weight: 1,
      score_type: "score",
    },
  ]);

  async function loadData() {
    try {
      const [templatesRes, standardsRes] = await Promise.all([
        api.get("/training/evaluation-templates/"),
        api.get("/training/standards/"),
      ]);

      setTemplates(templatesRes.data);
      setStandards(standardsRes.data);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function addQuestion() {
    setQuestions([
      ...questions,
      {
        question: "",
        standard: "",
        weight: 1,
        score_type: "score",
      },
    ]);
  }

  function removeQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function updateQuestion(
    index: number,
    field: string,
    value: string | number
  ) {
    const copy = [...questions];

    copy[index] = {
      ...copy[index],
      [field]: value,
    };

    setQuestions(copy);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const templateRes = await api.post(
        "/training/evaluation-templates/",
        form
      );

      const templateId = templateRes.data.id;

      await Promise.all(
        questions.map((question, index) =>
          api.post("/training/evaluation-questions/", {
            template: templateId,
            standard: question.standard || null,
            question: question.question,
            weight: question.weight,
            score_type: question.score_type,
            order: index + 1,
          })
        )
      );

      setForm({
        name: "",
        description: "",
        active: true,
      });

      setQuestions([
        {
          question: "",
          standard: "",
          weight: 1,
          score_type: "score",
        },
      ]);

      loadData();
    } catch (error) {
      console.error(error);
      alert("Error creating template");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Evaluation Templates
        </h1>

        <p className="text-gray-500">
          Create audits and evaluations dynamically.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">
          Create Template
        </h2>

        <div className="grid gap-4">
          <input
            className="rounded-2xl border px-4 py-3"
            placeholder="Template Name"
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
          />

          <textarea
            className="rounded-2xl border px-4 py-3"
            rows={3}
            placeholder="Description"
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description: e.target.value,
              })
            }
          />
        </div>

        <div className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">
              Questions
            </h3>

            <button
              type="button"
              onClick={addQuestion}
              className="rounded-xl bg-black px-4 py-2 text-white"
            >
              Add Question
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((question, index) => (
              <div
                key={index}
                className="rounded-2xl border p-4"
              >
                <div className="grid gap-4 md:grid-cols-4">
                  <input
                    className="rounded-xl border px-4 py-3"
                    placeholder="Question"
                    value={question.question}
                    onChange={(e) =>
                      updateQuestion(
                        index,
                        "question",
                        e.target.value
                      )
                    }
                  />

                  <select
                    className="rounded-xl border px-4 py-3"
                    value={question.standard}
                    onChange={(e) =>
                      updateQuestion(
                        index,
                        "standard",
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      Select Standard
                    </option>

                    {standards.map((standard) => (
                      <option
                        key={standard.id}
                        value={standard.id}
                      >
                        {standard.title}
                      </option>
                    ))}
                  </select>

                  <select
                    className="rounded-xl border px-4 py-3"
                    value={question.score_type}
                    onChange={(e) =>
                      updateQuestion(
                        index,
                        "score_type",
                        e.target.value
                      )
                    }
                  >
                    <option value="score">
                      Score 1-10
                    </option>

                    <option value="yes_no">
                      Yes / No
                    </option>

                    <option value="text">
                      Text
                    </option>
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="flex-1 rounded-xl border px-4 py-3"
                      value={question.weight}
                      onChange={(e) =>
                        updateQuestion(
                          index,
                          "weight",
                          Number(e.target.value)
                        )
                      }
                    />

                    <button
                      type="button"
                      onClick={() =>
                        removeQuestion(index)
                      }
                      className="rounded-xl bg-red-100 px-4 py-2 font-semibold text-red-700"
                    >
                      X
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="mt-6 rounded-2xl bg-black px-6 py-3 font-semibold text-white"
        >
          Save Template
        </button>
      </form>

      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">
          Existing Templates
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-2xl border p-5"
            >
              <h3 className="font-bold">
                {template.name}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {template.description}
              </p>

              <div className="mt-4">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    template.active
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {template.active
                    ? "ACTIVE"
                    : "INACTIVE"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}