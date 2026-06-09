"use client";

import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./dashboard.module.css";

interface CutRecommendation {
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    sold12m: number;    // 지난 1년 총 판매량
    peakMonth: number;  // 지난 1년 중 최고 월 판매량 = 최소 유지 목표량
    currentStock: number;
    cuttingQty: number;
    pipelineQty: number;    // cutting + sewing + returned + finishing 합산
    effectiveStock: number; // currentStock + pipelineQty
}

interface Props {
    inProgress: number;
    needsCut: number;
    sewingCount: number;
    needsPlanchaCount: number;
    needsPlanchaItems: any[];
    hasNewFabricToday: boolean;
    readyToDeliverCount: number;
    readyToDeliverOrders: { id: string; order_number: string | null; customer_name: string | null }[];
    cutRecommendations: CutRecommendation[];
}

type Stage = "cutting" | "sewing" | "returned" | "finishing" | "done";

interface SewingFactory {
    id: string;
    name: string;
    orderCount: number;
    totalQty: number;
}

interface FactoryOrder {
    id: string;
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
    advanceQty: number; // 입력값
}



export default function DashboardHome({ inProgress, needsCut, sewingCount, needsPlanchaCount, needsPlanchaItems, hasNewFabricToday, readyToDeliverCount, readyToDeliverOrders, cutRecommendations }: Props) {
    const { t, lang } = useLanguage();
    const supabase = createClient();

    // ── 알림 카드 표시 (하루 안보기 상태 확인) ──
    const [showAlert, setShowAlert] = useState(false);

    // 로컬 스토리지에 저장된 오늘 날짜와 현재 날짜를 비교 및 관리자 확인
    useEffect(() => {
        const checkAndSetAlert = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const isAdmin = session?.user.user_metadata?.role === "admin";

            if (hasNewFabricToday && isAdmin) {
                const dismissedDate = localStorage.getItem("fabric_alert_dismissed");
                const todayStr = new Date().toLocaleDateString();
                if (dismissedDate !== todayStr) {
                    setShowAlert(true);
                }
            }
        };
        checkAndSetAlert();
    }, [hasNewFabricToday, supabase.auth]);

    const dismissAlert = () => {
        const todayStr = new Date().toLocaleDateString();
        localStorage.setItem("fabric_alert_dismissed", todayStr);
        setShowAlert(false);
    };

    // ── 납품 가능 주문 알림 ──
    const [showDeliverAlert, setShowDeliverAlert] = useState(false);
    useEffect(() => {
        if (readyToDeliverCount > 0) {
            const dismissed = localStorage.getItem("deliver_alert_dismissed");
            const todayStr = new Date().toLocaleDateString();
            if (dismissed !== todayStr) setShowDeliverAlert(true);
        }
    }, [readyToDeliverCount]);
    const dismissDeliverAlert = () => {
        localStorage.setItem("deliver_alert_dismissed", new Date().toLocaleDateString());
        setShowDeliverAlert(false);
    };

    // ── 재단하기 모달 ──
    const [showCutModal, setShowCutModal] = useState(false);
    const [cutFilterMain, setCutFilterMain] = useState<"all" | "hombre" | "mujer">("all");
    const [cutFilterSub, setCutFilterSub] = useState<string>("all");
    const [cutFilterUrgent, setCutFilterUrgent] = useState(false); // 재단 필요만 보기

    // ── 봉제공장 모달 ──
    const [showFactoryModal, setShowFactoryModal] = useState(false);
    const [factoryLoading, setFactoryLoading] = useState(false);
    const [factories, setFactories] = useState<SewingFactory[]>([]);
    const [selectedFactory, setSelectedFactory] = useState<SewingFactory | null>(null);
    const [factoryOrders, setFactoryOrders] = useState<FactoryOrder[]>([]);
    const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
    const [sentIds, setSentIds] = useState<Set<string>>(new Set());

    // ── Plancha 추천 모달 ──
    const [showPlanchaModal, setShowPlanchaModal] = useState(false);
    const [planchaSelectedIds, setPlanchaSelectedIds] = useState<Set<string>>(new Set());
    const [planchaSending, setPlanchaSending] = useState(false);



    // 봉제공장 목록 + 봉제 건수 로드
    const fetchFactories = async () => {
        setFactoryLoading(true);
        const { data: factoryData } = await supabase
            .from("sewing_factories")
            .select("id, name")
            .order("name");

        const { data: sewingOrders } = await supabase
            .from("production_orders")
            .select("factory_id, quantity")
            .eq("stage", "sewing");

        const list: SewingFactory[] = (factoryData ?? []).map(f => {
            const orders = (sewingOrders ?? []).filter(o => o.factory_id === f.id);
            return {
                id: f.id,
                name: f.name,
                orderCount: orders.length,
                totalQty: orders.reduce((s, o) => s + (o.quantity ?? 0), 0),
            };
        }).filter(f => f.orderCount > 0); // 봉제 중인 공장만

        setFactories(list);
        setFactoryLoading(false);
    };

    // 공장별 봉제 품목 로드
    const fetchFactoryOrders = async (factory: SewingFactory) => {
        setSelectedFactory(factory);
        setSentIds(new Set());
        const { data } = await supabase
            .from("production_orders")
            .select("id, main_category, sub_category, color, size, quantity")
            .eq("stage", "sewing")
            .eq("factory_id", factory.id)
            .order("created_at", { ascending: false });

        setFactoryOrders(
            (data ?? []).map(o => ({ ...o, advanceQty: o.quantity }))
        );
    };

    // 봉제입고로 보내기 (단건) - 봉제공장에서 가게로 들어오는 단계
    const sendToFinishing = async (order: FactoryOrder) => {
        setSendingIds(prev => new Set([...prev, order.id]));
        const qty = order.advanceQty > 0 ? order.advanceQty : order.quantity;
        await supabase
            .from("production_orders")
            .update({
                stage: "returned" as Stage,
                quantity: qty,
                sewing_returned_qty: qty,
            })
            .eq("id", order.id);
        setSendingIds(prev => { const s = new Set(prev); s.delete(order.id); return s; });
        setSentIds(prev => new Set([...prev, order.id]));
        // 목록에서 수량 업데이트 (낙관적)
        setFactoryOrders(prev => prev.map(o => o.id === order.id ? { ...o, quantity: qty } : o));
        // 공장 카운트 갱신
        setFactories(prev => prev.map(f =>
            f.id === selectedFactory?.id
                ? { ...f, orderCount: Math.max(0, f.orderCount - 1), totalQty: Math.max(0, f.totalQty - qty) }
                : f
        ));
    };

    const handleCutCardClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setShowCutModal(true);
    };

    const handleFactoryCardClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setShowFactoryModal(true);
        setSelectedFactory(null);
        setFactoryOrders([]);
        fetchFactories();
    };

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
            onClick: undefined as undefined | ((e: React.MouseEvent) => void),
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
            href: "#",
            onClick: handleCutCardClick,
        },
        {
            label: lang === "ko" ? "봉제 현황" : "En costura",
            value: sewingCount,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="7" cy="6" r="2" fill="currentColor" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                    <circle cx="17" cy="18" r="2" fill="currentColor" />
                </svg>
            ),
            color: "#3b82f6",
            bg: "rgba(59,130,246,0.12)",
            href: "#",
            onClick: handleFactoryCardClick,
        },
        {
            label: lang === "ko" ? "Plancha 필요" : "Req. Plancha",
            value: needsPlanchaCount,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
            color: "#8b5cf6",
            bg: "rgba(139,92,246,0.12)",
            href: "#",
            onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                setShowPlanchaModal(true);
            },
        },
    ];

    // Plancha 일괄 발송 핸들러
    const togglePlanchaSelect = (id: string) => {
        setPlanchaSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const sendToPlanchaBulk = async () => {
        if (planchaSelectedIds.size === 0) return;
        setPlanchaSending(true);
        const ids = Array.from(planchaSelectedIds);

        for (const id of ids) {
            const order = needsPlanchaItems.find(o => o.id === id);
            if (!order) continue;
            await supabase.from("production_orders")
                .update({ stage: "finishing", sewing_returned_qty: order.quantity })
                .eq("id", id);
        }

        setPlanchaSending(false);
        setPlanchaSelectedIds(new Set());
        setShowPlanchaModal(false);
        // 페이지 리로드하여 대시보드 데이터 통째로 갱신 (서버 컴포넌트라 router.refresh 필요)
        window.location.reload();
    };


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

            {/* 원단 입고 알림 카드 */}
            {showAlert && (
                <div style={{
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid #3b82f6",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    marginBottom: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ fontSize: "24px" }}>🔔</div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#1e3a8a", marginBottom: "4px" }}>
                                {lang === "ko" ? "새로운 원단이 입고되었습니다!" : "¡Nueva tela ingresada hoy!"}
                            </h3>
                            <p style={{ margin: 0, fontSize: "14px", color: "#3b82f6" }}>
                                {lang === "ko"
                                    ? "생산라인에 추가된 원단이 있습니다. 잊지 말고 원단 업체 내역에도 등록해 주세요."
                                    : "Has añadido tela en producción. No olvides registrarla en Proveedores de Tela."}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <Link
                            href="/dashboard/fabric-suppliers"
                            style={{
                                backgroundColor: "#3b82f6",
                                color: "white",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                fontSize: "14px",
                                fontWeight: 500,
                                textDecoration: "none"
                            }}
                        >
                            {lang === "ko" ? "원단 업체 바로가기 →" : "Ir a Proveedores →"}
                        </Link>
                        <button
                            onClick={dismissAlert}
                            style={{
                                backgroundColor: "transparent",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                color: "#3b82f6",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                fontSize: "14px",
                                cursor: "pointer",
                                fontWeight: 500
                            }}
                        >
                            {lang === "ko" ? "오늘 하루 닫기 ✕" : "Cerrar por hoy ✕"}
                        </button>
                    </div>
                </div>
            )}

            {/* 납품 가능 주문 알림 카드 */}
            {showDeliverAlert && readyToDeliverCount > 0 && (
                <div style={{
                    backgroundColor: "rgba(5, 150, 105, 0.1)",
                    border: "1px solid #059669",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    marginBottom: "24px",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap"
                }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1 }}>
                        <div style={{ fontSize: "24px", flexShrink: 0 }}>📦</div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#065f46", marginBottom: "4px" }}>
                                {lang === "ko"
                                    ? `납품 가능한 주문 ${readyToDeliverCount}건이 있습니다!`
                                    : `¡Hay ${readyToDeliverCount} pedido(s) listos para entregar!`}
                            </h3>
                            <p style={{ margin: 0, fontSize: "13px", color: "#059669" }}>
                                {lang === "ko" ? "리스트" : "Lista"}: {readyToDeliverOrders.slice(0, 5).map(o =>
                                    (o.customer_name || "") + (o.order_number ? ` (#${o.order_number})` : "")
                                ).join(", ")}{readyToDeliverCount > 5 ? ` +${readyToDeliverCount - 5}` : ""}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexShrink: 0 }}>
                        <Link
                            href="/dashboard/orders"
                            style={{
                                backgroundColor: "#059669",
                                color: "white",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                fontSize: "14px",
                                fontWeight: 500,
                                textDecoration: "none"
                            }}
                        >
                            {lang === "ko" ? "주문 바로가기 →" : "Ir a Pedidos →"}
                        </Link>
                        <button
                            onClick={dismissDeliverAlert}
                            style={{
                                backgroundColor: "transparent",
                                border: "1px solid rgba(5, 150, 105, 0.3)",
                                color: "#059669",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                fontSize: "14px",
                                cursor: "pointer",
                                fontWeight: 500
                            }}
                        >
                            {lang === "ko" ? "오늘 하루 닫기 ✕" : "Cerrar por hoy ✕"}
                        </button>
                    </div>
                </div>
            )}

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
                    <Link
                        href={stat.href}
                        key={i}
                        className={styles.statCard}
                        onClick={stat.onClick}
                    >
                        <div className={styles.statIcon} style={{ background: stat.bg, color: stat.color }}>
                            {stat.icon}
                        </div>
                        <div className={styles.statValue}>{stat.value.toLocaleString()}</div>
                        <div className={styles.statLabel}>{stat.label}</div>
                    </Link>
                ))}
            </div>

            {/* ── 재단하기 모달 ── */}
            {showCutModal && (
                <div className={styles.modalOverlay} onClick={() => setShowCutModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.modalTitle}>
                                    ✂️ {lang === "ko" ? "재단 추천" : "Recomendación de corte"}
                                </h2>
                                <p className={styles.modalSubtitle}>
                                    {lang === "ko"
                                        ? "지난 1년 최대 월판매량 기준 · 연간 판매 많은 순"
                                        : "Basado en el mes pico de ventas del último año"}
                                </p>
                            </div>
                            <button className={styles.modalClose} onClick={() => { setShowCutModal(false); setCutFilterMain("all"); setCutFilterSub("all"); setCutFilterUrgent(false); }}>✕</button>
                        </div>

                        {/* 카테고리 필터 + 재단 필요 토글 */}
                        {cutRecommendations.length > 0 && (() => {
                            const availableSubs = Array.from(
                                new Set(
                                    cutRecommendations
                                        .filter(r => cutFilterMain === "all" || r.main_category === cutFilterMain)
                                        .map(r => r.sub_category)
                                        .filter(Boolean)
                                )
                            ).sort();
                            const urgentCount = cutRecommendations.filter(r => r.effectiveStock < r.peakMonth).length;
                            return (
                                <div style={{ display: "flex", gap: 8, padding: "8px 20px", flexWrap: "wrap", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                                    <select
                                        value={cutFilterMain}
                                        onChange={e => { setCutFilterMain(e.target.value as any); setCutFilterSub("all"); }}
                                        style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}
                                    >
                                        <option value="all">{lang === "ko" ? "전체 카테고리" : "Todas las categorías"}</option>
                                        <option value="hombre">🧔 Hombre</option>
                                        <option value="mujer">👩 Mujer</option>
                                    </select>
                                    <select
                                        value={cutFilterSub}
                                        onChange={e => setCutFilterSub(e.target.value)}
                                        style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", flex: 1, minWidth: 120 }}
                                    >
                                        <option value="all">{lang === "ko" ? "전체 서브" : "Todas las sub"}</option>
                                        {availableSubs.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <button
                                        onClick={() => setCutFilterUrgent(prev => !prev)}
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 700,
                                            padding: "4px 10px",
                                            borderRadius: 20,
                                            border: cutFilterUrgent ? "none" : "1px solid var(--border)",
                                            background: cutFilterUrgent ? "rgba(239,68,68,0.15)" : "transparent",
                                            color: cutFilterUrgent ? "#ef4444" : "var(--text-muted)",
                                            cursor: "pointer",
                                            whiteSpace: "nowrap",
                                            transition: "all 0.15s",
                                            flexShrink: 0,
                                        }}
                                    >
                                        ✂️ {lang === "ko" ? `재단 필요 (${urgentCount})` : `Cortar (${urgentCount})`}
                                    </button>
                                </div>
                            );
                        })()}

                        {cutRecommendations.length === 0 ? (
                            <div className={styles.modalEmpty}>
                                {lang === "ko"
                                    ? "최근 1년 판매 데이터가 없습니다."
                                    : "No hay datos de venta en el último año."}
                            </div>
                        ) : (() => {
                            const filtered = cutRecommendations.filter(r =>
                                (cutFilterMain === "all" || r.main_category === cutFilterMain) &&
                                (cutFilterSub === "all" || r.sub_category === cutFilterSub) &&
                                (!cutFilterUrgent || r.effectiveStock < r.peakMonth)
                            );
                            return filtered.length === 0 ? (
                                <div className={styles.modalEmpty}>
                                    {lang === "ko" ? "해당 필터에 품목이 없습니다." : "No hay artículos en este filtro."}
                                </div>
                            ) : (
                                <div className={styles.modalList}>
                                    {filtered.map((item, idx) => {
                                        const needsCutItem = item.effectiveStock < item.peakMonth;
                                        return (
                                            <div
                                                key={`${item.sub_category}-${item.color}-${item.size}`}
                                                className={`${styles.cutItem} ${needsCutItem ? styles.cutItemUrgent : ""}`}
                                            >
                                                <div className={styles.cutRank}>#{idx + 1}</div>
                                                <div className={styles.cutInfo}>
                                                    <div className={styles.cutName}>{item.sub_category}</div>
                                                    <div className={styles.cutMeta}>
                                                        {item.color && <span className={styles.cutTag}>🎨 {item.color}</span>}
                                                        {item.size && <span className={styles.cutTag}>{lang === "ko" ? "사이즈" : "Talla"} {item.size}</span>}
                                                    </div>
                                                    {/* 판매 통계 */}
                                                    <div className={styles.cutSalesBar}>
                                                        <span>{lang === "ko" ? `연간: ${item.sold12m}개` : `Año: ${item.sold12m}`}</span>
                                                        <span className={styles.cutSalesDivider}>·</span>
                                                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                                            {lang === "ko" ? `최다월: ${item.peakMonth}개` : `Mes pico: ${item.peakMonth}`}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className={styles.cutQtyGroup}>
                                                    <div className={`${styles.cutQty} ${item.currentStock === 0 ? styles.cutQtyZero : ""}`}>
                                                        <span className={styles.cutQtyLabel}>{lang === "ko" ? "재고" : "Stock"}</span>
                                                        <span className={styles.cutQtyNum}>{item.currentStock}</span>
                                                    </div>
                                                    {item.pipelineQty > 0 && (
                                                        <div className={styles.cutQtyCutting}>
                                                            <span className={styles.cutQtyLabel}>{lang === "ko" ? "생산중" : "En prod."}</span>
                                                            <span className={styles.cutQtyNum}>{item.pipelineQty}</span>
                                                        </div>
                                                    )}
                                                    {needsCutItem ? (
                                                        <div className={styles.cutNeedsBadge}>
                                                            {lang === "ko" ? "재단 필요" : "Cortar"}
                                                        </div>
                                                    ) : (
                                                        <div className={styles.cutOkBadge}>
                                                            {lang === "ko" ? "충분" : "OK"}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        <div className={styles.modalFooter}>
                            <Link href="/dashboard/production" className={styles.modalGoBtn} onClick={() => setShowCutModal(false)}>
                                {lang === "ko" ? "생산라인으로 이동 →" : "Ir a producción →"}
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 봉제공장 모달 ── */}
            {showFactoryModal && (
                <div className={styles.modalOverlay} onClick={() => { setShowFactoryModal(false); setSelectedFactory(null); }}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                {selectedFactory ? (
                                    <>
                                        <button
                                            className={styles.factoryBack}
                                            onClick={() => { setSelectedFactory(null); setFactoryOrders([]); setSentIds(new Set()); }}
                                        >
                                            ← {lang === "ko" ? "공장 목록" : "Talleres"}
                                        </button>
                                        <h2 className={styles.modalTitle}>🏭 {selectedFactory.name}</h2>
                                        <p className={styles.modalSubtitle}>
                                            {lang === "ko"
                                                ? `봉제 중 ${selectedFactory.orderCount}건`
                                                : `${selectedFactory.orderCount} en costura`}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <h2 className={styles.modalTitle}>
                                            🧵 {lang === "ko" ? "봉제공장 현황" : "Estado de talleres"}
                                        </h2>
                                        <p className={styles.modalSubtitle}>
                                            {lang === "ko" ? "공장을 선택하세요" : "Selecciona un taller"}
                                        </p>
                                    </>
                                )}
                            </div>
                            <button className={styles.modalClose} onClick={() => { setShowFactoryModal(false); setSelectedFactory(null); }}>✕</button>
                        </div>

                        {/* 공장 목록 */}
                        {!selectedFactory && (
                            factoryLoading ? (
                                <div className={styles.modalEmpty}>{lang === "ko" ? "불러오는 중..." : "Cargando..."}</div>
                            ) : factories.length === 0 ? (
                                <div className={styles.modalEmpty}>
                                    {lang === "ko" ? "현재 봉제 중인 공장이 없습니다." : "No hay talleres trabajando."}
                                </div>
                            ) : (
                                <div className={styles.modalList}>
                                    {factories.map(factory => (
                                        <button
                                            key={factory.id}
                                            className={styles.factoryCard}
                                            onClick={() => fetchFactoryOrders(factory)}
                                        >
                                            <div className={styles.factoryCardIcon}>🏭</div>
                                            <div className={styles.factoryCardInfo}>
                                                <div className={styles.factoryCardName}>{factory.name}</div>
                                                <div className={styles.factoryCardMeta}>
                                                    {lang === "ko"
                                                        ? `${factory.orderCount}건 봉제 중 · 총 ${factory.totalQty.toLocaleString()}개`
                                                        : `${factory.orderCount} en costura · ${factory.totalQty.toLocaleString()} uds`}
                                                </div>
                                            </div>
                                            <div className={styles.factoryCardBadge}>{factory.orderCount}</div>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                                                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                    ))}
                                </div>
                            )
                        )}

                        {/* 공장별 품목 리스트 */}
                        {selectedFactory && (
                            <div className={styles.modalList}>
                                {factoryOrders.length === 0 ? (
                                    <div className={styles.modalEmpty}>
                                        {lang === "ko" ? "품목이 없습니다." : "Sin órdenes."}
                                    </div>
                                ) : (
                                    factoryOrders.map(order => {
                                        const isSent = sentIds.has(order.id);
                                        const isSending = sendingIds.has(order.id);
                                        return (
                                            <div
                                                key={order.id}
                                                className={`${styles.factoryOrderItem} ${isSent ? styles.factoryOrderSent : ""}`}
                                            >
                                                <div className={styles.cutInfo}>
                                                    <div className={styles.cutName}>
                                                        {order.sub_category || order.main_category}
                                                    </div>
                                                    <div className={styles.cutMeta}>
                                                        {order.main_category && !order.sub_category && <span className={styles.cutBadge}>{order.main_category}</span>}
                                                        {order.sub_category && <span className={styles.cutBadge}>{order.sub_category}</span>}
                                                        {order.color && <span className={styles.cutTag}>🎨 {order.color}</span>}
                                                        {order.size && <span className={styles.cutTag}>{lang === "ko" ? "사이즈" : "Talla"} {order.size}</span>}
                                                    </div>
                                                </div>
                                                {isSent ? (
                                                    <div className={styles.sentBadge}>
                                                        ✓ {lang === "ko" ? "봉제입고 완료" : "Ingresado"}
                                                    </div>
                                                ) : (
                                                    <div className={styles.factoryOrderActions}>
                                                        <input
                                                            type="number"
                                                            className={styles.factoryQtyInput}
                                                            min={1}
                                                            value={order.advanceQty}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value, 10);
                                                                setFactoryOrders(prev =>
                                                                    prev.map(o => o.id === order.id ? { ...o, advanceQty: isNaN(val) ? 0 : val } : o)
                                                                );
                                                            }}
                                                        />
                                                        <button
                                                            className={styles.factorySendBtn}
                                                            disabled={isSending}
                                                            onClick={() => sendToFinishing(order)}
                                                        >
                                                            {isSending ? "..." : (lang === "ko" ? "→ 봉제입고" : "→ En tienda")}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        <div className={styles.modalFooter}>
                            <Link
                                href="/dashboard/production"
                                className={styles.modalGoBtn}
                                style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}
                                onClick={() => { setShowFactoryModal(false); setSelectedFactory(null); }}
                            >
                                {lang === "ko" ? "생산라인으로 이동 →" : "Ir a producción →"}
                            </Link>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── Plancha 추천 (재고부족순) 모달 ─── */}
            {showPlanchaModal && (
                <div className={styles.modalOverlay} onClick={() => setShowPlanchaModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>📦 {lang === "ko" ? "Plancha 발송 요망 (재고부족순)" : "Recomendados para Plancha"}</h2>
                            <button className={styles.closeBtn} onClick={() => setShowPlanchaModal(false)}>✕</button>
                        </div>

                        {needsPlanchaItems.length === 0 ? (
                            <div className={styles.modalEmpty}>
                                {lang === "ko" ? "현재 Plancha로 보낼 품목이 없습니다." : "No hay artículos para enviar."}
                            </div>
                        ) : (
                            <>
                                <div className={styles.bulkBar} style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6", marginBottom: 12 }}>
                                    <span>{lang === "ko" ? `${planchaSelectedIds.size}개 선택됨` : `${planchaSelectedIds.size} seleccionado(s)`}</span>
                                    <button
                                        className={styles.bulkSendBtn}
                                        style={{ background: "#8b5cf6" }}
                                        disabled={planchaSending || planchaSelectedIds.size === 0}
                                        onClick={sendToPlanchaBulk}
                                    >
                                        🔧 {planchaSending ? "..." : (lang === "ko" ? "일괄 발송" : "Enviar selección")}
                                    </button>
                                </div>

                                <div className={styles.modalList}>
                                    {needsPlanchaItems.map(item => {
                                        const isChecked = planchaSelectedIds.has(item.id);
                                        return (
                                            <div key={item.id} className={`${styles.listItem} ${isChecked ? styles.listItemSelected : ""}`}>
                                                <label className={styles.factoryCheckLabel} style={{ marginRight: 12 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => togglePlanchaSelect(item.id)}
                                                    />
                                                </label>
                                                <div className={styles.itemInfo}>
                                                    <div className={styles.itemName}>
                                                        {item.main_category} &gt; {item.sub_category || "—"}
                                                    </div>
                                                    <div className={styles.itemMeta}>
                                                        <span>{item.color || "—"}</span>
                                                        <span className={styles.dot}>•</span>
                                                        <span>Talla {item.size || "—"}</span>
                                                    </div>
                                                </div>
                                                <div className={styles.planchaStockInfo}>
                                                    <div className={styles.planchaStockLabel}>{lang === "ko" ? "잔여재고" : "Stock"}</div>
                                                    <div className={styles.planchaStockQty} style={{ color: item.stock_quantity === 0 ? "#ef4444" : "var(--text-primary)" }}>
                                                        {item.stock_quantity}
                                                    </div>
                                                </div>
                                                <div className={styles.planchaSendInfo}>
                                                    <div className={styles.planchaSendLabel}>{lang === "ko" ? "생산수량" : "Cant."}</div>
                                                    <div className={styles.planchaSendQty}>{item.quantity}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                        <div className={styles.modalFooter}>
                            <Link
                                href="/dashboard/production"
                                className={styles.modalGoBtn}
                                style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}
                            >
                                {lang === "ko" ? "생산라인으로 이동 →" : "Ir a producción →"}
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
