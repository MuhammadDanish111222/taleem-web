// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcademySettingsClient from "@/app/admin/(protected)/academy-settings/AcademySettingsClient";

describe("AcademySettingsClient - Gap 2 Form Safety & Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("disables Save button while initial settings are loading", async () => {
    let resolveGet!: (value: Response) => void;
    const getPromise = new Promise<Response>((resolve) => {
      resolveGet = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/academy-settings") {
          return getPromise;
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AcademySettingsClient />);

    const saveButton = screen.getByRole("button", { name: "Loading..." }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    // Resolve GET request
    resolveGet({
      ok: true,
      json: async () => ({
        data: {
          visible: true,
          whatsapp_number: "923345405945",
          whatsapp_message_template: "Salam Sir",
        },
      }),
    } as Response);

    const loadedSaveButton = await screen.findByRole("button", { name: "Save Settings" });
    await waitFor(() => expect((loadedSaveButton as HTMLButtonElement).disabled).toBe(false));
  });

  it("keeps Save disabled and prevents submission if initial loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/academy-settings") {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({ status: "error", code: "ACADEMY_SETTINGS_UNAVAILABLE" }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AcademySettingsClient />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("Settings are unavailable.");
    });

    const saveButton = (await screen.findByRole("button", { name: "Save Settings" })) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    // Form inputs should be disabled to prevent editing corrupted/unloaded state
    expect((screen.getByLabelText(/Show WhatsApp Support/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/WhatsApp Phone Number/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Default Message Template/i) as HTMLTextAreaElement).disabled).toBe(true);

    // Submitting form directly should not trigger any POST request
    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    // Confirm no POST fetch was dispatched
    const calls = vi.mocked(fetch).mock.calls;
    const postCalls = calls.filter((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(postCalls.length).toBe(0);
  });

  it("shows retry button on load failure and allows recovering on successful retry", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/academy-settings") {
          attempts++;
          if (attempts === 1) {
            return Promise.reject(new Error("Network error"));
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: {
                visible: true,
                whatsapp_number: "923345405945",
                whatsapp_message_template: "Salam Sir",
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AcademySettingsClient />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("Failed to load academy settings.");
    });

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeDefined();

    fireEvent.click(retryButton);

    const saveButton = (await screen.findByRole("button", { name: "Save Settings" })) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));
    expect((screen.getByLabelText(/WhatsApp Phone Number/i) as HTMLInputElement).value).toBe("923345405945");
  });

  it("disables Save when form contains invalid phone number or invalid template", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/academy-settings") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: {
                visible: true,
                whatsapp_number: "923345405945",
                whatsapp_message_template: "Hello",
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AcademySettingsClient />);

    const saveButton = (await screen.findByRole("button", { name: "Save Settings" })) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));

    const phoneInput = screen.getByLabelText(/WhatsApp Phone Number/i) as HTMLInputElement;
    const templateInput = screen.getByLabelText(/Default Message Template/i) as HTMLTextAreaElement;

    // 1. Phone with letters -> invalid
    fireEvent.change(phoneInput, { target: { value: "923345abc945" } });
    expect(saveButton.disabled).toBe(true);

    // 2. Phone with leading zero -> invalid
    fireEvent.change(phoneInput, { target: { value: "03345405945" } });
    expect(saveButton.disabled).toBe(true);

    // 3. Phone too short (<7 digits) -> invalid
    fireEvent.change(phoneInput, { target: { value: "12345" } });
    expect(saveButton.disabled).toBe(true);

    // 4. Phone too long (>15 digits) -> invalid
    fireEvent.change(phoneInput, { target: { value: "923345405945123456" } });
    expect(saveButton.disabled).toBe(true);

    // 5. Valid phone with formatting -> valid again
    fireEvent.change(phoneInput, { target: { value: "+92 (334) 540-5945" } });
    expect(saveButton.disabled).toBe(false);

    // 6. Template containing HTML script tag -> invalid
    fireEvent.change(templateInput, { target: { value: "<script>alert(1)</script>" } });
    expect(saveButton.disabled).toBe(true);

    // 7. Clear template HTML -> valid again
    fireEvent.change(templateInput, { target: { value: "Salam Sir Danish" } });
    expect(saveButton.disabled).toBe(false);
  });

  it("enforces phone validation even when visible is false (consistent with server schema)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/academy-settings") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: {
                visible: false,
                whatsapp_number: "923345405945",
                whatsapp_message_template: "",
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AcademySettingsClient />);

    const saveButton = (await screen.findByRole("button", { name: "Save Settings" })) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));

    const phoneInput = screen.getByLabelText(/WhatsApp Phone Number/i) as HTMLInputElement;

    // Blank phone number while visible=false must keep Save disabled because server requires valid phone
    fireEvent.change(phoneInput, { target: { value: "" } });
    expect(saveButton.disabled).toBe(true);

    // Restoring valid phone re-enables Save
    fireEvent.change(phoneInput, { target: { value: "923345405945" } });
    expect(saveButton.disabled).toBe(false);
  });

  it("submits valid form data with CSRF token and updates UI on success", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/auth/csrf") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrfToken: "mock-csrf-token-123" }),
        });
      }
      if (url === "/api/admin/academy-settings" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: "success",
            data: {
              visible: true,
              whatsapp_number: "923345405945",
              whatsapp_message_template: "Updated template",
            },
          }),
        });
      }
      if (url === "/api/admin/academy-settings") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              visible: false,
              whatsapp_number: "923345405945",
              whatsapp_message_template: "Initial",
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<AcademySettingsClient />);

    const saveButton = (await screen.findByRole("button", { name: "Save Settings" })) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));

    const toggleCheckbox = screen.getByLabelText(/Show WhatsApp Support/i) as HTMLInputElement;
    const templateInput = screen.getByLabelText(/Default Message Template/i) as HTMLTextAreaElement;

    fireEvent.click(toggleCheckbox);
    fireEvent.change(templateInput, { target: { value: "Updated template" } });

    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("Academy settings saved successfully.");
    });

    const postCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/admin/academy-settings" && (call[1] as RequestInit)?.method === "POST"
    );
    expect(postCall).toBeDefined();
    expect(postCall?.[1]?.headers).toMatchObject({
      "content-type": "application/json",
      "x-csrf-token": "mock-csrf-token-123",
    });
    expect(JSON.parse(postCall?.[1]?.body as string)).toEqual({
      visible: true,
      whatsapp_number: "923345405945",
      whatsapp_message_template: "Updated template",
    });
  });
});
