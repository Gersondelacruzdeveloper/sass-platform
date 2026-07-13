// src/modules/ticketing/routes/ticketingRoutes.tsx
// Route version: dynamic-organisation-launcher-v2-2026-07-12

import type { ReactElement } from "react";
import { Navigate, Route, useParams } from "react-router-dom";

import ProtectedRoute from "../../../components/ProtectedRoute";
import { useAppSelector } from "../../../store/hooks";

import TicketingDashboardLayout from "../layouts/TicketingDashboardLayout";
import TicketingSellerLayout from "../layouts/TicketingSellerLayout";

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

  if (!organisationSlug) {
    return <TicketingLandingPage />;
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

      {/* Owner/admin portal */}
      <Route
        path="/ticketing/:organisationSlug"
        element={<TicketingDashboardLayout />}
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
