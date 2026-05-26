import { Navigate, Outlet } from "react-router-dom";

import { useAppSelector } from "../store/hooks";

export default function ProtectedRoute() {
  const { user } = useAppSelector((state) => state.auth);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}