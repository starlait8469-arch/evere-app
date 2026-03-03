"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/lib/i18n";
import styles from "./page.module.css";

export default function LandingPage() {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className={styles.container}>
      <div className={styles.bgGlow} />

      <div className={styles.card}>
        {/* Language Switcher */}
        <div className={styles.langSwitcher}>
          <button
            className={`${styles.langBtn} ${lang === "ko" ? styles.langActive : ""}`}
            onClick={() => setLang("ko" as Language)}
          >
            🇰🇷 한국어
          </button>
          <button
            className={`${styles.langBtn} ${lang === "es" ? styles.langActive : ""}`}
            onClick={() => setLang("es" as Language)}
          >
            🇪🇸 Español
          </button>
        </div>

        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className={styles.logoText}>{t("appName")}</span>
        </div>

        {t("appSubtitle") && <p className={styles.subtitle}>{t("appSubtitle")}</p>}

        {/* Buttons */}
        <div className={styles.buttons}>
          <Link href="/auth/login" className={styles.btnPrimary}>
            {t("login")}
          </Link>
        </div>

      </div>
    </div>
  );
}
