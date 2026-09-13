"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Workflow, Plus, Pencil, Trash2, RefreshCw, Search, Loader2, AlertTriangle, XCircle, FileSearch } from "lucide-react";
import { RiskBadge } from "../../components/ui/RiskBadge";
import { useToast } from "../../components/ui/Toast";
import { FeedSkeleton } from "../../components/ui/Skeleton";
import {
  useRules, listFeatures, createRule, updateRule, deleteRule,
  type FraudRule, type RuleInput,
} from "../../lib/api";
import { clsx } from "clsx";

const ACTIONS = ["BLOCK", "CHALLENGE", "REVIEW", "FLAG"] as const;

const ACTION_STYLE: Record<string, string> = {
  BLOCK: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  CHALLENGE: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  REVIEW: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  FLAG: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
};

type EditorMode = { kind: "create" } | { kind: "edit"; rule: FraudRule } | null;

function EditorModal({
  mode, features, onClose, onSaved,
}: {
  mode: EditorMode;
  features: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode?.kind === "edit" ? mode.rule : null;
  const [form, setForm] = useState<RuleInput>(() => ({
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    expression: editing?.expression ?? "",
    score_contribution: editing?.score_contribution ?? 60,
    action: editing?.action ?? "CHALLENGE",
    is_enabled: editing?.is_enabled ?? true,
    priority: editing?.priority ?? 50,
  }));
  const [ruleId, setRuleId] = useState(editing?.rule_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateRule(editing.rule_id, form);
        toast({ kind: "success", title: "Rule updated", message: `${form.name} saved and hot-reloaded into the decision engine.` });
      } else {
        if (!ruleId.trim()) throw new Error("Rule ID is required");
        await createRule({ ...form, rule_id: ruleId.trim() });
        toast({ kind: "success", title: "Rule created", message: `${form.name} is now live in the decision engine.` });
      }
      onSaved();
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Save failed";
      setError(msg);
      toast({ kind: "danger", title: "Save failed", message: msg });
    } finally {
      setSaving(false);
    }
  };

  const filteredFeatures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? features.filter((f) => f.toLowerCase().includes(q)).slice(0, 12) : features.slice(0, 12);
  }, [features, query]);

  const insertFeature = (f: string) => {
    setForm((prev) => ({ ...prev, expression: prev.expression ? `${prev.expression} ${f}` : f }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              {editing ? `Edit ${editing.rule_id}` : "New Fraud Rule"}
            </h2>
            <p className="text-xs text-slate-500">
              Expressions are evaluated against 56 live features via a safe AST parser (never eval)
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs text-slate-400">
              Rule ID
              <input
                disabled={!!editing}
                value={ruleId}
                onChange={(e) => setRuleId(e.target.value)}
                placeholder="RULE_017"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/60 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Impossible Travel"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/60"
              />
            </label>
          </div>

          <label className="block text-xs text-slate-400">
            Description
            <input
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this rule detects"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/60"
            />
          </label>

          <div>
            <label className="block text-xs text-slate-400">
              Expression — must reference at least one feature
            </label>
            <textarea
              value={form.expression}
              onChange={(e) => setForm((f) => ({ ...f, expression: e.target.value }))}
              placeholder="geo_distance_from_last_login_km > 500 and hours_since_last_login < 2"
              rows={3}
              className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-cyan-200 outline-none focus:ring-2 focus:ring-cyan-500/60"
            />
            <div className="mt-2 flex items-center gap-2">
              <Search size={13} className="text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search features to insert…"
                className="flex-1 rounded border border-white/5 bg-black/20 px-2 py-1 text-[11px] text-slate-300 outline-none"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filteredFeatures.map((f) => (
                <button
                  key={f}
                  onClick={() => insertFeature(f)}
                  className="rounded border border-cyan-500/20 bg-cyan-500/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label className="block text-xs text-slate-400">
              Score contribution
              <input
                type="number"
                min={0}
                max={100}
                value={form.score_contribution}
                onChange={(e) => setForm((f) => ({ ...f, score_contribution: Number(e.target.value) }))}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/60"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Action
              <select
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/60"
              >
                {ACTIONS.map((a) => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Priority
              <input
                type="number"
                min={0}
                max={100}
                value={form.priority ?? 50}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/60"
              />
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.is_enabled ?? true}
              onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
              className="h-4 w-4 accent-cyan-400"
            />
            Rule enabled (takes effect immediately — cache hot-reloads on save)
          </label>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !form.name || !form.expression}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create rule"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function RulesPage() {
  const { rules, error, loading, refresh } = useRules();
  const { toast } = useToast();
  const [features, setFeatures] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [confirmDelete, setConfirmDelete] = useState<FraudRule | null>(null);
  const [search, setSearch] = useState("");
  const [filterEnabled, setFilterEnabled] = useState<"all" | "enabled" | "disabled">("all");

  useEffect(() => {
    listFeatures().then(setFeatures).catch(() => setFeatures([]));
  }, []);

  const filtered = useMemo(() => {
    if (!rules) return [];
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (q && !(`${r.name} ${r.rule_id} ${r.expression}`.toLowerCase().includes(q))) return false;
      if (filterEnabled === "enabled" && !r.is_enabled) return false;
      if (filterEnabled === "disabled" && r.is_enabled) return false;
      return true;
    });
  }, [rules, search, filterEnabled]);

  const stats = useMemo(() => ({
    total: rules?.length ?? 0,
    enabled: rules?.filter((r) => r.is_enabled).length ?? 0,
    totalHits: rules?.reduce((s, r) => s + r.hit_count, 0) ?? 0,
  }), [rules]);

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await deleteRule(confirmDelete.rule_id);
      setConfirmDelete(null);
      void refresh();
      toast({ kind: "success", title: "Rule deleted", message: `${confirmDelete.name} removed and hot-unloaded from the engine.` });
    } catch {
      setConfirmDelete(null);
      toast({ kind: "danger", title: "Delete failed", message: "The rule could not be removed — check engine availability." });
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6 lg:p-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Workflow className="h-8 w-8 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-md">Rules Engine</h1>
            <p className="text-sm text-slate-400">
              {stats.enabled}/{stats.total} active · {stats.totalHits.toLocaleString()} lifetime hits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter rules…"
              className="w-40 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {(["all", "enabled", "disabled"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterEnabled(mode)}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                  filterEnabled === mode ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10"
            aria-label="Refresh rules"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setEditor({ kind: "create" })}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-cyan-400 hover:to-indigo-400"
          >
            <Plus size={16} /> New Rule
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          {error} — the risk engine must be healthy and seeded (make seed-rules).
        </p>
      )}

      {/* Rules list */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-4 pr-1">
        {loading && rules === null && <FeedSkeleton items={4} />}

        {filtered.map((rule, i) => (
          <motion.div
            key={rule.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            whileHover={{ x: 4 }}
            className={clsx(
              "group relative rounded-xl border bg-slate-900/40 p-4 pl-5 transition-all hover:border-cyan-500/30 hover:shadow-[0_0_24px_rgba(34,211,238,0.08)]",
              rule.is_enabled ? "border-white/10" : "border-white/5 opacity-60"
            )}
          >
            <span
              className={clsx(
                "absolute left-0 top-0 h-full w-0.5 rounded-l-xl transition-opacity",
                rule.is_enabled ? "bg-gradient-to-b from-cyan-400 to-indigo-500 opacity-70" : "bg-slate-700 opacity-40"
              )}
            />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{rule.rule_id}</span>
                  <h3 className="font-semibold text-slate-100">{rule.name}</h3>
                  <span className={clsx("rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide", ACTION_STYLE[rule.action] ?? ACTION_STYLE.FLAG)}>
                    {rule.action}
                  </span>
                  {!rule.is_enabled && (
                    <span className="rounded border border-slate-600/30 bg-slate-700/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                      DISABLED
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">{rule.description || "No description"}</p>
                <code className="mt-2 block truncate rounded-md bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-cyan-200">
                  {rule.expression}
                </code>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <RiskBadge score={rule.score_contribution} />
                  <p className="mt-1 text-[10px] text-slate-500">
                    hits: <span className="font-mono text-slate-300">{rule.hit_count.toLocaleString()}</span>
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setEditor({ kind: "edit", rule })}
                    className="rounded-md border border-white/10 p-1.5 text-slate-400 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
                    aria-label={`Edit ${rule.rule_id}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(rule)}
                    className="rounded-md border border-white/10 p-1.5 text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label={`Delete ${rule.rule_id}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {!loading && filtered.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
            <FileSearch className="h-10 w-10 text-slate-600" />
            <p className="text-sm">No rules match. Seed defaults with <code className="rounded bg-white/5 px-1">make seed-rules</code>.</p>
          </div>
        )}
      </div>

      {/* Editor modal */}
      <AnimatePresence>
        {editor && (
          <EditorModal
            mode={editor}
            features={features}
            onClose={() => setEditor(null)}
            onSaved={() => { setEditor(null); void refresh(); }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-rose-500/20 bg-slate-900/95 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-6 w-6 text-rose-400" />
                <div>
                  <h3 className="font-bold text-white">Delete {confirmDelete.rule_id}?</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    “{confirmDelete.name}” will stop firing immediately. Lifetime hit stats are lost.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void remove()}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
                >
                  Delete rule
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
