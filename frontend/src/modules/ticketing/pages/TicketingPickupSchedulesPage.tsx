// src/modules/ticketing/pages/TicketingPickupSchedulesPage.tsx

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  Hotel,
  Loader2,
  MapPin,
  Upload,
  Download,
  FileSpreadsheet,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import api from "../../../api/axios";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

type ProductType =
  | "excursion"
  | "transfer"
  | "ticket"
  | "event"
  | "nightlife"
  | "custom";

type ProductStatus =
  | "draft"
  | "active"
  | "inactive"
  | "sold_out"
  | "archived";

type ExperienceProduct = {
  id: number;
  name: string;
  slug: string;
  product_type: ProductType;
  status: ProductStatus;
  supports_pickup: boolean;
  requires_pickup_location: boolean;
  public_enabled: boolean;
};

type PickupZone = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
};

type PickupLocation = {
  id: number;
  zone?: number | null;
  zone_name?: string;
  name: string;
  slug: string;
  location_type: "hotel" | "airport" | "meeting_point" | "private_address" | "other";
  address: string;
  default_pickup_point: string;
  default_instructions: string;
  google_maps_link: string;
  is_active: boolean;
};

type ProductPickupSchedule = {
  id: number;
  product: number;
  product_name?: string;
  pickup_location: number;
  pickup_location_name?: string;
  day_of_week: number | null;
  specific_date: string | null;
  pickup_time: string;
  pickup_point: string;
  resolved_pickup_point?: string;
  instructions: string;
  is_active: boolean;
};

type ResolvePickupResponse = {
  found: boolean;
  product?: string;
  pickup_location?: string;
  service_date?: string;
  message?: string;
  schedule?: ProductPickupSchedule;
};

type ImportSummary = {
  rows_read: number;
  valid_rows: number;
  invalid_rows: number;
  existing_locations: number;
  new_locations: number;
  existing_schedules: number;
  new_schedules: number;
  updated_schedules: number;
  created_locations: number;
  created_schedules: number;
  skipped_duplicates: number;
};

type ImportRow = {
  row_number: number;
  hotel_name: string;
  pickup_time: string;
  zone_name: string;
  pickup_point: string;
  instructions: string;
  specific_date: string;
  day_of_week: number | null;
  status: string;
  action: string;
  errors: string[];
};

type ImportResponse = {
  mode: "preview" | "import";
  product: { id: number; name: string };
  summary: ImportSummary;
  rows: ImportRow[];
};

type ZoneForm = {
  id?: number;
  name: string;
  description: string;
  is_active: boolean;
};

type LocationForm = {
  id?: number;
  zone_id: string;
  name: string;
  location_type: PickupLocation["location_type"];
  address: string;
  default_pickup_point: string;
  default_instructions: string;
  google_maps_link: string;
  is_active: boolean;
};

type ScheduleForm = {
  id?: number;
  product_id: string;
  pickup_location_id: string;
  day_of_week: string;
  specific_date: string;
  pickup_time: string;
  pickup_point: string;
  instructions: string;
  is_active: boolean;
};

type Translate = (key: string) => string;

function getDayOptions(t: Translate) {
  return [
    { value: "", label: t("pickupSchedules.days.fallback") },
    { value: "0", label: t("pickupSchedules.days.monday") },
    { value: "1", label: t("pickupSchedules.days.tuesday") },
    { value: "2", label: t("pickupSchedules.days.wednesday") },
    { value: "3", label: t("pickupSchedules.days.thursday") },
    { value: "4", label: t("pickupSchedules.days.friday") },
    { value: "5", label: t("pickupSchedules.days.saturday") },
    { value: "6", label: t("pickupSchedules.days.sunday") },
  ];
}

const emptyZoneForm: ZoneForm = {
  name: "",
  description: "",
  is_active: true,
};

const emptyLocationForm: LocationForm = {
  zone_id: "",
  name: "",
  location_type: "hotel",
  address: "",
  default_pickup_point: "",
  default_instructions: "",
  google_maps_link: "",
  is_active: true,
};

const emptyScheduleForm: ScheduleForm = {
  product_id: "",
  pickup_location_id: "",
  day_of_week: "",
  specific_date: "",
  pickup_time: "",
  pickup_point: "",
  instructions: "",
  is_active: true,
};

function getRequestParams(organisationSlug?: string) {
  return {
    slug: organisationSlug,
    organisation_slug: organisationSlug,
  };
}

function getErrorMessage(err: any, fallback: string) {
  const data = err?.response?.data;

  if (!data) return fallback;

  if (typeof data === "string") return data;

  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);

  const firstKey = Object.keys(data)[0];

  if (firstKey) {
    const value = data[firstKey];

    if (Array.isArray(value)) return `${firstKey}: ${value.join(", ")}`;
    return `${firstKey}: ${String(value)}`;
  }

  return fallback;
}

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatTime(
  value: string | null | undefined,
  language: "en" | "es"
) {
  if (!value) return "—";

  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw || "0");

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat(language === "es" ? "es-DO" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function dayLabel(
  value: number | null | undefined,
  dayOptions: { value: string; label: string }[],
  fallback: string
) {
  if (value === null || value === undefined) return fallback;

  return (
    dayOptions.find((item) => item.value === String(value))?.label || fallback
  );
}

function productTypeLabel(value: ProductType, t: Translate) {
  return t(`pickupSchedules.productTypes.${value}`);
}

function toggleStringValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value].sort((a, b) => Number(a) - Number(b));
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());

  return cells;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
}

