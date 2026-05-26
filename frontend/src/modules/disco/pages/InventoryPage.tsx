import {
  Plus,
  Search,
  Boxes,
  AlertTriangle,
  DollarSign,
  MoreVertical,
} from "lucide-react";

import InventoryTable from "../components/InventoryTable";

const categories = [
  { name: "Rum", items: 18, value: 4260 },
  { name: "Vodka", items: 12, value: 3180 },
  { name: "Beer", items: 240, value: 960 },
  { name: "Whisky", items: 9, value: 5400 },
];

export default function InventoryPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Stock control
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Inventory
          </h1>

          <p className="mt-2 text-gray-500">
            Monitor bottles, drinks, suppliers, low-stock alerts, and inventory value.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          Add Product
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total products</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">279</h2>
            </div>

            <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
              <Boxes size={24} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Low-stock alerts</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">3</h2>
            </div>

            <div className="rounded-2xl bg-red-100 p-3 text-red-700">
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Inventory value</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">$13,800</h2>
            </div>

            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <DollarSign size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-4">
        {categories.map((category) => (
          <div
            key={category.name}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{category.name}</p>
                <h3 className="mt-2 text-2xl font-bold text-gray-900">
                  {category.items}
                </h3>
                <p className="mt-1 text-sm text-gray-500">items in stock</p>
              </div>

              <button className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <MoreVertical size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">Stock value</p>
              <p className="mt-1 font-bold text-gray-900">
                ${category.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Product Inventory
            </h2>
            <p className="text-sm text-gray-500">
              Search, update, and monitor all stock items.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search product..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <InventoryTable />
      </div>
    </div>
  );
}