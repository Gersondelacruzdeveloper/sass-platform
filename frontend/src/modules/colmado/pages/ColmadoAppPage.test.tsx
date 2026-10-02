import type {
  ReactNode,
} from "react";

import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ColmadoWorkspace,
} from "../hooks/useColmadoWorkspace";

import type {
  ColmadoSection,
  Store,
} from "../types/colmado";

import ColmadoAppPage from "./ColmadoAppPage";


const workspaceMock = vi.hoisted(() => ({
  current:
    null as unknown as ColmadoWorkspace,
}));


const authMocks = vi.hoisted(() => ({
  getCurrentColmadoSession: vi.fn(),
  logoutFromColmado: vi.fn(),
}));


vi.mock(
  "../hooks/useColmadoWorkspace",
  () => ({
    useColmadoWorkspace: () => (
      workspaceMock.current
    ),
  }),
);


vi.mock(
  "../api/colmadoAuthClient",
  () => authMocks,
);


vi.mock(
  "../components/ColmadoShell",
  () => ({
    default: ({
      children,
      organisationName,
      userName,
      userEmail,
      isPlatformOwner,
      onSelectSection,
      onSelectStore,
      onRefresh,
      onLogout,
    }: {
      children: ReactNode;
      organisationName: string;
      userName: string;
      userEmail: string;
      isPlatformOwner: boolean;
      onSelectSection: (
        section: ColmadoSection,
      ) => void;
      onSelectStore: (
        storeId: number,
      ) => void;
      onRefresh: () => void;
      onLogout: () => void;
    }) => (
      <div>
        <p>
          Negocio: {organisationName}
        </p>

        <p>
          Usuario: {userName}
        </p>

        <p>
          Correo: {userEmail}
        </p>

        <nav>
          {(
            [
              "inicio",
              "vender",
              "inventario",
              "pedidos",
              "fiado",
              "caja",
            ] as ColmadoSection[]
          ).map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => {
                onSelectSection(section);
              }}
            >
              Ir a {section}
            </button>
          ))}

          {isPlatformOwner && (
            <button
              type="button"
              onClick={() => {
                onSelectSection(
                  "catalogo",
                );
              }}
            >
              Ir a catálogo
            </button>
          )}
        </nav>

        <button
          type="button"
          onClick={() => {
            onSelectStore(3);
          }}
        >
          Seleccionar sucursal 3
        </button>

        <button
          type="button"
          onClick={onRefresh}
        >
          Actualizar todo
        </button>

        <button
          type="button"
          onClick={onLogout}
        >
          Cerrar sesión
        </button>

        {children}
      </div>
    ),
  }),
);


vi.mock(
  "../components/ColmadoHome",
  () => ({
    default: ({
      onNavigate,
    }: {
      onNavigate: (
        section: ColmadoSection,
      ) => void;
    }) => (
      <div>
        <p>Pantalla de inicio</p>

        <button
          type="button"
          onClick={() => {
            onNavigate("vender");
          }}
        >
          Venta rápida
        </button>
      </div>
    ),
  }),
);


vi.mock(
  "../components/SalePanel",
  () => ({
    default: ({
      onSaleCompleted,
    }: {
      onSaleCompleted:
        () => void | Promise<void>;
    }) => (
      <div>
        <p>Pantalla de venta</p>

        <button
          type="button"
          onClick={() => {
            void onSaleCompleted();
          }}
        >
          Completar venta simulada
        </button>
      </div>
    ),
  }),
);


vi.mock(
  "../components/InventoryPanel",
  () => ({
    default: () => (
      <p>Pantalla de inventario</p>
    ),
  }),
);


vi.mock(
  "../components/OrdersPanel",
  () => ({
    default: () => (
      <p>Pantalla de pedidos</p>
    ),
  }),
);


vi.mock(
  "../components/CreditPanel",
  () => ({
    default: () => (
      <p>Pantalla de fiado</p>
    ),
  }),
);


vi.mock(
  "../components/CashRegisterPanel",
  () => ({
    default: () => (
      <p>Pantalla de caja</p>
    ),
  }),
);


vi.mock(
  "../components/PlatformCatalogPanel",
  () => ({
    default: () => (
      <p>Pantalla del catálogo maestro</p>
    ),
  }),
);


const store: Store = {
  id: 2,
  name: "Colmado Macao",
  address: "Macao",
  phone: "809-555-0000",
  is_active: true,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};


function baseWorkspace(
  overrides:
    Partial<ColmadoWorkspace> = {},
): ColmadoWorkspace {
  return {
    stores: [
      store,
      {
        ...store,
        id: 3,
        name: "Colmado Verón",
      },
    ],
    selectedStoreId: 2,
    selectedStore: store,
    dashboard: null,
    cashRegister: null,
    loadingStores: false,
    loadingWorkspace: false,
    error: null,
    selectStore: vi.fn(),
    refreshWorkspace:
      vi.fn().mockResolvedValue(
        undefined,
      ),
    ...overrides,
  };
}


function session(
  isPlatformOwner = false,
) {
  return {
    organisation: {
      id: 4,
      name: "Colmados Don Juan",
      slug: "colmado-don-juan",
      business_type: "colmado",
      plan: "basic",
      is_active: true,
    },
    user: {
      id: 10,
      email: "juan@example.com",
      username: "juan@example.com",
      first_name: "Juan",
      last_name: "Pérez",
      phone: "809-555-0101",
      role: "owner",
      is_platform_owner:
        isPlatformOwner,
      organisation: {
        id: 4,
        name: "Colmados Don Juan",
        slug: "colmado-don-juan",
        business_type: "colmado",
        plan: "basic",
        is_active: true,
      },
    },
  };
}


