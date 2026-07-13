// src/modules/ticketing/routes/ticketingRoutes.tsx
// Route version: dedicated-partner-layout-v4-2026-07-13

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

import TicketingSellerDashboardPage from "../pages/seller/TicketingSellerDashboardPage";
import TicketingSellerProductsPage from "../pages/seller/TicketingSellerProductsPage";
import TicketingSellerNewBookingPage from "../pages/seller/TicketingSellerNewBookingPage";
import TicketingSellerBookingsPage from "../pages/seller/TicketingSellerBookingsPage";
import TicketingSellerCustomersPage from "../pages/seller/TicketingSellerCustomersPage";
import TicketingSellerCommissionsPage from "../pages/seller/TicketingSellerCommissionsPage";
import TicketingSellerProfilePage from "../pages/seller/TicketingSellerProfilePage";

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

type PartnerAccessState = {
  loading: boolean;
  isPartner: boolean;
  data: PartnerBootstrap | null;
};

const EMPTY_PARTNER_ACCESS: PartnerAccessState = {
  loading: true,
  isPartner: false,
  data: null,
};

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
        });
        return;
      }

      setState(EMPTY_PARTNER_ACCESS);

      try {
        const response = await api.get<PartnerBootstrap>(
          "/ticketing/partner/bootstrap/",
          {
            params: {
              slug: organisationSlug,
              organisation_slug: organisationSlug,
            },
          },
        );

        if (!cancelled) {
          setState({
            loading: false,
            isPartner: response.data?.portal_type === "partner",
            data: response.data,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            isPartner: false,
            data: null,
          });
        }
      }
    }

    void loadPartnerAccess();

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

function OwnerPortalGuard({ children }: { children: ReactElement }) {
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const partnerAccess = usePartnerAccess(organisationSlug);

  if (partnerAccess.loading) {
    return <RouteLoadingScreen />;
  }

  if (partnerAccess.isPartner && organisationSlug) {
    return (
      <Navigate
        to={getPartnerDestination(
          organisationSlug,
          partnerAccess.data?.permissions,
        )}
        replace
      />
    );
  }

  return children;
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

  if (!partnerAccess.isPartner || !partnerAccess.data) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug || ""}/dashboard`}
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

  if (!organisationSlug || !partnerAccess.data) {
    return <Navigate to="/ticketing" replace />;
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

  const partnerAccess = usePartnerAccess(organisationSlug);

  if (!organisationSlug) {
    return <TicketingLandingPage />;
  }

  if (partnerAccess.loading) {
    return <RouteLoadingScreen />;
  }

  if (partnerAccess.isPartner) {
    return (
      <Navigate
        to={getPartnerDestination(
          organisationSlug,
          partnerAccess.data?.permissions,
        )}
        replace
      />
    );
  }

  const isSeller =
    Boolean(user?.seller) ||
    user?.role === "seller" ||
    user?.membership?.role === "seller";

  return (
    <Navigate
      to={
        isSeller
          ? `/ticketing/${organisationSlug}/seller/dashboard`
          : `/ticketing/${organisationSlug}/dashboard`
      }
      replace
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
    {/* Dynamic PWA / platform launcher */}
    <Route path="/ticketing" element={<TicketingAppLauncher />} />
    <Route path="/ticketing/" element={<TicketingAppLauncher />} />

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
      {/* Seller portal */}
      <Route
        path="/ticketing/:organisationSlug/seller"
        element={<TicketingSellerLayout />}
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
        element={<TicketingPartnerLayout />}
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
