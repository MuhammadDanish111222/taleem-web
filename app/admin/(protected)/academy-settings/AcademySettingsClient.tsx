"use client";

import { useCallback, useEffect, useState } from "react";
import { academySettingsMutationSchema } from "@/lib/validation/academySettings";

async function csrf(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  const data = await response.json();
  return data.csrfToken;
}

export default function AcademySettingsClient() {
  const [visible, setVisible] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedSuccessfully, setLoadedSuccessfully] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatusMessage("");
    setIsError(false);
    try {
      const response = await fetch("/api/admin/academy-settings", { cache: "no-store" });
      if (!response.ok) {
        setStatusMessage("Settings are unavailable.");
        setIsError(true);
        setLoadedSuccessfully(false);
        return;
      }
      const json = await response.json();
      if (json.data) {
        setVisible(Boolean(json.data.visible));
        setWhatsappNumber(json.data.whatsapp_number ?? "");
        setMessageTemplate(json.data.whatsapp_message_template ?? "");
      }
      setLoadedSuccessfully(true);
    } catch {
      setStatusMessage("Failed to load academy settings.");
      setIsError(true);
      setLoadedSuccessfully(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const validationResult = academySettingsMutationSchema.safeParse({
    visible,
    whatsapp_number: whatsappNumber,
    whatsapp_message_template: messageTemplate,
  });
  const formValid = validationResult.success;
  const canSave = loadedSuccessfully && formValid && !saving && !loading;

  const previewNumber = whatsappNumber.replace(/^\+/, "").replace(/[\s()\-]/g, "");
  const previewUrl =
    formValid && previewNumber.length >= 7 && previewNumber.length <= 15
      ? `https://wa.me/${previewNumber}${
          messageTemplate.trim() ? `?text=${encodeURIComponent(messageTemplate.trim())}` : ""
        }`
      : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setStatusMessage("");
    setIsError(false);

    try {
      const token = await csrf();
      const response = await fetch("/api/admin/academy-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": token,
        },
        body: JSON.stringify({
          visible,
          whatsapp_number: whatsappNumber,
          whatsapp_message_template: messageTemplate,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        await load();
        setStatusMessage("Academy settings saved successfully.");
        setIsError(false);
      } else {
        const errorDetail =
          data.errors && Array.isArray(data.errors)
            ? data.errors.map((e: { message?: string }) => e.message).filter(Boolean).join(", ")
            : data.code ?? "ACADEMY_SETTINGS_REJECTED";
        setStatusMessage(`Save failed: ${errorDetail}`);
        setIsError(true);
      }
    } catch {
      setStatusMessage("Failed to save academy settings.");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  };

  const inputsDisabled = loading || saving || !loadedSuccessfully;

  return (
    <section className="p-8 max-w-3xl text-slate-900">
      <h1 className="text-3xl font-bold text-slate-900">Academy Settings</h1>
      <p className="mt-2 text-sm font-medium text-slate-600">
        Configure public WhatsApp support contact details. These settings are read directly by the
        student application from Firestore.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-slate-900">
        <div className="flex items-center gap-3">
          <input
            id="visible-toggle"
            type="checkbox"
            checked={visible}
            disabled={inputsDisabled}
            onChange={(e) => setVisible(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="visible-toggle" className="text-sm font-semibold text-slate-800">
            Show WhatsApp Support Action on Student Pages
          </label>
        </div>

        <div>
          <label htmlFor="whatsapp-number" className="block text-sm font-semibold text-slate-800">
            WhatsApp Phone Number
          </label>
          <p className="mt-1 text-xs font-medium text-slate-500">
            International format without leading + or 0 (e.g. <code>923345405945</code>). Must be 7–15 digits.
          </p>
          <input
            id="whatsapp-number"
            type="text"
            required
            disabled={inputsDisabled}
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="923345405945"
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="message-template" className="block text-sm font-semibold text-slate-800">
            Default Message Template (optional, max 500 characters)
          </label>
          <textarea
            id="message-template"
            rows={3}
            maxLength={500}
            disabled={inputsDisabled}
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            placeholder="Salam Sir Danish, I have a question regarding Taleem AI..."
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        {previewUrl && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-xs">
            <span className="font-bold text-slate-800">Live Link Preview: </span>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-700 underline hover:text-blue-900"
            >
              {previewUrl}
            </a>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 focus:outline-none disabled:opacity-50"
          >
            {loading ? "Loading..." : saving ? "Saving..." : "Save Settings"}
          </button>
          {!loading && !loadedSuccessfully && isError && (
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
          )}
          {statusMessage && (
            <p
              role="status"
              className={`text-sm font-semibold ${isError ? "text-red-700" : "text-emerald-700"}`}
            >
              {statusMessage}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
