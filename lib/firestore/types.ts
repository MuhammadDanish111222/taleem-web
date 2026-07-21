export interface Board {
  name: string;
  slug: string;
  active: boolean;
  display_order: number;
}

export interface ClassDoc {
  name: string;
  slug: string;
  active: boolean;
  display_order: number;
}

export interface Subject {
  name: string;
  slug: string;
  active: boolean;
  display_order: number;
  icon?: string;
}

export interface Chapter {
  title: string;
  slug: string;
  chapter_number: number;
  active: boolean;
  display_order: number;
}

export interface SiteSettings {
  site_name: string;
}

export interface AcademySettings {
  academy_name: string;
  whatsapp_number: string;
  whatsapp_message_template: string;
  visible: boolean;
}
