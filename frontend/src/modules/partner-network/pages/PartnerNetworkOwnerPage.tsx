import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  partnerNetworkApi,
  type ReferralPartner,
  type ReferralPartnerLocation,
  type ReferralProductAccess,
  type ReferralCommissionRule,
  type ReferralQRCode,
  type NetworkOptions,
} from "../api/partnerNetworkApi";


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-950">{title}</h2><div className="mt-4">{children}</div></section>;
}

export default function PartnerNetworkOwnerPage() {
  const { organisationSlug = "" } = useParams();
  const [partners, setPartners] = useState<ReferralPartner[]>([]);
  const [locations, setLocations] = useState<ReferralPartnerLocation[]>([]);
  const [products, setProducts] = useState<NetworkOptions["products"]>([]);
  const [pickups, setPickups] = useState<NetworkOptions["pickup_locations"]>([]);
  const [productRules, setProductRules] = useState<ReferralProductAccess[]>([]);
  const [commissionRules, setCommissionRules] = useState<ReferralCommissionRule[]>([]);
  const [qrs, setQrs] = useState<ReferralQRCode[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerType, setPartnerType] = useState("hotel");
  const [locationName, setLocationName] = useState("");
  const [pickupId, setPickupId] = useState("");
  const [portalEmail, setPortalEmail] = useState("");
  const [productId, setProductId] = useState("");
  const [commissionValue, setCommissionValue] = useState("5.00");
  const [commissionType, setCommissionType] = useState("fixed_per_booking");

  const selectedPartner = useMemo(() => partners.find(p => p.id === selectedPartnerId) ?? null, [partners, selectedPartnerId]);
  const selectedLocations = useMemo(() => locations.filter(l => l.partner === selectedPartnerId), [locations, selectedPartnerId]);

  const load = async () => {
    const [p, l, options, accessRules, rules, qrRows] = await Promise.all([
      partnerNetworkApi.listPartners(organisationSlug),
      partnerNetworkApi.listLocations(organisationSlug),
      partnerNetworkApi.getOptions(organisationSlug),
      partnerNetworkApi.listProductAccess(organisationSlug),
      partnerNetworkApi.listCommissionRules(organisationSlug),
      partnerNetworkApi.listQRs(organisationSlug),
    ]);
    setPartners(p); setLocations(l); setProducts(options.products); setPickups(options.pickup_locations); setProductRules(accessRules); setCommissionRules(rules); setQrs(qrRows);
    if (!selectedPartnerId && p.length) setSelectedPartnerId(p[0].id);
  };

  useEffect(() => { load().catch(() => setMessage("Could not load Partner Network data.")); }, [organisationSlug]);

  const addPartner = async (e: FormEvent) => {
    e.preventDefault();
    const partner = await partnerNetworkApi.createPartner(organisationSlug, { name: partnerName, partner_type: partnerType, status: "pending" });
    setPartnerName(""); setSelectedPartnerId(partner.id); setMessage("Partner created. Configure the property before activation."); await load();
  };

  const addLocation = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPartnerId) return;
    await partnerNetworkApi.createLocation(organisationSlug, {
      partner: selectedPartnerId,
      display_name: locationName,
      property_type: selectedPartner?.partner_type ?? "hotel",
      linked_pickup_location: pickupId ? Number(pickupId) : null,
      is_active: false,
    });
    setLocationName(""); setPickupId(""); setMessage("Property created. Add products/schedules and check readiness before activating it."); await load();
  };

  const activatePartner = async () => {
    if (!selectedPartnerId) return;
    await partnerNetworkApi.updatePartner(organisationSlug, selectedPartnerId, { status: "active" }); setMessage("Partner activated."); await load();
  };

  const activateLocation = async (location: ReferralPartnerLocation) => {
    const readiness = await partnerNetworkApi.getLocationReadiness(organisationSlug, location.id);
    const blocking = (readiness.problems ?? []).filter((x: string) => x !== "invalid_qr");
    if (blocking.length) { setMessage(`Cannot activate yet: ${blocking.join(", ")}`); return; }
    await partnerNetworkApi.updateLocation(organisationSlug, location.id, { is_active: true });
    setMessage("Property activated. Generate its QR next."); await load();
  };

  const generateQr = async (location: ReferralPartnerLocation) => {
    try { await partnerNetworkApi.generateQR(organisationSlug, location.id); setMessage(`QR generated for ${location.display_name}.`); await load(); }
    catch (error: any) { setMessage(error?.response?.data?.detail ?? "QR could not be generated. Check readiness."); }
  };

  const addProduct = async () => {
    if (!selectedPartnerId || !productId) return;
    await partnerNetworkApi.updatePartner(organisationSlug, selectedPartnerId, { product_access_mode: "custom" });
    await partnerNetworkApi.createProductAccess(organisationSlug, { partner: selectedPartnerId, product: Number(productId), is_active: true, is_recommended: true });
    setMessage("Product added to this partner's concierge allowlist."); await load();
  };

  const addCommission = async () => {
    if (!selectedPartnerId || !commissionValue) return;
    await partnerNetworkApi.createCommissionRule(organisationSlug, {
      partner: selectedPartnerId,
      product: productId ? Number(productId) : null,
      commission_type: commissionType,
      commission_value: commissionValue,
      trigger: "deposit_paid",
      is_active: true,
    });
    setMessage("Commission rule created."); await load();
  };

  const grantPortal = async () => {
    if (!selectedPartnerId || !portalEmail.trim()) return;
    await partnerNetworkApi.createAccessByEmail(
      organisationSlug,
      selectedPartnerId,
      portalEmail.trim(),
    );
    setPortalEmail(""); setMessage("Referral Partner Portal access granted.");
  };

  return <div className="min-h-screen bg-slate-50 p-4 md:p-6"><div className="mx-auto max-w-7xl">
    <div className="rounded-[2rem] bg-slate-950 p-7 text-white"><div className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Private module</div><h1 className="mt-2 text-3xl font-black">Punta Cana Discovery AI Concierge Partner Network</h1><p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">Referral/accommodation partners only. Existing Ticketing Sellers and the Business Entity Partner Portal remain separate.</p></div>
    {message && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-black text-sky-800">{message}</div>}
    <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-5">
        <Section title="Add partner"><form onSubmit={addPartner} className="space-y-3"><input className="w-full rounded-xl border p-3" placeholder="Hotel, villa or Airbnb name" value={partnerName} onChange={e=>setPartnerName(e.target.value)} required /><select className="w-full rounded-xl border p-3" value={partnerType} onChange={e=>setPartnerType(e.target.value)}><option value="hotel">Hotel</option><option value="villa">Villa</option><option value="airbnb">Airbnb</option><option value="guesthouse">Guesthouse</option><option value="resort">Resort</option><option value="other">Other</option></select><button className="w-full rounded-xl bg-sky-600 px-4 py-3 font-black text-white">Create partner</button></form></Section>
        <Section title="Partners"><div className="space-y-2">{partners.map(p => <button key={p.id} onClick={()=>setSelectedPartnerId(p.id)} className={`w-full rounded-2xl border p-4 text-left ${p.id===selectedPartnerId ? "border-sky-500 bg-sky-50" : "border-slate-200"}`}><div className="font-black">{p.name}</div><div className="text-xs font-bold capitalize text-slate-500">{p.partner_type} · {p.status}</div></button>)}</div></Section>
      </div>
      <div className="space-y-5">
        {!selectedPartner ? <Section title="Select a partner"><p className="text-sm font-semibold text-slate-500">Choose a partner to configure it.</p></Section> : <>
          <Section title={`${selectedPartner.name} configuration`}><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize">{selectedPartner.status}</span>{selectedPartner.status !== "active" && <button onClick={activatePartner} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">Activate partner</button>}</div></Section>
          <Section title="1. Property + pickup profile"><form onSubmit={addLocation} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input className="rounded-xl border p-3" placeholder="Property display name" value={locationName} onChange={e=>setLocationName(e.target.value)} required /><select className="rounded-xl border p-3" value={pickupId} onChange={e=>setPickupId(e.target.value)} required><option value="">Select existing pickup location</option>{pickups.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white">Add property</button></form><div className="mt-4 space-y-3">{selectedLocations.map(l => { const qr=qrs.find(q=>q.partner_location===l.id && q.status==="active"); return <div key={l.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-black">{l.display_name}</div><div className="text-xs font-semibold text-slate-500">Pickup: {l.pickup_location_name ?? "Not configured"} · Readiness: {l.readiness?.status ?? "checking"}</div></div><div className="flex gap-2">{!l.is_active && <button onClick={()=>activateLocation(l)} className="rounded-xl border px-3 py-2 text-xs font-black">Activate</button>}<button onClick={()=>generateQr(l)} className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white">{qr ? "Regenerate QR" : "Generate QR"}</button></div></div>{qr && <div className="mt-3 text-xs font-bold text-emerald-700">QR active · {qr.scan_count ?? 0} scans</div>}</div>})}</div></Section>
          <Section title="2. Excursion allowlist"><div className="flex flex-col gap-3 md:flex-row"><select className="min-w-0 flex-1 rounded-xl border p-3" value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Select excursion</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button onClick={addProduct} className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white">Add excursion</button></div><div className="mt-3 text-xs font-semibold text-slate-500">{productRules.filter(r=>r.partner===selectedPartnerId && !r.partner_location).length} partner-level product rules configured.</div></Section>
          <Section title="3. Commission"><div className="grid gap-3 md:grid-cols-3"><select className="rounded-xl border p-3" value={commissionType} onChange={e=>setCommissionType(e.target.value)}><option value="fixed_per_booking">Fixed / booking</option><option value="fixed_per_guest">Fixed / guest</option><option value="percentage_of_sale">% of sale</option><option value="percentage_of_platform_margin">% of margin</option></select><input className="rounded-xl border p-3" value={commissionValue} onChange={e=>setCommissionValue(e.target.value)} placeholder="5.00" /><button onClick={addCommission} className="rounded-xl bg-slate-950 px-4 py-3 font-black text-white">Create rule</button></div><div className="mt-3 text-xs font-semibold text-slate-500">{commissionRules.filter(r=>r.partner===selectedPartnerId).length} commission rules configured.</div></Section>
          <Section title="4. Give partner portal access"><div className="flex flex-col gap-3 md:flex-row"><input type="email" className="min-w-0 flex-1 rounded-xl border p-3" placeholder="Existing user email" value={portalEmail} onChange={e=>setPortalEmail(e.target.value)} /><button onClick={grantPortal} className="rounded-xl bg-sky-600 px-4 py-3 font-black text-white">Grant access</button></div><p className="mt-3 text-xs font-semibold text-slate-500">The user must already have an account. Their portal only shows Dashboard, My QR, Concierge Settings, and Earnings.</p></Section>
        </>}
      </div>
    </div>
  </div></div>;
}
