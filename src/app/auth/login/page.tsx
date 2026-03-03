"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth";
import styles from "../auth.module.css";

export default function LoginPage() {
    const { t, lang, setLang } = useLanguage();
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!username.trim() || !password) {
            setError(lang === "ko" ? "모든 항목을 입력하세요." : "Completa todos los campos.");
            return;
        }

        setLoading(true);
        const supabase = createClient();
        const email = usernameToEmail(username);

        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
            setError(lang === "ko" ? "사용자 이름 또는 비밀번호가 올바르지 않습니다." : "Usuario o contraseña incorrectos.");
            setLoading(false);
            return;
        }

        router.push("/dashboard");
    };

    return (
        <div className={styles.container}>
            <div className={styles.bgGlow} />

            <div className={styles.card}>
                {/* Language Switcher */}
                <div className={styles.langSwitcher}>
                    <button className={`${styles.langBtn} ${lang === "ko" ? styles.langActive : ""}`} onClick={() => setLang("ko")}>
                        🇰🇷 한국어
                    </button>
                    <button className={`${styles.langBtn} ${lang === "es" ? styles.langActive : ""}`} onClick={() => setLang("es")}>
                        🇪🇸 Español
                    </button>
                </div>

                {/* Logo */}
                <Link href="/" className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className={styles.logoText}>EVERE</span>
                </Link>

                <h1 className={styles.title}>{t("loginTitle")}</h1>

                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.field}>
                        <label className={styles.label}>{t("name")}</label>
                        <input
                            className={styles.input}
                            type="text"
                            placeholder={lang === "ko" ? "사용자 이름" : "Nombre de usuario"}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            autoFocus
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>{t("password")}</label>
                        <input
                            className={styles.input}
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                    </div>

                    {error && <div className={styles.error}>{error}</div>}

                    <button className={styles.btnPrimary} type="submit" disabled={loading}>
                        {loading
                            ? (lang === "ko" ? "로그인 중..." : "Iniciando sesión...")
                            : t("loginBtn")}
                    </button>
                </form>

                <p className={styles.switchLink}>
                    {t("noAccount")}{" "}
                    <Link href="/auth/signup" className={styles.link}>
                        {t("goSignup")}
                    </Link>
                </p>
            </div>
        </div>
    );
}
