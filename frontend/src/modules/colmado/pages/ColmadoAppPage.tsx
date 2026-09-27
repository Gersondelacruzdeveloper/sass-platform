import { useEffect, useMemo, useState } from "react";
import { AlertCircle, LoaderCircle, Store as StoreIcon } from "lucide-react";
import { useParams } from "react-router-dom";

import CashRegisterPanel from "../components/CashRegisterPanel";
import ColmadoHome from "../components/ColmadoHome";
import ColmadoShell from "../components/ColmadoShell";
import CreditPanel from "../components/CreditPanel";
import InventoryPanel from "../components/InventoryPanel";
import OrdersPanel from "../components/OrdersPanel";
import SalePanel from "../components/SalePanel";
import { useColmadoWorkspace } from "../hooks/useColmadoWorkspace";
import type { ColmadoSection } from "../types/colmado";

const sectionKey = (organisationSlug: string) =>
  `colmado:selected-section:${organisationSlug}`;

const validSections: ColmadoSection[] = [
  "inicio",
  "vender",
  "inventario",
  "pedidos",
  "fiado",
  "caja",
];

function savedSection(organisationSlug: string): ColmadoSection {
  const saved = localStorage.getItem(sectionKey(organisationSlug));
  return validSections.includes(saved as ColmadoSection)
    ? (saved as ColmadoSection)
    : "inicio";
}

function readableOrganisationName(slug: string) {
  if (!slug) return "Mi Colmado";
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("es") + word.slice(1))
    .join(" ");
}

export default function ColmadoAppPage() {
  const { organisationSlug = "" } = useParams();
  const [section, setSection] = useState<ColmadoSection>(() =>
    savedSection(organisationSlug),
  );
  const workspace = useColmadoWorkspace(organisationSlug);

  useEffect(() => {
    setSection(savedSection(organisationSlug));
  }, [organisationSlug]);

  function selectSection(nextSection: ColmadoSection) {
    localStorage.setItem(sectionKey(organisationSlug), nextSection);
    setSection(nextSection);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const organisationName = useMemo(
    () => readableOrganisationName(organisationSlug),
    [organisationSlug],
  );

  if (workspace.loadingStores) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="text-center text-slate-700">
          <LoaderCircle
            aria-hidden="true"
            className="mx-auto animate-spin text-emerald-700"
            size={42}
          />
          <p className="mt-4 font-black">Abriendo tu colmado...</p>
        </div>
      </div>
    );
  }

  if (!workspace.selectedStore) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-sm">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-800">
            <StoreIcon aria-hidden="true" size={32} />
          </span>
          <h1 className="mt-4 text-2xl font-black text-slate-950">
            Falta crear una sucursal
          </h1>
          <p className="mt-2 text-slate-600">
            Crea o activa por lo menos una sucursal para comenzar a vender.
          </p>
          {workspace.error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">
              {workspace.error}
            </p>
          )}
        </div>
      </div>
    );
  }

  const selectedStore = workspace.selectedStore;
  const cashRegisterOpen = workspace.cashRegister?.status === "open";

  return (
    <ColmadoShell
      organisationName={organisationName}
      stores={workspace.stores}
      selectedStoreId={workspace.selectedStoreId}
      section={section}
      cashRegisterOpen={cashRegisterOpen}
      refreshing={workspace.loadingWorkspace}
      onSelectStore={workspace.selectStore}
      onSelectSection={selectSection}
      onRefresh={() => void workspace.refreshWorkspace()}
    >
      {workspace.error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={19} />
          <span>{workspace.error}</span>
        </div>
      )}

      {section === "inicio" && (
        <ColmadoHome
          store={selectedStore}
          dashboard={workspace.dashboard}
          cashRegisterOpen={cashRegisterOpen}
          loading={workspace.loadingWorkspace}
          onNavigate={selectSection}
        />
      )}

      {section === "vender" && (
        <SalePanel
          organisationSlug={organisationSlug}
          store={selectedStore}
          cashRegisterOpen={cashRegisterOpen}
          onOpenCashRegister={() => selectSection("caja")}
          onSaleCompleted={workspace.refreshWorkspace}
        />
      )}

      {section === "inventario" && (
        <InventoryPanel
          organisationSlug={organisationSlug}
          store={selectedStore}
          onInventoryChanged={workspace.refreshWorkspace}
        />
      )}

      {section === "pedidos" && (
        <OrdersPanel
          organisationSlug={organisationSlug}
          store={selectedStore}
          onOrdersChanged={workspace.refreshWorkspace}
        />
      )}

      {section === "fiado" && (
        <CreditPanel
          organisationSlug={organisationSlug}
          store={selectedStore}
          onDataChanged={workspace.refreshWorkspace}
        />
      )}

      {section === "caja" && (
        <CashRegisterPanel
          organisationSlug={organisationSlug}
          store={selectedStore}
          cashRegister={workspace.cashRegister}
          onChanged={workspace.refreshWorkspace}
        />
      )}
    </ColmadoShell>
  );
}
