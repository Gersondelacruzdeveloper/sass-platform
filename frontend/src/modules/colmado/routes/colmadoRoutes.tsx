import {
  Route,
} from "react-router-dom";

import ColmadoAppPage from "../pages/ColmadoAppPage";
import ColmadoLoginPage from "../pages/ColmadoLoginPage";
import ColmadoSignupPage from "../pages/ColmadoSignupPage";
import ColmadoSubscriptionCancelPage from "../pages/ColmadoSubscriptionCancelPage";
import ColmadoSubscriptionSuccessPage from "../pages/ColmadoSubscriptionSuccessPage";


export const colmadoRoutes = (
  <>
    <Route
      path="/colmado/signup"
      element={<ColmadoSignupPage />}
    />

    <Route
      path="/colmado/subscription/success"
      element={<ColmadoSubscriptionSuccessPage />}
    />

    <Route
      path="/colmado/subscription/cancel"
      element={<ColmadoSubscriptionCancelPage />}
    />

    <Route
      path="/colmado/login"
      element={<ColmadoLoginPage />}
    />

    <Route
      path="/colmado/:organisationSlug/login"
      element={<ColmadoLoginPage />}
    />

    <Route
      path="/colmado/:organisationSlug"
      element={<ColmadoAppPage />}
    />
  </>
);
