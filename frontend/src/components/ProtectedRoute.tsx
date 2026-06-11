import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAppSelector } from "../store/hooks";

export default function ProtectedRoute() {
  const { user, initialized } = useAppSelector((state) => state.auth);
  const location = useLocation();
  const params = useParams();

  const businessType = params.businessType || location.pathname.split("/")[1];
  const organisationSlug =
    params.organisationSlug || location.pathname.split("/")[2];

  const loginPath =
    businessType && organisationSlug
      ? `/${businessType}/${organisationSlug}/login`
      : "/login";

  const billingLockedPath =
    businessType && organisationSlug
      ? `/${businessType}/${organisationSlug}/billing-locked`
      : "/billing-locked";

  const allowedWhenInactive = [
    "billing-locked",
    "billing",
    "settings",
    "subscription",
  ];

  const isAllowedWhenInactive = allowedWhenInactive.some((path) =>
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
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  const organisation = user.organisation;

  if (
    organisation &&
    organisation.is_active === false &&
    !isAllowedWhenInactive
  ) {
    return <Navigate to={billingLockedPath} replace />;
  }

  return <Outlet />;
}