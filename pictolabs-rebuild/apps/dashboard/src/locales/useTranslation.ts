import { create } from 'zustand';
import idTranslations from './id.json';
import enTranslations from './en.json';

export type Language = 'id' | 'en';

const translations: Record<Language, any> = {
  id: idTranslations,
  en: enTranslations,
};

interface TranslationState {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

export const useTranslation = create<TranslationState>((set, get) => ({
  lang: (localStorage.getItem('pictolabs_lang') as Language) || 'id',

  setLang: (lang: Language) => {
    localStorage.setItem('pictolabs_lang', lang);
    set({ lang });
  },

  t: (key: string, fallback?: string): string => {
    const currentLang = get().lang;
    const dict = translations[currentLang] || translations.id;

    const parts = key.split('.');
    let current = dict;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        // Fallback to Indonesian if missing in English, or to fallback parameter
        let idVal = translations.id;
        for (const p of parts) {
          if (idVal && typeof idVal === 'object' && p in idVal) {
            idVal = idVal[p];
          } else {
            return fallback || key;
          }
        }
        return typeof idVal === 'string' ? idVal : fallback || key;
      }
    }

    return typeof current === 'string' ? current : fallback || key;
  },
}));
