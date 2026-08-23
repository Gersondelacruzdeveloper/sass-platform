// src/modules/ticketing/components/SellerPermissionHelpModal.tsx

import {
  AlertTriangle,
  CircleHelp,
  Lightbulb,
  ShieldCheck,
  X,
} from "lucide-react";

import type {
  SellerPermissionHelp,
  SellerPermissionRisk,
} from "../seller-permissions/sellerPermissionHelp";

type SellerPermissionHelpModalProps = {
  permission: SellerPermissionHelp;
  onClose: () => void;
};

function riskClasses(risk: SellerPermissionRisk) {
  if (risk === "crítico") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (risk === "alto") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }

  if (risk === "medio") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export default function SellerPermissionHelpModal({
  permission,
  onClose,
}: SellerPermissionHelpModalProps) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Ayuda del permiso: ${permission.title}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <CircleHelp className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-600">
                Ayuda para el administrador
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
                {permission.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
            aria-label="Cerrar explicación del permiso"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-96px)] space-y-4 overflow-y-auto p-5 sm:p-6">
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
              <div>
                <h3 className="text-sm font-black text-slate-950">
                  ¿Qué estás autorizando?
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {permission.summary}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
            <div className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
              <div>
                <h3 className="text-sm font-black text-sky-950">
                  Ejemplo real
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-sky-900">
                  {permission.example}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-black text-slate-950">
              ¿Qué pasa si está desactivado?
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {permission.disabledResult}
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-black text-slate-950">
              Dependencias y límites
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {permission.limitations}
            </p>
          </section>

          <section
            className={`rounded-3xl border p-5 ${riskClasses(permission.risk)}`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h3 className="text-sm font-black">
                  Riesgo: {permission.risk.toUpperCase()}
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6">
                  {permission.riskReason}
                </p>
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
