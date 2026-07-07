// src/modules/ticketing/pages/seller/TicketingSellerProductsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useParams } from "react-router-dom";

import ticketingApi from "../../api/ticketingApi";
import type { ExperienceProduct } from "../../types/ticketingTypes";
import SellerProductCard from "../../components/seller/SellerProductCard";

function getErrorMessage(error: any) {
  const data = error?.response?.data;

  if (!data) return "Could not load seller products.";
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);

  return "Could not load seller products.";
}

export default function TicketingSellerProductsPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  const slug = organisationSlug || "";
  const bookingPath = `/ticketing/${slug}/seller/new-booking`;

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      if (!slug) {
        setProducts([]);
        setErrorMessage("Organisation slug is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const data = await ticketingApi.getSellerProducts(slug, {
          is_active: true,
        });

        if (!active) return;
        setProducts(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Could not load seller products:", error);
        if (!active) return;
        setProducts([]);
        setErrorMessage(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, [slug]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return products;

    return products.filter((product) => {
      return [
        product.name,
        product.short_description,
        product.location,
        product.product_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [products, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-amber-600">
            Seller Products
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Products you can sell
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            These products come from the seller-only API and are filtered by your permissions.
          </p>
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products..."
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-slate-400"
          />
        </div>
      </div>

      {loading && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          Loading products...
        </div>
      )}

      {!loading && errorMessage && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && filteredProducts.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          No products available for your seller account.
        </div>
      )}

      {!loading && !errorMessage && filteredProducts.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <SellerProductCard
              key={product.id}
              product={product}
              bookingPath={bookingPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
