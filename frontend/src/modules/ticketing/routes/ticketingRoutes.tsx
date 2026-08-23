// src/modules/ticketing/routes/ticketingRoutes.tsx
// Route version: fail-closed-portal-guards-v6-role-aware-2026-08-05

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  useParams,
} from "react-router-dom";

import ProtectedRoute from "../../../components/ProtectedRoute";
import api from "../../../api/axios";
import { useAppSelector } from "../../../store/hooks";

import TicketingDashboardLayout from "../layouts/TicketingDashboardLayout";
import TicketingSellerLayout from "../layouts/TicketingSellerLayout";
import TicketingPartnerLayout from "../layouts/TicketingPartnerLayout";
import {
  Loader2,
  ShieldCheck,
} from "lucide-react";

import TicketingLandingPage from "../pages/TicketingLandingPage";
import TicketingInstallPage from "../pages/TicketingInstallPage";
import TicketingLoginPage from "../pages/TicketingLoginPage";
import TicketingSignupPage from "../pages/TicketingSignupPage";
import TicketingBillingLockedPage from "../pages/TicketingBillingLockedPage";
import TicketingSubscriptionSuccessPage from "../pages/TicketingSubscriptionSuccessPage";
import TicketingSubscriptionCancelPage from "../pages/TicketingSubscriptionCancelPage";

import TicketingDashboardPage from "../pages/TicketingDashboardPage";
import TicketingBookingsPage from "../pages/TicketingBookingsPage";
import TicketingNewBookingPage from "../pages/TicketingNewBookingPage";
import TicketingProductsPage from "../pages/TicketingProductsPage";
import TicketingExcursionsPage from "../pages/TicketingExcursionsPage";
import TicketingTransfersPage from "../pages/TicketingTransfersPage";
import TicketingEventsPage from "../pages/TicketingEventsPage";
import TicketingSellersPage from "../pages/TicketingSellersPage";
import TicketingCommissionsPage from "../pages/TicketingCommissionsPage";
import TicketingReportsPage from "../pages/TicketingReportsPage";
import TicketingPickupSchedulesPage from "../pages/TicketingPickupSchedulesPage";
import TicketingAvailabilityPage from "../pages/TicketingAvailabilityPage";
import TicketingSettingsPage from "../pages/TicketingSettingsPage";
import TicketingBrandingPage from "../pages/TicketingBrandingPage";
import TicketingDomainPage from "../pages/TicketingDomainPage";
import TicketingIntegrationsPage from "../pages/TicketingIntegrationsPage";
import TicketingSEOPage from "../pages/TicketingSEOPage";
import TicketingSellerOnboardingPage from "../pages/TicketingSellerOnboardingPage";
import PublicSellerApplicationPage from "../pages/PublicSellerApplicationPage";
import SellerApplicationStatusPage from "../pages/SellerApplicationStatusPage";

import TicketingSellerDashboardPage from "../pages/seller/TicketingSellerDashboardPage";
import TicketingSellerProductsPage from "../pages/seller/TicketingSellerProductsPage";
import TicketingSellerNewBookingPage from "../pages/seller/TicketingSellerNewBookingPage";
import TicketingSellerAIBookingPage from "../pages/seller/TicketingSellerAIBookingPage";
import TicketingSellerBookingsPage from "../pages/seller/TicketingSellerBookingsPage";
import TicketingSellerCustomersPage from "../pages/seller/TicketingSellerCustomersPage";
import TicketingSellerCommissionsPage from "../pages/seller/TicketingSellerCommissionsPage";
import TicketingSellerProfilePage from "../pages/seller/TicketingSellerProfilePage";
import TicketingSellerPayoutsPage from "../pages/seller/TicketingSellerPayoutsPage";

// Operations pages
import TicketingOperationsDashboardPage from "../pages/operations/TicketingOperationsDashboardPage";
import TicketingBusinessEntitiesPage from "../pages/operations/TicketingBusinessEntitiesPage";
import TicketingBusinessEntityDetailPage from "../pages/operations/TicketingBusinessEntityDetailPage";
import TicketingBusinessAgreementsPage from "../pages/operations/TicketingBusinessAgreementsPage";
import TicketingScannerPage from "../pages/operations/TicketingScannerPage";
import TicketingAdmissionsPage from "../pages/operations/TicketingAdmissionsPage";
import TicketingScanAttemptsPage from "../pages/operations/TicketingScanAttemptsPage";
import TicketingSettlementsPage from "../pages/operations/TicketingSettlementsPage";
import TicketingSettlementDetailPage from "../pages/operations/TicketingSettlementDetailPage";
import TicketingLedgerPage from "../pages/operations/TicketingLedgerPage";

