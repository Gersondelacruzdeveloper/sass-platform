// src/modules/ticketing/pages/seller/TicketingSellerCustomersPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useParams } from "react-router-dom";

import ticketingApi from "../../api/ticketingApi";
import type { Customer } from "../../types/ticketingTypes";

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export default function TicketingSellerCustomersPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  const slug = organisationSlug || "";

  useEffect(() => {
    async function loadCustomers() {
      try {
        setLoading(true);
        setErrorMessage("");

        const data = await ticketingApi.getCustomers(slug);
        setCustomers(data);
      } catch (error) {
        console.error(error);
        setErrorMessage("Could not load seller customers.");
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, [slug]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return customers;

    return customers.filter((customer) => {
      return [
        customer.full_name,
        customer.email,
        customer.phone,
        customer.whatsapp,
        customer.hotel_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [customers, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-amber-600">
            Seller Customers
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Your customers
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Only customers from your seller bookings are shown.
          </p>
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customers..."
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-slate-400"
          />
        </div>
      </div>

      {loading && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          Loading customers...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && filteredCustomers.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          No seller customers found.
        </div>
      )}

      {!loading && !errorMessage && filteredCustomers.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Customer
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Contact
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Hotel
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Bookings
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Total Spent
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950">
                        {customer.full_name}
                      </p>
                      {customer.email && (
                        <p className="text-sm font-semibold text-slate-500">
                          {customer.email}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      {customer.whatsapp || customer.phone || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      {customer.hotel_name || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm font-black text-slate-950">
                      {customer.total_bookings}
                    </td>
                    <td className="px-5 py-4 text-sm font-black text-slate-950">
                      {money(customer.total_spent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
