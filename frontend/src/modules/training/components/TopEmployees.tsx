import { Link } from "react-router-dom";
import type { Employee } from "../types/training";

type Propiedades = {
  empleados: Employee[];
};

export default function MejoresEmpleados({
  empleados,
}: Propiedades) {
  if (!empleados.length) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">
          Mejores Empleados
        </h2>

        <p className="mt-4 text-gray-500">
          No se encontraron empleados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">
          Mejores Empleados
        </h2>

        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Empleados Destacados
        </span>
      </div>

      <div className="space-y-3">
        {empleados.map((empleado, indice) => (
          <Link
            key={empleado.id}
            to={`/training/employees/${empleado.id}`}
            className="block"
          >
            <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 transition-all hover:border-black hover:bg-white">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black font-bold text-white">
                  {empleado.photo ? (
                    <img
                      src={empleado.photo}
                      alt={empleado.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    empleado.name.charAt(0)
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      #{indice + 1}
                    </span>

                    <h3 className="font-semibold">
                      {empleado.name}
                    </h3>
                  </div>

                  <p className="text-sm text-gray-500">
                    {empleado.position}
                  </p>

                  <p className="text-xs text-gray-400">
                    {empleado.outlet_name}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold">
                  {empleado.total_score}%
                </div>

                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    empleado.potential_level ===
                    "future_leader"
                      ? "bg-purple-100 text-purple-700"
                      : empleado.potential_level ===
                        "high"
                      ? "bg-green-100 text-green-700"
                      : empleado.potential_level ===
                        "medium"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {empleado.potential_level ===
                  "future_leader"
                    ? "FUTURO LÍDER"
                    : empleado.potential_level ===
                      "high"
                    ? "ALTO"
                    : empleado.potential_level ===
                      "medium"
                    ? "MEDIO"
                    : "BAJO"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}