import type { TrainingSession } from "../types/training";

type Props = {
  sessions: TrainingSession[];
};

export default function TrainingToday({ sessions }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Trainings Today</h2>

        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
          {sessions.length} Today
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">
          No trainings scheduled for today.
        </p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-xl border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{session.title}</h3>

                  <p className="mt-1 text-sm text-gray-500">
                    {session.topic}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    {session.outlet_name || "No outlet"} ·{" "}
                    {session.facilitator_name || "No facilitator"}
                  </p>
                </div>

                <StatusBadge status={session.status} />
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {formatTime(session.start_datetime)} -{" "}
                  {formatTime(session.end_datetime)}
                </span>

                <span className="font-semibold text-gray-700">
                  {session.attendees?.length || 0} attendees
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "completed"
      ? "bg-green-100 text-green-700"
      : status === "in_progress"
      ? "bg-yellow-100 text-yellow-700"
      : status === "cancelled"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}