import PublicExperienceHomePage from "../pages/PublicExperienceHomePage";
import PublicProductDetailPage from "../pages/PublicProductDetailPage";
import PublicProductsListingPage from "../pages/PublicProductsListingPage";
import PublicCheckoutPage from "../pages/PublicCheckoutPage";
import PublicConfirmationPage from "../pages/PublicConfirmationPage";
import TicketingBlogPostsPage from "../pages/TicketingBlogPostsPage";
import TicketingBlogEditorPage from "../pages/TicketingBlogEditorPage";
import PublicBlogListPage from "../pages/PublicBlogListPage";
import PublicBlogDetailPage from "../pages/PublicBlogDetailPage";

const PLATFORM_HOSTS = [
  "localhost",
  "127.0.0.1",
  "app.puntacanadiscovery.com",
];

function getCurrentHostname(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hostname.toLowerCase();
}

function isCustomTicketingDomain(): boolean {
  const hostname = getCurrentHostname();

  return Boolean(hostname) && !PLATFORM_HOSTS.includes(hostname);
}

function CustomDomainOnly({ children }: { children: ReactElement }) {
  if (!isCustomTicketingDomain()) {
    return <Navigate to="/ticketing" replace />;
  }

  return children;
}


type PartnerPermissions = {
  can_access_dashboard: boolean;
  can_scan: boolean;
  can_view_today_bookings: boolean;
  can_view_admissions: boolean;
  can_view_customer_contact: boolean;
  can_view_financials: boolean;
  can_view_settlements: boolean;
  can_record_payments: boolean;
  can_reverse_admissions: boolean;
  can_manage_users: boolean;
};

type PartnerBootstrap = {
  portal_type: "partner";
  organisation: {
    id: number;
    name: string;
    slug: string;
  };
  default_business_entity_id: number;
  default_business_entity: {
    id: number;
    name: string;
    slug: string;
    entity_type: string;
  };
  role: string;
  permissions: PartnerPermissions;
  routes?: Record<string, string>;
};

type AccessFailure = "none" | "denied" | "unavailable";

type PartnerAccessState = {
  loading: boolean;
  isPartner: boolean;
  data: PartnerBootstrap | null;
  failure: AccessFailure;
};

const EMPTY_PARTNER_ACCESS: PartnerAccessState = {
  loading: true,
  isPartner: false,
  data: null,
  failure: "none",
};

type PortalType =
  | "owner"
  | "seller"
  | "pending"
  | "partner"
  | "denied"
  | "unavailable";

type PortalAccessState = {
  loading: boolean;
  portalType: PortalType | "checking";
  partner: PartnerBootstrap | null;
};

