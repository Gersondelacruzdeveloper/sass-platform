const inventoryItems = [
  {
    name: "Brugal Añejo",
    category: "Rum",
    stock: 18,
    minStock: 10,
    unit: "bottles",
    value: 360,
  },
  {
    name: "Presidente Beer",
    category: "Beer",
    stock: 124,
    minStock: 40,
    unit: "units",
    value: 248,
  },
  {
    name: "Grey Goose Vodka",
    category: "Vodka",
    stock: 6,
    minStock: 8,
    unit: "bottles",
    value: 420,
  },
];

export default function InventoryTable() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500">
            Live stock levels and low-stock alerts
          </p>
        </div>

        <button className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
          Add Item
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
              <th className="pb-3">Product</th>
              <th className="pb-3">Category</th>
              <th className="pb-3">Stock</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Value</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {inventoryItems.map((item) => {
              const isLow = item.stock <= item.minStock;

              return (
                <tr key={item.name}>
                  <td className="py-4 font-semibold text-gray-900">
                    {item.name}
                  </td>
                  <td className="py-4 text-gray-500">{item.category}</td>
                  <td className="py-4 text-gray-700">
                    {item.stock} {item.unit}
                  </td>
                  <td className="py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isLow
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {isLow ? "Low Stock" : "Healthy"}
                    </span>
                  </td>
                  <td className="py-4 font-semibold text-gray-900">
                    ${item.value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}