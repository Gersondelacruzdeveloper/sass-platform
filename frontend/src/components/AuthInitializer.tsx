import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { initializeAuth } from "../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../store/hooks";

export default function AuthInitializer({
  children,
}: {
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();

  const initialized = useAppSelector(
    (state) => state.auth.initialized
  );

  const initializationStartedRef = useRef(false);

  useEffect(() => {
    if (initializationStartedRef.current) {
      return;
    }

    initializationStartedRef.current = true;
    void dispatch(initializeAuth());
  }, [dispatch]);

  /*
   * Only block the application during the initial session check.
   *
   * Do not use state.auth.loading here because that value is also used
   * by login and logout. Using it would unmount the login page whenever
   * the user submits the form.
   */
  if (!initialized) {
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

  return <>{children}</>;
}