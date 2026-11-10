import {
  ArrowLeft,
  CreditCard,
  ShoppingBasket,
} from "lucide-react";

import {
  Link,
} from "react-router-dom";


export default function ColmadoSubscriptionCancelPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl sm:p-10">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-amber-100 text-amber-800">
          <CreditCard
            aria-hidden="true"
            size={40}
          />
        </span>

        <p className="mt-5 text-sm font-black uppercase tracking-wide text-emerald-700">
          Mi Colmado
        </p>

        <h1 className="mt-2 text-3xl font-black text-slate-950">
          El pago no se completó
        </h1>

        <p className="mt-4 leading-7 text-slate-600">
          Stripe no realizó ningún cobro. Puedes volver al registro y completar el pago cuando estés listo.
        </p>

        <Link
          className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 font-black text-white transition hover:bg-emerald-800"
          to="/colmado/signup"
        >
          <ShoppingBasket aria-hidden="true" size={20} />
          Volver al registro
        </Link>

        <Link
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 px-5 font-black text-slate-700 transition hover:bg-slate-50"
          to="/colmado/login"
        >
          <ArrowLeft aria-hidden="true" size={19} />
          Ya tengo una cuenta
        </Link>
      </section>
    </main>
  );
}
