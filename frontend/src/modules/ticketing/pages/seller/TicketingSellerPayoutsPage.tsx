// src/modules/ticketing/pages/seller/TicketingSellerPayoutsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type {
  SellerPayoutAccount,
  SellerPayoutAccountPayload,
  SellerPayoutMethod,
  SellerPayoutRequest,
} from "../../types/ticketingTypes";
import {
  formatDateTime,
  formatMoney,
  getApiError,
  humanize,
  normalizeList,
  statusClasses,
} from "../../seller-onboarding/sellerOnboardingUi";

const PAYOUT_METHODS: Array<{
  value: SellerPayoutMethod;
  label: string;
}> = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "mobile_wallet", label: "Mobile wallet" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

const EMPTY_ACCOUNT: SellerPayoutAccountPayload = {
  method: "bank_transfer",
  nickname: "",
  account_holder_name: "",
  bank_name: "",
  account_type: "",
  account_number: "",
  paypal_email: "",
  mobile_wallet_phone: "",
  extra_details: {},
  is_default: true,
  is_active: true,
};

function fieldClass() {
  return "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100";
}

function textareaClass() {
  return "min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100";
}

export default function TicketingSellerPayoutsPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [accounts, setAccounts] = useState<SellerPayoutAccount[]>([]);
  const [requests, setRequests] = useState<SellerPayoutRequest[]>([]);
  const [availableAmount, setAvailableAmount] = useState(0);
  const [currency, setCurrency] = useState("USD");

  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState<SellerPayoutAccountPayload>({
    ...EMPTY_ACCOUNT,
  });

  const [requestAmount, setRequestAmount] = useState("");
  const [requestAccountId, setRequestAccountId] = useState("");
  const [sellerNote, setSellerNote] = useState("");

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.is_active),
    [accounts],
  );

  const defaultAccount = useMemo(
    () => activeAccounts.find((account) => account.is_default) || activeAccounts[0],
    [activeAccounts],
  );

  useEffect(() => {
    if (!requestAccountId && defaultAccount) {
      setRequestAccountId(String(defaultAccount.id));
    }
  }, [defaultAccount, requestAccountId]);

  async function loadPage() {
    if (!organisationSlug) {
      setError("Organisation could not be resolved.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [accountData, requestData, balanceData] = await Promise.all([
        ticketingApi.getSellerPayoutAccounts(organisationSlug),
        ticketingApi.getMySellerPayoutRequests(organisationSlug),
        ticketingApi.getSellerPayoutBalance(organisationSlug),
      ]);

      setAccounts(normalizeList<SellerPayoutAccount>(accountData));
      setRequests(normalizeList<SellerPayoutRequest>(requestData));
      setAvailableAmount(Number(balanceData.available_for_payout || 0));
      setCurrency(balanceData.currency || "USD");
    } catch (loadError) {
      setError(getApiError(loadError, "Could not load payout information."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [organisationSlug]);

  function updateAccountField<K extends keyof SellerPayoutAccountPayload>(
    key: K,
    value: SellerPayoutAccountPayload[K],
  ) {
    setAccountForm((current) => ({ ...current, [key]: value }));
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accountForm.account_holder_name.trim()) {
      setError("Account holder name is required.");
      return;
    }

    try {
      setSavingAccount(true);
      setError("");
      setMessage("");

      const created = await ticketingApi.createSellerPayoutAccount(
        organisationSlug,
        accountForm,
      );

      setAccounts((current) => {
        const withoutConflictingDefault = created.is_default
          ? current.map((account) => ({ ...account, is_default: false }))
          : current;
        return [created, ...withoutConflictingDefault];
      });
      setAccountForm({ ...EMPTY_ACCOUNT });
      setShowAccountForm(false);
      setRequestAccountId(String(created.id));
      setMessage("Payout account saved.");
    } catch (saveError) {
      setError(getApiError(saveError, "Could not save the payout account."));
    } finally {
      setSavingAccount(false);
    }
  }

  async function makeDefault(account: SellerPayoutAccount) {
    try {
      setWorkingId(account.id);
      setError("");

      const updated = await ticketingApi.makeSellerPayoutAccountDefault(
        organisationSlug,
        account.id,
      );

      setAccounts((current) =>
        current.map((item) => ({
          ...item,
          is_default: item.id === updated.id,
        })),
      );
      setRequestAccountId(String(updated.id));
      setMessage("Default payout account updated.");
    } catch (actionError) {
      setError(getApiError(actionError, "Could not update the default account."));
    } finally {
      setWorkingId(null);
    }
  }

  async function removeAccount(account: SellerPayoutAccount) {
    const confirmed = window.confirm(
      `Remove ${account.nickname || account.masked_destination}?`,
    );
    if (!confirmed) return;

    try {
      setWorkingId(account.id);
      setError("");
      await ticketingApi.deleteSellerPayoutAccount(organisationSlug, account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      if (requestAccountId === String(account.id)) {
        setRequestAccountId("");
      }
      setMessage("Payout account removed.");
    } catch (actionError) {
      setError(getApiError(actionError, "Could not remove this payout account."));
    } finally {
      setWorkingId(null);
    }
  }

  async function submitPayoutRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(requestAmount);
    const accountId = Number(requestAccountId);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payout amount greater than zero.");
      return;
    }

    if (amount > availableAmount) {
      setError(`The maximum available amount is ${formatMoney(availableAmount, currency)}.`);
      return;
    }

    if (!accountId) {
      setError("Choose a payout account.");
      return;
    }

    try {
      setRequestingPayout(true);
      setError("");
      setMessage("");

      const created = await ticketingApi.createSellerPayoutRequest(
        organisationSlug,
        {
          amount: requestAmount,
          payout_account: accountId,
          seller_note: sellerNote.trim(),
        },
      );

      setRequests((current) => [created, ...current]);
      setAvailableAmount((current) => Math.max(current - amount, 0));
      setRequestAmount("");
      setSellerNote("");
      setMessage("Your payout request was submitted.");
    } catch (submitError) {
      setError(getApiError(submitError, "Could not submit the payout request."));
    } finally {
      setRequestingPayout(false);
    }
  }

  async function cancelRequest(request: SellerPayoutRequest) {
    const confirmed = window.confirm("Cancel this payout request?");
    if (!confirmed) return;

    try {
      setWorkingId(request.id);
      setError("");

      const updated = await ticketingApi.cancelSellerPayoutRequest(
        organisationSlug,
        request.id,
      );

      setRequests((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await loadPage();
      setMessage("Payout request cancelled.");
    } catch (actionError) {
      setError(getApiError(actionError, "Could not cancel this payout request."));
    } finally {
      setWorkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-black text-slate-700">Loading payouts...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">
            Seller finance
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            Commission payouts
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Save a payment destination and request payment from approved commission.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPage()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 shadow-sm md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <CircleDollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                Available for payout
              </p>
              <p className="mt-1 text-3xl font-black text-emerald-950">
                {formatMoney(availableAmount, currency)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold leading-6 text-emerald-800/80">
            This balance includes approved commission that has not already been reserved by another active payout request.
          </p>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Payment accounts
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">{activeAccounts.length}</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {defaultAccount
              ? `Default: ${defaultAccount.masked_destination}`
              : "Add an account before requesting payment."}
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Payout accounts</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Sensitive destination details are masked after saving.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountForm((current) => !current)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
              >
                {showAccountForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {showAccountForm ? "Close" : "Add"}
              </button>
            </div>

            {showAccountForm && (
              <form onSubmit={saveAccount} className="mt-5 space-y-4 rounded-3xl bg-slate-50 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Method
                    </span>
                    <select
                      value={accountForm.method}
                      onChange={(event) =>
                        updateAccountField("method", event.target.value as SellerPayoutMethod)
                      }
                      className={fieldClass()}
                    >
                      {PAYOUT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Nickname
                    </span>
                    <input
                      value={accountForm.nickname || ""}
                      onChange={(event) => updateAccountField("nickname", event.target.value)}
                      placeholder="My main account"
                      className={fieldClass()}
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Account holder name
                  </span>
                  <input
                    required
                    value={accountForm.account_holder_name}
                    onChange={(event) =>
                      updateAccountField("account_holder_name", event.target.value)
                    }
                    className={fieldClass()}
                  />
                </label>

                {accountForm.method === "bank_transfer" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Bank name
                      </span>
                      <input
                        value={accountForm.bank_name || ""}
                        onChange={(event) => updateAccountField("bank_name", event.target.value)}
                        className={fieldClass()}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Account type
                      </span>
                      <input
                        value={accountForm.account_type || ""}
                        onChange={(event) => updateAccountField("account_type", event.target.value)}
                        placeholder="Savings / checking"
                        className={fieldClass()}
                      />
                    </label>
                    <label className="space-y-2 sm:col-span-2">
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Account number
                      </span>
                      <input
                        required
                        value={accountForm.account_number || ""}
                        onChange={(event) =>
                          updateAccountField("account_number", event.target.value)
                        }
                        className={fieldClass()}
                      />
                    </label>
                  </div>
                )}

                {accountForm.method === "paypal" && (
                  <label className="block space-y-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                      PayPal email
                    </span>
                    <input
                      required
                      type="email"
                      value={accountForm.paypal_email || ""}
                      onChange={(event) => updateAccountField("paypal_email", event.target.value)}
                      className={fieldClass()}
                    />
                  </label>
                )}

                {accountForm.method === "mobile_wallet" && (
                  <label className="block space-y-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Mobile wallet phone
                    </span>
                    <input
                      required
                      value={accountForm.mobile_wallet_phone || ""}
                      onChange={(event) =>
                        updateAccountField("mobile_wallet_phone", event.target.value)
                      }
                      className={fieldClass()}
                    />
                  </label>
                )}

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <input
                    type="checkbox"
                    checked={Boolean(accountForm.is_default)}
                    onChange={(event) => updateAccountField("is_default", event.target.checked)}
                    className="h-5 w-5 rounded border-slate-300"
                  />
                  <span className="text-sm font-black text-slate-700">
                    Use as my default payout account
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={savingAccount}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-60"
                >
                  {savingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save payout account
                </button>
              </form>
            )}

            <div className="mt-5 space-y-3">
              {accounts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-center">
                  <WalletCards className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 text-sm font-black text-slate-700">No payout account yet</p>
                </div>
              ) : (
                accounts.map((account) => (
                  <article
                    key={account.id}
                    className="rounded-3xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                          {account.method === "bank_transfer" ? (
                            <Building2 className="h-5 w-5" />
                          ) : (
                            <CreditCard className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black text-slate-950">
                              {account.nickname || humanize(account.method)}
                            </p>
                            {account.is_default && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-700">
                                <Star className="h-3 w-3 fill-current" /> Default
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                            {account.masked_destination}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            {account.account_holder_name}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-1">
                        {!account.is_default && (
                          <button
                            type="button"
                            disabled={workingId === account.id}
                            onClick={() => void makeDefault(account)}
                            title="Make default"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={workingId === account.id}
                          onClick={() => void removeAccount(account)}
                          title="Remove account"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          {workingId === account.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <form
            onSubmit={submitPayoutRequest}
            className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <h2 className="text-xl font-black text-slate-950">Request a payout</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              The requested amount is reserved immediately while the owner reviews it.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Amount
                </span>
                <input
                  required
                  min="0.01"
                  max={availableAmount || undefined}
                  step="0.01"
                  type="number"
                  value={requestAmount}
                  onChange={(event) => setRequestAmount(event.target.value)}
                  placeholder="0.00"
                  className={fieldClass()}
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Payout account
                </span>
                <select
                  required
                  value={requestAccountId}
                  onChange={(event) => setRequestAccountId(event.target.value)}
                  className={fieldClass()}
                >
                  <option value="">Choose an account</option>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.nickname || humanize(account.method)} — {account.masked_destination}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                Note to owner
              </span>
              <textarea
                value={sellerNote}
                onChange={(event) => setSellerNote(event.target.value)}
                placeholder="Optional payment note"
                className={textareaClass()}
              />
            </label>

            <button
              type="submit"
              disabled={
                requestingPayout ||
                activeAccounts.length === 0 ||
                availableAmount <= 0
              }
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requestingPayout ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CircleDollarSign className="h-4 w-4" />
              )}
              Submit payout request
            </button>
          </form>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black text-slate-950">Payout history</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Review approval, processing and payment status.
            </p>

            <div className="mt-5 space-y-3">
              {requests.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center">
                  <WalletCards className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 text-sm font-black text-slate-700">
                    No payout requests yet
                  </p>
                </div>
              ) : (
                requests.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-3xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-black text-slate-950">
                            {formatMoney(request.amount, request.currency)}
                          </p>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClasses(request.status)}`}
                          >
                            {humanize(request.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-500">
                          {request.payout_destination}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          Requested {formatDateTime(request.requested_at)}
                        </p>
                      </div>

                      {["requested", "under_review"].includes(request.status) && (
                        <button
                          type="button"
                          disabled={workingId === request.id}
                          onClick={() => void cancelRequest(request)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-red-200 px-4 text-xs font-black text-red-700 hover:bg-red-50"
                        >
                          {workingId === request.id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          Cancel
                        </button>
                      )}
                    </div>

                    {(request.seller_note || request.owner_note || request.rejection_reason) && (
                      <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                        {request.seller_note && <p>Your note: {request.seller_note}</p>}
                        {request.owner_note && <p>Owner note: {request.owner_note}</p>}
                        {request.rejection_reason && (
                          <p className="text-red-700">Reason: {request.rejection_reason}</p>
                        )}
                      </div>
                    )}

                    {request.payment_reference && (
                      <p className="mt-3 text-xs font-black text-emerald-700">
                        Payment reference: {request.payment_reference}
                      </p>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
