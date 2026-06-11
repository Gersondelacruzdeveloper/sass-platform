// src/modules/disco/components/DiscoDataTable.tsx

import type { ReactNode } from "react";
import { Search } from "lucide-react";

type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

type DiscoDataTableProps<T> = {
  title?: string;
  subtitle?: string;
  columns: Column<T>[];
  data: T[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  emptyMessage?: string;
  actions?: ReactNode;
};

export default function DiscoDataTable<T extends { id?: number | string }>({
  title,
  subtitle,
  columns,
  data,
  searchValue,
  onSearchChange,
  emptyMessage = "No records found.",
  actions,
}: DiscoDataTableProps<T>) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      {(title || subtitle || onSearchChange || actions) && (
        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0">
          <div>
            {title && (
              <h2 className="text-lg font-black text-slate-900">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {onSearchChange && (
              <div className="relative">
                <Search
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={searchValue || ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white sm:w-72"
                />
              </div>
            )}

            {actions}
          </div>
        </div>
      )}

      {/* Mobile cards */}
      <div className="divide-y divide-slate-100 md:hidden">
        {data.length === 0 ? (
          <div className="p-6 text-center text-sm font-semibold text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          data.map((row, rowIndex) => (
            <div key={row.id ?? rowIndex} className="space-y-3 p-4">
              {columns.map((column) => (
                <div
                  key={String(column.key)}
                  className="flex items-start justify-between gap-4"
                >
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    {column.label}
                  </p>

                  <div className="max-w-[65%] text-right text-sm font-bold text-slate-800">
                    {column.render
                      ? column.render(row)
                      : String(row[column.key as keyof T] ?? "—")}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500 ${
                    column.className || ""
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-10 text-center text-sm font-semibold text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr key={row.id ?? rowIndex} className="hover:bg-slate-50">
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className={`whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-700 ${
                        column.className || ""
                      }`}
                    >
                      {column.render
                        ? column.render(row)
                        : String(row[column.key as keyof T] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}