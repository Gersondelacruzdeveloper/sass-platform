import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Globe2,
  Languages,
  LockKeyhole,
  MonitorSmartphone,
  PlayCircle,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
  Warehouse,
  Wine,
  type LucideIcon,
} from "lucide-react";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type FeatureCard = {
  icon: LucideIcon;
  titleKey: string;
  textKey: string;
};

type VideoCard = {
  titleKey: string;
  textKey: string;
};

const features: FeatureCard[] = [
  {
    icon: Receipt,
    titleKey: "landing.feature.posTitle",
    textKey: "landing.feature.posText",
  },
  {
    icon: Table2,
    titleKey: "landing.feature.tablesTitle",
    textKey: "landing.feature.tablesText",
  },
  {
    icon: Banknote,
    titleKey: "landing.feature.cashTitle",
    textKey: "landing.feature.cashText",
  },
  {
    icon: Warehouse,
    titleKey: "landing.feature.inventoryTitle",
    textKey: "landing.feature.inventoryText",
  },
  {
    icon: Users,
    titleKey: "landing.feature.employeesTitle",
    textKey: "landing.feature.employeesText",
  },
  {
    icon: BarChart3,
    titleKey: "landing.feature.reportsTitle",
    textKey: "landing.feature.reportsText",
  },
];

const videoCards: VideoCard[] = [
  {
    titleKey: "landing.video.ownerTitle",
    textKey: "landing.video.ownerText",
  },
  {
    titleKey: "landing.video.posTitle",
    textKey: "landing.video.posText",
  },
  {
    titleKey: "landing.video.inventoryTitle",
    textKey: "landing.video.inventoryText",
  },
  {
    titleKey: "landing.video.installTitle",
    textKey: "landing.video.installText",
  },
];

const beforeKeys = [
  "landing.before.one",
  "landing.before.two",
  "landing.before.three",
  "landing.before.four",
];

const afterKeys = [
  "landing.after.one",
  "landing.after.two",
  "landing.after.three",
  "landing.after.four",
];

const securityItems = [
  {
    icon: LockKeyhole,
    key: "landing.security.login",
  },
  {
    icon: ShieldCheck,
    key: "landing.security.roles",
  },
  {
    icon: Activity,
    key: "landing.security.logs",
  },
  {
    icon: Globe2,
    key: "landing.security.cloud",
  },
];

