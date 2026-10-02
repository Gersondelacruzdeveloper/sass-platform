import type { ReactNode } from "react";

import {
  Boxes,
  ClipboardList,
  HandCoins,
  House,
  LogOut,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  Store as StoreIcon,
  UserRound,
  WalletCards,
} from "lucide-react";

import type {
  ColmadoSection,
  Store,
} from "../types/colmado";


interface ColmadoShellProps {
  children: ReactNode;
  organisationName?: string;
  userName: string;
  userEmail: string;
  isPlatformOwner: boolean;
  stores: Store[];
  selectedStoreId: number;
  section: ColmadoSection;
  cashRegisterOpen: boolean;
  refreshing?: boolean;
  loggingOut?: boolean;
  onSelectStore: (storeId: number) => void;
  onSelectSection: (
    section: ColmadoSection,
  ) => void;
  onRefresh: () => void;
  onLogout: () => void;
}


const navigation: Array<{
  key: ColmadoSection;
  label: string;
  icon: typeof House;
  platformOnly?: boolean;
}> = [
  {
    key: "inicio",
    label: "Inicio",
    icon: House,
  },
  {
    key: "vender",
    label: "Vender",
    icon: ShoppingCart,
  },
  {
    key: "inventario",
    label: "Inventario",
    icon: Boxes,
  },
  {
    key: "pedidos",
    label: "Pedidos",
    icon: ClipboardList,
  },
  {
    key: "fiado",
    label: "Fiado",
    icon: HandCoins,
  },
  {
    key: "caja",
    label: "Caja",
    icon: WalletCards,
  },
  {
    key: "catalogo",
    label: "Catálogo maestro",
    icon: PackageSearch,
    platformOnly: true,
  },
];


