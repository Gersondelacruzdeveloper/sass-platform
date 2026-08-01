// src/modules/ticketing/pages/TicketingBlogPostsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import type {
  BlogCategory,
  BlogPost,
  BlogPostStatus,
  SupportedBlogLanguage,
} from "../types/ticketingTypes";

type CategoryForm = {
  name: string;
  slug: string;
  description: string;
  default_language: SupportedBlogLanguage;
  sort_order: string;
  seo_title: string;
  meta_description: string;
  is_active: boolean;
};

const EMPTY_CATEGORY: CategoryForm = {
  name: "",
  slug: "",
  description: "",
  default_language: "en",
  sort_order: "0",
  seo_title: "",
  meta_description: "",
  is_active: true,
};

const STATUS_OPTIONS: Array<{ value: BlogPostStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function errorMessage(error: any, fallback: string) {
  const data = error?.response?.data;

  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;

  const firstField = data && typeof data === "object" ? Object.values(data)[0] : null;
  if (Array.isArray(firstField) && firstField[0]) return String(firstField[0]);
  if (typeof firstField === "string") return firstField;

  return fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not scheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function publicPostPath(organisationSlug: string, post: BlogPost) {
  return `/experiences/${organisationSlug}/blog/${post.slug}`;
}

export default function TicketingBlogPostsPage() {
  const params = useParams();
  const slug = params.organisationSlug || params.slug || "";

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BlogPostStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BlogCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY);
  const [categoryImage, setCategoryImage] = useState<File | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);

  async function loadData() {
    if (!slug) return;

    try {
      setLoading(true);
      setError("");

      const [postResponse, categoryResponse] = await Promise.all([
        ticketingApi.getBlogPosts(slug),
        ticketingApi.getBlogCategories(slug),
      ]);

      setPosts(postResponse);
      setCategories(categoryResponse);
    } catch (err) {
      console.error("Could not load blog CMS:", err);
      setError(errorMessage(err, "We could not load the blog CMS."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [slug]);

  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return posts.filter((post) => {
      const searchMatch = query
        ? `${post.title} ${post.excerpt} ${post.slug} ${post.author_name}`
            .toLowerCase()
            .includes(query)
        : true;

      const statusMatch = statusFilter === "all" || post.status === statusFilter;
      const categoryId = post.category_detail?.id ?? post.category;
      const categoryMatch =
        categoryFilter === "all" || String(categoryId || "") === categoryFilter;
      const featuredMatch = !featuredOnly || post.is_featured;

      return searchMatch && statusMatch && categoryMatch && featuredMatch;
    });
  }, [posts, search, statusFilter, categoryFilter, featuredOnly]);

  const summary = useMemo(
    () => ({
      total: posts.length,
      published: posts.filter((post) => post.status === "published").length,
      scheduled: posts.filter((post) => post.status === "scheduled").length,
      drafts: posts.filter((post) => post.status === "draft").length,
      featured: posts.filter((post) => post.is_featured).length,
    }),
    [posts],
  );

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryForm(EMPTY_CATEGORY);
    setCategoryImage(null);
    setCategoryModalOpen(true);
  }

  function openEditCategory(category: BlogCategory) {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name || "",
      slug: category.slug || "",
      description: category.description || "",
      default_language: category.default_language || "en",
      sort_order: String(category.sort_order || 0),
      seo_title: category.seo_title || "",
      meta_description: category.meta_description || "",
      is_active: category.is_active !== false,
    });
    setCategoryImage(null);
    setCategoryModalOpen(true);
  }

  function updateCategoryForm<K extends keyof CategoryForm>(
    key: K,
    value: CategoryForm[K],
  ) {
    setCategoryForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "name" && !current.slug.trim()) {
        return { ...next, slug: slugify(String(value)) };
      }

      return next;
    });
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) {
      setError("Category name is required.");
      return;
    }

    try {
      setCategorySaving(true);
      setError("");
      setMessage("");

      const formData = new FormData();
      formData.append("name", categoryForm.name.trim());
      formData.append("slug", categoryForm.slug.trim() || slugify(categoryForm.name));
      formData.append("description", categoryForm.description);
      formData.append("default_language", categoryForm.default_language);
      formData.append("sort_order", categoryForm.sort_order || "0");
      formData.append("seo_title", categoryForm.seo_title);
      formData.append("meta_description", categoryForm.meta_description);
      formData.append("is_active", categoryForm.is_active ? "true" : "false");

      if (categoryImage) formData.append("image", categoryImage);

      const saved = editingCategory
        ? await ticketingApi.updateBlogCategory(editingCategory.id, formData, slug)
        : await ticketingApi.createBlogCategory(formData, slug);

      setCategories((current) =>
        editingCategory
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved].sort(
              (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
            ),
      );

      setCategoryModalOpen(false);
      setEditingCategory(null);
      setCategoryImage(null);
      setMessage(editingCategory ? "Category updated." : "Category created.");
    } catch (err) {
      console.error("Could not save blog category:", err);
      setError(errorMessage(err, "We could not save this category."));
    } finally {
      setCategorySaving(false);
    }
  }

  async function deleteCategory(category: BlogCategory) {
    const confirmed = window.confirm(
      `Delete the category “${category.name}”? Existing posts will keep working without a category.`,
    );

    if (!confirmed) return;

    try {
      setWorkingId(category.id);
      setError("");
      await ticketingApi.deleteBlogCategory(category.id, slug);
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setMessage("Category deleted.");
    } catch (err) {
      setError(errorMessage(err, "We could not delete this category."));
    } finally {
      setWorkingId(null);
    }
  }

  async function updatePostAction(
    post: BlogPost,
    action: "publish" | "unpublish" | "archive" | "delete",
  ) {
    if (
      action === "delete" &&
      !window.confirm(`Delete “${post.title}”? This cannot be undone.`)
    ) {
      return;
    }

    try {
      setWorkingId(post.id);
      setError("");
      setMessage("");

      if (action === "delete") {
        await ticketingApi.deleteBlogPost(post.id, slug);
        setPosts((current) => current.filter((item) => item.id !== post.id));
        setMessage("Article deleted.");
        return;
      }

      const updated =
        action === "publish"
          ? await (async () => {
              await ticketingApi.updateBlogPost(
                post.id,
                { published_at: new Date().toISOString() },
                slug,
              );
              return ticketingApi.publishBlogPost(post.id, slug);
            })()
          : action === "unpublish"
            ? await ticketingApi.unpublishBlogPost(post.id, slug)
            : await ticketingApi.archiveBlogPost(post.id, slug);

      setPosts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(
        action === "publish"
          ? "Article published."
          : action === "unpublish"
            ? "Article moved back to draft."
            : "Article archived.",
      );
    } catch (err) {
      setError(errorMessage(err, `We could not ${action} this article.`));
    } finally {
      setWorkingId(null);
    }
  }

  async function copyPublicUrl(post: BlogPost) {
    const url = `${window.location.origin}${publicPostPath(slug, post)}`;

    try {
      await navigator.clipboard.writeText(url);
      setMessage("Public article URL copied.");
    } catch {
      window.prompt("Copy this URL", url);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading blog content...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <Newspaper className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-violet-600">
              Content and SEO
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Blog
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Create helpful articles, connect them to products, schedule publication,
              and publish them on the organisation’s custom domain.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateCategory}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-5 text-sm font-black text-violet-700 transition hover:bg-violet-100"
          >
            <Tags className="h-4 w-4" />
            Categories
          </button>
          <Link
            to={`/ticketing/${slug}/blog/new`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            New article
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat title="All articles" value={summary.total} icon={FileText} />
        <Stat title="Published" value={summary.published} icon={CheckCircle2} />
        <Stat title="Scheduled" value={summary.scheduled} icon={CalendarClock} />
        <Stat title="Drafts" value={summary.drafts} icon={Edit3} />
        <Stat title="Featured" value={summary.featured} icon={Star} />
      </section>

      {error && (
        <Notice tone="error" icon={AlertCircle}>
          {error}
        </Notice>
      )}
      {message && (
        <Notice tone="success" icon={CheckCircle2}>
          {message}
        </Notice>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_190px_210px_auto]">
          <label className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, excerpt, slug or author"
              className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as BlogPostStatus | "all")
            }
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>

          <label className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={(event) => setFeaturedOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Featured only
          </label>
        </div>
      </section>

      {filteredPosts.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Newspaper className="mx-auto h-12 w-12 text-slate-300" />
          <h2 className="mt-4 text-xl font-black text-slate-950">
            No articles found
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Create the first article or change the filters above.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredPosts.map((post) => (
            <article
              key={post.id}
              className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="grid gap-4 p-4 sm:grid-cols-[170px_1fr]">
                <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                  {post.cover_image_url || post.cover_image ? (
                    <img
                      src={(post.cover_image_url || post.cover_image) as string}
                      alt={post.cover_image_alt || post.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-9 w-9 text-slate-300" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={post.status} />
                    {post.is_featured && <Badge label="Featured" tone="violet" />}
                    {post.is_publicly_visible && <Badge label="Public" tone="blue" />}
                    {post.category_detail?.name && (
                      <Badge label={post.category_detail.name} tone="slate" />
                    )}
                  </div>

                  <h2 className="mt-3 line-clamp-2 text-xl font-black text-slate-950">
                    {post.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">
                    {post.excerpt || "No excerpt has been added yet."}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-400">
                    <span>{post.author_display_name || post.author_name || "No author"}</span>
                    <span>{formatDateTime(post.published_at)}</span>
                    <span>{post.reading_time_minutes || 1} min read</span>
                    <span>{post.view_count || 0} views</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/ticketing/${slug}/blog/${post.id}/edit`}
                      className="inline-flex items-center gap-1 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </Link>

                    {post.status === "published" ? (
                      <button
                        type="button"
                        disabled={workingId === post.id}
                        onClick={() => updatePostAction(post, "unpublish")}
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        Move to draft
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={workingId === post.id}
                        onClick={() => updatePostAction(post, "publish")}
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Publish now
                      </button>
                    )}

                    {post.is_publicly_visible && (
                      <>
                        <a
                          href={publicPostPath(slug, post)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </a>
                        <button
                          type="button"
                          onClick={() => copyPublicUrl(post)}
                          className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy URL
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      disabled={workingId === post.id}
                      onClick={() => updatePostAction(post, "archive")}
                      className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>

                    <button
                      type="button"
                      disabled={workingId === post.id}
                      onClick={() => updatePostAction(post, "delete")}
                      className="inline-flex items-center gap-1 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      {workingId === post.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {categoryModalOpen && (
        <CategoryManagerModal
          categories={categories}
          form={categoryForm}
          editingCategory={editingCategory}
          image={categoryImage}
          saving={categorySaving}
          workingId={workingId}
          onClose={() => {
            if (!categorySaving) setCategoryModalOpen(false);
          }}
          onCreateNew={openCreateCategory}
          onEdit={openEditCategory}
          onDelete={deleteCategory}
          onChange={updateCategoryForm}
          onImageChange={setCategoryImage}
          onSave={saveCategory}
        />
      )}
    </div>
  );
}

function Stat({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            {title}
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: "error" | "success";
  icon: typeof AlertCircle;
  children: React.ReactNode;
}) {
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

function Badge({ label, tone }: { label: string; tone: "violet" | "blue" | "slate" }) {
  const classes = {
    violet: "bg-violet-100 text-violet-700",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return <span className={`rounded-full px-3 py-1 text-[11px] font-black ${classes}`}>{label}</span>;
}

function StatusBadge({ status }: { status: BlogPostStatus }) {
  const styles: Record<BlogPostStatus, string> = {
    draft: "bg-slate-100 text-slate-700",
    scheduled: "bg-amber-100 text-amber-800",
    published: "bg-emerald-100 text-emerald-700",
    archived: "bg-rose-100 text-rose-700",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-black capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function CategoryManagerModal({
  categories,
  form,
  editingCategory,
  image,
  saving,
  workingId,
  onClose,
  onCreateNew,
  onEdit,
  onDelete,
  onChange,
  onImageChange,
  onSave,
}: {
  categories: BlogCategory[];
  form: CategoryForm;
  editingCategory: BlogCategory | null;
  image: File | null;
  saving: boolean;
  workingId: number | null;
  onClose: () => void;
  onCreateNew: () => void;
  onEdit: (category: BlogCategory) => void;
  onDelete: (category: BlogCategory) => void;
  onChange: <K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) => void;
  onImageChange: (file: File | null) => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-violet-600">
              Blog organisation
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              Categories
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.1fr]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-950">Saved categories</h3>
              <button
                type="button"
                onClick={onCreateNew}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
              >
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </div>

            <div className="space-y-2">
              {categories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">
                  No categories yet.
                </div>
              ) : (
                categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                      {category.image_url || category.image ? (
                        <img
                          src={(category.image_url || category.image) as string}
                          alt={category.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Tags className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">
                        {category.name}
                      </p>
                      <p className="truncate text-xs font-semibold text-slate-400">
                        /{category.slug} · order {category.sort_order}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEdit(category)}
                      className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={workingId === category.id}
                      onClick={() => onDelete(category)}
                      className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-lg font-black text-slate-950">
              {editingCategory ? "Edit category" : "Create category"}
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Slug">
                <input
                  value={form.slug}
                  onChange={(event) => onChange("slug", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Default language">
                <select
                  value={form.default_language}
                  onChange={(event) =>
                    onChange("default_language", event.target.value as SupportedBlogLanguage)
                  }
                  className="input"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="pt">Portuguese</option>
                  <option value="de">German</option>
                </select>
              </Field>
              <Field label="Sort order">
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(event) => onChange("sort_order", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Description" full>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => onChange("description", event.target.value)}
                  className="input min-h-24 py-3"
                />
              </Field>
              <Field label="SEO title" full>
                <input
                  value={form.seo_title}
                  onChange={(event) => onChange("seo_title", event.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Meta description" full>
                <textarea
                  rows={3}
                  value={form.meta_description}
                  onChange={(event) => onChange("meta_description", event.target.value)}
                  className="input min-h-24 py-3"
                />
              </Field>
              <Field label="Category image" full>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => onImageChange(event.target.files?.[0] || null)}
                  className="block w-full text-sm font-semibold text-slate-600"
                />
                {image && (
                  <p className="mt-2 text-xs font-bold text-slate-500">{image.name}</p>
                )}
              </Field>
              <label className="flex items-center gap-3 text-sm font-black text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => onChange("is_active", event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Active and available on the public blog
              </label>
            </div>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingCategory ? "Save category" : "Create category"}
            </button>
          </section>
        </div>
      </div>

      <style>{`
        .input { height: 3rem; width: 100%; border-radius: 1rem; border: 1px solid rgb(203 213 225); background: white; padding-left: 1rem; padding-right: 1rem; font-size: .875rem; font-weight: 600; outline: none; }
        .input:focus { border-color: rgb(100 116 139); box-shadow: 0 0 0 4px rgb(241 245 249); }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? "sm:col-span-2" : ""}>
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
