import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ptBR from "@/locales/pt-BR.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { "pt-BR": { translation: ptBR }, en: { translation: en }, es: { translation: es } },
    lng: "pt-BR",
    fallbackLng: "pt-BR",
    interpolation: { escapeValue: false },
  });
}

export { i18n };
