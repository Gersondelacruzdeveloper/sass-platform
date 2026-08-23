// src/modules/ticketing/pages/TicketingLandingPage.tsx
// Landing version: fail-closed-routing-v2-2026-08-05

import { Navigate, useParams } from "react-router-dom";

import { useAppSelector } from "../../../store/hooks";

const RESERVED_SLUGS = new Set([
  "dashboard",
  "seller",
  "partner",
  "login",
  "signup",
  "billing-locked",
  "subscription",
]);

function normalizeSlug(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const slug = value.trim().toLowerCase();

  if (!slug || RESERVED_SLUGS.has(slug)) {
    return "";
  }

  return slug;
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function getSellerState(
  user: any,
): "approved" | "pending" | "denied" | null {
  const seller = user?.seller;

  const isSellerAccount =
    Boolean(seller) ||
    normalizeStatus(user?.role) === "seller" ||
    normalizeStatus(user?.membership?.role) === "seller" ||
    normalizeStatus(user?.membership_role) === "seller";

  if (!isSellerAccount) {
    return null;
  }

  const status = normalizeStatus(
    seller?.application_status ||
      seller?.status ||
      user?.seller_application_status ||
      user?.application_status,
  );

  if (status === "approved" && seller?.is_active !== false) {
    return "approved";
  }

  if (
    seller?.is_active === false ||
    [
      "rejected",
      "suspended",
      "disabled",
      "inactive",
      "revoked",
    ].includes(status)
  ) {
    return "denied";
  }

  // Missing, submitted, reviewing, and pending statuses all fail closed.
  return "pending";
}

function AccessMessage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-slate-950">
          {title}
        </h1>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {message}
        </p>
      </div>
    </div>
  );
}

export default function TicketingLandingPage() {
  const { organisationSlug = "" } = useParams<{
    organisationSlug?: string;
  }>();

  const { user, initialized, loading } = useAppSelector(
    (state) => state.auth,
  );

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white p-6 text-center shadow">
          <p className="font-semibold text-slate-900">
            Loading...
          </p>
          <p className="text-sm text-slate-500">
            Checking your session
          </p>
        </div>
      </div>
    );
  }

  const urlSlug = normalizeSlug(organisationSlug);

  if (urlSlug && typeof window !== "undefined") {
    window.localStorage.setItem(
      "last_ticketing_slug",
      urlSlug,
    );
  }

  const savedSlug =
    typeof window !== "undefined"
      ? normalizeSlug(
          window.localStorage.getItem("last_ticketing_slug"),
        )
      : "";

  const resolvedSlug =
    urlSlug ||
    normalizeSlug((user as any)?.organisation?.slug) ||
    normalizeSlug((user as any)?.organisation_slug) ||
    normalizeSlug(
      (user as any)?.membership?.organisation?.slug,
    ) ||
    normalizeSlug(
      (user as any)?.membership?.organisation_slug,
    ) ||
    normalizeSlug((user as any)?.seller?.organisation_slug) ||
    savedSlug;

  if (!user) {
    if (!resolvedSlug) {
      return (
        <AccessMessage
          title="Organisation required"
          message="Open the login link for your organisation. The application will not guess an organisation or use “dashboard” as an organisation slug."
        />
      );
    }

    return (
      <Navigate
        to={`/ticketing/${resolvedSlug}/login`}
        replace
      />
    );
  }

  if (!resolvedSlug) {
    return (
      <AccessMessage
        title="Unable to determine organisation"
        message="Your account is authenticated, but no valid organisation could be confirmed. For security, no dashboard has been displayed."
      />
    );
  }

  const sellerState = getSellerState(user as any);

  if (sellerState === "approved") {
    return (
      <Navigate
        to={`/ticketing/${resolvedSlug}/seller/dashboard`}
        replace
      />
    );
  }

  if (
    sellerState === "pending" ||
    sellerState === "denied"
  ) {
    return (
      <Navigate
        to={`/ticketing/${resolvedSlug}/seller-application`}
        replace
      />
    );
  }

  // Do not guess that the user is an owner. Route to the organisation root
  // and let the strict OwnerPortalGuard/PartnerPortalGuard verify access.
  return (
    <Navigate
      to={`/ticketing/${resolvedSlug}`}
      replace
    />
  );
}
