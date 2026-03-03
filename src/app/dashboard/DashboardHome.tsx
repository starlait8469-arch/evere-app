"use client";

import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";
import styles from "./dashboard.module.css";

interface Props {
    inProgress: number;
    needsCut: number;
    totalInventory: number;
}

export default function DashboardHome({ inProgress, needsCut, totalInventory }: Props) {
    const { t, lang } = useLanguage();

    const stats = [
        {
            label: t("totalProduction"),
            value: inProgress,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
            color: "#6366f1",
            bg: "rgba(99,102,241,0.12)",
            href: "/dashboard/production",
        },
        {
            label: lang === "ko" ? "재단하기" : "Cortar ahora",
            value: needsCut,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M6 2v6m0 0c1.657 0 3 1.343 3 3S7.657 14 6 14s-3-1.343-3-3 1.343-3 3-3zm12 4v6m0 0c1.657 0 3 1.343 3 3s-1.343 3-3 3-3-1.343-3-3 1.343-3 3-3zm-9.5 7.5L18 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
            color: "#f97316",
            bg: "rgba(249,115,22,0.12)",
            href: "/dashboard/production",
        },
        {
            label: t("totalInventory"),
            value: totalInventory,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
            color: "#f59e0b",
            bg: "rgba(245,158,11,0.12)",
            href: "/dashboard/inventory",
        },
    ];


    const quickLinks = [
        {
            href: "/dashboard/production",
            label: lang === "ko" ? "생산라인 보기" : "Ver producción",
            desc: lang === "ko" ? "현재 진행중인 생산 현황" : "Estado de producción actual",
            icon: "🏭",
        },
        {
            href: "/dashboard/inventory",
            label: lang === "ko" ? "재고 보기" : "Ver inventario",
            desc: lang === "ko" ? "품목별 재고 수량 확인" : "Ver cantidades por artículo",
            icon: "📦",
        },
        {
            href: "/dashboard/sales",
            label: lang === "ko" ? "판매 등록" : "Registrar Venta",
            desc: lang === "ko" ? "판매 내역 입력 및 재고 자동 차감" : "Registrar ventas y descontar stock",
            icon: "🛒",
        },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t("dashboard")}</h1>
                <p className={styles.subtitle}>
                    {lang === "ko" ? "전체 현황을 한눈에 확인하세요" : "Resumen general de tu operación"}
                </p>
            </div>

            {/* Quick links */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>
                    {lang === "ko" ? "바로가기" : "Accesos rápidos"}
                </h2>
                <div className={styles.quickGrid}>
                    {quickLinks.map((ql, i) => (
                        <Link href={ql.href} key={i} className={styles.quickCard}>
                            <span className={styles.quickIcon}>{ql.icon}</span>
                            <div>
                                <div className={styles.quickLabel}>{ql.label}</div>
                                <div className={styles.quickDesc}>{ql.desc}</div>
                            </div>
                            <svg className={styles.quickArrow} width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsGrid}>
                {stats.map((stat, i) => (
                    <Link href={stat.href} key={i} className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: stat.bg, color: stat.color }}>
                            {stat.icon}
                        </div>
                        <div className={styles.statValue}>{stat.value.toLocaleString()}</div>
                        <div className={styles.statLabel}>{stat.label}</div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
