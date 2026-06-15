type PropiedadesTarjetaEstadistica = {
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  icono?: React.ReactNode;
  tendencia?: {
    valor: number;
    positiva?: boolean;
  };
};

export default function TarjetaEstadistica({
  titulo,
  valor,
  subtitulo,
  icono,
  tendencia,
}: PropiedadesTarjetaEstadistica) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">
            {titulo}
          </p>

          <h3 className="mt-2 text-3xl font-bold text-gray-900">
            {valor}
          </h3>

          {subtitulo && (
            <p className="mt-1 text-sm text-gray-500">
              {subtitulo}
            </p>
          )}
        </div>

        {icono && (
          <div className="rounded-xl bg-gray-100 p-3">
            {icono}
          </div>
        )}
      </div>

      {tendencia && (
        <div className="mt-4 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              tendencia.positiva
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {tendencia.positiva ? "+" : "-"}
            {tendencia.valor}%
          </span>

          <span className="text-xs text-gray-500">
            vs período anterior
          </span>
        </div>
      )}
    </div>
  );
}