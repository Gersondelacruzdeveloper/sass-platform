// src/modules/ticketing/pages/PublicBlogDetailPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  Copy,
  Image as ImageIcon,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import { ticketingLanguageOptions, useTicketingTranslation } from "../i18n";
import type {
  PublicBlogPostDetail,
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
  setJsonLd,
  setMetaTag,
  setRobotsMeta,
  usePublicTicketingOrganisation,
} from "../blog/publicBlogUtils";

export default function PublicBlogDetailPage() {
  const {
    organisationSlug: organisationSlugFromUrl = "",
    blogSlug = "",
  } = useParams<{
    organisationSlug?: string;
    blogSlug?: string;
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
  const [post, setPost] = useState<PublicBlogPostDetail | null>(null);
  const [latestPosts, setLatestPosts] = useState<PublicBlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  const publicPath = (path = "/") =>
    buildPublicPath(organisationSlug, isCustomDomain, path);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      if (!organisationSlug || !blogSlug) {
        setLoading(false);
        setError("Article route is incomplete.");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [brandingResponse, postResponse, listResponse] = await Promise.all([
          ticketingApi.getPublicBranding(organisationSlug),
          ticketingApi.getPublicBlogPost(organisationSlug, blogSlug, {
            language: blogLanguage,
          }),
          ticketingApi.getPublicBlogPosts(organisationSlug, {
            language: blogLanguage,
            ordering: "-published_at",
          }),
        ]);

        if (cancelled) return;

        setBranding(brandingResponse);
        setPost(postResponse);
        setLatestPosts(
          listResponse.filter((item) => item.id !== postResponse.id).slice(0, 3),
        );
      } catch (err: any) {
        if (cancelled) return;
        setPost(null);
        setError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            "This article is not available.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [organisationSlug, blogSlug, blogLanguage]);

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

  const sanitizedContent = useMemo(() => {
    return DOMPurify.sanitize(post?.content || "", {
      USE_PROFILES: { html: true },
    });
  }, [post?.content]);

  useEffect(() => {
    if (!post) return;

    const title = post.seo_title || `${post.title} | ${brandName}`;
    const description = post.meta_description || post.excerpt || "";
    const fallbackCanonical =
      typeof window !== "undefined"
        ? `${window.location.origin}${publicPath(`/blog/${post.slug}`)}`
        : publicPath(`/blog/${post.slug}`);
    const canonical = post.canonical_url || fallbackCanonical;
    const socialImage = resolveAssetUrl(
      post.og_image_url || post.cover_image_url || publicSite?.og_image_url,
    );

    document.title = title;
    setMetaTag('meta[name="description"]', { name: "description" }, description);
    setMetaTag('meta[property="og:title"]', { property: "og:title" }, post.og_title || title);
    setMetaTag(
      'meta[property="og:description"]',
      { property: "og:description" },
      post.og_description || description,
    );
    setMetaTag('meta[property="og:type"]', { property: "og:type" }, "article");
    setMetaTag('meta[property="og:url"]', { property: "og:url" }, canonical);
    setMetaTag('meta[property="og:image"]', { property: "og:image" }, socialImage);
    setMetaTag('meta[name="twitter:card"]', { name: "twitter:card" }, "summary_large_image");
    setMetaTag(
      'meta[name="twitter:title"]',
      { name: "twitter:title" },
      post.twitter_title || post.og_title || title,
    );
    setMetaTag(
      'meta[name="twitter:description"]',
      { name: "twitter:description" },
      post.twitter_description || post.og_description || description,
    );
    setMetaTag('meta[name="twitter:image"]', { name: "twitter:image" }, socialImage);
    setCanonicalLink(canonical);
    setRobotsMeta(post.robots_allow_indexing !== false);

    const fallbackJsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description,
      image: socialImage ? [socialImage] : [],
      datePublished: post.published_at,
      dateModified: post.updated_at,
      author: post.author_name
        ? { "@type": "Person", name: post.author_name }
        : undefined,
      publisher: {
        "@type": "Organization",
        name: brandName,
        logo: logoUrl
          ? { "@type": "ImageObject", url: logoUrl }
          : undefined,
      },
      mainEntityOfPage: canonical,
    };

    setJsonLd(
      "ticketing-blog-article-jsonld",
      post.json_ld_override && Object.keys(post.json_ld_override).length
        ? post.json_ld_override
        : fallbackJsonLd,
    );

    return () => {
      document.getElementById("ticketing-blog-article-jsonld")?.remove();
    };
  }, [post, brandName, logoUrl, publicSite, organisationSlug, isCustomDomain]);

  async function shareArticle() {
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: post?.title || brandName,
          text: post?.excerpt || "",
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setShareMessage("Link copied");
      window.setTimeout(() => setShareMessage(""), 1800);
    } catch (error) {
      console.error("Could not share article:", error);
    }
  }

  if (organisationLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-black text-slate-700">Loading article...</span>
        </div>
      </div>
    );
  }

  const pageError = organisationError || error;

  if (pageError || !post) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-16 text-center">
        <BookOpen className="mx-auto h-14 w-14 text-slate-300" />
        <h1 className="mt-5 text-3xl font-black text-slate-950">Article unavailable</h1>
        <p className="mx-auto mt-3 max-w-xl font-semibold text-slate-500">{pageError}</p>
        <Link
          to={publicPath("/blog")}
          className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
        >
          Return to the blog
        </Link>
      </div>
    );
  }

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
              to={publicPath("/blog")}
              className="hidden h-10 items-center justify-center rounded-xl border px-4 text-xs font-black sm:inline-flex"
              style={{ borderColor: `${theme.primary}25`, color: theme.primary }}
            >
              All stories
            </Link>
          </div>
        </div>
      </header>

      <main>
        <article>
          <section className="mx-auto max-w-5xl px-4 pb-8 pt-10 text-center sm:px-6 lg:pt-16">
            <Link
              to={publicPath("/blog")}
              className="inline-flex items-center gap-2 text-sm font-black"
              style={{ color: theme.primary }}
            >
              <ArrowLeft className="h-4 w-4" /> Back to the blog
            </Link>

            {post.category?.name && (
              <p
                className="mt-8 text-sm font-black uppercase tracking-[0.18em]"
                style={{ color: theme.accent }}
              >
                {post.category.name}
              </p>
            )}

            <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {post.title}
            </h1>

            {post.excerpt && (
              <p
                className="mx-auto mt-6 max-w-3xl text-lg font-semibold leading-8"
                style={{ color: theme.muted }}
              >
                {post.excerpt}
              </p>
            )}

            <div
              className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold"
              style={{ color: theme.muted }}
            >
              {post.author_name && <span>By {post.author_name}</span>}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatBlogDate(post.published_at, blogLanguage)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" />
                {post.reading_time_minutes || 1} min read
              </span>
            </div>

            <button
              type="button"
              onClick={shareArticle}
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-black"
              style={{ borderColor: `${theme.primary}25`, color: theme.primary }}
            >
              {shareMessage ? <Copy className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {shareMessage || "Share article"}
            </button>
          </section>

          {post.cover_image_url && (
            <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="overflow-hidden rounded-[2rem] bg-slate-100 shadow-sm">
                <img
                  src={resolveAssetUrl(post.cover_image_url)}
                  alt={post.cover_image_alt || post.title}
                  className="max-h-[650px] w-full object-cover"
                />
              </div>
            </section>
          )}

          <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-8 lg:py-16">
            <div
              className="blog-article prose prose-lg prose-slate max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />

            <aside className="space-y-5">
              {post.related_products?.length > 0 && (
                <div
                  className="rounded-3xl border p-5 shadow-sm"
                  style={{
                    borderColor: `${theme.primary}18`,
                    backgroundColor: theme.card,
                  }}
                >
                  <h2 className="text-lg font-black">Book related experiences</h2>
                  <div className="mt-4 space-y-4">
                    {post.related_products.map((product) => (
                      <Link
                        key={product.id}
                        to={publicPath(
                          product.current_public_path || `/product/${product.slug}`,
                        )}
                        className="group block overflow-hidden rounded-2xl border"
                        style={{ borderColor: `${theme.primary}18` }}
                      >
                        <div className="h-32 bg-slate-100">
                          {product.image_url ? (
                            <img
                              src={resolveAssetUrl(product.image_url)}
                              alt={product.name}
                              className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="grid h-full place-items-center">
                              <ImageIcon className="h-7 w-7 text-slate-300" />
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="line-clamp-2 text-sm font-black">{product.name}</p>
                          <span
                            className="mt-2 inline-flex items-center gap-1 text-xs font-black"
                            style={{ color: theme.primary }}
                          >
                            View experience <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="rounded-3xl p-5 text-white shadow-sm"
                style={{ backgroundColor: theme.primary }}
              >
                <h2 className="text-lg font-black">Ready to explore?</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/75">
                  Browse the available excursions, transfers, tickets and events.
                </p>
                <Link
                  to={publicPath("/")}
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-black"
                  style={{ color: theme.primary }}
                >
                  Explore experiences
                </Link>
              </div>
            </aside>
          </section>

          {post.gallery_images?.length > 0 && (
            <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
              <h2 className="text-3xl font-black">Gallery</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {post.gallery_images.map((image) => (
                  <figure
                    key={image.id}
                    className="overflow-hidden rounded-3xl bg-slate-100"
                  >
                    <img
                      src={resolveAssetUrl(image.image_url || image.image)}
                      alt={image.alt_text || post.title}
                      className="h-72 w-full object-cover"
                    />
                    {image.caption && (
                      <figcaption
                        className="bg-white p-3 text-sm font-semibold"
                        style={{ color: theme.muted }}
                      >
                        {image.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}
        </article>

        {latestPosts.length > 0 && (
          <section
            className="border-t py-16"
            style={{ borderColor: `${theme.primary}18` }}
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p
                    className="text-sm font-black uppercase tracking-wide"
                    style={{ color: theme.accent }}
                  >
                    Keep reading
                  </p>
                  <h2 className="mt-2 text-3xl font-black">More travel stories</h2>
                </div>
                <Link
                  to={publicPath("/blog")}
                  className="hidden items-center gap-2 text-sm font-black sm:inline-flex"
                  style={{ color: theme.primary }}
                >
                  View all <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {latestPosts.map((item) => (
                  <Link
                    key={item.id}
                    to={publicPath(`/blog/${item.slug}`)}
                    className="group overflow-hidden rounded-3xl border shadow-sm transition hover:-translate-y-1"
                    style={{
                      borderColor: `${theme.primary}18`,
                      backgroundColor: theme.card,
                    }}
                  >
                    <div className="h-48 bg-slate-100">
                      {item.cover_image_url ? (
                        <img
                          src={resolveAssetUrl(item.cover_image_url)}
                          alt={item.cover_image_alt || item.title}
                          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                        />
                      ) : null}
                    </div>
                    <div className="p-5">
                      <h3 className="line-clamp-2 text-lg font-black">{item.title}</h3>
                      <p
                        className="mt-2 line-clamp-2 text-sm font-semibold leading-6"
                        style={{ color: theme.muted }}
                      >
                        {item.excerpt}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer
        className="border-t px-4 py-10 text-center text-sm font-semibold sm:px-6"
        style={{ borderColor: `${theme.primary}18`, color: theme.muted }}
      >
        © {new Date().getFullYear()} {brandName}
      </footer>

      <style>{`
        .blog-article { font-size: 1.05rem; line-height: 1.9; }
        .blog-article p { margin: 1.15rem 0; }
        .blog-article h1, .blog-article h2, .blog-article h3 { margin: 2rem 0 .8rem; font-weight: 900; line-height: 1.2; }
        .blog-article h2 { font-size: 1.75rem; }
        .blog-article h3 { font-size: 1.35rem; }
        .blog-article ul, .blog-article ol { margin: 1rem 0; padding-left: 1.6rem; }
        .blog-article ul { list-style: disc; }
        .blog-article ol { list-style: decimal; }
        .blog-article li { margin: .45rem 0; }
        .blog-article blockquote { margin: 1.5rem 0; border-left: 4px solid ${theme.accent}; padding: .75rem 1rem; background: ${theme.card}; border-radius: 0 1rem 1rem 0; font-weight: 700; }
        .blog-article a { color: ${theme.secondary}; font-weight: 800; text-decoration: underline; }
        .blog-article img { margin: 1.5rem 0; width: 100%; border-radius: 1.5rem; }
      `}</style>
    </div>
  );
}
