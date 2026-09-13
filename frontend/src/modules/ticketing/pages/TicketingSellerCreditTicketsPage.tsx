import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldX, Ticket } from "lucide-react";

import { ticketingApi } from "../api/ticketingApi";
import type { Booking } from "../types/ticketingTypes";

function money(value: string | number | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

function statusLabel(status?: Booking["seller_credit_status"]) {
  if (status === "settled") return "Paid to company";
  if (status === "blocked") return "Not paid / blocked";
  return "Pending collection";
}

function statusClasses(status?: Booking["seller_credit_status"]) {
  if (status === "settled") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function TicketingSellerCreditTicketsPage() {
  const params = useParams();
  const slug = params.organisationSlug || params.slug || "";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const rows = await ticketingApi.getBookings(slug, { seller_credit: true });
      setBookings(rows);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not load seller credit tickets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [slug]);

  async function changeStatus(
    booking: Booking,
    nextStatus: "pending_collection" | "settled" | "blocked",
  ) {
    try {
      setSavingId(Number(booking.id));
      setError("");
      const updated = await ticketingApi.updateSellerCreditStatus(
        Number(booking.id),
        nextStatus,
        slug,
      );
      setBookings((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not update this ticket.");
    } finally {
      setSavingId(null);
    }
  }

  const totals = useMemo(() => {
    const pending = bookings.filter((b) => b.seller_credit_status === "pending_collection");
    const blocked = bookings.filter((b) => b.seller_credit_status === "blocked");
    const settled = bookings.filter((b) => b.seller_credit_status === "settled");
    return {
      pendingCount: pending.length,
      blockedCount: blocked.length,
      settledCount: settled.length,
      pendingAmount: pending.reduce((sum, b) => sum + Number(b.seller_due_to_company || b.total_amount || 0), 0),
    };
  }, [bookings]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Seller credit control</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Paid tickets issued by sellers</h1>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
            These customers already have a QR, but the seller may still owe the company the money. Mark the ticket paid when you receive it, or block it if payment has not arrived.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Summary label="Pending seller money" value={money(totals.pendingAmount)} />
        <Summary label="Pending" value={String(totals.pendingCount)} />
        <Summary label="Blocked" value={String(totals.blockedCount)} />
        <Summary label="Paid to company" value={String(totals.settledCount)} />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
      ) : bookings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Ticket className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-black text-slate-700">No seller-credit tickets yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Seller owes</th>
                  <th className="px-4 py-3">Event date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((booking) => {
                  const saving = savingId === Number(booking.id);
                  return (
                    <tr key={booking.id} className="align-top">
                      <td className="px-4 py-4 font-black text-slate-950">{booking.booking_code}</td>
                      <td className="px-4 py-4">
                        <div className="font-black text-slate-800">{booking.customer_name}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">{booking.customer_whatsapp || booking.customer_email || "—"}</div>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-700">{booking.seller_detail?.full_name || "—"}</td>
                      <td className="px-4 py-4 font-black text-slate-950">{money(booking.seller_due_to_company || booking.total_amount)}</td>
                      <td className="px-4 py-4 font-bold text-slate-600">{booking.service_date || "—"}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClasses(booking.seller_credit_status)}`}>
                          {statusLabel(booking.seller_credit_status)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex min-w-64 flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={saving || booking.seller_credit_status === "settled"}
                            onClick={() => void changeStatus(booking, "settled")}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-40"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Paid
                          </button>
                          <button
                            type="button"
                            disabled={saving || booking.seller_credit_status === "blocked"}
                            onClick={() => void changeStatus(booking, "blocked")}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-xs font-black text-white disabled:opacity-40"
                          >
                            <ShieldX className="h-4 w-4" /> Not paid / block
                          </button>
                          {booking.seller_credit_status !== "pending_collection" && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void changeStatus(booking, "pending_collection")}
                              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 disabled:opacity-40"
                            >
                              <AlertTriangle className="h-4 w-4" /> Pending
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}