function normalizeRole(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function getHttpStatus(error: unknown): number | undefined {
  if (
    !error ||
    typeof error !== "object" ||
    !("response" in error)
  ) {
    return undefined;
  }

  return (
    error as {
      response?: {
        status?: number;
      };
    }
  ).response?.status;
}

function getVerifiedUser(responseData: any): any {
  return responseData?.user || responseData;
}

function hasExplicitOwnerAccess(
  user: any,
  organisationSlug: string,
): boolean {
  if (
    user?.is_staff === true ||
    user?.is_superuser === true ||
    user?.is_platform_owner === true
  ) {
    return true;
  }

  const adminRoles = new Set(["owner", "admin", "manager"]);
  const currentOrganisationSlug =
    user?.organisation?.slug ||
    user?.organisation_slug ||
    "";

  return Boolean(
    currentOrganisationSlug === organisationSlug &&
      user?.organisation?.is_active !== false &&
      adminRoles.has(normalizeRole(user?.role)),
  );
}

function isNormalAccessFailure(status?: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

function organisationParams(organisationSlug: string) {
  return {
    slug: organisationSlug,
    organisation_slug: organisationSlug,
  };
}

function getPartnerDestination(
  organisationSlug: string,
  permissions?: Partial<PartnerPermissions> | null,
): string {
  const base = `/ticketing/${organisationSlug}/partner`;

  if (permissions?.can_scan) {
    return `${base}/scanner`;
  }

  if (permissions?.can_view_admissions) {
    return `${base}/admissions`;
  }

  if (permissions?.can_view_settlements) {
    return `${base}/settlements`;
  }

  if (permissions?.can_view_today_bookings) {
    return `${base}/scan-history`;
  }

  return `${base}/access-denied`;
}

function usePartnerAccess(
  organisationSlug?: string,
): PartnerAccessState {
  const [state, setState] =
    useState<PartnerAccessState>(EMPTY_PARTNER_ACCESS);

  useEffect(() => {
    let cancelled = false;

    async function loadPartnerAccess() {
      if (!organisationSlug) {
        setState({
          loading: false,
          isPartner: false,
          data: null,
          failure: "denied",
        });
        return;
      }

      setState(EMPTY_PARTNER_ACCESS);

      try {
        const response = await api.get<PartnerBootstrap>(
          "/ticketing/partner/bootstrap/",
          { params: organisationParams(organisationSlug) },
        );

        if (cancelled) return;

        if (response.data?.portal_type !== "partner") {
          setState({
            loading: false,
            isPartner: false,
            data: null,
            failure: "denied",
          });
          return;
        }

        setState({
          loading: false,
          isPartner: true,
          data: response.data,
          failure: "none",
        });
      } catch (error) {
        if (cancelled) return;

        const status = getHttpStatus(error);

        setState({
          loading: false,
          isPartner: false,
          data: null,
          failure: isNormalAccessFailure(status)
            ? "denied"
            : "unavailable",
        });
      }
    }

    void loadPartnerAccess();

    return () => {
      cancelled = true;
    };
  }, [organisationSlug]);

  return state;
}

function usePortalAccess(
  organisationSlug?: string,
): PortalAccessState {
  const [state, setState] = useState<PortalAccessState>({
    loading: true,
    portalType: "checking",
    partner: null,
  });

  useEffect(() => {
    let cancelled = false;

    function commit(nextState: PortalAccessState) {
      if (!cancelled) {
        setState(nextState);
      }
    }

    async function resolvePortalAccess() {
      commit({
        loading: true,
        portalType: "checking",
        partner: null,
      });

      if (!organisationSlug) {
        commit({
          loading: false,
          portalType: "denied",
          partner: null,
        });
        return;
      }

      let verifiedUser: any;

      try {
        const response = await api.get("/accounts/me/");
        verifiedUser = getVerifiedUser(response.data);
      } catch (error) {
        const status = getHttpStatus(error);

        commit({
          loading: false,
          portalType: isNormalAccessFailure(status)
            ? "denied"
            : "unavailable",
          partner: null,
        });
        return;
      }

      if (!verifiedUser) {
        commit({
          loading: false,
          portalType: "unavailable",
          partner: null,
        });
        return;
      }

      // /accounts/me/ proves an organisation administrator only when its
      // membership organisation matches the organisation in the route.
      if (hasExplicitOwnerAccess(verifiedUser, organisationSlug)) {
        commit({
          loading: false,
          portalType: "owner",
          partner: null,
        });
        return;
      }

      // Seller identity is authoritative only from the organisation-specific
      // seller endpoint. /accounts/me/ does not return Seller model data.
      try {
        const response = await api.get("/ticketing/sellers/me/", {
          params: organisationParams(organisationSlug),
        });
        const seller = response.data;

        if (
          normalizeRole(seller?.application_status) === "approved" &&
          seller?.is_active === true &&
          seller?.can_access_dashboard !== false
        ) {
          commit({
            loading: false,
            portalType: "seller",
            partner: null,
          });
          return;
        }
      } catch (error) {
        const status = getHttpStatus(error);

        if (!isNormalAccessFailure(status)) {
          commit({
            loading: false,
            portalType: "unavailable",
            partner: null,
          });
          return;
        }
      }

      // A pending applicant is allowed to see only the application-status page.
      try {
        const response = await api.get("/ticketing/seller/application/", {
          params: organisationParams(organisationSlug),
        });
        const applicationStatus = normalizeRole(response.data?.status);

        if (
          applicationStatus === "pending" ||
          applicationStatus === "needs_information"
        ) {
          commit({
            loading: false,
            portalType: "pending",
            partner: null,
          });
          return;
        }

        if (
          applicationStatus === "rejected" ||
          applicationStatus === "withdrawn" ||
          applicationStatus === "approved"
        ) {
          commit({
            loading: false,
            portalType: "denied",
            partner: null,
          });
          return;
        }
      } catch (error) {
        const status = getHttpStatus(error);

        if (!isNormalAccessFailure(status)) {
          commit({
            loading: false,
            portalType: "unavailable",
            partner: null,
          });
          return;
        }
      }

      try {
        const response = await api.get<PartnerBootstrap>(
          "/ticketing/partner/bootstrap/",
          { params: organisationParams(organisationSlug) },
        );

        if (response.data?.portal_type !== "partner") {
          commit({
            loading: false,
            portalType: "denied",
            partner: null,
          });
          return;
        }

        commit({
          loading: false,
          portalType: "partner",
          partner: response.data,
        });
      } catch (error) {
        const status = getHttpStatus(error);

        commit({
          loading: false,
          portalType: isNormalAccessFailure(status)
            ? "denied"
            : "unavailable",
          partner: null,
        });
      }
    }

    void resolvePortalAccess();

    return () => {
      cancelled = true;
    };
  }, [organisationSlug]);

  return state;
}

function RouteLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
        <span className="text-sm font-black text-slate-700">
          Checking portal access...
        </span>
      </div>
    </div>
  );
}

