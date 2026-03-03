"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import styles from "./DashboardLayout.module.css";

interface Props {
    children: React.ReactNode;
    username: string;
    role: string;
}

export default function DashboardLayout({ children, username, role }: Props) {
    const { t, lang, setLang } = useLanguage();
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const isAdmin = role === "admin";

    const navItems = [
        {
            href: "/dashboard",
            label: t("dashboard"),
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            href: "/dashboard/production",
            label: t("production"),
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            href: "/dashboard/inventory",
            label: t("inventory"),
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            href: "/dashboard/sales",
            label: lang === "ko" ? "판매" : "Ventas",
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                </svg>
            ),
        },
        ...(isAdmin
            ? [
                {
                    href: "/dashboard/sales/history",
                    label: lang === "ko" ? "판매 장부" : "Historial Ventas",
                    icon: (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 3.5L18.5 8H14V3.5zM8 12h8m-8 4h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ),
                },
                {
                    href: "/dashboard/users",
                    label: lang === "ko" ? "직원 관리" : "Gestión de empleados",
                    icon: (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ),
                },
            ]
            : []),
    ];

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
    };

    return (
        <div className={styles.root}>
            {/* Sidebar overlay on mobile */}
            {sidebarOpen && (
                <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
            )}

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
                {/* Logo */}
                <div className={styles.sidebarLogo}>
                    <div className={styles.logoIcon}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className={styles.logoText}>EVERE</span>
                </div>

                {/* Nav Items */}
                <nav className={styles.nav}>
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <span className={styles.navIcon}>{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Bottom: User info + Language + Logout */}
                <div className={styles.sidebarBottom}>
                    {/* Language switcher */}
                    <div className={styles.langRow}>
                        <button
                            className={`${styles.langBtn} ${lang === "ko" ? styles.langActive : ""}`}
                            onClick={() => setLang("ko")}
                        >🇰🇷</button>
                        <button
                            className={`${styles.langBtn} ${lang === "es" ? styles.langActive : ""}`}
                            onClick={() => setLang("es")}
                        >🇪🇸</button>
                    </div>

                    {/* User */}
                    <div className={styles.userRow}>
                        <div className={styles.userAvatar}>
                            {username.charAt(0).toUpperCase()}
                        </div>
                        <div className={styles.userInfo}>
                            <div className={styles.userName}>{username}</div>
                            <div className={styles.userRole}>
                                {isAdmin
                                    ? (lang === "ko" ? "관리자" : "Admin")
                                    : (lang === "ko" ? "직원" : "Empleado")}
                            </div>
                        </div>
                        <button className={styles.logoutBtn} onClick={handleLogout} title={t("logout")}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div className={styles.main}>
                {/* Top bar (mobile) */}
                <header className={styles.topbar}>
                    <button className={styles.menuBtn} onClick={() => setSidebarOpen(true)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>
                    <span className={styles.topbarLogo}>EVERE</span>
                </header>

                <div className={styles.content}>
                    {children}
                </div>
            </div>
        </div>
    );
}
