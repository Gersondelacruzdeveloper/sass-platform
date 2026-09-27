import { Route } from "react-router-dom";

import ColmadoAppPage from "../pages/ColmadoAppPage";
import ColmadoSignupPage from "../pages/ColmadoSignupPage";


export const colmadoRoutes = (
  <>
    <Route
      path="/colmado/signup"
      element={<ColmadoSignupPage />}
    />

    <Route
      path="/colmado/:organisationSlug"
      element={<ColmadoAppPage />}
    />
  </>
);