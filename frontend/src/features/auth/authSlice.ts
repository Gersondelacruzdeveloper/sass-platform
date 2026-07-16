import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import axios from "axios";

import api from "../../api/axios";
import type { LoginPayload, User } from "../../types/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

interface BackendErrorResponse {
  detail?: unknown;
  error?: unknown;
  message?: unknown;
  non_field_errors?: unknown;
  email?: unknown;
  password?: unknown;
}

const INVALID_CREDENTIALS_MESSAGE =
  "Incorrect email or password. Please check your credentials and try again.";

const GENERIC_LOGIN_ERROR_MESSAGE =
  "Unable to sign you in at the moment. Please try again.";

const GENERIC_LOGOUT_ERROR_MESSAGE =
  "Unable to sign you out at the moment.";

const initialState: AuthState = {
  user: null,
  loading: false,
  initialized: false,
  error: null,
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function readFirstString(value: unknown): string | null {
  const directValue = readString(value);

  if (directValue) {
    return directValue;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = readString(item);

      if (message) {
        return message;
      }
    }
  }

  return null;
}

function getBackendErrorMessage(
  data?: BackendErrorResponse
): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  return (
    readFirstString(data.detail) ??
    readFirstString(data.error) ??
    readFirstString(data.message) ??
    readFirstString(data.non_field_errors) ??
    readFirstString(data.email) ??
    readFirstString(data.password)
  );
}

/*
 * The internal Redux action type has been renamed to:
 *
 * auth/loginTicketingUserV2
 *
 * The exported function is still named loginUser so existing page
 * imports do not need to change.
 */
export const loginUser = createAsyncThunk<
  User,
  LoginPayload,
  { rejectValue: string }
>(
  "auth/loginTicketingUserV2",
  async (credentials, { rejectWithValue }) => {
    try {
      // Trim email if provided on the payload; LoginPayload may not have a
      // guaranteed `email` property, so guard and cast to avoid TS errors.
      await api.post("/accounts/login/", {
        ...credentials,
        ...(typeof (credentials as any).email === "string"
          ? { email: (credentials as any).email.trim() }
          : {}),
      });

      const response = await api.get<User>("/accounts/me/");

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError<BackendErrorResponse>(error)) {
        const status = error.response?.status;
        const backendMessage = getBackendErrorMessage(
          error.response?.data
        );

        if (status === 400 || status === 401) {
          return rejectWithValue(
            backendMessage ?? INVALID_CREDENTIALS_MESSAGE
          );
        }

        if (!error.response) {
          return rejectWithValue(
            "Unable to connect to the server. Check your internet connection and try again."
          );
        }

        return rejectWithValue(
          backendMessage ?? GENERIC_LOGIN_ERROR_MESSAGE
        );
      }

      return rejectWithValue(GENERIC_LOGIN_ERROR_MESSAGE);
    }
  }
);

export const fetchMe = createAsyncThunk<
  User,
  void,
  { rejectValue: null }
>(
  "auth/fetchCurrentTicketingUserV2",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get<User>("/accounts/me/");

      return response.data;
    } catch {
      /*
       * A 401 or 403 here usually means that no authenticated
       * session exists. It should not become a visible login error.
       */
      return rejectWithValue(null);
    }
  }
);

export const initializeAuth = createAsyncThunk<
  User | null,
  void
>(
  "auth/initializeTicketingAuthV2",
  async (_, { dispatch }) => {
    const result = await dispatch(fetchMe());

    if (fetchMe.fulfilled.match(result)) {
      return result.payload;
    }

    return null;
  }
);

export const logoutUser = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>(
  "auth/logoutTicketingUserV2",
  async (_, { rejectWithValue }) => {
    try {
      await api.post("/accounts/logout/");
    } catch (error: unknown) {
      if (axios.isAxiosError<BackendErrorResponse>(error)) {
        return rejectWithValue(
          getBackendErrorMessage(error.response?.data) ??
            GENERIC_LOGOUT_ERROR_MESSAGE
        );
      }

      return rejectWithValue(GENERIC_LOGOUT_ERROR_MESSAGE);
    }
  }
);

const authSlice = createSlice({
  /*
   * Keep this name as "auth" so state.auth continues working.
   * Changing it would require changes to your Redux store and pages.
   */
  name: "auth",

  initialState,

  reducers: {
    clearAuthError: (state) => {
      state.error = null;
    },

    setAuthError: (
      state,
      action: PayloadAction<string | null>
    ) => {
      state.error = action.payload;
    },

    resetAuthState: (state) => {
      state.user = null;
      state.loading = false;
      state.initialized = false;
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.initialized = true;
        state.user = action.payload;
        state.error = null;
      })

      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.user = null;
        state.error =
          action.payload ??
          action.error.message ??
          GENERIC_LOGIN_ERROR_MESSAGE;
      })

      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
      })

      .addCase(fetchMe.rejected, (state) => {
        state.user = null;
      })

      .addCase(initializeAuth.pending, (state) => {
        state.loading = true;
        state.initialized = false;
      })

      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.loading = false;
        state.initialized = true;
        state.user = action.payload;
      })

      .addCase(initializeAuth.rejected, (state) => {
        state.loading = false;
        state.initialized = true;
        state.user = null;
      })

      .addCase(logoutUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(logoutUser.fulfilled, (state) => {
        state.loading = false;
        state.initialized = true;
        state.user = null;
        state.error = null;
      })

      .addCase(logoutUser.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.payload ??
          action.error.message ??
          GENERIC_LOGOUT_ERROR_MESSAGE;
      });
  },
});

export const {
  clearAuthError,
  setAuthError,
  resetAuthState,
} = authSlice.actions;

export default authSlice.reducer;