import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import deAT from "@/locales/de-AT.json";

// en-US is the product default. de-AT is a second locale (draft content,
// to be validated by Drei). Locale default per tenant is applied at the
// TenantProvider; the user can switch manually.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      "de-AT": { translation: deAT },
    },
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "de-AT"],
    interpolation: { escapeValue: false },
  });
} else {
  // Hot update: the i18next singleton survives module re-evaluation, so refresh its strings —
  // otherwise the dev server keeps rendering old copy and the page hydrates with a mismatch.
  i18n.addResourceBundle("en", "translation", en, true, true);
  i18n.addResourceBundle("de-AT", "translation", deAT, true, true);
}

export { i18n };
