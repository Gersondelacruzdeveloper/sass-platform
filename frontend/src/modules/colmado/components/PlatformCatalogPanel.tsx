import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  getApiErrorMessage,
  type CatalogProduct,
} from "../api/colmadoClient";

import {
  createPlatformProduct,
  downloadCatalogTemplate,
  getPlatformCatalog,
  importPlatformCatalog,
  updatePlatformProduct,
  type SavePlatformProductPayload,
} from "../api/platformCatalogClient";


type Notice = {
  kind: "success" | "error";
  text: string;
} | null;


const emptyForm: SavePlatformProductPayload = {
  barcode: "",
  name: "",
  brand: "",
  presentation: "",
  category: "",
  unit: "unit",
  sale_mode: "unit",
  units_per_case: 1,
  is_active: true,
};


export default function PlatformCatalogPanel() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [editingProduct, setEditingProduct] =
    useState<CatalogProduct | null>(null);

  const [form, setForm] =
    useState<SavePlatformProductPayload>(emptyForm);

  const [notice, setNotice] = useState<Notice>(null);


  const loadProducts = useCallback(
    async (term = "") => {
      setLoading(true);

      try {
        setProducts(
          await getPlatformCatalog({
            search: term,
          }),
        );
      } catch (error) {
        setNotice({
          kind: "error",
          text: getApiErrorMessage(error),
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );


  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);


  function startNewProduct() {
    setEditingProduct(null);
    setForm(emptyForm);
    setShowForm(true);
    setNotice(null);
  }


  function startEditing(product: CatalogProduct) {
    setEditingProduct(product);

    setForm({
      barcode: product.barcode ?? "",
      name: product.name,
      brand: product.brand,
      presentation: product.presentation,
      category: product.category,
      unit: product.unit,
      sale_mode: product.sale_mode,
      units_per_case: product.units_per_case,
      is_active: product.is_active,
    });

    setShowForm(true);
    setNotice(null);
  }


  async function saveProduct(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.name.trim() || saving) {
      return;
    }

    setSaving(true);
    setNotice(null);

    const payload = {
      ...form,
      barcode: form.barcode?.trim() || null,
      name: form.name.trim(),
      brand: form.brand?.trim(),
      presentation: form.presentation?.trim(),
      category: form.category?.trim(),
    };

    try {
      if (editingProduct) {
        await updatePlatformProduct(
          editingProduct.id,
          payload,
        );
      } else {
        await createPlatformProduct(payload);
      }

      setShowForm(false);
      setEditingProduct(null);
      setForm(emptyForm);

      setNotice({
        kind: "success",
        text: editingProduct
          ? "Producto actualizado correctamente."
          : "Producto agregado al catálogo maestro.",
      });

      await loadProducts(search);
    } catch (error) {
      setNotice({
        kind: "error",
        text: getApiErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  }


  async function toggleProduct(
    product: CatalogProduct,
  ) {
    try {
      await updatePlatformProduct(product.id, {
        is_active: !product.is_active,
      });

      setNotice({
        kind: "success",
        text: product.is_active
          ? "Producto desactivado."
          : "Producto activado.",
      });

      await loadProducts(search);
    } catch (error) {
      setNotice({
        kind: "error",
        text: getApiErrorMessage(error),
      });
    }
  }


  async function uploadCatalog(
    file: File | undefined,
  ) {
    if (!file || importing) {
      return;
    }

    setImporting(true);
    setNotice(null);

    try {
      const result = await importPlatformCatalog(file);

      setNotice({
        kind: result.was_successful
          ? "success"
          : "error",
        text: result.was_successful
          ? (
            `Importación lista: ` +
            `${result.created_products} creados y ` +
            `${result.updated_products} actualizados.`
          )
          : "La importación contiene errores. Revisa el archivo.",
      });

      await loadProducts(search);
    } catch (error) {
      setNotice({
        kind: "error",
        text: getApiErrorMessage(error),
      });
    } finally {
      setImporting(false);
    }
  }


  async function downloadTemplate() {
    try {
      const blob = await downloadCatalogTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "plantilla_catalogo_colmado.csv";
      link.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({
        kind: "error",
        text: getApiErrorMessage(error),
      });
    }
  }


  return (
    <section
      className="space-y-5"
      aria-labelledby="platform-catalog-title"
    >
      <div>
        <p className="text-sm font-bold text-emerald-700">
          Administración
        </p>

        <h1
          id="platform-catalog-title"
          className="text-2xl font-black text-slate-950"
        >
          Catálogo maestro
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          Agrega una sola vez los productos que después
          podrán usar todos los colmados.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <button
          type="button"
          onClick={startNewProduct}
          className="min-h-12 rounded-xl bg-emerald-700 px-4 font-black text-white"
        >
          Agregar producto
        </button>

        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-emerald-700 px-4 text-center font-black text-emerald-800">
          {importing
            ? "Importando..."
            : "Importar Excel o CSV"}

          <input
            className="sr-only"
            type="file"
            accept=".csv,.xlsx"
            disabled={importing}
            onChange={(event) => {
              void uploadCatalog(
                event.target.files?.[0],
              );

              event.target.value = "";
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => void downloadTemplate()}
          className="min-h-12 rounded-xl border border-slate-300 px-4 font-black text-slate-800"
        >
          Descargar plantilla
        </button>
      </div>

      {notice && (
        <div
          role={
            notice.kind === "error"
              ? "alert"
              : "status"
          }
          className={
            `rounded-xl border p-3 text-sm font-bold ${
              notice.kind === "error"
                ? (
                  "border-red-200 bg-red-50 " +
                  "text-red-800"
                )
                : (
                  "border-emerald-200 bg-emerald-50 " +
                  "text-emerald-800"
                )
            }`
          }
        >
          {notice.text}
        </div>
      )}

      {showForm && (
        <ProductForm
          form={form}
          editing={Boolean(editingProduct)}
          saving={saving}
          onChange={setForm}
          onCancel={() => setShowForm(false)}
          onSubmit={saveProduct}
        />
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void loadProducts(search);
        }}
      >
        <label
          className="sr-only"
          htmlFor="catalog-search"
        >
          Buscar productos
        </label>

        <input
          id="catalog-search"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 outline-none focus:border-emerald-600"
          placeholder="Nombre, marca o código de barra"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />

        <button
          type="submit"
          className="min-h-12 rounded-xl bg-slate-900 px-5 font-black text-white"
        >
          Buscar
        </button>
      </form>

      <div className="space-y-3">
        {loading ? (
          <p
            role="status"
            className="py-8 text-center font-bold text-slate-600"
          >
            Cargando productos...
          </p>
        ) : products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center font-bold text-slate-600">
            No encontramos productos.
          </p>
        ) : (
          products.map((product) => (
            <article
              key={product.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-black text-slate-950">
                    {product.display_name}
                  </h2>

                  <p className="text-sm text-slate-600">
                    {product.barcode ||
                      "Sin código de barra"}
                    {" · "}
                    {product.category ||
                      "Sin categoría"}
                  </p>

                  <p
                    className={
                      `mt-1 text-xs font-black ${
                        product.is_active
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`
                    }
                  >
                    {product.is_active
                      ? "Activo"
                      : "Inactivo"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      startEditing(product);
                    }}
                    className="min-h-11 rounded-xl border border-slate-300 px-4 font-black text-slate-800"
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void toggleProduct(product);
                    }}
                    className="min-h-11 rounded-xl border border-emerald-700 px-4 font-black text-emerald-800"
                  >
                    {product.is_active
                      ? "Desactivar"
                      : "Activar"}
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}


interface ProductFormProps {
  form: SavePlatformProductPayload;
  editing: boolean;
  saving: boolean;
  onChange: (
    value: SavePlatformProductPayload,
  ) => void;
  onCancel: () => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void;
}


function ProductForm({
  form,
  editing,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  function setField(
    key: keyof SavePlatformProductPayload,
    value: string | number | boolean | null,
  ) {
    onChange({
      ...form,
      [key]: value,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4"
    >
      <h2 className="text-lg font-black text-slate-950">
        {editing
          ? "Editar producto"
          : "Nuevo producto"}
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label="Nombre *"
          value={form.name}
          required
          onChange={(value) => {
            setField("name", value);
          }}
        />

        <Field
          label="Código de barra"
          value={form.barcode ?? ""}
          onChange={(value) => {
            setField("barcode", value);
          }}
        />

        <Field
          label="Marca"
          value={form.brand ?? ""}
          onChange={(value) => {
            setField("brand", value);
          }}
        />

        <Field
          label="Presentación"
          value={form.presentation ?? ""}
          placeholder="Ejemplo: 12 oz"
          onChange={(value) => {
            setField("presentation", value);
          }}
        />

        <Field
          label="Categoría"
          value={form.category ?? ""}
          onChange={(value) => {
            setField("category", value);
          }}
        />

        <label className="text-sm font-black text-slate-800">
          Unidades por caja

          <input
            type="number"
            min="1"
            required
            value={form.units_per_case}
            onChange={(event) => {
              setField(
                "units_per_case",
                Number(event.target.value),
              );
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"
          />
        </label>

        <label className="text-sm font-black text-slate-800">
          Unidad de venta

          <select
            value={form.unit}
            onChange={(event) => {
              setField("unit", event.target.value);
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"
          >
            <option value="unit">Unidad</option>
            <option value="lb">Libra</option>
            <option value="kg">Kilogramo</option>
            <option value="liter">Litro</option>
            <option value="portion">Porción</option>
          </select>
        </label>

        <label className="text-sm font-black text-slate-800">
          Forma de venta

          <select
            value={form.sale_mode}
            onChange={(event) => {
              setField(
                "sale_mode",
                event.target.value,
              );
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"
          >
            <option value="unit">
              Por unidad
            </option>

            <option value="weight">
              Por peso
            </option>

            <option value="amount">
              Por valor en pesos
            </option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="min-h-12 flex-1 rounded-xl bg-emerald-700 px-4 font-black text-white disabled:opacity-50"
        >
          {saving
            ? "Guardando..."
            : "Guardar producto"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-black text-slate-800"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}


interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}


function Field({
  label,
  value,
  onChange,
  required = false,
  placeholder = "",
}: FieldProps) {
  return (
    <label className="text-sm font-black text-slate-800">
      {label}

      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"
      />
    </label>
  );
}