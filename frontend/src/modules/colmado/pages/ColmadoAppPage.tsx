import {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  LoaderCircle,
  Store as StoreIcon,
} from "lucide-react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getCurrentColmadoSession,
  logoutFromColmado,
  type ColmadoLoginResult,
} from "../api/colmadoAuthClient";

import CashRegisterPanel from "../components/CashRegisterPanel";
import ColmadoHome from "../components/ColmadoHome";
import ColmadoShell from "../components/ColmadoShell";
import CreditPanel from "../components/CreditPanel";
import InventoryPanel from "../components/InventoryPanel";
import OrdersPanel from "../components/OrdersPanel";
import PlatformCatalogPanel from "../components/PlatformCatalogPanel";
import SalePanel from "../components/SalePanel";
import { useColmadoWorkspace } from "../hooks/useColmadoWorkspace";

import type {
  ColmadoSection,
} from "../types/colmado";


const sectionKey = (
  organisationSlug: string,
) => (
  `colmado:selected-section:${organisationSlug}`
);


const validSections: ColmadoSection[] = [
  "inicio",
  "vender",
  "inventario",
  "pedidos",
  "fiado",
  "caja",
  "catalogo",
];


function savedSection(
  organisationSlug: string,
): ColmadoSection {
  const saved = localStorage.getItem(
    sectionKey(organisationSlug),
  );

  return validSections.includes(
    saved as ColmadoSection,
  )
    ? saved as ColmadoSection
    : "inicio";
}


export default function ColmadoAppPage() {
  const {
    organisationSlug = "",
  } = useParams();

  const navigate = useNavigate();

  const [section, setSection] =
    useState<ColmadoSection>(
      () => savedSection(organisationSlug),
    );

  const [session, setSession] =
    useState<ColmadoLoginResult | null>(null);

  const [
    loadingSession,
    setLoadingSession,
  ] = useState(true);

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  const workspace =
    useColmadoWorkspace(organisationSlug);


  useEffect(() => {
    let active = true;

    setLoadingSession(true);

    void getCurrentColmadoSession()
      .then((result) => {
        if (!active) {
          return;
        }

        if (
          result.organisation.slug !==
          organisationSlug
        ) {
          navigate(
            `/colmado/${result.organisation.slug}`,
            {
              replace: true,
            },
          );

          return;
        }

        setSession(result);
      })
      .catch(() => {
        if (active) {
          navigate(
            "/colmado/login",
            {
              replace: true,
            },
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    navigate,
    organisationSlug,
  ]);


  useEffect(() => {
    setSection(
      savedSection(organisationSlug),
    );
  }, [organisationSlug]);


  useEffect(() => {
    if (
      session &&
      !session.user.is_platform_owner &&
      section === "catalogo"
    ) {
      localStorage.setItem(
        sectionKey(organisationSlug),
        "inicio",
      );

      setSection("inicio");
    }
  }, [
    organisationSlug,
    section,
    session,
  ]);


  function selectSection(
    nextSection: ColmadoSection,
  ) {
    if (
      nextSection === "catalogo" &&
      !session?.user.is_platform_owner
    ) {
      return;
    }

    localStorage.setItem(
      sectionKey(organisationSlug),
      nextSection,
    );

    setSection(nextSection);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }


  async function logout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await logoutFromColmado();
    } finally {
      navigate(
        "/colmado/login",
        {
          replace: true,
        },
      );
    }
  }


  if (
    loadingSession ||
    workspace.loadingStores ||
    !session
  ) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="text-center text-slate-700">
          <LoaderCircle
            aria-hidden="true"
            className="mx-auto animate-spin text-emerald-700"
            size={42}
          />

          <p className="mt-4 font-black">
            Abriendo tu colmado...
          </p>
        </div>
      </div>
    );
  }


  if (!workspace.selectedStore) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-sm">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-800">
            <StoreIcon
              aria-hidden="true"
              size={32}
            />
          </span>

          <h1 className="mt-4 text-2xl font-black text-slate-950">
            Falta crear una sucursal
          </h1>

          <p className="mt-2 text-slate-600">
            Crea o activa por lo menos una
            sucursal para comenzar a vender.
          </p>

          {workspace.error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"
            >
              {workspace.error}
            </p>
          )}
        </div>
      </div>
    );
  }


  const selectedStore =
    workspace.selectedStore;

  const cashRegisterOpen =
    workspace.cashRegister?.status === "open";

  const fullName = (
    `${session.user.first_name} ` +
    session.user.last_name
  ).trim();

  const userName = (
    fullName ||
    session.user.username ||
    session.user.email
  );


  return (
    <ColmadoShell
      organisationName={
        session.organisation.name
      }
      userName={userName}
      userEmail={session.user.email}
      isPlatformOwner={
        session.user.is_platform_owner
      }
      stores={workspace.stores}
      selectedStoreId={
        workspace.selectedStoreId
      }
      section={section}
      cashRegisterOpen={
        cashRegisterOpen
      }
      refreshing={
        workspace.loadingWorkspace
      }
      loggingOut={loggingOut}
      onSelectStore={
        workspace.selectStore
      }
      onSelectSection={
        selectSection
      }
      onRefresh={() => {
        void workspace.refreshWorkspace();
      }}
      onLogout={() => {
        void logout();
      }}
    >
      {workspace.error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={19}
          />

          <span>
            {workspace.error}
          </span>
        </div>
      )}

      {section === "inicio" && (
        <ColmadoHome
          store={selectedStore}
          dashboard={workspace.dashboard}
          cashRegisterOpen={
            cashRegisterOpen
          }
          loading={
            workspace.loadingWorkspace
          }
          onNavigate={
            selectSection
          }
        />
      )}

      {section === "vender" && (
        <SalePanel
          organisationSlug={
            organisationSlug
          }
          store={selectedStore}
          cashRegisterOpen={
            cashRegisterOpen
          }
          onOpenCashRegister={() => {
            selectSection("caja");
          }}
          onSaleCompleted={
            workspace.refreshWorkspace
          }
        />
      )}

      {section === "inventario" && (
        <InventoryPanel
          organisationSlug={
            organisationSlug
          }
          store={selectedStore}
          onInventoryChanged={
            workspace.refreshWorkspace
          }
        />
      )}

      {section === "pedidos" && (
        <OrdersPanel
          organisationSlug={
            organisationSlug
          }
          store={selectedStore}
          onOrdersChanged={
            workspace.refreshWorkspace
          }
        />
      )}

      {section === "fiado" && (
        <CreditPanel
          organisationSlug={
            organisationSlug
          }
          store={selectedStore}
          onDataChanged={
            workspace.refreshWorkspace
          }
        />
      )}

      {section === "caja" && (
        <CashRegisterPanel
          organisationSlug={
            organisationSlug
          }
          store={selectedStore}
          cashRegister={
            workspace.cashRegister
          }
          onChanged={
            workspace.refreshWorkspace
          }
        />
      )}

      {(
        section === "catalogo" &&
        session.user.is_platform_owner
      ) && (
        <PlatformCatalogPanel />
      )}
    </ColmadoShell>
  );
}