function PortalAccessMessage({
  title,
  message,
  organisationSlug,
  allowRetry = false,
}: {
  title: string;
  message: string;
  organisationSlug?: string;
  allowRetry?: boolean;
}) {
  const loginPath = organisationSlug
    ? `/ticketing/${organisationSlug}/login`
    : "/ticketing";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-11 w-11 text-slate-700" />

        <h1 className="mt-4 text-2xl font-black text-slate-950">
          {title}
        </h1>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {message}
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {allowRetry && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50"
            >
              Try again
            </button>
          )}

          <Link
            to={loginPath}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Return to login
          </Link>
        </div>
      </div>
    </div>
  );
}

function OwnerPortalGuard({
  children,
}: {
  children: ReactElement;
}) {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const access = usePortalAccess(organisationSlug);

  if (access.loading) {
    return <RouteLoadingScreen />;
  }

  if (
    access.portalType === "partner" &&
    access.partner &&
    organisationSlug
  ) {
    return (
      <Navigate
        to={getPartnerDestination(
          organisationSlug,
          access.partner.permissions,
        )}
        replace
      />
    );
  }

  if (access.portalType === "seller" && organisationSlug) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/seller/dashboard`}
        replace
      />
    );
  }

  if (access.portalType === "pending" && organisationSlug) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/seller-application`}
        replace
      />
    );
  }

  if (access.portalType === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify access"
        message="The server could not confirm your permissions. For security, the owner dashboard has been blocked and no dashboard information has been displayed."
        organisationSlug={organisationSlug}
        allowRetry
      />
    );
  }

  if (access.portalType !== "owner") {
    return (
      <PortalAccessMessage
        title="Access denied"
        message="Your account does not have owner, administrator, or manager permission for this organisation."
        organisationSlug={organisationSlug}
      />
    );
  }

  return children;
}

function SellerPortalGuard({
  children,
}: {
  children: ReactElement;
}) {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const access = usePortalAccess(organisationSlug);

  if (access.loading) {
    return <RouteLoadingScreen />;
  }

  if (access.portalType === "seller") {
    return children;
  }

  if (access.portalType === "pending" && organisationSlug) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/seller-application`}
        replace
      />
    );
  }

  if (access.portalType === "owner" && organisationSlug) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/dashboard`}
        replace
      />
    );
  }

  if (
    access.portalType === "partner" &&
    access.partner &&
    organisationSlug
  ) {
    return (
      <Navigate
        to={getPartnerDestination(
          organisationSlug,
          access.partner.permissions,
        )}
        replace
      />
    );
  }

  if (access.portalType === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify access"
        message="The server could not confirm that this seller account is approved. For security, the seller dashboard has been blocked."
        organisationSlug={organisationSlug}
        allowRetry
      />
    );
  }

  return (
    <PortalAccessMessage
      title="Seller access denied"
      message="This seller account is not approved or is no longer active."
      organisationSlug={organisationSlug}
    />
  );
}

