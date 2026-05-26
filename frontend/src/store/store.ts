import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import organisationReducer from "../features/organisations/organisationSlice";
import discoReducer from "../features/disco/discoSlice";


export const store = configureStore({
  reducer: {
    auth: authReducer,
    organisations: organisationReducer,
    disco: discoReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;