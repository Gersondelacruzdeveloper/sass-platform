// src/modules/ticketing/pages/PublicBlogListPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  Image as ImageIcon,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import { ticketingLanguageOptions, useTicketingTranslation } from "../i18n";
import type {
  BlogCategory,
  PublicBlogPostSummary,
  PublicBrandingResponse,
  SupportedBlogLanguage,
} from "../types/ticketingTypes";
import {
  buildPublicPath,
  formatBlogDate,
  getPublicTheme,
  resolveAssetUrl,
  setCanonicalLink,
  setMetaTag,
  usePublicTicketingOrganisation,
} from "../blog/publicBlogUtils";

function getCategoryId(post: PublicBlogPostSummary) {
  return post.category?.id ? String(post.category.id) : "";
}

export default function PublicBlogListPage() {
  const { organisationSlug: organisationSlugFromUrl = "" } = useParams<{
    organisationSlug?: string;
  }>();
  const {
    organisationSlug,
    loading: organisationLoading,
    error: organisationError,
    isCustomDomain,
  } = usePublicTicketingOrganisation(organisationSlugFromUrl);
  const { language, setLanguage } = useTicketingTranslation();
  const blogLanguage = (
    ["en", "es", "fr", "pt", "de"].includes(language) ? language : "en"
  ) as SupportedBlogLanguage;

  const [branding, setBranding] = useState<PublicBrandingResponse | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [posts, setPosts] = useState<PublicBlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const publicPath = (path = "/") =>
    buildPublicPath(organisationSlug, isCustomDomain, path);

  useEffect(() => {
    let cancelled = false;

    async function loadBlog() {
      if (!organisationSlug) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [brandingResponse, categoryResponse, postResponse] =
          await Promise.all([
            ticketingApi.getPublicBranding(organisationSlug),
            ticketingApi.getPublicBlogCategories(organisationSlug, {
              language: blogLanguage,
            }),
            ticketingApi.getPublicBlogPosts(organisationSlug, {
              language: blogLanguage,
              ordering: "-published_at",
            }),
          ]);

        if (cancelled) return;

        setBranding(brandingResponse);
        setCategories(categoryResponse);
        setPosts(postResponse);
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            "We could not load the blog.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBlog();

    return () => {
      cancelled = true;
    };
  }, [organisationSlug, blogLanguage]);

  const publicSite = branding?.public_site as any;
  const ticketingSettings = branding?.ticketing_settings;
  const organisation = branding?.organisation;
  const theme = useMemo(() => getPublicTheme(publicSite), [publicSite]);
  const brandName =
    publicSite?.site_title ||
    publicSite?.display_title ||
    ticketingSettings?.public_brand_name ||
    organisation?.name ||
    "Experiences";
  const logoUrl = resolveAssetUrl(publicSite?.logo_url || publicSite?.logo);

  useEffect(() => {
    if (!brandName) return;

    document.title = `Travel Blog | ${brandName}`;
    setMetaTag(
      'meta[name="description"]',
      { name: "description" },
      publicSite?.meta_description ||
        `Travel guides, local advice and experience ideas from ${brandName}.`,
    );

    const canonical =
      typeof window !== "undefined"
        ? `${window.location.origin}${publicPath("/blog")}`
        : publicPath("/blog");
    setCanonicalLink(canonical);
  }, [brandName, publicSite, organisationSlug, isCustomDomain]);

  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return posts.filter((post) => {
      const searchMatch = query
        ? `${post.title} ${post.excerpt} ${post.category?.name || ""}`
            .toLowerCase()
            .includes(query)
        : true;
      const categoryMatch =
        category === "all" || getCategoryId(post) === category;

      return searchMatch && categoryMatch;
    });
  }, [posts, search, category]);

  const featured = filteredPosts.find((post) => post.is_featured) || null;
  const remaining = featured
    ? filteredPosts.filter((post) => post.id !== featured.id)
    : filteredPosts;

  if (organisationLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-black text-slate-700">
            Loading travel stories...
          </span>
        </div>
      </div>
    );
  }

  const pageError = organisationError || error;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          borderColor: `${theme.primary}18`,
          backgroundColor: `${theme.card}F2`,
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to={publicPath("/")} className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={brandName}
                className="h-11 w-11 rounded-2xl object-contain"
              />
            ) : (
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                style={{ backgroundColor: theme.primary }}
              >
                <Sparkles className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{brandName}</p>
              <p className="text-xs font-semibold" style={{ color: theme.muted }}>
                Travel blog
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as typeof language, true)
              }
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"
              aria-label="Language"
            >
              {ticketingLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Link
              to={publicPath("/")}
              className="hidden h-10 items-center justify-center rounded-xl px-4 text-xs font-black text-white sm:inline-flex"
              style={{ backgroundColor: theme.button }}
            >
              Explore experiences
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8 lg:pt-16">
          <div className="max-w-3xl">
            <p
              className="text-sm font-black uppercase tracking-[0.18em]"
              style={{ color: theme.accent }}
            >
              Local ideas and inspiration
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              Discover more before you travel
            </h1>
            <p
              className="mt-5 max-w-2xl text-base font-semibold leading-8"
              style={{ color: theme.muted }}
            >
              Practical guides, nightlife ideas, excursion advice and local tips
              to help you plan a better stay.
            </p>
          </div>

          <div className="mt-8 grid gap-3 lg:grid-cols-[1fr_auto]">
            <label
              className="flex h-12 items-center gap-3 rounded-2xl border px-4"
              style={{
                borderColor: `${theme.primary}22`,
                backgroundColor: theme.card,
              }}
            >
              <Search className="h-5 w-5" style={{ color: theme.muted }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the blog"
                className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className="rounded-2xl px-4 py-3 text-xs font-black transition"
                style={{
                  backgroundColor: category === "all" ? theme.primary : theme.card,
                  color: category === "all" ? "#fff" : theme.text,
                  border: `1px solid ${theme.primary}20`,
                }}
              >
                All stories
              </button>
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(String(item.id))}
                  className="rounded-2xl px-4 py-3 text-xs font-black transition"
                  style={{
                    backgroundColor:
                      category === String(item.id) ? theme.primary : theme.card,
                    color:
                      category === String(item.id) ? "#fff" : theme.text,
                    border: `1px solid ${theme.primary}20`,
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        {pageError ? (
          <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">Blog unavailable</h2>
            <p className="mt-2 font-semibold" style={{ color: theme.muted }}>
              {pageError}
            </p>
          </section>
        ) : filteredPosts.length === 0 ? (
          <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">No stories found</h2>
            <p className="mt-2 font-semibold" style={{ color: theme.muted }}>
              Try another search or category.
            </p>
          </section>
        ) : (
          <>
            {featured && (
              <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
                <Link
                  to={publicPath(`/blog/${featured.slug}`)}
                  className="group grid overflow-hidden rounded-[2rem] border shadow-sm lg:grid-cols-[1.1fr_0.9fr]"
                  style={{
                    borderColor: `${theme.primary}18`,
                    backgroundColor: theme.card,
                  }}
                >
                  <div className="min-h-[310px] bg-slate-100">
                    {featured.cover_image_url ? (
                      <img
                        src={resolveAssetUrl(featured.cover_image_url)}
                        alt={featured.cover_image_alt || featured.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <ImageIcon className="h-12 w-12 text-slate-300" />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center p-7 sm:p-10">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide">
                      <span
                        className="rounded-full px-3 py-1"
                        style={{
                          backgroundColor: `${theme.accent}22`,
                          color: theme.accent,
                        }}
                      >
                        Featured
                      </span>
                      {featured.category?.name && (
                        <span style={{ color: theme.muted }}>
                          {featured.category.name}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight">
                      {featured.title}
                    </h2>
                    <p
                      className="mt-4 line-clamp-3 text-sm font-semibold leading-7"
                      style={{ color: theme.muted }}
                    >
                      {featured.excerpt}
                    </p>
                    <PostMeta post={featured} language={blogLanguage} muted={theme.muted} />
                    <span
                      className="mt-6 inline-flex items-center gap-2 text-sm font-black"
                      style={{ color: theme.primary }}
                    >
                      Read article
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </section>
            )}

            <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-20 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
              {remaining.map((post) => (
                <Link
                  key={post.id}
                  to={publicPath(`/blog/${post.slug}`)}
                  className="group overflow-hidden rounded-3xl border shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  style={{
                    borderColor: `${theme.primary}18`,
                    backgroundColor: theme.card,
                  }}
                >
                  <div className="h-56 bg-slate-100">
                    {post.cover_image_url ? (
                      <img
                        src={resolveAssetUrl(post.cover_image_url)}
                        alt={post.cover_image_alt || post.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <ImageIcon className="h-10 w-10 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    {post.category?.name && (
                      <p
                        className="text-xs font-black uppercase tracking-wide"
                        style={{ color: theme.accent }}
                      >
                        {post.category.name}
                      </p>
                    )}
                    <h2 className="mt-2 line-clamp-2 text-xl font-black leading-tight">
                      {post.title}
                    </h2>
                    <p
                      className="mt-3 line-clamp-3 text-sm font-semibold leading-6"
                      style={{ color: theme.muted }}
                    >
                      {post.excerpt}
                    </p>
                    <PostMeta post={post} language={blogLanguage} muted={theme.muted} />
                  </div>
                </Link>
              ))}
            </section>
          </>
        )}
      </main>

      <footer
        className="border-t px-4 py-10 text-center text-sm font-semibold sm:px-6"
        style={{ borderColor: `${theme.primary}18`, color: theme.muted }}
      >
        © {new Date().getFullYear()} {brandName}
      </footer>
    </div>
  );
}

function PostMeta({
  post,
  language,
  muted,
}: {
  post: PublicBlogPostSummary;
  language: string;
  muted: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold" style={{ color: muted }}>
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="h-3.5 w-3.5" />
        {formatBlogDate(post.published_at, language)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock3 className="h-3.5 w-3.5" />
        {post.reading_time_minutes || 1} min read
      </span>
    </div>
  );
}
