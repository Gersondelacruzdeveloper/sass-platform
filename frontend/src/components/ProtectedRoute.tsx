import {
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";

import { useAppSelector } from "../store/hooks";

export default function ProtectedRoute() {
  const { user, initialized } = useAppSelector(
    (state) => state.auth
  );

  const location = useLocation();

  const { businessType, organisationSlug } = useParams<{
    businessType?: string;
    organisationSlug?: string;
  }>();

  const pathParts = location.pathname
    .split("/")
    .filter(Boolean);

  const resolvedBusinessType =
    businessType ?? pathParts[0] ?? "";

  const resolvedOrganisationSlug =
    organisationSlug ?? pathParts[1] ?? "";

  const loginPath =
    resolvedBusinessType && resolvedOrganisationSlug
      ? `/${resolvedBusinessType}/${resolvedOrganisationSlug}/login`
      : "/login";

  const billingLockedPath =
    resolvedBusinessType && resolvedOrganisationSlug
      ? `/${resolvedBusinessType}/${resolvedOrganisationSlug}/billing-locked`
      : "/billing-locked";

  const allowedWhenInactive = [
    "billing-locked",
    "billing",
    "settings",
    "subscription",
  ];

  const isAllowedWhenInactive =
    allowedWhenInactive.some((path) =>
      location.pathname.includes(path)
    );

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-6 py-4 shadow">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={loginPath}
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  const organisation =
    user.organisation as typeof user.organisation & {
      is_active?: boolean;
    };

  if (
    organisation?.is_active === false &&
    !isAllowedWhenInactive
  ) {
    return (
      <Navigate
        to={billingLockedPath}
        replace
      />
    );
  }

  return <Outlet />;
}