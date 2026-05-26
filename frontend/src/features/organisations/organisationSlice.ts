import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../api/axios";
import type { Organisation, Membership } from "../../types/organisation";

const initialState: {
  organisations: Organisation[];
  memberships: Membership[];
  currentOrganisation: Organisation | null;
  loading: boolean;
  error: string | null;
} = {
  organisations: [],
  memberships: [],
  currentOrganisation: null,
  loading: false,
  error: null,
};

export const fetchOrganisations = createAsyncThunk(
  "organisations/fetchOrganisations",
  async () => {
    const response = await api.get<Organisation[]>(
      "/organisations/organisations/"
    );
    return response.data;
  }
);

export const fetchMemberships = createAsyncThunk(
  "organisations/fetchMemberships",
  async () => {
    const response = await api.get<Membership[]>(
      "/organisations/memberships/"
    );
    return response.data;
  }
);

const organisationSlice = createSlice({
  name: "organisations",
  initialState,
  reducers: {
    setCurrentOrganisation(state, action) {
      state.currentOrganisation = action.payload;
      localStorage.setItem(
        "currentOrganisationId",
        String(action.payload.id)
      );
    },
    clearCurrentOrganisation(state) {
      state.currentOrganisation = null;
      localStorage.removeItem("currentOrganisationId");
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrganisations.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchOrganisations.fulfilled, (state, action) => {
        state.loading = false;
        state.organisations = action.payload;

        const savedId = localStorage.getItem("currentOrganisationId");

        if (savedId) {
          const found = action.payload.find(
            (org) => org.id === Number(savedId)
          );
          state.currentOrganisation = found || action.payload[0] || null;
        } else {
          state.currentOrganisation = action.payload[0] || null;
        }
      })
      .addCase(fetchOrganisations.rejected, (state) => {
        state.loading = false;
        state.error = "Could not load organisations";
      })
      .addCase(fetchMemberships.fulfilled, (state, action) => {
        state.memberships = action.payload;
      });
  },
});

export const {
  setCurrentOrganisation,
  clearCurrentOrganisation,
} = organisationSlice.actions;

export default organisationSlice.reducer;