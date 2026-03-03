"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth";
import styles from "../auth/auth.module.css";
import localStyles from "./setup.module.css";

export default function SetupPage() {
    const { lang, setLang } = useLanguage();
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const t = (ko: string, es: string) => lang === "ko" ? ko : es;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!username.trim()) {
            setError(t("사용자 이름을 입력하세요.", "Ingresa tu nombre de usuario."));
            return;
        }
        if (password.length < 6) {
            setError(t("비밀번호는 6자 이상이어야 합니다.", "La contraseña debe tener al menos 6 caracteres."));
            return;
        }
        if (password !== confirmPassword) {
            setError(t("비밀번호가 일치하지 않습니다.", "Las contraseñas no coinciden."));
            return;
        }

        setLoading(true);
        const supabase = createClient();
        const email = usernameToEmail(username);

        // 이미 관리자가 있는지 확인
        const { data: existingAdmin } = await supabase
            .from("profiles")
            .select("id")
            .eq("role", "admin")
            .maybeSingle();

        if (existingAdmin) {
            setError(t("관리자 계정이 이미 존재합니다.", "Ya existe una cuenta de administrador."));
            setLoading(false);
            return;
        }

        // 관리자 계정 생성
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username: username.trim(), role: "admin" },
                emailRedirectTo: undefined,
            },
        });

        if (signUpError || !signUpData.user) {
            setError(signUpError?.message ?? t("오류가 발생했습니다.", "Ocurrió un error."));
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
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className={styles.logoText}>EVERE</span>
                </div>

                <div className={localStyles.adminBadge}>
                    {t("🔐 관리자 계정 설정", "🔐 Configuración de administrador")}
                </div>
                <h1 className={styles.title}>{t("최초 관리자 계정 만들기", "Crear cuenta de administrador")}</h1>
                <p className={localStyles.hint}>{t("이 페이지는 최초 1회만 사용됩니다.", "Esta página solo se usa una vez.")}</p>

                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.field}>
                        <label className={styles.label}>{t("관리자 이름", "Nombre de administrador")}</label>
                        <input
                            className={styles.input}
                            type="text"
                            placeholder={t("관리자 이름", "Nombre de administrador")}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>{t("비밀번호", "Contraseña")}</label>
                        <input
                            className={styles.input}
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>{t("비밀번호 확인", "Confirmar contraseña")}</label>
                        <input
                            className={styles.input}
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>

                    {error && <div className={styles.error}>{error}</div>}

                    <button className={styles.btnPrimary} type="submit" disabled={loading}>
                        {loading
                            ? t("생성 중...", "Creando...")
                            : t("관리자 계정 만들기", "Crear cuenta")}
                    </button>
                </form>
            </div>
        </div>
    );
}
