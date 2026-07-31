"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { AcademySettings } from "@/lib/firestore/types";

export interface SupportWhatsapp {
  url: string;
  label: string;
}

export function buildWhatsappSupport(
  settings: AcademySettings,
): SupportWhatsapp | null {
  if (!settings.visible) return null;
  const number = settings.whatsapp_number.replace(/\D/g, "");
  if (number.length < 7 || number.length > 15) return null;
  const message = settings.whatsapp_message_template.trim();
  const url = `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  return { url, label: "Contact Sir Danish on WhatsApp" };
}

export function useSupportWhatsapp(): SupportWhatsapp | null {
  const [support, setSupport] = useState<SupportWhatsapp | null>(null);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, "academy_settings", "default"))
      .then((snapshot) => {
        if (!active || !snapshot.exists()) return;
        const result = buildWhatsappSupport(snapshot.data() as AcademySettings);
        if (result) setSupport(result);
      })
      .catch(() => {
        // The action stays hidden when public support settings are unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  return support;
}
