import type { TrainingSession } from "../types/training";

type Propiedades = {
  sesiones: TrainingSession[];
};

export default function CapacitacionesDeHoy({ sesiones }: Propiedades) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Capacitaciones de Hoy</h2>

        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
          {sesiones.length} Hoy
        </span>
      </div>

      {sesiones.length === 0 ? (
        <p className="text-sm text-gray-500">
          No hay capacitaciones programadas para hoy.
        </p>
      ) : (
        <div className="space-y-3">
          {sesiones.map((sesion) => (
            <div
              key={sesion.id}
              className="rounded-xl border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{sesion.title}</h3>

                  <p className="mt-1 text-sm text-gray-500">
                    {sesion.topic}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    {sesion.outlet_name || "Sin centro de consumo"} ·{" "}
                    {sesion.facilitator_name || "Sin facilitador"}
                  </p>
                </div>

                <EtiquetaEstado status={sesion.status} />
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {formatearHora(sesion.start_datetime)} -{" "}
                  {formatearHora(sesion.end_datetime)}
                </span>

                <span className="font-semibold text-gray-700">
                  {sesion.attendees?.length || 0} asistentes
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EtiquetaEstado({ status }: { status: string }) {
  const estilos =
    status === "completed"
      ? "bg-green-100 text-green-700"
      : status === "in_progress"
      ? "bg-yellow-100 text-yellow-700"
      : status === "cancelled"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-700";

  const textoEstado =
    status === "completed"
      ? "COMPLETADO"
      : status === "in_progress"
      ? "EN PROCESO"
      : status === "cancelled"
      ? "CANCELADO"
      : status.replace("_", " ").toUpperCase();

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${estilos}`}>
      {textoEstado}
    </span>
  );
}

function formatearHora(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}