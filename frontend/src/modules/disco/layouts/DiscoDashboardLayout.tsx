// src/modules/disco/layouts/DiscoDashboardLayout.tsx

import { useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";

import DiscoSidebar from "../components/DiscoSidebar";
import DiscoTopbar from "../components/DiscoTopbar";

import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";

export default function DiscoDashboardLayout() {

  const [mobileOpen, setMobileOpen] = useState(false);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { organisationSlug } = useParams();

  const { user } = useAppSelector((state) => state.auth);

  const authUser = user as any;

  console.log("AUTH USER IN LAYOUT:", user);

  const slug =
    organisationSlug || authUser?.organisation?.slug || "almond-brownie";

  const userName =
    authUser?.disco_employee?.full_name ||
    authUser?.full_name ||
    authUser?.name ||
    authUser?.username ||
    authUser?.email ||
    "Staff Member";

  const userEmail = authUser?.email || "";

  const organisationName =
    authUser?.disco_employee?.organisation_name ||
    authUser?.organisation?.name ||
    slug;

  const userAvatarUrl =
    authUser?.disco_employee?.profile_image_url ||
    authUser?.disco_employee?.photo_url ||
    authUser?.disco_employee?.employee_photo_url ||
    authUser?.disco_employee?.photo ||
    authUser?.profile_image_url ||
    authUser?.avatar_url ||
    authUser?.user_avatar_url ||
    authUser?.image_url ||
    authUser?.avatar ||
    null;

  async function handleLogout() {
    await dispatch(logoutUser());
    navigate(`/disco/${slug}/login`, { replace: true });
  }

  return (
    
    <div className="min-h-screen bg-slate-50">
      <DiscoSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="min-h-screen lg:pl-72">
        <DiscoTopbar
          userName={userName}
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
          organisationName={organisationName}
          onMenuClick={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />

        <main className="px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}