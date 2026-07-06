// src/modules/ticketing/components/seller/SellerProductCard.tsx

import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";

import type { ExperienceProduct } from "../../types/ticketingTypes";

type SellerProductCardProps = {
  product: ExperienceProduct;
  bookingPath: string;
};

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export default function SellerProductCard({
  product,
  bookingPath,
}: SellerProductCardProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-[4/3] bg-slate-100">
        {product.image_url || product.image ? (
          <img
            src={product.image_url || product.image || ""}
            alt={product.image_alt_text || product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
            No image
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {product.product_type}
            </p>
            <h3 className="mt-1 line-clamp-2 text-lg font-black text-slate-950">
              {product.name}
            </h3>
          </div>

          <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-950">
            {money(product.base_price)}
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm font-medium text-slate-500">
          {product.short_description || product.long_description}
        </p>

        <div className="mt-4 space-y-2 text-sm font-semibold text-slate-500">
          {product.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{product.location}</span>
            </div>
          )}

          {product.duration_text && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <span>{product.duration_text}</span>
            </div>
          )}
        </div>

        <Link
          to={`${bookingPath}?product=${product.id}`}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
        >
          Create Booking
        </Link>
      </div>
    </div>
  );
}
