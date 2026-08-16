"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/academy-settings", { cache: "no-store" });
      if (!response.ok) {
        setStatusMessage("Settings are unavailable.");
        setIsError(true);
        return;
      }
      const json = await response.json();
      if (json.data) {
        setVisible(Boolean(json.data.visible));
        setWhatsappNumber(json.data.whatsapp_number ?? "");
        setMessageTemplate(json.data.whatsapp_message_template ?? "");
      }
    } catch {
      setStatusMessage("Failed to load academy settings.");
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previewNumber = whatsappNumber.replace(/^\+/, "").replace(/[\s()\-]/g, "");
  const previewUrl =
    previewNumber.length >= 7 && previewNumber.length <= 15
      ? `https://wa.me/${previewNumber}${
          messageTemplate.trim() ? `?text=${encodeURIComponent(messageTemplate.trim())}` : ""
        }`
      : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || saving) return;

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
        setStatusMessage("Academy settings saved successfully.");
        setIsError(false);
        await load();
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

  return (
    <section className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Academy Settings</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Configure public WhatsApp support contact details. These settings are read directly by the
        student application from Firestore.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <input
            id="visible-toggle"
            type="checkbox"
            checked={visible}
            disabled={loading}
            onChange={(e) => setVisible(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="visible-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Show WhatsApp Support Action on Student Pages
          </label>
        </div>

        <div>
          <label htmlFor="whatsapp-number" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            WhatsApp Phone Number
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            International format without leading + or 0 (e.g. <code>923345405945</code>). Must be 7–15 digits.
          </p>
          <input
            id="whatsapp-number"
            type="text"
            required={visible}
            disabled={loading}
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="923345405945"
            className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label htmlFor="message-template" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            Default Message Template (optional, max 500 characters)
          </label>
          <textarea
            id="message-template"
            rows={3}
            maxLength={500}
            disabled={loading}
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            placeholder="Salam Sir Danish, I have a question regarding Taleem AI..."
            className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {previewUrl && (
          <div className="rounded-md bg-gray-50 p-3 text-xs dark:bg-gray-900/50">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Live Link Preview: </span>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
            >
              {previewUrl}
            </a>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading || saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "Loading..." : saving ? "Saving..." : "Save Settings"}
          </button>
          {statusMessage && (
            <p
              role="status"
              className={`text-sm font-medium ${isError ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
            >
              {statusMessage}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
