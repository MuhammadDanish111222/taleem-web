import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

import { buildWhatsappSupport } from "@/components/ai/useSupportWhatsapp";
import type { AcademySettings } from "@/lib/firestore/types";

describe("WhatsApp Support Hook - buildWhatsappSupport", () => {
  it("returns null when visible is false", () => {
    const settings: AcademySettings = {
      visible: false,
      whatsapp_number: "923345405945",
      whatsapp_message_template: "Hello Sir",
      academy_name: "Taleem Academy",
    };
    expect(buildWhatsappSupport(settings)).toBeNull();
  });

  it("returns formatted wa.me URL without template when message is empty", () => {
    const settings: AcademySettings = {
      visible: true,
      whatsapp_number: "923345405945",
      whatsapp_message_template: "   ",
      academy_name: "Taleem Academy",
    };
    const result = buildWhatsappSupport(settings);
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://wa.me/923345405945");
    expect(result?.label).toBe("Contact Sir Danish on WhatsApp");
  });

  it("returns formatted wa.me URL with encoded template when message is provided", () => {
    const settings: AcademySettings = {
      visible: true,
      whatsapp_number: "+92 334 5405945",
      whatsapp_message_template: "Salam Sir Danish! I need help.",
      academy_name: "Taleem Academy",
    };
    const result = buildWhatsappSupport(settings);
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://wa.me/923345405945?text=Salam%20Sir%20Danish!%20I%20need%20help.");
  });

  it("returns null if normalized number has fewer than 7 digits", () => {
    const settings: AcademySettings = {
      visible: true,
      whatsapp_number: "12345",
      whatsapp_message_template: "",
      academy_name: "Taleem Academy",
    };
    expect(buildWhatsappSupport(settings)).toBeNull();
  });

  it("returns null if normalized number has more than 15 digits", () => {
    const settings: AcademySettings = {
      visible: true,
      whatsapp_number: "12345678901234567",
      whatsapp_message_template: "",
      academy_name: "Taleem Academy",
    };
    expect(buildWhatsappSupport(settings)).toBeNull();
  });
});
