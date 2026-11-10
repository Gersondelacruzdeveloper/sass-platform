import {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
} from "lucide-react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  getColmadoCheckoutStatus,
} from "../api/colmadoSignupClient";


const ACTIVATION_RETRY_DELAY_MS = 1500;
const MAX_ACTIVATION_CHECKS = 20;


type PageState =
  | "checking"
  | "activating"
  | "error";


function safeLoginUrl(loginUrl: string): string {
  return /^\/colmado\/[^/?#]+\/login$/.test(loginUrl)
    ? loginUrl
    : "/colmado/login";
}


export default function ColmadoSubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";

  const [pageState, setPageState] = useState<PageState>("checking");
  const [message, setMessage] = useState(
    "Confirmando tu pago con Stripe...",
  );
  const [retryVersion, setRetryVersion] = useState(0);


  useEffect(() => {
    if (!sessionId) {
      setPageState("error");
      setMessage(
        "No encontramos la referencia del pago. Vuelve al registro o comunícate con soporte.",
      );
      return;
    }

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function verifyCheckout(attempt: number) {
      try {
        const checkout = await getColmadoCheckoutStatus(sessionId);

        if (!active) {
          return;
        }

        const paymentCompleted = (
          checkout.payment_status === "paid"
          || checkout.payment_status === "no_payment_required"
        );

        if (!paymentCompleted) {
          setPageState("error");
          setMessage(
            "Stripe todavía no confirma el pago. Revisa el estado del cobro antes de intentarlo nuevamente.",
          );
          return;
        }

        if (checkout.is_active) {
          navigate(
            safeLoginUrl(checkout.login_url),
            {
              replace: true,
            },
          );
          return;
        }

        setPageState("activating");
        setMessage(
          `Pago recibido. Estamos activando ${checkout.organisation_name}...`,
        );

        if (attempt >= MAX_ACTIVATION_CHECKS) {
          setPageState("error");
          setMessage(
            "Recibimos el pago, pero la activación está tardando más de lo normal. Pulsa revisar nuevamente; no realices otro pago.",
          );
          return;
        }

        retryTimer = setTimeout(
          () => {
            void verifyCheckout(attempt + 1);
          },
          ACTIVATION_RETRY_DELAY_MS,
        );
      } catch {
        if (!active) {
          return;
        }

        setPageState("error");
        setMessage(
          "No pudimos confirmar la activación en este momento. Tu pago no se repetirá; pulsa revisar nuevamente.",
        );
      }
    }

    setPageState("checking");
    setMessage("Confirmando tu pago con Stripe...");
    void verifyCheckout(0);

    return () => {
      active = false;

      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    navigate,
    retryVersion,
    sessionId,
  ]);


  const loading = (
    pageState === "checking"
    || pageState === "activating"
  );


  return (
    <main className="grid min-h-screen place-items-center bg-emerald-950 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl sm:p-10">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-emerald-100 text-emerald-700">
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={40}
            />
          ) : (
            <AlertCircle
              aria-hidden="true"
              size={40}
            />
          )}
        </span>

        <p className="mt-5 text-sm font-black uppercase tracking-wide text-emerald-700">
          Mi Colmado
        </p>

        <h1 className="mt-2 text-3xl font-black text-slate-950">
          {loading
            ? "Preparando tu cuenta"
            : "Necesitamos revisar la activación"}
        </h1>

        <p
          className="mt-4 leading-7 text-slate-600"
          role={pageState === "error" ? "alert" : "status"}
        >
          {message}
        </p>

        {loading && (
          <div className="mt-7 rounded-2xl bg-emerald-50 p-4 text-left text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-black">
              <ShieldCheck aria-hidden="true" size={19} />
              Pago protegido por Stripe
            </p>
            <p className="mt-2 leading-6 text-emerald-800">
              No cierres esta pantalla. Te enviaremos automáticamente al inicio de sesión.
            </p>
          </div>
        )}

        {pageState === "error" && sessionId && (
          <button
            className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 font-black text-white transition hover:bg-emerald-800"
            onClick={() => {
              setRetryVersion((current) => current + 1);
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={20} />
            Revisar activación
          </button>
        )}

        {pageState === "error" && !sessionId && (
          <Link
            className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 font-black text-white transition hover:bg-emerald-800"
            to="/colmado/signup"
          >
            <ShoppingBasket aria-hidden="true" size={20} />
            Volver al registro
          </Link>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
          <CheckCircle2 aria-hidden="true" size={16} />
          No vuelvas a pagar mientras verificamos el cobro.
        </div>
      </section>
    </main>
  );
}
