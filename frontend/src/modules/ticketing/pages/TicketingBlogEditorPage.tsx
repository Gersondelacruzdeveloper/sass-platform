// src/modules/ticketing/pages/TicketingBlogEditorPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  Languages,
  Loader2,
  Newspaper,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import BlogRichTextEditor from "../components/blog/BlogRichTextEditor";
import ticketingApi from "../api/ticketingApi";
import type {
  BlogCategory,
  BlogPost,
  BlogPostGalleryImage,
  BlogPostStatus,
  BlogPostTranslation,
  BlogPostTranslations,
  BlogPostWritePayload,
  ExperienceProduct,
  SupportedBlogLanguage,
} from "../types/ticketingTypes";

type EditorForm = {
  category_id: string;
  author_name: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_alt: string;
  default_language: SupportedBlogLanguage;
  translations: BlogPostTranslations;
  related_product_ids: number[];
  status: BlogPostStatus;
  is_active: boolean;
  is_featured: boolean;
  published_at: string;
  seo_title: string;
  meta_description: string;
  canonical_url: string;
  og_title: string;
  og_description: string;
  twitter_title: string;
  twitter_description: string;
  keywords_text: string;
  json_ld_text: string;
  robots_allow_indexing: boolean;
};

const SUPPORTED_LANGUAGES: Array<{
  value: SupportedBlogLanguage;
  label: string;
  flag: string;
}> = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "pt", label: "Português", flag: "🇵🇹" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
];

const EMPTY_TRANSLATION: BlogPostTranslation = {
  title: "",
  excerpt: "",
  content: "",
  cover_image_alt: "",
  seo_title: "",
  meta_description: "",
  og_title: "",
  og_description: "",
  twitter_title: "",
  twitter_description: "",
};

const EMPTY_FORM: EditorForm = {
  category_id: "",
  author_name: "",
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image_alt: "",
  default_language: "en",
  translations: {},
  related_product_ids: [],
  status: "draft",
  is_active: true,
  is_featured: false,
  published_at: "",
  seo_title: "",
  meta_description: "",
  canonical_url: "",
  og_title: "",
  og_description: "",
  twitter_title: "",
  twitter_description: "",
  keywords_text: "",
  json_ld_text: "",
  robots_allow_indexing: true,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 210);
}

