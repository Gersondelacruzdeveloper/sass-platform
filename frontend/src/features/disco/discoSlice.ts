import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  getDiscoProducts,
  getSales,
  getExpenses,
  getStockMovements,
} from "../../api/discoApi";

import type { Product, Sale, Expense, StockMovement } from "../../types/disco";

interface DiscoState {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  stockMovements: StockMovement[];
  loading: boolean;
  error: string | null;
}

const initialState: DiscoState = {
  products: [],
  sales: [],
  expenses: [],
  stockMovements: [],
  loading: false,
  error: null,
};

export const fetchDiscoDashboard = createAsyncThunk(
  "disco/fetchDashboard",
  async () => {
    const [products, sales, expenses, stockMovements] = await Promise.all([
      getDiscoProducts(),
      getSales(),
      getExpenses(),
      getStockMovements(),
    ]);

    return {
      products,
      sales,
      expenses,
      stockMovements,
    };
  }
);

const discoSlice = createSlice({
  name: "disco",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDiscoDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDiscoDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.products = action.payload.products;
        state.sales = action.payload.sales;
        state.expenses = action.payload.expenses;
        state.stockMovements = action.payload.stockMovements;
      })
      .addCase(fetchDiscoDashboard.rejected, (state) => {
        state.loading = false;
        state.error = "Could not load disco dashboard";
      });
  },
});

export default discoSlice.reducer;