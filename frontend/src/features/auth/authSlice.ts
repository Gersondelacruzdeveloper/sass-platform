import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import api from "../../api/axios";
import type { LoginPayload, User } from "../../types/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  loading: false,
  initialized: false,
  error: null,
};

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (payload: LoginPayload) => {
    const response = await api.post("/accounts/login/", payload);
    return response.data.user;
  }
);

export const fetchMe = createAsyncThunk(
  "auth/fetchMe",
  async () => {
    const response = await api.get<User>(
      "/accounts/me/"
    );

    return response.data;
  }
);

export const initializeAuth = createAsyncThunk(
  "auth/initializeAuth",
  async (_, { dispatch }) => {

try {
  const result = await dispatch(fetchMe());

    if (fetchMe.fulfilled.match(result)) {
      return result.payload;
    }
  } catch {
    return null;
  }

  return null;

  }
);

export const logoutUser = createAsyncThunk(
  "auth/logoutUser",
  async () => {
    await api.post("/accounts/logout/");
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {},

  extraReducers: (builder) => {
    builder

      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

    .addCase(loginUser.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload;
    })
      .addCase(loginUser.rejected, (state) => {
        state.loading = false;
        state.error =
          "Invalid username/email or password";
      })

      .addCase(fetchMe.pending, (state) => {
        state.loading = true;
      })

      .addCase(fetchMe.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })

      .addCase(fetchMe.rejected, (state) => {
          state.loading = false;
          state.user = null;
      })
      
      .addCase(initializeAuth.pending, (state) => {
        state.loading = true;
        state.initialized = false;
      })

      .addCase(initializeAuth.fulfilled, (state) => {
        state.loading = false;
        state.initialized = true;
      })

      .addCase(initializeAuth.rejected, (state) => {
        state.loading = false;
        state.initialized = true;
        state.user = null;
      })

      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
      });
  },
});

export default authSlice.reducer;