async function buildImportFileForSelectedDays(
  originalFile: File,
  selectedDays: string[]
) {
  if (!selectedDays.length) return originalFile;

  const text = await originalFile.text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");

  if (!lines.length) return originalFile;

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const normalizedHeaders = headers.map((header) =>
    header.toLowerCase().replace(/\s+/g, "_")
  );

  const outputHeaders = [...headers];

  let dayIndex = normalizedHeaders.indexOf("day_of_week");
  if (dayIndex === -1) {
    outputHeaders.push("day_of_week");
    dayIndex = outputHeaders.length - 1;
  }

  let specificDateIndex = normalizedHeaders.indexOf("specific_date");
  if (specificDateIndex === -1) {
    outputHeaders.push("specific_date");
    specificDateIndex = outputHeaders.length - 1;
  }

  const outputRows: string[][] = [];

  lines.slice(1).forEach((line) => {
    const cells = parseCsvLine(line);

    if (!cells.some((cell) => cell.trim())) return;

    selectedDays.forEach((day) => {
      const row = [...cells];

      while (row.length < outputHeaders.length) {
        row.push("");
      }

      row[dayIndex] = day;

      // Recurring weekday imports should not carry a specific date override.
      // If specific_date exists, the backend gives it priority over day_of_week.
      row[specificDateIndex] = "";

      outputRows.push(row);
    });
  });

  const csvContent = [
    outputHeaders.map(csvEscape).join(","),
    ...outputRows.map((row) => outputHeaders.map((_, index) => csvEscape(row[index] || "")).join(",")),
  ].join("\n");

  return new File([csvContent], originalFile.name.replace(/\.csv$/i, "") + "-selected-days.csv", {
    type: "text/csv",
  });
}

