// src/modules/ticketing/pages/TicketingLandingPage.tsx

import { Navigate, useParams } from "react-router-dom";

import { useAppSelector } from "../../../store/hooks";

export default function TicketingLandingPage() {
  const { organisationSlug = "" } = useParams<{
    organisationSlug?: string;
  }>();

  const { user, initialized, loading } = useAppSelector(
    (state) => state.auth
  );

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white p-6 text-center shadow">
          <p className="font-semibold text-slate-900">Loading...</p>
          <p className="text-sm text-slate-500">
            Checking your session
          </p>
        </div>
      </div>
    );
  }

  const loginPath = organisationSlug
    ? `/ticketing/${organisationSlug}/login`
    : "/ticketing/login";

  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  const dashboardPath = organisationSlug
    ? `/ticketing/${organisationSlug}/dashboard`
    : "/ticketing/dashboard";

  return <Navigate to={dashboardPath} replace />;
}
