// src/modules/ticketing/routes/ticketingRoutes.tsx

import type { ReactElement } from "react";
import { Navigate, Route } from "react-router-dom";

import ProtectedRoute from "../../../components/ProtectedRoute";

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

function getCurrentHostname() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hostname.toLowerCase();
}

function isCustomTicketingDomain() {
  const hostname = getCurrentHostname();

  return Boolean(hostname) && !PLATFORM_HOSTS.includes(hostname);
}

function CustomDomainOnly({ children }: { children: ReactElement }) {
  if (!isCustomTicketingDomain()) {
    return <Navigate to="/ticketing" replace />;
  }

  return children;
}

export const ticketingRoutes = (
  <>
    {/* Public Landing Page */}
    <Route path="/ticketing" element={<TicketingLandingPage />} />

    {/* Clean public routes for custom ticketing domains */}
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

    {/* Public Experience Website fallback using organisation slug */}
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
      path="/experiences/:organisationSlug/:listingType"
      element={<PublicProductsListingPage />}
    />

    {/* Public Login */}
    <Route
      path="/ticketing/:organisationSlug/login"
      element={<TicketingLoginPage />}
    />

    {/* Public Signup */}
    <Route path="/ticketing/signup" element={<TicketingSignupPage />} />

    {/* Public Billing Locked */}
    <Route
      path="/ticketing/:organisationSlug/billing-locked"
      element={<TicketingBillingLockedPage />}
    />

    {/* Public Subscription Status */}
    <Route
      path="/ticketing/subscription/success"
      element={<TicketingSubscriptionSuccessPage />}
    />

    <Route
      path="/ticketing/subscription/cancel"
      element={<TicketingSubscriptionCancelPage />}
    />

    {/* Protected Ticketing Module */}
    <Route element={<ProtectedRoute />}>
      {/* Owner/Admin Portal */}
      <Route
        path="/ticketing/:organisationSlug"
        element={<TicketingDashboardLayout />}
      >
        <Route index element={<Navigate to="dashboard" replace />} />

        <Route path="dashboard" element={<TicketingDashboardPage />} />
        <Route path="bookings" element={<TicketingBookingsPage />} />
        <Route path="new-booking" element={<TicketingNewBookingPage />} />
        <Route path="products" element={<TicketingProductsPage />} />
        <Route path="pickup-schedules" element={<TicketingPickupSchedulesPage />} />
        <Route path="availability" element={<TicketingAvailabilityPage />} />
        <Route path="excursions" element={<TicketingExcursionsPage />} />
        <Route path="transfers" element={<TicketingTransfersPage />} />
        <Route path="events" element={<TicketingEventsPage />} />
        <Route path="sellers" element={<TicketingSellersPage />} />
        <Route path="commissions" element={<TicketingCommissionsPage />} />
        <Route path="reports" element={<TicketingReportsPage />} />
        <Route path="settings" element={<TicketingSettingsPage />} />
        <Route path="branding" element={<TicketingBrandingPage />} />
        <Route path="domain" element={<TicketingDomainPage />} />
        <Route path="integrations" element={<TicketingIntegrationsPage />} />
        <Route path="seo" element={<TicketingSEOPage />} />
      </Route>

      {/* Seller Portal */}
      <Route
        path="/ticketing/:organisationSlug/seller"
        element={<TicketingSellerLayout />}
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<TicketingSellerDashboardPage />} />
        <Route path="products" element={<TicketingSellerProductsPage />} />
        <Route path="new-booking" element={<TicketingSellerNewBookingPage />} />
        <Route path="bookings" element={<TicketingSellerBookingsPage />} />
        <Route path="customers" element={<TicketingSellerCustomersPage />} />
        <Route path="commissions" element={<TicketingSellerCommissionsPage />} />
        <Route path="profile" element={<TicketingSellerProfilePage />} />
      </Route>

      {/* Old seller dashboard fallback */}
    <Route
      path="/ticketing/:organisationSlug/seller-dashboard"
      element={<Navigate to="/ticketing/:organisationSlug/seller/dashboard" replace />}
    />
    </Route>
  </>
);
