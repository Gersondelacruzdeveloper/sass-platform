import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, History,
  RotateCcw, ShieldCheck, Upload, XCircle,
} from "lucide-react";
import {
  applyTrainingImport, downloadTrainingImportTemplate, getTrainingImportJobs,
  previewTrainingImport, rollbackTrainingImport,
} from "./api";
import type { ImportJob } from "./types";

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ImportJob["status"] }) {
  const styles: Record<ImportJob["status"], string> = {
    preview: "bg-blue-50 text-blue-700",
    applied: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
    rolled_back: "bg-slate-100 text-slate-600",
  };
  const labels = { preview: "Vista previa", applied: "Aplicado", failed: "Falló", rolled_back: "Revertido" };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[status]}`}>{labels[status]}</span>;
}

export default function ImportCenterPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshHistory() {
    try { setHistory(await getTrainingImportJobs()); } catch { /* keep page usable */ }
  }

  useEffect(() => { refreshHistory(); }, []);

  const canApply = Boolean(job?.preview?.valid && job.status === "preview");
  const counts = job?.preview?.counts;

  async function handlePreview() {
    if (!selectedFile) return;
    setLoading(true); setMessage("");
    try {
      const next = await previewTrainingImport(selectedFile);
      setJob(next);
      setMessage(next.preview.valid ? "Archivo validado. Revisa el resumen antes de aplicar." : "Hay errores que debes corregir antes de importar.");
      await refreshHistory();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "No se pudo leer el archivo.");
    } finally { setLoading(false); }
  }

  async function handleApply() {
    if (!job || !canApply) return;
    setLoading(true); setMessage("");
    try {
      const response: any = await applyTrainingImport(job.id);
      setJob((current) => current ? { ...current, status: response.status, result: response.result, applied_at: new Date().toISOString() } : current);
      setMessage("Importación aplicada correctamente.");
      await refreshHistory();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "La importación no pudo aplicarse.");
    } finally { setLoading(false); }
  }

  async function handleRollback(id: number) {
    if (!window.confirm("¿Revertir esta importación? Solo se revertirán los cambios registrados por este job.")) return;
    setLoading(true);
    try {
      await rollbackTrainingImport(id);
      setMessage("Importación revertida.");
      if (job?.id === id) setJob({ ...job, status: "rolled_back" });
      await refreshHistory();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "No se pudo revertir.");
    } finally { setLoading(false); }
  }

  const summaryRows = useMemo(() => Object.entries(job?.result?.summary || {}), [job]);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80">
              <ShieldCheck size={16} /> Training Import Center
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">Carga todo sin crear registros uno por uno.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 md:text-base">
              Sube estándares, procedimientos, plantillas y preguntas. Primero validamos; nada cambia hasta que presiones Aplicar.
            </p>
          </div>
          <button type="button" onClick={downloadTrainingImportTemplate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950">
            <Download size={18}/> Plantilla vacía
          </button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2 rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
          <h2 className="text-xl font-black text-slate-950">1. Selecciona el Excel</h2>
          <p className="mt-1 text-sm text-slate-500">Formato .xlsx · máximo 10 MB</p>
          <input ref={inputRef} data-testid="import-file" type="file" accept=".xlsx" className="hidden" onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setJob(null); setMessage(""); }} />
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 flex min-h-36 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-slate-400">
            <FileSpreadsheet size={34} className="text-slate-500"/>
            <span className="mt-3 font-black text-slate-800">{selectedFile?.name || "Elegir archivo"}</span>
            <span className="mt-1 text-xs text-slate-500">El archivo no se aplica automáticamente.</span>
          </button>
          <button type="button" disabled={!selectedFile || loading} onClick={handlePreview} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Upload size={18}/>{loading ? "Procesando..." : "Validar y ver preview"}
          </button>
        </div>

        <div className="xl:col-span-3 rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-black text-slate-950">2. Vista previa</h2><p className="mt-1 text-sm text-slate-500">Confirma lo que se va a crear o actualizar.</p></div>
            {job && <StatusBadge status={job.status}/>} 
          </div>
          {!job ? (
            <div className="mt-8 rounded-3xl bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">Sube un archivo para ver el resumen aquí.</div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <CountCard label="Estándares" value={counts?.standards || 0}/><CountCard label="Procedimientos" value={counts?.procedures || 0}/><CountCard label="Plantillas" value={counts?.templates || 0}/><CountCard label="Preguntas" value={counts?.questions || 0}/>
              </div>
              {job.preview.errors.length > 0 && <div className="rounded-2xl bg-red-50 p-4"><div className="flex items-center gap-2 font-black text-red-800"><XCircle size={18}/> Errores ({job.preview.errors.length})</div><ul className="mt-2 space-y-1 text-sm text-red-700">{job.preview.errors.map((e,i)=><li key={i}>• {e}</li>)}</ul></div>}
              {job.preview.warnings.length > 0 && <div className="rounded-2xl bg-amber-50 p-4"><div className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle size={18}/> Revisar ({job.preview.warnings.length})</div><ul className="mt-2 space-y-1 text-sm text-amber-800">{job.preview.warnings.slice(0,8).map((w,i)=><li key={i}>• {w}</li>)}</ul></div>}
              {job.preview.valid && <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 className="mt-0.5 shrink-0" size={20}/><div><p className="font-black">Listo para importar</p><p className="text-sm">No se encontraron errores bloqueantes. Las advertencias pueden revisarse antes de continuar.</p></div></div>}
              <button type="button" disabled={!canApply || loading} onClick={handleApply} className="min-h-12 w-full rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">3. Aplicar importación</button>
            </div>
          )}
        </div>
      </section>

      {message && <div aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">{message}</div>}

      {summaryRows.length > 0 && <section className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6"><h2 className="text-xl font-black">Resultado</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{summaryRows.map(([name,data])=><div key={name} className="rounded-2xl bg-slate-50 p-4"><p className="font-black capitalize">{name}</p><p className="mt-2 text-sm text-slate-600">Creados: {data.created} · Actualizados: {data.updated}{typeof data.protected === "number" ? ` · Protegidos: ${data.protected}` : ""}</p></div>)}</div></section>}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex items-center gap-2"><History size={20}/><h2 className="text-xl font-black">Historial de importaciones</h2></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-400"><th className="py-3 pr-4">Archivo</th><th className="py-3 pr-4">Dataset</th><th className="py-3 pr-4">Estado</th><th className="py-3 pr-4">Creado</th><th className="py-3 text-right">Acción</th></tr></thead>
            <tbody>{history.map(item=><tr key={item.id} className="border-b border-slate-100"><td className="py-4 pr-4 font-bold text-slate-900">{item.file_name}</td><td className="py-4 pr-4 text-slate-500">{item.dataset_key || "—"} {item.dataset_version ? `v${item.dataset_version}` : ""}</td><td className="py-4 pr-4"><StatusBadge status={item.status}/></td><td className="py-4 pr-4 text-slate-500">{new Date(item.created_at).toLocaleString()}</td><td className="py-4 text-right">{item.status === "applied" ? <button type="button" onClick={()=>handleRollback(item.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-700"><RotateCcw size={15}/> Revertir</button> : "—"}</td></tr>)}</tbody>
          </table>
          {history.length === 0 && <div className="py-8 text-center text-sm text-slate-500">Aún no hay importaciones.</div>}
        </div>
      </section>
    </div>
  );
}
