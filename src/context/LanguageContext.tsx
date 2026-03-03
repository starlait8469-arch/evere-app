"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Language, translations, TranslationKey } from "@/lib/i18n";

interface LanguageContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
    lang: "ko",
    setLang: () => { },
    t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Language>("ko");

    useEffect(() => {
        const saved = localStorage.getItem("fabricflow_lang") as Language | null;
        if (saved && (saved === "ko" || saved === "es")) {
            setLangState(saved);
        }
    }, []);

    const setLang = (newLang: Language) => {
        setLangState(newLang);
        localStorage.setItem("fabricflow_lang", newLang);
    };

    const t = (key: TranslationKey): string => {
        return translations[lang][key] ?? key;
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}
