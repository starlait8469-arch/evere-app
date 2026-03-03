"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth";
import styles from "../auth.module.css";

export default function SignupPage() {
    const { t, lang, setLang } = useLanguage();
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!username.trim()) {
            setError(lang === "ko" ? "사용자 이름을 입력하세요." : "Ingresa tu nombre de usuario.");
            return;
        }
        if (password.length < 6) {
            setError(lang === "ko" ? "비밀번호는 6자 이상이어야 합니다." : "La contraseña debe tener al menos 6 caracteres.");
            return;
        }
        if (password !== confirmPassword) {
            setError(lang === "ko" ? "비밀번호가 일치하지 않습니다." : "Las contraseñas no coinciden.");
            return;
        }

        setLoading(true);
        const supabase = createClient();
        const email = usernameToEmail(username);

        const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username: username.trim() },
                emailRedirectTo: undefined,
            },
        });

        if (signUpError) {
            if (signUpError.message.includes("already registered")) {
                setError(lang === "ko" ? "이미 사용중인 사용자 이름입니다." : "Este nombre de usuario ya está en uso.");
            } else {
                setError(signUpError.message);
            }
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

                <h1 className={styles.title}>{t("signupTitle")}</h1>

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
                            autoComplete="new-password"
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>{t("confirmPassword")}</label>
                        <input
                            className={styles.input}
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    {error && <div className={styles.error}>{error}</div>}

                    <button className={styles.btnPrimary} type="submit" disabled={loading}>
                        {loading
                            ? (lang === "ko" ? "처리 중..." : "Procesando...")
                            : t("signupBtn")}
                    </button>
                </form>

                <p className={styles.switchLink}>
                    {t("hasAccount")}{" "}
                    <Link href="/auth/login" className={styles.link}>
                        {t("goLogin")}
                    </Link>
                </p>
            </div>
        </div>
    );
}
