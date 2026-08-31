import { describe, expect, it } from "vitest";

import { isPublicProductVisible } from "./PublicExperienceHomePage";

type PublicProductFixture = {
  id: number;
  name: string;
  product_type: string;
  public_enabled?: boolean;
  status?: string | null;
};

function visible(products: PublicProductFixture[]) {
  return products.filter((product) =>
    isPublicProductVisible(product as never),
  );
}

describe("PublicExperienceHomePage public product visibility", () => {
  it("shows a public product when the public serializer omits status", () => {
    const products = visible([
      {
        id: 1,
        name: "Saona Island Full Day",
        product_type: "excursion",
        public_enabled: true,
      },
    ]);

    expect(products.map((product) => product.id)).toEqual([1]);
  });

  it("shows an explicitly active public product", () => {
    const products = visible([
      {
        id: 7,
        name: "Coco Bongo Punta Cana",
        product_type: "nightlife",
        public_enabled: true,
        status: "active",
      },
    ]);

    expect(products.map((product) => product.id)).toEqual([7]);
  });

  it("excludes an explicitly archived product", () => {
    const products = visible([
      {
        id: 9,
        name: "Archived Catalina",
        product_type: "excursion",
        public_enabled: true,
        status: "archived",
      },
    ]);

    expect(products).toEqual([]);
  });

  it("excludes a product explicitly disabled from the public site", () => {
    const products = visible([
      {
        id: 12,
        name: "Private Product",
        product_type: "excursion",
        public_enabled: false,
        status: "active",
      },
    ]);

    expect(products).toEqual([]);
  });

  it("uses the same visible list for product-type counts", () => {
    const products = visible([
      {
        id: 1,
        name: "Saona",
        product_type: "excursion",
        public_enabled: true,
      },
      {
        id: 7,
        name: "Coco Bongo",
        product_type: "nightlife",
        public_enabled: true,
      },
      {
        id: 8,
        name: "Hidden Catalina",
        product_type: "excursion",
        public_enabled: false,
      },
      {
        id: 10,
        name: "Archived Transfer",
        product_type: "transfer",
        public_enabled: true,
        status: "archived",
      },
    ]);

    const counts = products.reduce<Record<string, number>>(
      (result, product) => {
        result[product.product_type] =
          (result[product.product_type] || 0) + 1;
        return result;
      },
      {},
    );

    expect(products).toHaveLength(2);
    expect(counts).toEqual({ excursion: 1, nightlife: 1 });
  });
});