function PartnerPortalGuard({
  children,
}: {
  children: ReactElement;
}) {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const access = usePortalAccess(organisationSlug);

  if (access.loading) {
    return <RouteLoadingScreen />;
  }

  if (access.portalType === "partner") {
    return children;
  }

  if (access.portalType === "owner" && organisationSlug) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/dashboard`}
        replace
      />
    );
  }

  if (access.portalType === "seller" && organisationSlug) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/seller/dashboard`}
        replace
      />
    );
  }

  if (access.portalType === "pending" && organisationSlug) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/seller-application`}
        replace
      />
    );
  }

  if (access.portalType === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify access"
        message="The server could not confirm your partner permissions. For security, the partner portal has been blocked."
        organisationSlug={organisationSlug}
        allowRetry
      />
    );
  }

  return (
    <PortalAccessMessage
      title="Partner access denied"
      message="Your account does not have access to this partner portal."
      organisationSlug={organisationSlug}
    />
  );
}

function PartnerPermissionGate({
  permission,
  children,
}: {
  permission: keyof PartnerPermissions;
  children: ReactElement;
}) {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const partnerAccess = usePartnerAccess(organisationSlug);

  if (partnerAccess.loading) {
    return <RouteLoadingScreen />;
  }

  if (partnerAccess.failure === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify partner permission"
        message="The server could not confirm this permission. For security, the requested page has been blocked."
        organisationSlug={organisationSlug}
        allowRetry
      />
    );
  }

  if (!partnerAccess.isPartner || !partnerAccess.data) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug || ""}/partner/access-denied`}
        replace
      />
    );
  }

  if (!partnerAccess.data.permissions[permission]) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/partner/access-denied`}
        replace
      />
    );
  }

  return children;
}

function PartnerAccessDeniedPage() {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const partnerAccess = usePartnerAccess(organisationSlug);

  if (partnerAccess.loading) {
    return <RouteLoadingScreen />;
  }

  if (partnerAccess.failure === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify partner access"
        message="The server could not confirm your permissions. No partner or owner information has been displayed."
        organisationSlug={organisationSlug}
        allowRetry
      />
    );
  }

  const fallback = organisationSlug
    ? getPartnerDestination(
        organisationSlug,
        partnerAccess.data?.permissions,
      )
    : "/ticketing";

  return (
    <div className="mx-auto max-w-xl rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
      <ShieldCheck className="mx-auto h-10 w-10 text-amber-700" />
      <h1 className="mt-4 text-2xl font-black text-slate-950">
        Access restricted
      </h1>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
        Your partner account does not have permission to open this page.
        Contact the organisation owner if your role needs additional access.
      </p>

      {fallback !==
        `/ticketing/${organisationSlug}/partner/access-denied` && (
        <Link
          to={fallback}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
        >
          Return to an allowed page
        </Link>
      )}
    </div>
  );
}

function PartnerPortalIndex() {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const partnerAccess = usePartnerAccess(organisationSlug);

  if (partnerAccess.loading) {
    return <RouteLoadingScreen />;
  }

  if (partnerAccess.failure === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify partner access"
        message="The server could not confirm your partner account. For security, the portal has been blocked."
        organisationSlug={organisationSlug}
        allowRetry
      />
    );
  }

  if (!organisationSlug || !partnerAccess.data) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug || ""}/partner/access-denied`}
        replace
      />
    );
  }

  return (
    <Navigate
      to={getPartnerDestination(
        organisationSlug,
        partnerAccess.data.permissions,
      )}
      replace
    />
  );
}