function errorMessage(error: any, fallback: string) {
  const data = error?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;

  if (data && typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length) {
      const [field, value] = entries[0];
      if (Array.isArray(value) && value[0]) return `${field}: ${String(value[0])}`;
      if (typeof value === "string") return `${field}: ${value}`;
    }
  }

  return fallback;
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toBackendDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getForm(post?: BlogPost | null): EditorForm {
  if (!post) return EMPTY_FORM;

  return {
    category_id: post.category ? String(post.category) : "",
    author_name: post.author_name || post.author_display_name || "",
    title: post.title || "",
    slug: post.slug || "",
    excerpt: post.excerpt || "",
    content: post.content || "",
    cover_image_alt: post.cover_image_alt || "",
    default_language: post.default_language || "en",
    translations: post.translations || {},
    related_product_ids: (post.related_products || []).map((product) => product.id),
    status: post.status || "draft",
    is_active: post.is_active !== false,
    is_featured: Boolean(post.is_featured),
    published_at: toLocalDateTimeInput(post.published_at),
    seo_title: post.seo_title || "",
    meta_description: post.meta_description || "",
    canonical_url: post.canonical_url || "",
    og_title: post.og_title || "",
    og_description: post.og_description || "",
    twitter_title: post.twitter_title || "",
    twitter_description: post.twitter_description || "",
    keywords_text: Array.isArray(post.keywords_tags)
      ? post.keywords_tags.join(", ")
      : "",
    json_ld_text:
      post.json_ld_override && Object.keys(post.json_ld_override).length
        ? JSON.stringify(post.json_ld_override, null, 2)
        : "",
    robots_allow_indexing: post.robots_allow_indexing !== false,
  };
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

async function compressImageFile(file: File, maxWidth = 1800, quality = 0.84) {
  if (!isImageFile(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Blog image compression failed; original file will be used.", error);
    return file;
  }
}

export default function TicketingBlogEditorPage() {
  const params = useParams<{
    organisationSlug?: string;
    slug?: string;
    blogPostId?: string;
  }>();
  const slug = params.organisationSlug || params.slug || "";
  const postId = params.blogPostId ? Number(params.blogPostId) : null;
  const editing = Boolean(postId);
  const navigate = useNavigate();

  const [post, setPost] = useState<BlogPost | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [translationLanguage, setTranslationLanguage] =
    useState<SupportedBlogLanguage>("es");

  async function loadPage() {
    if (!slug) return;

    try {
      setLoading(true);
      setError("");

      const [categoryResponse, productResponse, postResponse] = await Promise.all([
        ticketingApi.getBlogCategories(slug, { is_active: true }),
        ticketingApi.getProducts(slug, { is_active: true }),
        postId ? ticketingApi.getBlogPost(postId, slug) : Promise.resolve(null),
      ]);

      setCategories(categoryResponse);
      setProducts(productResponse);
      setPost(postResponse);
      setForm(getForm(postResponse));

      const defaultLanguage = postResponse?.default_language || "en";
      setTranslationLanguage(defaultLanguage === "es" ? "en" : "es");
    } catch (err) {
      console.error("Could not load blog editor:", err);
      setError(errorMessage(err, "We could not load the blog editor."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [slug, postId]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products.slice(0, 30);

    return products
      .filter((product) =>
        `${product.name} ${product.product_type} ${product.short_description}`
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 30);
  }, [products, productSearch]);

  const translationDraft = useMemo<BlogPostTranslation>(() => {
    return {
      ...EMPTY_TRANSLATION,
      ...(form.translations[translationLanguage] || {}),
    };
  }, [form.translations, translationLanguage]);

  function updateForm<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "title" && !current.slug.trim()) {
        return { ...next, slug: slugify(String(value)) };
      }

      if (key === "status" && value === "scheduled" && !current.published_at) {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return { ...next, published_at: toLocalDateTimeInput(tomorrow.toISOString()) };
      }

      return next;
    });
  }

  function updateTranslation<K extends keyof BlogPostTranslation>(
    key: K,
    value: BlogPostTranslation[K],
  ) {
    setForm((current) => ({
      ...current,
      translations: {
        ...current.translations,
        [translationLanguage]: {
          ...EMPTY_TRANSLATION,
          ...(current.translations[translationLanguage] || {}),
          [key]: value,
          _meta: {
            ...(current.translations[translationLanguage]?._meta || {}),
            source: "manual",
            manually_edited: true,
            source_language: current.default_language,
            target_language: translationLanguage,
            updated_at: new Date().toISOString(),
          },
        },
      },
    }));
  }

  function deleteTranslation(language: SupportedBlogLanguage) {
    if (!form.translations[language]) return;

    const confirmed = window.confirm(
      `Delete the saved ${language.toUpperCase()} translation?`,
    );
    if (!confirmed) return;

    setForm((current) => {
      const next = { ...current.translations };
      delete next[language];
      return { ...current, translations: next };
    });
  }

  function toggleProduct(productId: number) {
    setForm((current) => ({
      ...current,
      related_product_ids: current.related_product_ids.includes(productId)
        ? current.related_product_ids.filter((id) => id !== productId)
        : [...current.related_product_ids, productId],
    }));
  }

  function buildPayload(statusOverride?: BlogPostStatus): BlogPostWritePayload {
    let jsonLd: Record<string, unknown> = {};

    if (form.json_ld_text.trim()) {
      const parsed = JSON.parse(form.json_ld_text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON-LD must be a JSON object.");
      }
      jsonLd = parsed;
    }

    const status = statusOverride || form.status;
    const publishedAt = toBackendDateTime(form.published_at);

    if (status === "scheduled" && !publishedAt) {
      throw new Error("Choose a publication date and time for a scheduled article.");
    }

    return {
      category_id: form.category_id ? Number(form.category_id) : null,
      author_name: form.author_name.trim(),
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      excerpt: form.excerpt,
      content: form.content,
      cover_image_alt: form.cover_image_alt,
      default_language: form.default_language,
      translations: form.translations,
      related_product_ids: form.related_product_ids,
      status,
      is_active: form.is_active,
      is_featured: form.is_featured,
      published_at: statusOverride === "published" ? null : publishedAt,
      seo_title: form.seo_title,
      meta_description: form.meta_description,
      canonical_url: form.canonical_url,
      og_title: form.og_title,
      og_description: form.og_description,
      twitter_title: form.twitter_title,
      twitter_description: form.twitter_description,
      keywords_tags: form.keywords_text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      json_ld_override: jsonLd,
      robots_allow_indexing: form.robots_allow_indexing,
    };
  }

  async function savePost(statusOverride?: BlogPostStatus) {
    if (!form.title.trim()) {
      setError("Article title is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const payload = buildPayload(statusOverride);
      let saved = postId
        ? await ticketingApi.updateBlogPost(postId, payload, slug)
        : await ticketingApi.createBlogPost(payload, slug);

      if (coverFile || ogImageFile) {
        const files = new FormData();

        if (coverFile) {
          files.append("cover_image", await compressImageFile(coverFile));
        }

        if (ogImageFile) {
          files.append("og_image", await compressImageFile(ogImageFile, 1400, 0.86));
        }

        saved = await ticketingApi.updateBlogPost(saved.id, files, slug);
      }

      if (statusOverride === "published" && saved.status !== "published") {
        saved = await ticketingApi.publishBlogPost(saved.id, slug);
      }

      setPost(saved);
      setForm(getForm(saved));
      setCoverFile(null);
      setOgImageFile(null);
      setMessage(
        statusOverride === "published"
          ? "Article published."
          : statusOverride === "draft"
            ? "Draft saved."
            : "Article saved.",
      );

      if (!postId) {
        navigate(`/ticketing/${slug}/blog/${saved.id}/edit`, { replace: true });
      }
    } catch (err) {
      console.error("Could not save blog article:", err);
      setError(
        err instanceof Error && !((err as any)?.response)
          ? err.message
          : errorMessage(err, "We could not save this article."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadGallery(files: FileList | File[]) {
    if (!post) {
      setError("Save the article before uploading gallery images.");
      return;
    }

    const images = Array.from(files).filter(isImageFile);
    if (!images.length) return;

    try {
      setGallerySaving(true);
      setError("");

      const startOrder = post.gallery_images?.length || 0;

      for (const [index, file] of images.entries()) {
        const formData = new FormData();
        formData.append("post_id", String(post.id));
        formData.append("image", await compressImageFile(file));
        formData.append("alt_text", form.cover_image_alt || post.title);
        formData.append("caption", post.title);
        formData.append("sort_order", String(startOrder + index));
        formData.append("is_active", "true");
        await ticketingApi.createBlogGalleryImage(formData, slug);
      }

      const refreshed = await ticketingApi.getBlogPost(post.id, slug);
      setPost(refreshed);
      setForm(getForm(refreshed));
      setMessage("Gallery images uploaded.");
    } catch (err) {
      setError(errorMessage(err, "We could not upload the gallery images."));
    } finally {
      setGallerySaving(false);
    }
  }

  async function deleteGalleryImage(image: BlogPostGalleryImage) {
    if (!post || !window.confirm("Delete this gallery image?")) return;

    try {
      setGallerySaving(true);
      await ticketingApi.deleteBlogGalleryImage(image.id, slug);
      const refreshed = await ticketingApi.getBlogPost(post.id, slug);
      setPost(refreshed);
      setForm(getForm(refreshed));
      setMessage("Gallery image deleted.");
    } catch (err) {
      setError(errorMessage(err, "We could not delete this gallery image."));
    } finally {
      setGallerySaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading article editor...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      <header className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <Link
            to={`/ticketing/${slug}/blog`}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-violet-600">
              Blog editor
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">
              {editing ? "Edit article" : "New article"}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Write the article, connect products, add translations and control SEO.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {post?.is_publicly_visible && (
            <a
              href={`/experiences/${slug}/blog/${post.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700"
            >
              <Eye className="h-4 w-4" /> Preview
            </a>
          )}
          <button
            type="button"
            onClick={() => savePost("draft")}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> Save draft
          </button>
          <button
            type="button"
            onClick={() => savePost("published")}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Publish now
          </button>
        </div>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <Section title="Article" icon={Newspaper}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Title"
                value={form.title}
                onChange={(value) => updateForm("title", value)}
                full
              />
              <Input
                label="Slug"
                value={form.slug}
                onChange={(value) => updateForm("slug", value)}
                helper={`/blog/${form.slug || "article-slug"}/`}
                full
              />
              <Textarea
                label="Excerpt"
                value={form.excerpt}
                onChange={(value) => updateForm("excerpt", value)}
                rows={4}
                full
              />
            </div>

            <div className="mt-5">
              <BlogRichTextEditor
                value={form.content}
                onChange={(value) => updateForm("content", value)}
              />
            </div>
          </Section>

          <Section title="Translations" icon={Languages}>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LANGUAGES.map((language) => {
                const isDefault = language.value === form.default_language;
                const hasTranslation = Boolean(form.translations[language.value]);

                return (
                  <button
                    key={language.value}
                    type="button"
                    onClick={() => setTranslationLanguage(language.value)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      translationLanguage === language.value
                        ? "border-violet-300 bg-violet-50 text-violet-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-sm font-black">
                      {language.flag} {language.label}
                    </span>
                    <span className="mt-1 block text-[11px] font-bold uppercase tracking-wide opacity-60">
                      {isDefault ? "Default" : hasTranslation ? "Translated" : "Not translated"}
                    </span>
                  </button>
                );
              })}
            </div>

            {translationLanguage === form.default_language ? (
              <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
                This is the default language. Edit its content in the Article and SEO sections.
              </div>
            ) : (
              <div className="mt-5 space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-black text-slate-950">
                    {SUPPORTED_LANGUAGES.find((item) => item.value === translationLanguage)?.flag}{" "}
                    {SUPPORTED_LANGUAGES.find((item) => item.value === translationLanguage)?.label}
                  </h3>
                  <button
                    type="button"
                    onClick={() => deleteTranslation(translationLanguage)}
                    disabled={!form.translations[translationLanguage]}
                    className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete translation
                  </button>
                </div>

                <Input
                  label="Translated title"
                  value={translationDraft.title || ""}
                  onChange={(value) => updateTranslation("title", value)}
                />
                <Textarea
                  label="Translated excerpt"
                  value={translationDraft.excerpt || ""}
                  onChange={(value) => updateTranslation("excerpt", value)}
                  rows={3}
                />
                <BlogRichTextEditor
                  label="Translated article content"
                  value={translationDraft.content || ""}
                  onChange={(value) => updateTranslation("content", value)}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Translated SEO title"
                    value={translationDraft.seo_title || ""}
                    onChange={(value) => updateTranslation("seo_title", value)}
                  />
                  <Textarea
                    label="Translated meta description"
                    value={translationDraft.meta_description || ""}
                    onChange={(value) => updateTranslation("meta_description", value)}
                    rows={3}
                  />
                  <Input
                    label="Translated Open Graph title"
                    value={translationDraft.og_title || ""}
                    onChange={(value) => updateTranslation("og_title", value)}
                  />
                  <Textarea
                    label="Translated Open Graph description"
                    value={translationDraft.og_description || ""}
                    onChange={(value) => updateTranslation("og_description", value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
          </Section>

          <Section title="Related products" icon={Search}>
            <label className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Search products to connect with this article"
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              />
            </label>

            <div className="mt-4 grid max-h-[420px] gap-3 overflow-y-auto sm:grid-cols-2">
              {filteredProducts.map((product) => {
                const checked = form.related_product_ids.includes(product.id);
                return (
                  <label
                    key={product.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${
                      checked
                        ? "border-violet-300 bg-violet-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProduct(product.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                      {product.image_url || product.image ? (
                        <img
                          src={(product.image_url || product.image) as string}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileText className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{product.name}</p>
                      <p className="text-xs font-semibold capitalize text-slate-400">{product.product_type}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </Section>

          <Section title="Image gallery" icon={ImageIcon}>
            {!post ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center">
                <Upload className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-black text-slate-800">Save the article first</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Gallery uploads are available after the article has an ID.
                </p>
              </div>
            ) : (
              <>
                <label className="block rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
                  <span className="text-sm font-black text-slate-800">Upload gallery images</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    disabled={gallerySaving}
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        void uploadGallery(event.target.files);
                        event.target.value = "";
                      }
                    }}
                    className="mt-4 block w-full text-sm font-semibold text-slate-600"
                  />
                </label>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(post.gallery_images || []).map((image) => (
                    <div key={image.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                      <div className="h-40 bg-slate-100">
                        {image.image_url || image.image ? (
                          <img
                            src={(image.image_url || image.image) as string}
                            alt={image.alt_text || post.title}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-3 p-3">
                        <p className="truncate text-xs font-bold text-slate-500">
                          {image.caption || image.alt_text || `Image ${image.id}`}
                        </p>
                        <button
                          type="button"
                          disabled={gallerySaving}
                          onClick={() => deleteGalleryImage(image)}
                          className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        </main>

        <aside className="space-y-5">
          <Section title="Publishing" icon={CalendarClock} compact>
            <Select
              label="Status"
              value={form.status}
              onChange={(value) => updateForm("status", value as BlogPostStatus)}
              options={[
                { value: "draft", label: "Draft" },
                { value: "scheduled", label: "Scheduled" },
                { value: "published", label: "Published" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <Select
              label="Category"
              value={form.category_id}
              onChange={(value) => updateForm("category_id", value)}
              options={[
                { value: "", label: "No category" },
                ...categories.map((category) => ({ value: String(category.id), label: category.name })),
              ]}
            />
            <Select
              label="Default language"
              value={form.default_language}
              onChange={(value) => updateForm("default_language", value as SupportedBlogLanguage)}
              options={SUPPORTED_LANGUAGES.map((language) => ({
                value: language.value,
                label: `${language.flag} ${language.label}`,
              }))}
            />
            <Input
              label="Public author name"
              value={form.author_name}
              onChange={(value) => updateForm("author_name", value)}
            />
            <Input
              label="Publication date and time"
              type="datetime-local"
              value={form.published_at}
              onChange={(value) => updateForm("published_at", value)}
            />
            <Toggle
              label="Active"
              checked={form.is_active}
              onChange={(value) => updateForm("is_active", value)}
            />
            <Toggle
              label="Featured article"
              checked={form.is_featured}
              onChange={(value) => updateForm("is_featured", value)}
            />
          </Section>

          <Section title="Images" icon={ImageIcon} compact>
            {(coverFile || post?.cover_image_url || post?.cover_image) && (
              <div className="overflow-hidden rounded-2xl bg-slate-100">
                <img
                  src={
                    coverFile
                      ? URL.createObjectURL(coverFile)
                      : ((post?.cover_image_url || post?.cover_image) as string)
                  }
                  alt={form.cover_image_alt || form.title}
                  className="h-44 w-full object-cover"
                />
              </div>
            )}
            <FileInput label="Cover image" onChange={setCoverFile} />
            <Input
              label="Cover image alt text"
              value={form.cover_image_alt}
              onChange={(value) => updateForm("cover_image_alt", value)}
            />
            <FileInput label="Social sharing image" onChange={setOgImageFile} />
          </Section>

          <Section title="SEO" icon={Search} compact>
            <Input
              label="SEO title"
              value={form.seo_title}
              onChange={(value) => updateForm("seo_title", value)}
              helper={`${form.seo_title.length}/255`}
            />
            <Textarea
              label="Meta description"
              value={form.meta_description}
              onChange={(value) => updateForm("meta_description", value)}
              rows={4}
              helper={`${form.meta_description.length} characters`}
            />
            <Input
              label="Canonical URL"
              value={form.canonical_url}
              onChange={(value) => updateForm("canonical_url", value)}
            />
            <Input
              label="Open Graph title"
              value={form.og_title}
              onChange={(value) => updateForm("og_title", value)}
            />
            <Textarea
              label="Open Graph description"
              value={form.og_description}
              onChange={(value) => updateForm("og_description", value)}
              rows={3}
            />
            <Input
              label="Twitter title"
              value={form.twitter_title}
              onChange={(value) => updateForm("twitter_title", value)}
            />
            <Textarea
              label="Twitter description"
              value={form.twitter_description}
              onChange={(value) => updateForm("twitter_description", value)}
              rows={3}
            />
            <Textarea
              label="Keywords"
              value={form.keywords_text}
              onChange={(value) => updateForm("keywords_text", value)}
              rows={3}
              helper="Separate keywords with commas."
            />
            <Textarea
              label="JSON-LD override"
              value={form.json_ld_text}
              onChange={(value) => updateForm("json_ld_text", value)}
              rows={7}
              helper="Optional valid JSON object. Leave blank to generate Article schema automatically."
              mono
            />
            <Toggle
              label="Allow search engine indexing"
              checked={form.robots_allow_indexing}
              onChange={(value) => updateForm("robots_allow_indexing", value)}
            />
          </Section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-4 backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-7xl flex-col justify-end gap-3 sm:flex-row">
          <Link
            to={`/ticketing/${slug}/blog`}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={() => savePost()}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save article
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  compact = false,
}: {
  title: string;
  icon: typeof Newspaper;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      <div className={compact ? "space-y-4" : ""}>{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  helper,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  helper?: string;
  full?: boolean;
}) {
  return (
    <label className={full ? "sm:col-span-2" : ""}>
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
      />
      {helper && <span className="mt-1 block text-xs font-semibold text-slate-400">{helper}</span>}
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows,
  helper,
  full = false,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  helper?: string;
  full?: boolean;
  mono?: boolean;
}) {
  return (
    <label className={full ? "sm:col-span-2" : ""}>
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${mono ? "font-mono" : ""}`}
      />
      {helper && <span className="mt-1 block text-xs font-semibold text-slate-400">{helper}</span>}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-slate-300"
      />
    </label>
  );
}

function FileInput({
  label,
  onChange,
}: {
  label: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">{label}</span>
      <input
        type="file"
        accept="image/*"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        className="block w-full text-sm font-semibold text-slate-600"
      />
    </label>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      className={`flex items-start gap-3 rounded-3xl border p-4 text-sm font-bold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      {children}
    </div>
  );
}
