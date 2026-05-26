import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Receipt,
  ShoppingCart,
  Users,
  Armchair,
  Ticket,
  Clock3,
  DollarSign,
} from "lucide-react";

const products = [
  {
    id: 1,
    name: "Brugal Añejo",
    category: "Rum",
    price: 8,
    stock: 18,
  },
  {
    id: 2,
    name: "Presidente Beer",
    category: "Beer",
    price: 4,
    stock: 124,
  },
  {
    id: 3,
    name: "Grey Goose Bottle",
    category: "Vodka",
    price: 180,
    stock: 7,
  },
  {
    id: 4,
    name: "Black Label Bottle",
    category: "Whisky",
    price: 220,
    stock: 5,
  },
  {
    id: 5,
    name: "Mojito",
    category: "Cocktail",
    price: 9,
    stock: 50,
  },
  {
    id: 6,
    name: "VIP Hookah",
    category: "Extras",
    price: 45,
    stock: 12,
  },
];

const cartItems = [
  {
    id: 1,
    name: "Brugal Añejo",
    qty: 2,
    price: 8,
  },
  {
    id: 2,
    name: "Presidente Beer",
    qty: 4,
    price: 4,
  },
];

const tables = [
  "Walk-In",
  "VIP Table 1",
  "VIP Table 2",
  "Terrace 4",
  "Main Floor 7",
];

export default function PosPage() {
  const subtotal = cartItems.reduce(
    (total, item) => total + item.qty * item.price,
    0
  );

  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Live POS system
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Disco POS
          </h1>

          <p className="mt-2 text-gray-500">
            Handle walk-ins, tables, VIP bottle service, tabs, and payments.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800">
            <Ticket size={18} />
            Entry Fee
          </button>

          <button className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100">
            <Users size={18} />
            Open Tab
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <ShoppingCart className="text-cyan-600" />

          <p className="mt-4 text-sm text-gray-500">
            Orders tonight
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            86
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />

          <p className="mt-4 text-sm text-gray-500">
            Revenue tonight
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            $4,820
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Armchair className="text-purple-600" />

          <p className="mt-4 text-sm text-gray-500">
            Occupied tables
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            14
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Clock3 className="text-orange-600" />

          <p className="mt-4 text-sm text-gray-500">
            Open tabs
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            11
          </h2>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid gap-6 2xl:grid-cols-[1fr_430px]">
        {/* Products */}
        <section className="space-y-6">
          {/* Search */}
          <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <Search size={18} className="text-gray-400" />

              <input
                type="text"
                placeholder="Search drink, bottle, cocktail..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>

            <select className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none">
              {tables.map((table) => (
                <option key={table}>{table}</option>
              ))}
            </select>
          </div>

          {/* Categories */}
          <div className="flex gap-3 overflow-x-auto">
            {[
              "All",
              "Rum",
              "Beer",
              "Vodka",
              "Whisky",
              "Cocktail",
              "Extras",
            ].map((category) => (
              <button
                key={category}
                className={`whitespace-nowrap rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                  category === "All"
                    ? "bg-black text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <button
                key={product.id}
                className="group rounded-3xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-5 flex h-24 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-3xl font-black text-white">
                  {product.name.slice(0, 2).toUpperCase()}
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-gray-900">
                      {product.name}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      {product.category}
                    </p>
                  </div>

                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
                    {product.stock} left
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <p className="text-2xl font-bold text-gray-900">
                    ${product.price}
                  </p>

                  <span className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-cyan-600">
                    Add
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Right Panel */}
        <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* Order Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Current Order
              </h2>

              <p className="text-sm text-gray-500">
                VIP Table 1 · 6 Guests
              </p>
            </div>

            <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
              <ShoppingCart size={22} />
            </div>
          </div>

          {/* Cart */}
          <div className="mt-6 space-y-4">
            {cartItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {item.name}
                    </h3>

                    <p className="text-sm text-gray-500">
                      ${item.price} each
                    </p>
                  </div>

                  <button className="rounded-xl p-2 text-gray-400 hover:bg-white hover:text-red-600">
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button className="rounded-xl bg-white p-2 shadow-sm hover:bg-gray-100">
                      <Minus size={16} />
                    </button>

                    <span className="w-8 text-center font-bold">
                      {item.qty}
                    </span>

                    <button className="rounded-xl bg-white p-2 shadow-sm hover:bg-gray-100">
                      <Plus size={16} />
                    </button>
                  </div>

                  <p className="font-bold text-gray-900">
                    ${item.qty * item.price}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 space-y-3 border-t pt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>

              <span className="font-semibold text-gray-900">
                ${subtotal}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Tax & service</span>

              <span className="font-semibold text-gray-900">
                ${tax.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <span className="font-bold text-gray-900">
                Total
              </span>

              <span className="text-3xl font-black text-gray-900">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment Buttons */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
              <Banknote size={18} />
              Cash
            </button>

            <button className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
              <CreditCard size={18} />
              Card
            </button>
          </div>

          {/* Main Actions */}
          <div className="mt-4 space-y-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-bold text-white shadow-lg transition hover:bg-cyan-600">
              <Receipt size={18} />
              Complete Sale
            </button>

            <button className="w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-100">
              Save as Open Tab
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}