export default function ColmadoShell({
  children,
  organisationName = "Mi Colmado",
  userName,
  userEmail,
  isPlatformOwner,
  stores,
  selectedStoreId,
  section,
  cashRegisterOpen,
  refreshing = false,
  loggingOut = false,
  onSelectStore,
  onSelectSection,
  onRefresh,
  onLogout,
}: ColmadoShellProps) {
  const visibleNavigation = navigation.filter(
    ({ platformOnly }) => (
      !platformOnly || isPlatformOwner
    ),
  );

  const mobileNavigation =
    visibleNavigation.filter(
      ({ key }) => (
        key !== "caja" &&
        key !== "catalogo"
      ),
    );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-emerald-950/10 bg-emerald-800 text-white shadow-sm">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center gap-2 px-3 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
              <StoreIcon
                aria-hidden="true"
                size={23}
              />
            </span>

            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-lg font-black leading-tight">
                {organisationName}
              </p>

              <p className="text-xs text-emerald-100">
                Control sencillo del negocio
              </p>
            </div>
          </div>

          <label className="ml-auto min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">
              Sucursal actual
            </span>

            <select
              aria-label="Sucursal actual"
              className="w-full truncate rounded-xl border border-white/20 bg-white px-3 py-2.5 font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-200"
              disabled={stores.length === 0}
              value={selectedStoreId || ""}
              onChange={(event) => {
                onSelectStore(
                  Number(event.target.value),
                );
              }}
            >
              {stores.length === 0 && (
                <option value="">
                  Sin sucursales
                </option>
              )}

              {stores.map((store) => (
                <option
                  key={store.id}
                  value={store.id}
                >
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          {isPlatformOwner && (
            <button
              type="button"
              aria-label="Catálogo maestro"
              title="Catálogo maestro"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25 focus:outline-none focus:ring-4 focus:ring-emerald-200 lg:hidden"
              onClick={() => {
                onSelectSection("catalogo");
              }}
            >
              <PackageSearch
                aria-hidden="true"
                size={21}
              />
            </button>
          )}

          <button
            type="button"
            aria-label="Actualizar información"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25 focus:outline-none focus:ring-4 focus:ring-emerald-200"
            disabled={
              refreshing ||
              !selectedStoreId
            }
            onClick={onRefresh}
          >
            <RefreshCw
              aria-hidden="true"
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
              size={21}
            />
          </button>

          <div className="hidden min-w-0 items-center gap-2 border-l border-white/20 pl-3 xl:flex">
            <UserRound
              aria-hidden="true"
              size={20}
            />

            <div className="min-w-0">
              <p className="max-w-40 truncate text-sm font-black">
                {userName}
              </p>

              <p className="max-w-40 truncate text-xs text-emerald-100">
                {userEmail}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Cerrar sesión"
            title={`Cerrar sesión de ${userName}`}
            disabled={loggingOut}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 transition hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:opacity-50"
            onClick={onLogout}
          >
            <LogOut
              aria-hidden="true"
              size={21}
            />
          </button>

          <button
            type="button"
            className={
              `hidden min-h-11 items-center gap-2 rounded-xl px-3 font-black transition focus:outline-none focus:ring-4 focus:ring-emerald-200 sm:flex ${
                cashRegisterOpen
                  ? (
                    "bg-emerald-50 " +
                    "text-emerald-900"
                  )
                  : (
                    "bg-amber-300 " +
                    "text-amber-950"
                  )
              }`
            }
            onClick={() => {
              onSelectSection("caja");
            }}
          >
            <span
              aria-hidden="true"
              className={
                `h-2.5 w-2.5 rounded-full ${
                  cashRegisterOpen
                    ? "bg-emerald-600"
                    : "bg-amber-700"
                }`
              }
            />

            {cashRegisterOpen
              ? "Caja abierta"
              : "Abrir caja"}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-screen-2xl">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r bg-white p-3 lg:flex">
          <nav
            aria-label="Secciones del colmado"
            className="space-y-1"
          >
            {visibleNavigation.map(
              ({
                key,
                label,
                icon: Icon,
              }) => {
                const active =
                  section === key;

                return (
                  <button
                    key={key}
                    type="button"
                    aria-current={
                      active
                        ? "page"
                        : undefined
                    }
                    className={
                      `flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left font-bold transition ${
                        active
                          ? (
                            "bg-emerald-700 " +
                            "text-white shadow"
                          )
                          : (
                            "text-slate-700 " +
                            "hover:bg-emerald-50 " +
                            "hover:text-emerald-900"
                          )
                      }`
                    }
                    onClick={() => {
                      onSelectSection(key);
                    }}
                  >
                    <Icon
                      aria-hidden="true"
                      size={23}
                    />

                    {label}

                    {key === "caja" && (
                      <span
                        aria-label={
                          cashRegisterOpen
                            ? "Abierta"
                            : "Cerrada"
                        }
                        className={
                          `ml-auto h-2.5 w-2.5 rounded-full ${
                            cashRegisterOpen
                              ? "bg-lime-300"
                              : "bg-amber-400"
                          }`
                        }
                      />
                    )}
                  </button>
                );
              },
            )}
          </nav>

          <div className="mt-auto rounded-xl bg-slate-100 p-3">
            <p className="truncate text-sm font-black text-slate-900">
              {userName}
            </p>

            <p className="truncate text-xs text-slate-600">
              {userEmail}
            </p>

            {isPlatformOwner && (
              <p className="mt-2 text-xs font-black text-emerald-700">
                Administrador de plataforma
              </p>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-8 lg:pt-6">
          {children}
        </main>
      </div>

      <button
        type="button"
        className={
          `fixed bottom-20 right-3 z-30 flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-black shadow-lg sm:hidden ${
            cashRegisterOpen
              ? "bg-emerald-700 text-white"
              : "bg-amber-300 text-amber-950"
          }`
        }
        onClick={() => {
          onSelectSection("caja");
        }}
      >
        <WalletCards
          aria-hidden="true"
          size={19}
        />

        {cashRegisterOpen
          ? "Caja abierta"
          : "Abrir caja"}
      </button>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_rgba(15,23,42,0.08)] lg:hidden"
      >
        {mobileNavigation.map(
          ({
            key,
            label,
            icon: Icon,
          }) => {
            const active =
              section === key;

            return (
              <button
                key={key}
                type="button"
                aria-current={
                  active
                    ? "page"
                    : undefined
                }
                className={
                  `flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-black transition ${
                    active
                      ? "text-emerald-700"
                      : "text-slate-500"
                  }`
                }
                onClick={() => {
                  onSelectSection(key);
                }}
              >
                <Icon
                  aria-hidden="true"
                  size={22}
                  strokeWidth={
                    active
                      ? 2.8
                      : 2
                  }
                />

                {label}
              </button>
            );
          },
        )}
      </nav>
    </div>
  );
}