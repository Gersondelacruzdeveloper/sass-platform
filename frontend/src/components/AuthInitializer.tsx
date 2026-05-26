import { useEffect } from "react";
import type { ReactNode } from "react";

import { initializeAuth } from "../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../store/hooks";

export default function AuthInitializer({
  children,
}: {
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const { initialized, loading } = useAppSelector((state) => state.auth);

  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white rounded-2xl shadow p-6 text-center">
          <p className="font-semibold text-slate-900">Loading...</p>
          <p className="text-sm text-slate-500">Checking your session</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}