export default function TicketingPickupSchedulesPage() {
  const { language, t } = useTicketingAdminTranslation();
  const { organisationSlug } = useParams<{ organisationSlug: string }>();

  const dayOptions = useMemo(() => getDayOptions(t), [t]);
  const importDayOptions = useMemo(
    () => dayOptions.filter((option) => option.value !== ""),
    [dayOptions]
  );

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [zones, setZones] = useState<PickupZone[]>([]);
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  const [schedules, setSchedules] = useState<ProductPickupSchedule[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingZone, setSavingZone] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [zoneForm, setZoneForm] = useState<ZoneForm>(emptyZoneForm);
  const [locationForm, setLocationForm] =
    useState<LocationForm>(emptyLocationForm);
  const [scheduleForm, setScheduleForm] =
    useState<ScheduleForm>(emptyScheduleForm);

  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const [testProductId, setTestProductId] = useState("");
  const [testLocationId, setTestLocationId] = useState("");
  const [testServiceDate, setTestServiceDate] = useState("");
  const [testResult, setTestResult] = useState<ResolvePickupResponse | null>(
    null
  );

  const [importProductId, setImportProductId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSelectedDays, setImportSelectedDays] = useState<string[]>([]);
  const [importUpdateExisting, setImportUpdateExisting] = useState(false);
  const [previewingImport, setPreviewingImport] = useState(false);
  const [committingImport, setCommittingImport] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  async function loadData() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [productsResponse, zonesResponse, locationsResponse, schedulesResponse] =
        await Promise.all([
          api.get<ExperienceProduct[]>("/ticketing/products/", {
            params: {
              ...requestParams,
              status: "active",
            },
          }),
          api.get<PickupZone[]>("/ticketing/pickup-zones/", {
            params: requestParams,
          }),
          api.get<PickupLocation[]>("/ticketing/pickup-locations/", {
            params: {
              ...requestParams,
              is_active: "true",
            },
          }),
          api.get<ProductPickupSchedule[]>("/ticketing/pickup-schedules/", {
            params: requestParams,
          }),
        ]);

      setProducts(productsResponse.data);
      setZones(zonesResponse.data);
      setLocations(locationsResponse.data);
      setSchedules(schedulesResponse.data);
    } catch (err: any) {
      console.error("Could not load pickup schedules:", err);
      setError(
        getErrorMessage(
          err,
          t("pickupSchedules.errors.load")
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [organisationSlug]);

  const pickupProducts = useMemo(() => {
    return products.filter(
      (product) =>
        product.product_type === "excursion" ||
        product.product_type === "transfer" ||
        product.supports_pickup ||
        product.requires_pickup_location
    );
  }, [products]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      const searchText = [
        schedule.product_name,
        schedule.pickup_location_name,
        schedule.pickup_time,
        schedule.pickup_point,
        schedule.instructions,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      if (productFilter && String(schedule.product) !== productFilter) {
        return false;
      }

      if (locationFilter && String(schedule.pickup_location) !== locationFilter) {
        return false;
      }

      return true;
    });
  }, [schedules, search, productFilter, locationFilter]);

  function resetZoneForm() {
    setZoneForm(emptyZoneForm);
  }

  function resetLocationForm() {
    setLocationForm(emptyLocationForm);
  }

  function resetScheduleForm() {
    setScheduleForm(emptyScheduleForm);
  }

  function editZone(zone: PickupZone) {
    setZoneForm({
      id: zone.id,
      name: zone.name,
      description: zone.description || "",
      is_active: zone.is_active,
    });
  }

  function editLocation(location: PickupLocation) {
    setLocationForm({
      id: location.id,
      zone_id: location.zone ? String(location.zone) : "",
      name: location.name || "",
      location_type: location.location_type || "hotel",
      address: location.address || "",
      default_pickup_point: location.default_pickup_point || "",
      default_instructions: location.default_instructions || "",
      google_maps_link: location.google_maps_link || "",
      is_active: location.is_active,
    });
  }

  function editSchedule(schedule: ProductPickupSchedule) {
    setScheduleForm({
      id: schedule.id,
      product_id: String(schedule.product),
      pickup_location_id: String(schedule.pickup_location),
      day_of_week:
        schedule.day_of_week === null || schedule.day_of_week === undefined
          ? ""
          : String(schedule.day_of_week),
      specific_date: schedule.specific_date || "",
      pickup_time: schedule.pickup_time || "",
      pickup_point: schedule.pickup_point || "",
      instructions: schedule.instructions || "",
      is_active: schedule.is_active,
    });
  }

  async function saveZone() {
    if (!zoneForm.name.trim()) {
      setError(t("pickupSchedules.validation.zoneNameRequired"));
      return;
    }

    try {
      setSavingZone(true);
      setError("");
      setSavedMessage("");

      const payload = {
        name: zoneForm.name.trim(),
        description: zoneForm.description,
        is_active: zoneForm.is_active,
      };

      if (zoneForm.id) {
        await api.patch(`/ticketing/pickup-zones/${zoneForm.id}/`, payload, {
          params: requestParams,
        });
        setSavedMessage(t("pickupSchedules.messages.zoneUpdated"));
      } else {
        await api.post("/ticketing/pickup-zones/", payload, {
          params: requestParams,
        });
        setSavedMessage(t("pickupSchedules.messages.zoneCreated"));
      }

      resetZoneForm();
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err, t("pickupSchedules.errors.saveZone")));
    } finally {
      setSavingZone(false);
    }
  }

  async function saveLocation() {
    if (!locationForm.name.trim()) {
      setError(t("pickupSchedules.validation.locationNameRequired"));
      return;
    }

    try {
      setSavingLocation(true);
      setError("");
      setSavedMessage("");

      const zoneValue = locationForm.zone_id ? Number(locationForm.zone_id) : null;

      const locationName = locationForm.name.trim();

      const payload = {
        zone: zoneValue,
        zone_id: zoneValue,
        name: locationName,
        slug: slugify(locationName),
        location_type: locationForm.location_type,
        address: locationForm.address,
        default_pickup_point: locationForm.default_pickup_point,
        default_instructions: locationForm.default_instructions,
        google_maps_link: locationForm.google_maps_link,
        is_active: locationForm.is_active,
      };

      if (locationForm.id) {
        await api.patch(
          `/ticketing/pickup-locations/${locationForm.id}/`,
          payload,
          {
            params: requestParams,
          }
        );
        setSavedMessage(t("pickupSchedules.messages.locationUpdated"));
      } else {
        await api.post("/ticketing/pickup-locations/", payload, {
          params: requestParams,
        });
        setSavedMessage(t("pickupSchedules.messages.locationCreated"));
      }

      resetLocationForm();
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err, t("pickupSchedules.errors.saveLocation")));
    } finally {
      setSavingLocation(false);
    }
  }

  async function saveSchedule() {
    if (!scheduleForm.product_id) {
      setError(t("pickupSchedules.validation.selectProduct"));
      return;
    }

    if (!scheduleForm.pickup_location_id) {
      setError(t("pickupSchedules.validation.selectLocation"));
      return;
    }

    if (!scheduleForm.pickup_time) {
      setError(t("pickupSchedules.validation.pickupTimeRequired"));
      return;
    }

    try {
      setSavingSchedule(true);
      setError("");
      setSavedMessage("");

      const productValue = Number(scheduleForm.product_id);
      const pickupLocationValue = Number(scheduleForm.pickup_location_id);

      const payload = {
        product: productValue,
        product_id: productValue,
        pickup_location: pickupLocationValue,
        pickup_location_id: pickupLocationValue,
        day_of_week:
          scheduleForm.specific_date || scheduleForm.day_of_week === ""
            ? null
            : Number(scheduleForm.day_of_week),
        specific_date: scheduleForm.specific_date || null,
        pickup_time: scheduleForm.pickup_time,
        pickup_point: scheduleForm.pickup_point,
        instructions: scheduleForm.instructions,
        is_active: scheduleForm.is_active,
      };

      if (scheduleForm.id) {
        await api.patch(
          `/ticketing/pickup-schedules/${scheduleForm.id}/`,
          payload,
          {
            params: requestParams,
          }
        );
        setSavedMessage(t("pickupSchedules.messages.scheduleUpdated"));
      } else {
        await api.post("/ticketing/pickup-schedules/", payload, {
          params: requestParams,
        });
        setSavedMessage(t("pickupSchedules.messages.scheduleCreated"));
      }

      resetScheduleForm();
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err, t("pickupSchedules.errors.saveSchedule")));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function deleteItem(
    type: "zone" | "location" | "schedule",
    id: number
  ) {
    const confirmed = window.confirm(t("pickupSchedules.confirm.delete"));

    if (!confirmed) return;

    const key = `${type}-${id}`;

    try {
      setDeletingId(key);
      setError("");
      setSavedMessage("");

      if (type === "zone") {
        await api.delete(`/ticketing/pickup-zones/${id}/`, {
          params: requestParams,
        });
      }

      if (type === "location") {
        await api.delete(`/ticketing/pickup-locations/${id}/`, {
          params: requestParams,
        });
      }

      if (type === "schedule") {
        await api.delete(`/ticketing/pickup-schedules/${id}/`, {
          params: requestParams,
        });
      }

      setSavedMessage(t("pickupSchedules.messages.itemDeleted"));
      await loadData();
    } catch (err: any) {
      setError(getErrorMessage(err, t("pickupSchedules.errors.deleteItem")));
    } finally {
      setDeletingId(null);
    }
  }

  function downloadImportTemplate() {
    const csvRows = [
      ["hotel", "pickup_time", "zone", "pickup_point", "instructions", "day_of_week", "specific_date"],
      ["Hard Rock Punta Cana", "07:15", "Bavaro", "Main lobby", "Wait 10 minutes before pickup", "", ""],
      ["Majestic Colonial", "07:25", "Bavaro", "Reception", "", "", ""],
    ];

    const csvContent = csvRows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pickup-schedule-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function submitImport(mode: "preview" | "import") {
    if (!importProductId) {
      setError(t("pickupSchedules.validation.importProductRequired"));
      return;
    }

    if (!importFile) {
      setError(t("pickupSchedules.validation.csvRequired"));
      return;
    }

    try {
      if (mode === "preview") {
        setPreviewingImport(true);
      } else {
        setCommittingImport(true);
      }

      setError("");
      setSavedMessage("");

      const preparedImportFile = await buildImportFileForSelectedDays(
        importFile,
        importSelectedDays
      );

      const formData = new FormData();
      formData.append("product", importProductId);
      formData.append("product_id", importProductId);
      formData.append("file", preparedImportFile);
      formData.append("mode", mode);
      formData.append("update_existing", importUpdateExisting ? "true" : "false");

      const response = await api.post<ImportResponse>(
        "/ticketing/pickup-schedules/import-csv/",
        formData,
        {
          params: requestParams,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setImportResult(response.data);

      if (mode === "import") {
        setSavedMessage(
          `${t("pickupSchedules.messages.importCompleted")} ${response.data.summary.created_locations} ${t("pickupSchedules.messages.hotelsCreated")} ${response.data.summary.created_schedules} ${t("pickupSchedules.messages.schedulesCreated")}`
        );
        await loadData();
      }
    } catch (err: any) {
      setError(getErrorMessage(err, t("pickupSchedules.errors.importCsv")));
    } finally {
      setPreviewingImport(false);
      setCommittingImport(false);
    }
  }

  async function testResolver() {
    if (!testProductId || !testLocationId || !testServiceDate) {
      setError(t("pickupSchedules.validation.testFieldsRequired"));
      return;
    }

    try {
      setTesting(true);
      setError("");
      setTestResult(null);

      const response = await api.get<ResolvePickupResponse>(
        "/ticketing/pickup-schedules/resolve/",
        {
          params: {
            ...requestParams,
            product: testProductId,
            product_id: testProductId,
            pickup_location: testLocationId,
            pickup_location_id: testLocationId,
            service_date: testServiceDate,
          },
        }
      );

      setTestResult(response.data);
    } catch (err: any) {
      const data = err?.response?.data;

      if (data) {
        setTestResult({
          found: false,
          message:
            data.detail ||
            data.message ||
            t("pickupSchedules.resolver.notFoundMessage"),
          product: data.product,
          pickup_location: data.pickup_location,
          service_date: data.service_date,
        });
        return;
      }

      setError(getErrorMessage(err, t("pickupSchedules.errors.testResolver")));
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600">
        {t("pickupSchedules.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Clock3 className="h-7 w-7" />
          </div>

          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              {t("pickupSchedules.header.eyebrow")}
            </p>

            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              {t("pickupSchedules.header.title")}
            </h1>

            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-500">
              {t("pickupSchedules.header.description")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          {t("pickupSchedules.actions.refresh")}
        </button>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard
          title={t("pickupSchedules.stats.products.title")}
          value={String(pickupProducts.length)}
          helper={t("pickupSchedules.stats.products.helper")}
          icon={Package}
        />
        <StatCard
          title={t("pickupSchedules.stats.zones.title")}
          value={String(zones.length)}
          helper={t("pickupSchedules.stats.zones.helper")}
          icon={MapPin}
        />
        <StatCard
          title={t("pickupSchedules.stats.hotels.title")}
          value={String(locations.length)}
          helper={t("pickupSchedules.stats.hotels.helper")}
          icon={Hotel}
        />
        <StatCard
          title={t("pickupSchedules.stats.schedules.title")}
          value={String(schedules.length)}
          helper={t("pickupSchedules.stats.schedules.helper")}
          icon={Clock3}
        />
      </section>

      <Panel
        title={t("pickupSchedules.import.title")}
        description={t("pickupSchedules.import.description")}
        icon={FileSpreadsheet}
      >
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto_auto]">
          <Select
            label={t("pickupSchedules.import.productLabel")}
            value={importProductId}
            onChange={setImportProductId}
            options={[
              { value: "", label: t("pickupSchedules.options.selectProduct") },
              ...pickupProducts.map((product) => ({
                value: String(product.id),
                label: product.name,
              })),
            ]}
          />

          <label className="block">
            <span className="text-sm font-bold text-slate-700">{t("pickupSchedules.import.csvLabel")}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setImportFile(event.target.files?.[0] || null);
                setImportResult(null);
              }}
              className="mt-2 block h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={downloadImportTemplate}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              {t("pickupSchedules.import.template")}
            </button>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => submitImport("preview")}
              disabled={previewingImport || committingImport}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-sm font-black text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {previewingImport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("pickupSchedules.import.analyze")}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <Toggle
            label={t("pickupSchedules.import.updateExisting")}
            checked={importUpdateExisting}
            onChange={setImportUpdateExisting}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-slate-800">
                {t("pickupSchedules.import.daysTitle")}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {t("pickupSchedules.import.daysDescription")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setImportSelectedDays([])}
              disabled={!importSelectedDays.length}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {t("pickupSchedules.import.clearDays")}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {importDayOptions.map((day) => {
              const selected = importSelectedDays.includes(day.value);

              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() =>
                    setImportSelectedDays((current) =>
                      toggleStringValue(current, day.value)
                    )
                  }
                  className={[
                    "rounded-2xl border px-4 py-2 text-sm font-black transition",
                    selected
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {day.label}
                </button>
              );
            })}
          </div>

          {importSelectedDays.length > 0 && (
            <p className="mt-3 text-xs font-bold text-amber-700">
              {t("pickupSchedules.import.selectedPrefix")} {importSelectedDays.map((day) => dayLabel(Number(day), dayOptions, t("pickupSchedules.days.everyDay"))).join(", ")}. {t("pickupSchedules.import.selectedSuffix")}
            </p>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-6 text-slate-500">
          {t("pickupSchedules.import.columnsHelp")}
        </div>

        {importResult && (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <ResultBox label={t("pickupSchedules.import.summary.rows")} value={String(importResult.summary.rows_read)} />
              <ResultBox label={t("pickupSchedules.import.summary.newHotels")} value={String(importResult.summary.new_locations)} />
              <ResultBox label={t("pickupSchedules.import.summary.newSchedules")} value={String(importResult.summary.new_schedules)} />
              <ResultBox label={t("pickupSchedules.import.summary.invalid")} value={String(importResult.summary.invalid_rows)} />
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200">
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t("pickupSchedules.table.row")}</Th>
                      <Th>{t("pickupSchedules.table.hotel")}</Th>
                      <Th>{t("pickupSchedules.table.time")}</Th>
                      <Th>{t("pickupSchedules.table.day")}</Th>
                      <Th>{t("pickupSchedules.table.zone")}</Th>
                      <Th>{t("pickupSchedules.table.status")}</Th>
                      <Th>{t("pickupSchedules.table.action")}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {importResult.rows.map((row) => (
                      <tr key={`${row.row_number}-${row.hotel_name}`}>
                        <Td>{row.row_number}</Td>
                        <Td>{row.hotel_name || "—"}</Td>
                        <Td>{row.pickup_time || "—"}</Td>
                        <Td>{dayLabel(row.day_of_week, dayOptions, t("pickupSchedules.days.everyDay"))}</Td>
                        <Td>{row.zone_name || "—"}</Td>
                        <Td>
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-black",
                              row.errors.length
                                ? "bg-red-50 text-red-700"
                                : row.status === "duplicate"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700",
                            ].join(" ")}
                          >
                            {row.errors.length ? t("pickupSchedules.status.error") : t(`pickupSchedules.importStatus.${row.status}`)}
                          </span>
                        </Td>
                        <Td>
                          {row.errors.length ? row.errors.join(", ") : row.action}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold leading-6 text-slate-500">
                {t("pickupSchedules.import.reviewHelp")}
              </p>

              <button
                type="button"
                onClick={() => submitImport("import")}
                disabled={committingImport || previewingImport || importResult.summary.valid_rows === 0}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {committingImport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("pickupSchedules.import.commit")}
              </button>
            </div>
          </div>
        )}
      </Panel>

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {savedMessage && (
        <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          {savedMessage}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-3">
        <Panel
          title={
            zoneForm.id
              ? t("pickupSchedules.zoneForm.editTitle")
              : t("pickupSchedules.zoneForm.createTitle")
          }
           description={t("pickupSchedules.zoneForm.description")}
          icon={MapPin}
        >
          <div className="space-y-4">
            <Input
              label={t("pickupSchedules.zoneForm.nameLabel")}
              value={zoneForm.name}
              onChange={(value) =>
                setZoneForm((current) => ({ ...current, name: value }))
              }
              placeholder={t("pickupSchedules.zoneForm.namePlaceholder")}
            />

            <Textarea
              label={t("pickupSchedules.common.description")}
              value={zoneForm.description}
              onChange={(value) =>
                setZoneForm((current) => ({ ...current, description: value }))
              }
              placeholder={t("pickupSchedules.zoneForm.descriptionPlaceholder")}
            />

            <Toggle
              label={t("pickupSchedules.common.active")}
              checked={zoneForm.is_active}
              onChange={(value) =>
                setZoneForm((current) => ({ ...current, is_active: value }))
              }
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveZone}
                disabled={savingZone}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {savingZone ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : zoneForm.id ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {zoneForm.id ? t("pickupSchedules.actions.updateZone") : t("pickupSchedules.actions.createZone")}
              </button>

              {zoneForm.id && (
                <button
                  type="button"
                  onClick={resetZoneForm}
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
                >
                  {t("pickupSchedules.actions.cancel")}
                </button>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title={
            locationForm.id
              ? t("pickupSchedules.locationForm.editTitle")
              : t("pickupSchedules.locationForm.createTitle")
          }
           description={t("pickupSchedules.locationForm.description")}
          icon={Hotel}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t("pickupSchedules.locationForm.nameLabel")}
              value={locationForm.name}
              onChange={(value) =>
                setLocationForm((current) => ({ ...current, name: value }))
              }
              placeholder={t("pickupSchedules.locationForm.namePlaceholder")}
            />

            <Select
              label={t("pickupSchedules.common.zone")}
              value={locationForm.zone_id}
              onChange={(value) =>
                setLocationForm((current) => ({ ...current, zone_id: value }))
              }
              options={[
                { value: "", label: t("pickupSchedules.options.noZone") },
                ...zones.map((zone) => ({
                  value: String(zone.id),
                  label: zone.name,
                })),
              ]}
            />

            <Select
              label={t("pickupSchedules.locationForm.typeLabel")}
              value={locationForm.location_type}
              onChange={(value) =>
                setLocationForm((current) => ({
                  ...current,
                  location_type: value as PickupLocation["location_type"],
                }))
              }
              options={[
                { value: "hotel", label: t("pickupSchedules.locationTypes.hotel") },
                { value: "airport", label: t("pickupSchedules.locationTypes.airport") },
                { value: "meeting_point", label: t("pickupSchedules.locationTypes.meeting_point") },
                { value: "private_address", label: t("pickupSchedules.locationTypes.private_address") },
                { value: "other", label: t("pickupSchedules.locationTypes.other") },
              ]}
            />

            <Input
              label={t("pickupSchedules.locationForm.defaultPointLabel")}
              value={locationForm.default_pickup_point}
              onChange={(value) =>
                setLocationForm((current) => ({
                  ...current,
                  default_pickup_point: value,
                }))
              }
              placeholder={t("pickupSchedules.locationForm.defaultPointPlaceholder")}
            />

            <Textarea
              label={t("pickupSchedules.locationForm.addressLabel")}
              value={locationForm.address}
              onChange={(value) =>
                setLocationForm((current) => ({ ...current, address: value }))
              }
              placeholder={t("pickupSchedules.locationForm.addressPlaceholder")}
            />

            <Textarea
              label={t("pickupSchedules.locationForm.instructionsLabel")}
              value={locationForm.default_instructions}
              onChange={(value) =>
                setLocationForm((current) => ({
                  ...current,
                  default_instructions: value,
                }))
              }
              placeholder={t("pickupSchedules.locationForm.instructionsPlaceholder")}
            />

            <Input
              label={t("pickupSchedules.locationForm.mapsLabel")}
              value={locationForm.google_maps_link}
              onChange={(value) =>
                setLocationForm((current) => ({
                  ...current,
                  google_maps_link: value,
                }))
              }
              placeholder={t("pickupSchedules.locationForm.mapsPlaceholder")}
            />

            <Toggle
              label={t("pickupSchedules.common.active")}
              checked={locationForm.is_active}
              onChange={(value) =>
                setLocationForm((current) => ({ ...current, is_active: value }))
              }
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={saveLocation}
              disabled={savingLocation}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {savingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : locationForm.id ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {locationForm.id ? t("pickupSchedules.actions.updateLocation") : t("pickupSchedules.actions.createLocation")}
            </button>

            {locationForm.id && (
              <button
                type="button"
                onClick={resetLocationForm}
                className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
              >
                {t("pickupSchedules.actions.cancel")}
              </button>
            )}
          </div>
        </Panel>

        <Panel
          title={
            scheduleForm.id
              ? t("pickupSchedules.scheduleForm.editTitle")
              : t("pickupSchedules.scheduleForm.createTitle")
          }
           description={t("pickupSchedules.scheduleForm.description")}
          icon={Clock3}
          className="xl:col-span-3"
        >
          <div className="grid gap-4 lg:grid-cols-4">
            <Select
              label={t("pickupSchedules.common.product")}
              value={scheduleForm.product_id}
              onChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  product_id: value,
                }))
              }
              options={[
                { value: "", label: t("pickupSchedules.options.selectProduct") },
                ...pickupProducts.map((product) => ({
                  value: String(product.id),
                  label: `${product.name} (${productTypeLabel(product.product_type, t)})`,
                })),
              ]}
            />

            <Select
              label={t("pickupSchedules.common.location")}
              value={scheduleForm.pickup_location_id}
              onChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  pickup_location_id: value,
                }))
              }
              options={[
                { value: "", label: t("pickupSchedules.options.selectLocation") },
                ...locations.map((location) => ({
                  value: String(location.id),
                  label: location.name,
                })),
              ]}
            />

            <Select
              label={t("pickupSchedules.scheduleForm.dayLabel")}
              value={scheduleForm.day_of_week}
              onChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  day_of_week: value,
                }))
              }
              options={dayOptions}
            />

            <Input
              label={t("pickupSchedules.scheduleForm.specificDateLabel")}
              type="date"
              value={scheduleForm.specific_date}
              onChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  specific_date: value,
                }))
              }
            />

            <Input
              label={t("pickupSchedules.common.pickupTime")}
              type="time"
              value={scheduleForm.pickup_time}
              onChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  pickup_time: value,
                }))
              }
            />

            <Input
              label={t("pickupSchedules.scheduleForm.pointOverrideLabel")}
              value={scheduleForm.pickup_point}
              onChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  pickup_point: value,
                }))
              }
              placeholder={t("pickupSchedules.scheduleForm.pointOverridePlaceholder")}
            />

            <Toggle
              label={t("pickupSchedules.common.active")}
              checked={scheduleForm.is_active}
              onChange={(value) =>
                setScheduleForm((current) => ({ ...current, is_active: value }))
              }
            />

            <div className="flex items-end">
              <button
                type="button"
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {savingSchedule ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : scheduleForm.id ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {scheduleForm.id ? t("pickupSchedules.actions.updateSchedule") : t("pickupSchedules.actions.createSchedule")}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <Textarea
              label={t("pickupSchedules.scheduleForm.instructionsLabel")}
              value={scheduleForm.instructions}
              onChange={(value) =>
                setScheduleForm((current) => ({
                  ...current,
                  instructions: value,
                }))
              }
              placeholder={t("pickupSchedules.scheduleForm.instructionsPlaceholder")}
            />
          </div>

          {scheduleForm.id && (
            <button
              type="button"
              onClick={resetScheduleForm}
              className="mt-3 h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              {t("pickupSchedules.actions.cancel")} edit
            </button>
          )}
        </Panel>
      </section>

      <Panel
        title={t("pickupSchedules.resolver.title")}
         description={t("pickupSchedules.resolver.description")}
        icon={CalendarDays}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_220px_170px]">
          <Select
            label={t("pickupSchedules.common.product")}
            value={testProductId}
            onChange={setTestProductId}
            options={[
              { value: "", label: t("pickupSchedules.options.selectProduct") },
              ...pickupProducts.map((product) => ({
                value: String(product.id),
                label: product.name,
              })),
            ]}
          />

          <Select
            label={t("pickupSchedules.common.location")}
            value={testLocationId}
            onChange={setTestLocationId}
            options={[
              { value: "", label: t("pickupSchedules.options.selectLocation") },
              ...locations.map((location) => ({
                value: String(location.id),
                label: location.name,
              })),
            ]}
          />

          <Input
            label={t("pickupSchedules.resolver.serviceDateLabel")}
            type="date"
            value={testServiceDate}
            onChange={setTestServiceDate}
          />

          <div className="flex items-end">
            <button
              type="button"
              onClick={testResolver}
              disabled={testing}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-sm font-black text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {t("pickupSchedules.actions.test")}
            </button>
          </div>
        </div>

        {testResult && (
          <div
            className={[
              "mt-5 rounded-3xl border p-5",
              testResult.found
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50",
            ].join(" ")}
          >
            {testResult.found ? (
              <>
                <p className="text-sm font-black uppercase tracking-wide text-emerald-700">
                  {t("pickupSchedules.resolver.found")}
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <ResultBox
                    label={t("pickupSchedules.resolver.time")}
                    value={formatTime(testResult.schedule?.pickup_time, language)}
                  />
                  <ResultBox
                    label={t("pickupSchedules.resolver.pickupPoint")}
                    value={
                      testResult.schedule?.resolved_pickup_point ||
                      testResult.schedule?.pickup_point ||
                      "—"
                    }
                  />
                  <ResultBox
                    label={t("pickupSchedules.resolver.schedule")}
                    value={
                      testResult.schedule?.specific_date
                        ? `${t("pickupSchedules.common.specificDate")}: ${testResult.schedule.specific_date}`
                        : dayLabel(testResult.schedule?.day_of_week, dayOptions, t("pickupSchedules.days.everyDay"))
                    }
                  />
                </div>

                {testResult.schedule?.instructions && (
                  <p className="mt-3 text-sm font-semibold leading-6 text-emerald-800">
                    {testResult.schedule.instructions}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-black uppercase tracking-wide text-amber-700">
                  {t("pickupSchedules.resolver.notFound")}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                  {testResult.message ||
                    t("pickupSchedules.resolver.notFoundMessage")}
                </p>
              </>
            )}
          </div>
        )}
      </Panel>

      <section className="grid gap-5 xl:grid-cols-3">
        <Panel title={t("pickupSchedules.zonesList.title")} description={t("pickupSchedules.zonesList.description")} icon={MapPin}>
          <div className="space-y-3">
            {zones.length === 0 ? (
              <EmptyState text={t("pickupSchedules.empty.zones")} />
            ) : (
              zones.map((zone) => (
                <div
                  key={zone.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {zone.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        {zone.description || t("pickupSchedules.common.noDescription")}
                      </p>
                    </div>

                    <RowActions
                      onEdit={() => editZone(zone)}
                      onDelete={() => deleteItem("zone", zone.id)}
                      deleting={deletingId === `zone-${zone.id}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title={t("pickupSchedules.locationsList.title")}
          description={t("pickupSchedules.locationsList.description")}
          icon={Hotel}
          className="xl:col-span-2"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {locations.length === 0 ? (
              <EmptyState text={t("pickupSchedules.empty.locations")} />
            ) : (
              locations.map((location) => (
                <div
                  key={location.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {location.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {location.zone_name || t("pickupSchedules.options.noZone")} ·{" "}
                        {t(`pickupSchedules.locationTypes.${location.location_type}`)}
                      </p>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                        {t("pickupSchedules.common.pickupPoint")}:{" "}
                        <span className="font-black text-slate-700">
                          {location.default_pickup_point || t("pickupSchedules.common.notSet")}
                        </span>
                      </p>
                    </div>

                    <RowActions
                      onEdit={() => editLocation(location)}
                      onDelete={() => deleteItem("location", location.id)}
                      deleting={deletingId === `location-${location.id}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      <Panel
        title={t("pickupSchedules.schedulesList.title")}
         description={t("pickupSchedules.schedulesList.description")}
        icon={Clock3}
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("pickupSchedules.filters.searchPlaceholder")}
              className="h-full flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </div>

          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
          >
            <option value="">{t("pickupSchedules.filters.allProducts")}</option>
            {pickupProducts.map((product) => (
              <option key={product.id} value={String(product.id)}>
                {product.name}
              </option>
            ))}
          </select>

          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
          >
            <option value="">{t("pickupSchedules.filters.allHotels")}</option>
            {locations.map((location) => (
              <option key={location.id} value={String(location.id)}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
          {filteredSchedules.length === 0 ? (
            <EmptyState text={t("pickupSchedules.empty.schedules")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>{t("pickupSchedules.table.product")}</Th>
                    <Th>{t("pickupSchedules.table.location")}</Th>
                    <Th>{t("pickupSchedules.table.rule")}</Th>
                    <Th>{t("pickupSchedules.table.pickupTime")}</Th>
                    <Th>{t("pickupSchedules.table.pickupPoint")}</Th>
                    <Th>{t("pickupSchedules.table.status")}</Th>
                    <Th>{t("pickupSchedules.table.actions")}</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredSchedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <Td>
                        <span className="font-black text-slate-900">
                          {schedule.product_name || `${t("pickupSchedules.common.product")} #${schedule.product}`}
                        </span>
                      </Td>
                      <Td>
                        {schedule.pickup_location_name ||
                          `${t("pickupSchedules.common.locationShort")} #${schedule.pickup_location}`}
                      </Td>
                      <Td>
                        {schedule.specific_date
                          ? `${t("pickupSchedules.common.specificDate")}: ${schedule.specific_date}`
                          : dayLabel(schedule.day_of_week, dayOptions, t("pickupSchedules.days.everyDay"))}
                      </Td>
                      <Td>
                        <span className="font-black text-amber-700">
                          {formatTime(schedule.pickup_time, language)}
                        </span>
                      </Td>
                      <Td>
                        {schedule.resolved_pickup_point ||
                          schedule.pickup_point ||
                          t("pickupSchedules.common.defaultPickupPoint")}
                      </Td>
                      <Td>
                        <span
                          className={[
                            "rounded-full px-2.5 py-1 text-xs font-black",
                            schedule.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500",
                          ].join(" ")}
                        >
                          {schedule.is_active ? t("pickupSchedules.status.active") : t("pickupSchedules.status.inactive")}
                        </span>
                      </Td>
                      <Td>
                        <RowActions
                          onEdit={() => editSchedule(schedule)}
                          onDelete={() => deleteItem("schedule", schedule.id)}
                          deleting={deletingId === `schedule-${schedule.id}`}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function StatCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="h-6 w-6 text-amber-600" />
      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">{value}</h2>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  className = "",
  children,
}: {
  title: string;
  description: string;
  icon: typeof Clock3;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />
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
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
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
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-black text-slate-800">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-amber-500"
      />
    </label>
  );
}

function RowActions({
  onEdit,
  onDelete,
  deleting,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTicketingAdminTranslation();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
        title={t("pickupSchedules.actions.edit")}
      >
        <Edit3 className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="rounded-xl border border-red-200 bg-white p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        title={t("pickupSchedules.actions.delete")}
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function ResultBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-emerald-950">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-600">
      {children}
    </td>
  );
}
