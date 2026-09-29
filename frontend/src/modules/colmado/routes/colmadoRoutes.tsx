import { Route } from "react-router-dom";

import ColmadoAppPage from "../pages/ColmadoAppPage";
import ColmadoLoginPage from "../pages/ColmadoLoginPage";
import ColmadoSignupPage from "../pages/ColmadoSignupPage";


export const colmadoRoutes = (
  <>
    <Route
      path="/colmado/signup"
      element={<ColmadoSignupPage />}
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