export default function DiscoLandingPage() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useDiscoTranslation();

  const whatsappUrl = useMemo(() => {
    const message =
      language === "es"
        ? "Hola, quiero información sobre PCD Nightlife para mi negocio."
        : "Hello, I want information about PCD Nightlife for my business.";

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [language]);

  function goToSignup() {
    navigate("/disco/signup");
  }

  function scrollToVideos() {
    document.getElementById("landing-videos")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950">
              <Wine className="h-6 w-6" />
            </div>

            <div className="hidden text-left sm:block">
              <p className="text-sm font-black leading-none">
                PCD Nightlife
              </p>
              <p className="mt-1 text-xs font-bold text-white/50">
                {t("landing.brandSubtitle")}
              </p>
            </div>
          </button>

          <nav className="hidden items-center gap-6 text-sm font-bold text-white/65 lg:flex">
            <a href="#problem" className="transition hover:text-white">
              {t("landing.navProblem")}
            </a>
            <a href="#features" className="transition hover:text-white">
              {t("landing.navFeatures")}
            </a>
            <a href="#landing-videos" className="transition hover:text-white">
              {t("landing.navVideos")}
            </a>
            <a href="#pricing" className="transition hover:text-white">
              {t("landing.navPricing")}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <label className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 text-xs font-black text-white/80">
              <Languages className="h-4 w-4" />

              <select
                value={language}
                aria-label={t("landing.language")}
                onChange={(event) =>
                  setLanguage(event.target.value as DiscoLanguage)
                }
                className="bg-transparent text-xs font-black text-white outline-none"
              >
                <option className="bg-slate-950 text-white" value="en">
                  EN
                </option>
                <option className="bg-slate-950 text-white" value="es">
                  ES
                </option>
              </select>
            </label>

            <button
              type="button"
              onClick={goToSignup}
              className="hidden h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-100 sm:inline-flex"
            >
              {t("landing.navStart")}
            </button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-0 top-40 h-[420px] w-[420px] rounded-full bg-fuchsia-500/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-200">
              <Sparkles className="h-4 w-4" />
              {t("landing.badge")}
            </div>

            <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              {t("landing.heroTitle")}
            </h1>

            <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-white/65 sm:text-xl">
              {t("landing.heroSubtitle")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={goToSignup}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-6 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200"
              >
                {t("landing.heroPrimaryCta")}
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={scrollToVideos}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-6 text-sm font-black text-white transition hover:bg-white/15"
              >
                <PlayCircle className="h-4 w-4" />
                {t("landing.heroSecondaryCta")}
              </button>
            </div>

            <p className="mt-5 max-w-2xl text-sm font-bold text-white/45">
              {t("landing.heroTrust")}
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur">
            <div className="rounded-[1.5rem] bg-slate-900 p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-white">
                    {t("landing.liveDashboard")}
                  </p>
                  <p className="mt-1 text-xs font-bold text-white/40">
                    PCD Nightlife
                  </p>
                </div>

                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-300">
                  <MonitorSmartphone className="h-5 w-5" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label={t("landing.salesToday")}
                  value="$18,450"
                  icon={TrendingUp}
                />
                <MetricCard
                  label={t("landing.openTables")}
                  value="12"
                  icon={Table2}
                />
                <MetricCard
                  label={t("landing.lowStock")}
                  value="8"
                  icon={Warehouse}
                />
                <MetricCard
                  label={t("landing.cashOpen")}
                  value="3"
                  icon={Banknote}
                />
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-black text-white/85">
                    {t("landing.liveSales")}
                  </p>
                  <p className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-black text-emerald-300">
                    {t("landing.online")}
                  </p>
                </div>

                <div className="flex h-40 items-end gap-2">
                  {[35, 62, 48, 80, 55, 92, 72, 100].map((height, index) => (
                    <div
                      key={index}
                      className="flex-1 rounded-t-xl bg-cyan-300"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="bg-white py-16 text-slate-950 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-700">
              {t("landing.sectionProblem")}
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              {t("landing.problemTitle")}
            </h2>

            <p className="mt-4 text-lg font-medium leading-8 text-slate-500">
              {t("landing.problemSubtitle")}
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              "landing.problem.one",
              "landing.problem.two",
              "landing.problem.three",
              "landing.problem.four",
            ].map((key, index) => (
              <div
                key={key}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-6"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                  {index + 1}
                </div>

                <p className="text-lg font-black leading-7 text-slate-900">
                  {t(key)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-100 py-16 text-slate-950 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
              {t("landing.solutionTitle")}
            </h2>

            <p className="mt-4 text-lg font-medium leading-8 text-slate-500">
              {t("landing.solutionSubtitle")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ComparisonCard
              title={t("landing.beforeTitle")}
              items={beforeKeys.map((key) => t(key))}
              variant="bad"
            />

            <ComparisonCard
              title={t("landing.afterTitle")}
              items={afterKeys.map((key) => t(key))}
              variant="good"
            />
          </div>
        </div>
      </section>

      <section id="features" className="bg-white py-16 text-slate-950 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-700">
              {t("landing.sectionFeatures")}
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              {t("landing.heroPrimaryCta")}
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.titleKey}
                  className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-cyan-300">
                    <Icon className="h-7 w-7" />
                  </div>

                  <h3 className="mt-5 text-xl font-black text-slate-950">
                    {t(feature.titleKey)}
                  </h3>

                  <p className="mt-3 text-sm font-medium leading-7 text-slate-500">
                    {t(feature.textKey)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="landing-videos"
        className="bg-slate-950 py-16 text-white sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-300">
              {t("landing.sectionVideos")}
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              {t("landing.videosTitle")}
            </h2>

            <p className="mt-4 text-lg font-medium leading-8 text-white/55">
              {t("landing.videosSubtitle")}
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {videoCards.map((video, index) => (
              <div
                key={video.titleKey}
                className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5"
              >
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950">
                  <div className="text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-cyan-200">
                      <PlayCircle className="h-10 w-10" />
                    </div>

                    <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-white/45">
                      {t("landing.videoPlaceholder")} {index + 1}
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-xl font-black">{t(video.titleKey)}</h3>

                  <p className="mt-3 text-sm font-medium leading-7 text-white/55">
                    {t(video.textKey)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 text-slate-950 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
              {t("landing.securityTitle")}
            </h2>

            <p className="mt-4 text-lg font-medium leading-8 text-slate-500">
              {t("landing.securitySubtitle")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {securityItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.key}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-cyan-300">
                    <Icon className="h-6 w-6" />
                  </div>

                  <p className="mt-4 text-lg font-black">{t(item.key)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="bg-slate-100 py-16 text-slate-950 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            {t("landing.pricingTitle")}
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-lg font-medium leading-8 text-slate-500">
            {t("landing.pricingSubtitle")}
          </p>

          <button
            type="button"
            onClick={goToSignup}
            className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-8 text-sm font-black text-white transition hover:bg-slate-800"
          >
            <CreditCard className="h-4 w-4" />
            {t("landing.finalCta")}
          </button>
        </div>
      </section>

      <section className="bg-cyan-300 py-16 text-slate-950 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
          <Smartphone className="mx-auto h-14 w-14" />

          <h2 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
            {t("landing.finalTitle")}
          </h2>

          <p className="mx-auto mt-5 max-w-3xl text-lg font-bold leading-8 text-slate-800/80">
            {t("landing.finalSubtitle")}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={goToSignup}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-8 text-sm font-black text-white transition hover:bg-slate-800"
            >
              {t("landing.finalCta")}
              <ArrowRight className="h-4 w-4" />
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-slate-950/20 bg-white/70 px-8 text-sm font-black text-slate-950 transition hover:bg-white"
            >
              {t("landing.whatsappCta")}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
        <Icon className="h-5 w-5" />
      </div>

      <p className="text-xs font-black uppercase tracking-wide text-white/35">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function ComparisonCard({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "bad" | "good";
}) {
  const isGood = variant === "good";

  return (
    <div
      className={`rounded-[2rem] border p-6 ${
        isGood
          ? "border-emerald-200 bg-emerald-50"
          : "border-red-200 bg-red-50"
      }`}
    >
      <h3
        className={`text-2xl font-black ${
          isGood ? "text-emerald-900" : "text-red-900"
        }`}
      >
        {title}
      </h3>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3">
            <CheckCircle2
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                isGood ? "text-emerald-600" : "text-red-600"
              }`}
            />

            <p
              className={`text-sm font-bold leading-6 ${
                isGood ? "text-emerald-900/75" : "text-red-900/75"
              }`}
            >
              {item}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}