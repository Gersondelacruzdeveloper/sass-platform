import {
  DollarSign,
  TrendingUp,
  Boxes,
  Users,
  Armchair,
  Ticket,
  ClipboardList,
  Banknote,
  CreditCard,
} from "lucide-react";

import KPIStatCard from "../components/KPIStatCard";
import SalesChart from "../components/SalesChart";
import InventoryTable from "../components/InventoryTable";

export default function DashboardHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
          Disco overview
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          Welcome back, Gerson
        </h1>

        <p className="mt-2 text-gray-500">
          Track POS sales, table orders, entry fees, open tabs, inventory,
          expenses, employees, and profit in real time.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          title="Tonight’s Revenue"
          value="$7,760"
          change="+22.4% from last night"
          trend="up"
          icon={DollarSign}
        />

        <KPIStatCard
          title="Net Profit"
          value="$4,930"
          change="+14.7% this week"
          trend="up"
          icon={TrendingUp}
        />

        <KPIStatCard
          title="Open Tabs"
          value="11"
          change="$4,820 outstanding"
          trend="neutral"
          icon={ClipboardList}
        />

        <KPIStatCard
          title="Guests Inside"
          value="126"
          change="148 entries sold"
          trend="up"
          icon={Users}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          title="Door Revenue"
          value="$2,940"
          change="Entry fees tonight"
          trend="up"
          icon={Ticket}
        />

        <KPIStatCard
          title="Table Revenue"
          value="$4,820"
          change="14 occupied tables"
          trend="up"
          icon={Armchair}
        />

        <KPIStatCard
          title="Inventory Value"
          value="$13,800"
          change="3 low-stock items"
          trend="down"
          icon={Boxes}
        />

        <KPIStatCard
          title="Employees Active"
          value="12"
          change="Pro plan limit: 15"
          trend="neutral"
          icon={Users}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SalesChart />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Tonight’s Summary
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Live performance for the current shift.
          </p>

          <div className="mt-6 space-y-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <Banknote size={16} />
                Cash sales
              </span>
              <span className="font-semibold text-gray-900">$3,860</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <CreditCard size={16} />
                Card sales
              </span>
              <span className="font-semibold text-gray-900">$1,240</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <Ticket size={16} />
                Entry fees
              </span>
              <span className="font-semibold text-gray-900">$2,940</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-gray-500">
                <Armchair size={16} />
                Table orders
              </span>
              <span className="font-semibold text-gray-900">$4,820</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Expenses today</span>
              <span className="font-semibold text-red-600">$1,600</span>
            </div>

            <div className="border-t pt-5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  Estimated profit
                </span>
                <span className="text-xl font-bold text-emerald-600">
                  $4,930
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-slate-950 p-6 text-white shadow-sm">
          <h2 className="text-lg font-bold">Live Operations</h2>

          <p className="mt-1 text-sm text-slate-400">
            Current nightclub activity.
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-slate-400">Occupied tables</span>
              <span className="font-bold">14 / 28</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Open tabs</span>
              <span className="font-bold">11</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Guests inside</span>
              <span className="font-bold">126</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Active cashiers</span>
              <span className="font-bold">4</span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="text-lg font-bold text-gray-900">
            Revenue Breakdown
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Where tonight’s money is coming from.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-500">POS drinks</p>
              <h3 className="mt-2 text-2xl font-bold text-gray-900">
                $2,000
              </h3>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-500">Tables/VIP</p>
              <h3 className="mt-2 text-2xl font-bold text-gray-900">
                $4,820
              </h3>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-500">Entry fees</p>
              <h3 className="mt-2 text-2xl font-bold text-gray-900">
                $2,940
              </h3>
            </div>
          </div>
        </div>
      </div>

      <InventoryTable />
    </div>
  );
}