function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        "/colmado/colmado-don-juan",
      ]}
    >
      <Routes>
        <Route
          path="/colmado/login"
          element={
            <p>Página de login</p>
          }
        />

        <Route
          path="/colmado/:organisationSlug"
          element={
            <ColmadoAppPage />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}


describe("ColmadoAppPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    workspaceMock.current =
      baseWorkspace();

    authMocks
      .getCurrentColmadoSession
      .mockResolvedValue(
        session(false),
      );

    authMocks
      .logoutFromColmado
      .mockResolvedValue(
        undefined,
      );
  });


  it(
    "loads the current user session before opening the colmado",
    async () => {
      renderPage();

      expect(
        screen.getByText(
          "Abriendo tu colmado...",
        ),
      ).toBeInTheDocument();

      expect(
        await screen.findByText(
          "Pantalla de inicio",
        ),
      ).toBeInTheDocument();

      expect(
        authMocks
          .getCurrentColmadoSession,
      ).toHaveBeenCalledOnce();
    },
  );


  it(
    "shows the real business and current user",
    async () => {
      renderPage();

      expect(
        await screen.findByText(
          "Negocio: Colmados Don Juan",
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          "Usuario: Juan Pérez",
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          "Correo: juan@example.com",
        ),
      ).toBeInTheDocument();
    },
  );


  it(
    "does not expose the master catalog to a normal user",
    async () => {
      renderPage();

      await screen.findByText(
        "Pantalla de inicio",
      );

      expect(
        screen.queryByRole(
          "button",
          {
            name: "Ir a catálogo",
          },
        ),
      ).not.toBeInTheDocument();

      expect(
        screen.queryByText(
          "Pantalla del catálogo maestro",
        ),
      ).not.toBeInTheDocument();
    },
  );


  it(
    "opens the master catalog for the platform owner",
    async () => {
      const user = userEvent.setup();

      authMocks
        .getCurrentColmadoSession
        .mockResolvedValue(
          session(true),
        );

      renderPage();

      await screen.findByText(
        "Pantalla de inicio",
      );

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Ir a catálogo",
          },
        ),
      );

      expect(
        screen.getByText(
          "Pantalla del catálogo maestro",
        ),
      ).toBeInTheDocument();
    },
  );


  it(
    "redirects unauthenticated users to the colmado login",
    async () => {
      authMocks
        .getCurrentColmadoSession
        .mockRejectedValue(
          new Error("Forbidden"),
        );

      renderPage();

      expect(
        await screen.findByText(
          "Página de login",
        ),
      ).toBeInTheDocument();
    },
  );


  it(
    "logs out and returns to the colmado login",
    async () => {
      const user = userEvent.setup();

      renderPage();

      await screen.findByText(
        "Pantalla de inicio",
      );

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Cerrar sesión",
          },
        ),
      );

      await waitFor(() => {
        expect(
          authMocks.logoutFromColmado,
        ).toHaveBeenCalledOnce();
      });

      expect(
        await screen.findByText(
          "Página de login",
        ),
      ).toBeInTheDocument();
    },
  );


  it(
    "navigates between every operational section",
    async () => {
      const user = userEvent.setup();

      renderPage();

      await screen.findByText(
        "Pantalla de inicio",
      );

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Ir a vender",
          },
        ),
      );

      expect(
        screen.getByText(
          "Pantalla de venta",
        ),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Ir a inventario",
          },
        ),
      );

      expect(
        screen.getByText(
          "Pantalla de inventario",
        ),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Ir a pedidos",
          },
        ),
      );

      expect(
        screen.getByText(
          "Pantalla de pedidos",
        ),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Ir a fiado",
          },
        ),
      );

      expect(
        screen.getByText(
          "Pantalla de fiado",
        ),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Ir a caja",
          },
        ),
      );

      expect(
        screen.getByText(
          "Pantalla de caja",
        ),
      ).toBeInTheDocument();
    },
  );


  it(
    "connects store selection and refresh actions",
    async () => {
      const user = userEvent.setup();
      const selectStore = vi.fn();

      const refreshWorkspace =
        vi.fn().mockResolvedValue(
          undefined,
        );

      workspaceMock.current =
        baseWorkspace({
          selectStore,
          refreshWorkspace,
        });

      renderPage();

      await screen.findByText(
        "Pantalla de inicio",
      );

      await user.click(
        screen.getByRole(
          "button",
          {
            name:
              "Seleccionar sucursal 3",
          },
        ),
      );

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Actualizar todo",
          },
        ),
      );

      expect(
        selectStore,
      ).toHaveBeenCalledWith(3);

      expect(
        refreshWorkspace,
      ).toHaveBeenCalledOnce();
    },
  );


  it(
    "refreshes the workspace after a completed sale",
    async () => {
      const user = userEvent.setup();

      const refreshWorkspace =
        vi.fn().mockResolvedValue(
          undefined,
        );

      workspaceMock.current =
        baseWorkspace({
          refreshWorkspace,
        });

      renderPage();

      await screen.findByText(
        "Pantalla de inicio",
      );

      await user.click(
        screen.getByRole(
          "button",
          {
            name: "Ir a vender",
          },
        ),
      );

      await user.click(
        screen.getByRole(
          "button",
          {
            name:
              "Completar venta simulada",
          },
        ),
      );

      expect(
        refreshWorkspace,
      ).toHaveBeenCalledOnce();
    },
  );
});