function TicketingTenantLauncher() {
  const { organisationSlug = "" } = useParams<{
    organisationSlug: string;
  }>();

  const { user, initialized, loading } = useAppSelector(
    (state) => state.auth,
  );

  const safeOrganisationSlug = organisationSlug.trim().toLowerCase();

  useEffect(() => {
    if (!safeOrganisationSlug || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      "last_ticketing_slug",
      safeOrganisationSlug,
    );
  }, [safeOrganisationSlug]);

  const access = usePortalAccess(
    user && safeOrganisationSlug
      ? safeOrganisationSlug
      : undefined,
  );

  if (!safeOrganisationSlug) {
    return <Navigate to="/ticketing" replace />;
  }

  if (!initialized || loading) {
    return <RouteLoadingScreen />;
  }

  if (!user) {
    return (
      <Navigate
        to={`/ticketing/${safeOrganisationSlug}/login`}
        replace
      />
    );
  }

  if (access.loading) {
    return <RouteLoadingScreen />;
  }

  if (access.portalType === "owner") {
    return (
      <Navigate
        to={`/ticketing/${safeOrganisationSlug}/dashboard`}
        replace
      />
    );
  }

  if (access.portalType === "seller") {
    return (
      <Navigate
        to={`/ticketing/${safeOrganisationSlug}/seller/dashboard`}
        replace
      />
    );
  }

  if (access.portalType === "pending") {
    return (
      <Navigate
        to={`/ticketing/${safeOrganisationSlug}/seller-application`}
        replace
      />
    );
  }

  if (access.portalType === "partner" && access.partner) {
    return (
      <Navigate
        to={getPartnerDestination(
          safeOrganisationSlug,
          access.partner.permissions,
        )}
        replace
      />
    );
  }

  if (access.portalType === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify access"
        message="The server could not confirm which portal this account may use. For security, no dashboard has been displayed."
        organisationSlug={safeOrganisationSlug}
        allowRetry
      />
    );
  }

  return (
    <PortalAccessMessage
      title="Access denied"
      message="This account does not have access to an owner, seller, or partner portal for this organisation."
      organisationSlug={safeOrganisationSlug}
    />
  );
}


