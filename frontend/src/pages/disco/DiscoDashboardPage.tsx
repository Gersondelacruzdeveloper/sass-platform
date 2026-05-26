import { useEffect } from "react";
import { Package, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchDiscoDashboard } from "../../features/disco/discoSlice";

const toNumber = (value: string | number | undefined | null) => {
  return Number(value || 0);
};

export default function DiscoDashboardPage() {
  const dispatch = useAppDispatch();

  const { products, sales, expenses, loading } = useAppSelector(
    (state) => state.disco
  );

  useEffect(() => {
    dispatch(fetchDiscoDashboard());
  }, [dispatch]);

  const totalSales = sales.reduce((sum, sale) => sum + toNumber(sale.total), 0);
  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + toNumber(expense.amount),
    0
  );
  const profit = totalSales - totalExpenses;

  const lowStock = products.filter(
    (product) => product.stock <= product.minimum_stock
  );

  if (loading) {
    return <div className="p-6">Loading disco dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Disco Dashboard</h1>
        <p className="text-slate-500">
          Sales, drinks, stock, expenses and profit control.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center gap-3">
            <Package />
            <div>
              <p className="text-sm text-slate-500">Products</p>
              <p className="text-2xl font-bold">{products.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center gap-3">
            <DollarSign />
            <div>
              <p className="text-sm text-slate-500">Sales</p>
              <p className="text-2xl font-bold">${totalSales.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center gap-3">
            <TrendingUp />
            <div>
              <p className="text-sm text-slate-500">Profit</p>
              <p className="text-2xl font-bold">${profit.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center gap-3">
            <AlertTriangle />
            <div>
              <p className="text-sm text-slate-500">Low Stock</p>
              <p className="text-2xl font-bold">{lowStock.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5">
        <h2 className="text-lg font-semibold mb-4">Products / Drinks</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Drink</th>
                <th>Stock</th>
                <th>Cost</th>
                <th>Sale Price</th>
                <th>Profit Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b">
                  <td className="py-2 font-medium">{product.name}</td>
                  <td>{product.stock}</td>
                  <td>${product.cost_price}</td>
                  <td>${product.sale_price}</td>
                  <td>
                    $
                    {(
                      toNumber(product.sale_price) -
                      toNumber(product.cost_price)
                    ).toFixed(2)}
                  </td>
                  <td>
                    {product.stock <= product.minimum_stock ? (
                      <span className="text-red-600 font-semibold">
                        Low stock
                      </span>
                    ) : (
                      <span className="text-green-600 font-semibold">OK</span>
                    )}
                  </td>
                </tr>
              ))}

              {products.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={6}>
                    No drinks/products yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}