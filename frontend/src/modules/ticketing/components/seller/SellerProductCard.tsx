// src/modules/ticketing/components/seller/SellerProductCard.tsx

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  Copy,
  Link2,
  Loader2,
  MapPin,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type { ExperienceProduct } from "../../types/ticketingTypes";

type SellerProductCardProps = {
  product: ExperienceProduct;
  bookingPath: string;
};

type SignedOfferResponse = {
  organisation_slug: string;
  seller_slug: string;
  product_id: number;
  product_slug: string;
  discount_percent: string;
  maximum_discount_percent: string;
  offer_token: string;
  expires_in_seconds: number;
  offer_url?: string;
};

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

function percent(value: unknown) {
  const amount = Number(value || 0);

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function getMaximumDiscount(product: ExperienceProduct) {
  const productAny = product as any;

  const sellerAllowed = Number(
    productAny.seller_allowed_discount_percent ?? 0
  );
  const productMaximum = Number(
    productAny.max_customer_discount_percent ?? sellerAllowed
  );

  if (!Number.isFinite(sellerAllowed) || sellerAllowed <= 0) {
    return Math.max(0, Number.isFinite(productMaximum) ? productMaximum : 0);
  }

  if (!Number.isFinite(productMaximum) || productMaximum <= 0) {
    return Math.max(0, sellerAllowed);
  }

  return Math.max(0, Math.min(sellerAllowed, productMaximum));
}

function buildSignedPublicLink(response: SignedOfferResponse) {
  if (typeof window === "undefined") {
    return "";
  }

  const backendOfferUrl = String(response.offer_url || "").trim();

  if (backendOfferUrl) {
    return new URL(backendOfferUrl, window.location.origin).toString();
  }

  const url = new URL(
    `/experiences/${encodeURIComponent(
      response.organisation_slug
    )}/s/${encodeURIComponent(
      response.seller_slug
    )}/product/${encodeURIComponent(response.product_slug)}`,
    window.location.origin
  );

  url.searchParams.set("offer_token", response.offer_token);

  return url.toString();
}

export default function SellerProductCard({
  product,
  bookingPath,
}: SellerProductCardProps) {
  const maximumDiscount = useMemo(
    () => getMaximumDiscount(product),
    [product]
  );

  const [discountPercent, setDiscountPercent] = useState("0");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const discountEnabled = maximumDiscount > 0;

  function updateDiscount(value: string) {
    const parsed = Number(value);

    if (value === "") {
      setDiscountPercent("");
      setGeneratedLink("");
      setMessage("");
      return;
    }

    if (!Number.isFinite(parsed)) return;

    const safeValue = Math.max(0, Math.min(maximumDiscount, parsed));

    setDiscountPercent(String(safeValue));
    setGeneratedLink("");
    setMessage("");
    setCopied(false);
  }

  async function generateOfferLink() {
    const selectedDiscount = Number(discountPercent || 0);

    if (!Number.isFinite(selectedDiscount) || selectedDiscount < 0) {
      setMessage("Enter a valid discount.");
      return;
    }

    if (selectedDiscount > maximumDiscount) {
      setMessage(
        `The maximum allowed discount is ${percent(maximumDiscount)}%.`
      );
      return;
    }

    try {
      setGeneratingLink(true);
      setMessage("");
      setCopied(false);

      const response = (await ticketingApi.generateSellerOfferLink(
        product.id,
        selectedDiscount
      )) as SignedOfferResponse;

      const secureLink = buildSignedPublicLink(response);

      if (!secureLink) {
        throw new Error("Could not build the secure public offer link.");
      }

      setGeneratedLink(secureLink);

      try {
        await navigator.clipboard.writeText(secureLink);
        setCopied(true);
        setMessage("Secure offer link generated and copied.");
      } catch {
        setMessage("Secure offer link generated.");
      }
    } catch (error: any) {
      console.error("Could not generate seller offer link:", error);

      setGeneratedLink("");
      setMessage(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Could not generate the secure offer link."
      );
    } finally {
      setGeneratingLink(false);
    }
  }

  async function copyGeneratedLink() {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setMessage("Secure offer link copied.");
    } catch {
      setMessage("Could not copy the link automatically.");
    }
  }

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

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-950">
                Secure customer offer
              </p>

              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Maximum discount: {percent(maximumDiscount)}%. The discount is
                signed and validated by the backend.
              </p>

              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max={maximumDiscount}
                    step="0.01"
                    value={discountPercent}
                    onChange={(event) => updateDiscount(event.target.value)}
                    disabled={!discountEnabled || generatingLink}
                    className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 pr-9 text-sm font-black text-slate-950 outline-none focus:border-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    aria-label="Customer discount percentage"
                  />

                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                    %
                  </span>
                </div>

                <button
                  type="button"
                  onClick={generateOfferLink}
                  disabled={!discountEnabled || generatingLink}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingLink ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Generate
                </button>
              </div>

              {!discountEnabled && (
                <p className="mt-2 text-xs font-bold text-slate-500">
                  Discounts are not enabled for this product.
                </p>
              )}

              {generatedLink && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none"
                    aria-label="Generated secure offer link"
                  />

                  <button
                    type="button"
                    onClick={copyGeneratedLink}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                    aria-label="Copy secure offer link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}

              {message && (
                <p className="mt-2 text-xs font-bold text-slate-600">
                  {message}
                </p>
              )}
            </div>
          </div>
        </div>

        <Link
          to={`${bookingPath}?product=${product.id}`}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
        >
          Create Booking
        </Link>
      </div>
    </div>
  );
}