function TicketingAppLauncher() {
  const user = useAppSelector((state) => state.auth.user) as any;

  const savedSlug =
    typeof window !== "undefined"
      ? window.localStorage.getItem("last_ticketing_slug") || ""
      : "";

  const organisationSlug =
    user?.organisation?.slug ||
    user?.organisation_slug ||
    user?.membership?.organisation?.slug ||
    user?.membership?.organisation_slug ||
    user?.seller?.organisation_slug ||
    savedSlug;

  const access = usePortalAccess(organisationSlug);

  if (!organisationSlug) {
    return <TicketingLandingPage />;
  }

  if (access.loading) {
    return <RouteLoadingScreen />;
  }

  if (access.portalType === "owner") {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/dashboard`}
        replace
      />
    );
  }

  if (access.portalType === "seller") {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/seller/dashboard`}
        replace
      />
    );
  }

  if (access.portalType === "pending") {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/seller-application`}
        replace
      />
    );
  }

  if (access.portalType === "partner" && access.partner) {
    return (
      <Navigate
        to={getPartnerDestination(
          organisationSlug,
          access.partner.permissions,
        )}
        replace
      />
    );
  }

  if (access.portalType === "unavailable") {
    return (
      <PortalAccessMessage
        title="Unable to verify access"
        message="The server could not confirm which portal this account may use. For security, no dashboard has been displayed."
        organisationSlug={organisationSlug}
        allowRetry
      />
    );
  }

  return (
    <PortalAccessMessage
      title="Access denied"
      message="This account does not have access to an owner, seller, or partner portal for this organisation."
      organisationSlug={organisationSlug}
    />
  );
}

function SellerDashboardFallback() {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  if (!organisationSlug) {
    return <Navigate to="/ticketing" replace />;
  }

  return (
    <Navigate
      to={`/ticketing/${organisationSlug}/seller/dashboard`}
      replace
    />
  );
}

export const ticketingRoutes = (
  <>
    {/* Dynamic PWA / platform launchers */}
    <Route path="/ticketing" element={<TicketingAppLauncher />} />
    <Route path="/ticketing/" element={<TicketingAppLauncher />} />
    <Route
      path="/ticketing/:organisationSlug/launch"
      element={<TicketingTenantLauncher />}
    />

    <Route
      path="/ticketing/:organisationSlug/install"
      element={<TicketingInstallPage />}
    />

    {/* Custom-domain public website routes */}
    <Route
      path="/"
      element={
        <CustomDomainOnly>
          <PublicExperienceHomePage />
        </CustomDomainOnly>
      }
    />

    <Route
      path="/product/:productSlug"
      element={
        <CustomDomainOnly>
          <PublicProductDetailPage />
        </CustomDomainOnly>
      }
    />

    <Route
      path="/checkout"
      element={
        <CustomDomainOnly>
          <PublicCheckoutPage />
        </CustomDomainOnly>
      }
    />

    <Route
      path="/confirmation/:bookingCode"
      element={
        <CustomDomainOnly>
          <PublicConfirmationPage />
        </CustomDomainOnly>
      }
    />

    <Route
      path="/blog"
      element={
        <CustomDomainOnly>
          <PublicBlogListPage />
        </CustomDomainOnly>
      }
    />

    <Route
      path="/blog/:blogSlug"
      element={
        <CustomDomainOnly>
          <PublicBlogDetailPage />
        </CustomDomainOnly>
      }
    />

    {/* Public seller invitation and application route. */}
    <Route
      path="/seller-apply/:token"
      element={<PublicSellerApplicationPage />}
    />

    <Route
      path="/:listingType"
      element={
        <CustomDomainOnly>
          <PublicProductsListingPage />
        </CustomDomainOnly>
      }
    />

    {/* Platform-hosted public website routes */}
    <Route
      path="/experiences/:organisationSlug"
      element={<PublicExperienceHomePage />}
    />

    <Route
      path="/experiences/:organisationSlug/product/:productSlug"
      element={<PublicProductDetailPage />}
    />

    <Route
      path="/experiences/:organisationSlug/checkout"
      element={<PublicCheckoutPage />}
    />

    <Route
      path="/experiences/:organisationSlug/confirmation/:bookingCode"
      element={<PublicConfirmationPage />}
    />

    <Route
      path="/experiences/:organisationSlug/blog"
      element={<PublicBlogListPage />}
    />

    <Route
      path="/experiences/:organisationSlug/blog/:blogSlug"
      element={<PublicBlogDetailPage />}
    />

    {/*
      Seller referral routes.

      Example:
      /experiences/punta-cana-discovery/s/g

      These routes must appear before the generic :listingType route.
    */}
    <Route
      path="/experiences/:organisationSlug/s/:sellerCode"
      element={<PublicExperienceHomePage />}
    />

    <Route
      path="/experiences/:organisationSlug/s/:sellerCode/product/:productSlug"
      element={<PublicProductDetailPage />}
    />

    <Route
      path="/experiences/:organisationSlug/s/:sellerCode/checkout"
      element={<PublicCheckoutPage />}
    />

    <Route
      path="/experiences/:organisationSlug/s/:sellerCode/confirmation/:bookingCode"
      element={<PublicConfirmationPage />}
    />

    <Route
      path="/experiences/:organisationSlug/s/:sellerCode/:listingType"
      element={<PublicProductsListingPage />}
    />

    {/* Keep this generic route after the seller referral routes */}
    <Route
      path="/experiences/:organisationSlug/:listingType"
      element={<PublicProductsListingPage />}
    />

    {/* Authentication and subscription routes */}
    <Route
      path="/ticketing/:organisationSlug/login"
      element={<TicketingLoginPage />}
    />

    <Route
      path="/ticketing/signup"
      element={<TicketingSignupPage />}
    />

    <Route
      path="/ticketing/:organisationSlug/billing-locked"
      element={<TicketingBillingLockedPage />}
    />

    <Route
      path="/ticketing/subscription/success"
      element={<TicketingSubscriptionSuccessPage />}
    />

    <Route
      path="/ticketing/subscription/cancel"
      element={<TicketingSubscriptionCancelPage />}
    />

    {/* Protected dashboards */}
    <Route element={<ProtectedRoute />}>
      {/* Pending or approved seller application status. */}
      <Route
        path="/ticketing/:organisationSlug/seller-application"
        element={<SellerApplicationStatusPage />}
      />

      {/* Seller portal */}
      <Route
        path="/ticketing/:organisationSlug/seller"
        element={
          <SellerPortalGuard>
            <TicketingSellerLayout />
          </SellerPortalGuard>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route
          path="dashboard"
          element={<TicketingSellerDashboardPage />}
        />
        <Route
          path="products"
          element={<TicketingSellerProductsPage />}
        />
        
                <Route
          path="ai-booking"
          element={<TicketingSellerAIBookingPage />}
        />
<Route
          path="new-booking"
          element={<TicketingSellerNewBookingPage />}
        />
        <Route
          path="bookings"
          element={<TicketingSellerBookingsPage />}
        />
        <Route
          path="customers"
          element={<TicketingSellerCustomersPage />}
        />
        <Route
          path="commissions"
          element={<TicketingSellerCommissionsPage />}
        />
        <Route
          path="payouts"
          element={<TicketingSellerPayoutsPage />}
        />
        <Route
          path="profile"
          element={<TicketingSellerProfilePage />}
        />
      </Route>

      <Route
        path="/ticketing/:organisationSlug/seller-dashboard"
        element={<SellerDashboardFallback />}
      />

      {/* Restricted Partner Portal */}
      <Route
        path="/ticketing/:organisationSlug/partner"
        element={
          <PartnerPortalGuard>
            <TicketingPartnerLayout />
          </PartnerPortalGuard>
        }
      >
        <Route index element={<PartnerPortalIndex />} />

        <Route
          path="scanner"
          element={
            <PartnerPermissionGate permission="can_scan">
              <TicketingScannerPage />
            </PartnerPermissionGate>
          }
        />

        <Route
          path="admissions"
          element={
            <PartnerPermissionGate permission="can_view_admissions">
              <TicketingAdmissionsPage />
            </PartnerPermissionGate>
          }
        />

        <Route
          path="scan-history"
          element={
            <PartnerPermissionGate permission="can_view_today_bookings">
              <TicketingScanAttemptsPage />
            </PartnerPermissionGate>
          }
        />

        <Route
          path="settlements"
          element={
            <PartnerPermissionGate permission="can_view_settlements">
              <TicketingSettlementsPage />
            </PartnerPermissionGate>
          }
        />

        <Route
          path="settlements/:settlementId"
          element={
            <PartnerPermissionGate permission="can_view_settlements">
              <TicketingSettlementDetailPage />
            </PartnerPermissionGate>
          }
        />

        <Route
          path="access-denied"
          element={<PartnerAccessDeniedPage />}
        />

        <Route
          path="*"
          element={<PartnerPortalIndex />}
        />
      </Route>

      {/* Owner/admin portal */}
      <Route
        path="/ticketing/:organisationSlug"
        element={
          <OwnerPortalGuard>
            <TicketingDashboardLayout />
          </OwnerPortalGuard>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<TicketingDashboardPage />} />
        <Route path="bookings" element={<TicketingBookingsPage />} />
        <Route path="new-booking" element={<TicketingNewBookingPage />} />
        <Route path="products" element={<TicketingProductsPage />} />
        <Route path="blog" element={<TicketingBlogPostsPage />} />
        <Route path="blog/new" element={<TicketingBlogEditorPage />} />
        <Route
          path="blog/:blogPostId/edit"
          element={<TicketingBlogEditorPage />}
        />
        <Route
          path="pickup-schedules"
          element={<TicketingPickupSchedulesPage />}
        />
        <Route
          path="availability"
          element={<TicketingAvailabilityPage />}
        />
        <Route path="excursions" element={<TicketingExcursionsPage />} />
        <Route path="transfers" element={<TicketingTransfersPage />} />
        <Route path="events" element={<TicketingEventsPage />} />
        <Route path="sellers" element={<TicketingSellersPage />} />
        <Route
          path="seller-onboarding"
          element={<TicketingSellerOnboardingPage />}
        />
        <Route
          path="commissions"
          element={<TicketingCommissionsPage />}
        />
        <Route path="reports" element={<TicketingReportsPage />} />

        {/* Operations */}
        <Route
          path="operations"
          element={<Navigate to="operations/dashboard" replace />}
        />
        <Route
          path="operations/dashboard"
          element={<TicketingOperationsDashboardPage />}
        />
        <Route
          path="operations/business-entities"
          element={<TicketingBusinessEntitiesPage />}
        />
        <Route
          path="operations/business-entities/:businessEntityId"
          element={<TicketingBusinessEntityDetailPage />}
        />
        <Route
          path="operations/agreements"
          element={<TicketingBusinessAgreementsPage />}
        />
        <Route
          path="operations/scanner"
          element={<TicketingScannerPage />}
        />
        <Route
          path="operations/admissions"
          element={<TicketingAdmissionsPage />}
        />
        <Route
          path="operations/scan-attempts"
          element={<TicketingScanAttemptsPage />}
        />
        <Route
          path="operations/settlements"
          element={<TicketingSettlementsPage />}
        />
        <Route
          path="operations/settlements/:settlementId"
          element={<TicketingSettlementDetailPage />}
        />
        <Route
          path="operations/ledger"
          element={<TicketingLedgerPage />}
        />

        <Route path="settings" element={<TicketingSettingsPage />} />
        <Route path="branding" element={<TicketingBrandingPage />} />
        <Route path="domain" element={<TicketingDomainPage />} />
        <Route
          path="integrations"
          element={<TicketingIntegrationsPage />}
        />
        <Route path="seo" element={<TicketingSEOPage />} />
      </Route>
    </Route>
  </>
);
