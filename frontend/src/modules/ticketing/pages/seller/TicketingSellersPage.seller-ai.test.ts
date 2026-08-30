import { describe, expect, it } from "vitest";

import {
  formToFormData,
  sellerToForm,
} from "./TicketingSellersPage";

describe("TicketingSellersPage seller AI field", () => {
  it("defaults new and legacy sellers to enabled", () => {
    const form = sellerToForm({
      id: 7,
      full_name: "Legacy Seller",
      seller_slug: "legacy-seller",
      role: "seller",
      assigned_products: [],
      is_active: true,
    } as never);

    expect(form.seller_ai_enabled).toBe(true);
  });

  it("preserves and submits the individual seller setting", () => {
    const form = sellerToForm({
      id: 8,
      full_name: "Disabled Seller",
      seller_slug: "disabled-seller",
      role: "seller",
      assigned_products: [],
      seller_ai_enabled: false,
      is_active: true,
    } as never);

    expect(form.seller_ai_enabled).toBe(false);

    const payload = formToFormData(form, null);

    expect(payload.get("seller_ai_enabled")).toBe("false");
  });
});
