"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./history.module.css";

type HistoryOrder = {
    id: string;
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
    original_qty: number | null;
    sewing_returned_qty: number | null;
    factory_id: string | null;
    completed_at: string | null;
    created_at: string;
    sewing_factories?: { name: string } | null;
};

export default function ProductionHistoryPage() {
    const { lang } = useLanguage();
    const router = useRouter();
    const supabase = createClient();

    const [orders, setOrders] = useState<HistoryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    // 필터
    const [filterCat, setFilterCat] = useState("all");
    const [filterLoss, setFilterLoss] = useState<"all" | "loss" | "ok">("all");
    const [search, setSearch] = useState("");

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push("/auth/login"); return; }
            const role = session.user.user_metadata?.role;
            if (role !== "admin") { router.push("/dashboard"); return; }
            setIsAdmin(true);
            fetchHistory();
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("production_orders")
            .select("*, sewing_factories(name)")
            .eq("stage", "done")
            .order("completed_at", { ascending: false });
        setOrders((data as HistoryOrder[]) || []);
        setLoading(false);
    };

    if (!isAdmin) return null;

    // 요약 통계
    const totalOrders = orders.length;
    const totalCut = orders.reduce((s, o) => s + (o.original_qty ?? o.quantity), 0);
    const totalSewingLoss = orders.reduce((s, o) => {
        if (o.original_qty == null || o.sewing_returned_qty == null) return s;
        return s + Math.max(0, o.original_qty - o.sewing_returned_qty);
    }, 0);
    const totalPlanchaLoss = orders.reduce((s, o) => {
        if (o.sewing_returned_qty == null) return s;
        return s + Math.max(0, o.sewing_returned_qty - o.quantity);
    }, 0);
    const totalFinal = orders.reduce((s, o) => s + o.quantity, 0);

    // 카테고리 목록
    const cats = ["all", ...Array.from(new Set(orders.map(o => o.main_category).filter(Boolean)))];

    // 필터 적용
    const filtered = orders.filter(o => {
        if (filterCat !== "all" && o.main_category !== filterCat) return false;
        if (filterLoss === "loss") {
            const sewLoss = o.original_qty != null && o.sewing_returned_qty != null ? o.original_qty - o.sewing_returned_qty : 0;
            const plLoss = o.sewing_returned_qty != null ? o.sewing_returned_qty - o.quantity : 0;
            if (sewLoss <= 0 && plLoss <= 0) return false;
        }
        if (filterLoss === "ok") {
            const sewLoss = o.original_qty != null && o.sewing_returned_qty != null ? o.original_qty - o.sewing_returned_qty : 0;
            const plLoss = o.sewing_returned_qty != null ? o.sewing_returned_qty - o.quantity : 0;
            if (sewLoss > 0 || plLoss > 0) return false;
        }
        if (search) {
            const q = search.toLowerCase();
            if (
                !o.main_category?.toLowerCase().includes(q) &&
                !o.sub_category?.toLowerCase().includes(q) &&
                !o.color?.toLowerCase().includes(q) &&
                !o.size?.toLowerCase().includes(q) &&
                !(o.sewing_factories?.name?.toLowerCase().includes(q))
            ) return false;
        }
        return true;
    });

    const lossRate = totalCut > 0 ? (((totalSewingLoss + totalPlanchaLoss) / totalCut) * 100).toFixed(1) : "0.0";

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>
                        {lang === "ko" ? "📋 생산 내역" : "📋 Historial de Producción"}
                    </h1>
                    <p className={styles.subtitle}>
                        {lang === "ko" ? "입고완료된 생산 주문 및 단계별 손실 현황" : "Órdenes completadas y pérdidas por etapa"}
                    </p>
                </div>
                <button className={styles.refreshBtn} onClick={fetchHistory}>↺</button>
            </div>

            {/* 통계 카드 */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{lang === "ko" ? "총 완성" : "Total completado"}</span>
                    <span className={styles.statValue}>{totalOrders}{lang === "ko" ? "건" : " ord."}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{lang === "ko" ? "재단 수량" : "Total cortado"}</span>
                    <span className={styles.statValue}>{totalCut.toLocaleString()}</span>
                </div>
                <div className={`${styles.statCard} ${totalSewingLoss > 0 ? styles.statDanger : ""}`}>
                    <span className={styles.statLabel}>🪡 {lang === "ko" ? "봉제 손실" : "Pérd. costura"}</span>
                    <span className={styles.statValue}>{totalSewingLoss > 0 ? `−${totalSewingLoss.toLocaleString()}` : "0"}</span>
                </div>
                <div className={`${styles.statCard} ${totalPlanchaLoss > 0 ? styles.statWarn : ""}`}>
                    <span className={styles.statLabel}>🔧 {lang === "ko" ? "plancha 손실" : "Pérd. plancha"}</span>
                    <span className={styles.statValue}>{totalPlanchaLoss > 0 ? `−${totalPlanchaLoss.toLocaleString()}` : "0"}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{lang === "ko" ? "최종 입고" : "Total ingresado"}</span>
                    <span className={styles.statValue + " " + styles.statGreen}>{totalFinal.toLocaleString()}</span>
                </div>
                <div className={`${styles.statCard} ${parseFloat(lossRate) > 5 ? styles.statDanger : parseFloat(lossRate) > 0 ? styles.statWarn : ""}`}>
                    <span className={styles.statLabel}>{lang === "ko" ? "총 손실률" : "Tasa de pérdida"}</span>
                    <span className={styles.statValue}>{lossRate}%</span>
                </div>
            </div>

            {/* 필터 */}
            <div className={styles.filterBar}>
                <input
                    className={styles.searchInput}
                    placeholder={lang === "ko" ? "🔍 검색..." : "🔍 Buscar..."}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className={styles.filterBtns}>
                    {cats.map(c => (
                        <button
                            key={c}
                            className={`${styles.filterBtn} ${filterCat === c ? styles.filterActive : ""}`}
                            onClick={() => setFilterCat(c)}
                        >
                            {c === "all" ? (lang === "ko" ? "전체" : "Todos") : c}
                        </button>
                    ))}
                </div>
                <div className={styles.filterBtns}>
                    {(["all", "loss", "ok"] as const).map(f => (
                        <button
                            key={f}
                            className={`${styles.filterBtn} ${filterLoss === f ? styles.filterActive : ""}`}
                            onClick={() => setFilterLoss(f)}
                        >
                            {f === "all"
                                ? (lang === "ko" ? "전체" : "Todos")
                                : f === "loss"
                                    ? (lang === "ko" ? "⚠️ 손실 있음" : "⚠️ Con pérdida")
                                    : (lang === "ko" ? "✅ 손실 없음" : "✅ Sin pérdida")}
                        </button>
                    ))}
                </div>
            </div>

            {/* 테이블 */}
            {loading ? (
                <div className={styles.empty}>Loading...</div>
            ) : filtered.length === 0 ? (
                <div className={styles.empty}>
                    {lang === "ko" ? "내역이 없습니다." : "No hay registros."}
                </div>
            ) : (() => {
                // 날짜별 그룹화
                const groups = new Map<string, typeof filtered>();
                filtered.forEach(o => {
                    const dateKey = o.completed_at
                        ? new Date(o.completed_at).toLocaleDateString("es-AR", { weekday: "short", year: "numeric", month: "short", day: "numeric" })
                        : new Date(o.created_at).toLocaleDateString("es-AR", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
                    if (!groups.has(dateKey)) groups.set(dateKey, []);
                    groups.get(dateKey)!.push(o);
                });

                return (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>{lang === "ko" ? "분류" : "Categoría"}</th>
                                    <th>{lang === "ko" ? "서브" : "Sub"}</th>
                                    <th>{lang === "ko" ? "색상" : "Color"}</th>
                                    <th>{lang === "ko" ? "사이즈" : "Talla"}</th>
                                    <th>{lang === "ko" ? "봉제공장" : "Taller"}</th>
                                    <th className={styles.thNum}>{lang === "ko" ? "재단" : "Corte"}</th>
                                    <th className={styles.thNum}>🪡 {lang === "ko" ? "봉제입고" : "Cos."}</th>
                                    <th className={styles.thNum}>🔧 {lang === "ko" ? "plancha입고" : "Plan."}</th>
                                    <th className={styles.thNum}>{lang === "ko" ? "손실" : "Pérd."}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from(groups.entries()).map(([dateKey, dayOrders]) => {
                                    const dayCut = dayOrders.reduce((s, o) => s + (o.original_qty ?? o.quantity), 0);
                                    const dayFinal = dayOrders.reduce((s, o) => s + o.quantity, 0);
                                    const dayLoss = dayCut - dayFinal;
                                    return (
                                        <>
                                            {/* 날짜 구분 헤더 행 */}
                                            <tr key={`date-${dateKey}`} className={styles.dateGroupRow}>
                                                <td colSpan={9} className={styles.dateGroupCell}>
                                                    <span className={styles.dateGroupLabel}>📅 {dateKey}</span>
                                                    <span className={styles.dateGroupSummary}>
                                                        {dayOrders.length}{lang === "ko" ? "건" : " ord."}
                                                        {" · "}
                                                        {lang === "ko" ? "재단" : "Corte"} {dayCut}
                                                        {" → "}
                                                        {lang === "ko" ? "최종" : "Final"} {dayFinal}
                                                        {dayLoss > 0 && (
                                                            <span className={styles.dayLoss}> −{dayLoss}</span>
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                            {/* 해당 날짜의 주문들 */}
                                            {dayOrders.map(o => {
                                                const cut = o.original_qty ?? o.quantity;
                                                const sewing = o.sewing_returned_qty ?? o.quantity;
                                                const final = o.quantity;
                                                const sewLoss = Math.max(0, cut - sewing);
                                                const plLoss = Math.max(0, sewing - final);
                                                const totalLoss = sewLoss + plLoss;
                                                const hasLoss = totalLoss > 0;
                                                return (
                                                    <tr key={o.id} className={hasLoss ? styles.rowLoss : styles.rowOk}>
                                                        <td>{o.main_category}</td>
                                                        <td>{o.sub_category || "—"}</td>
                                                        <td>{o.color || "—"}</td>
                                                        <td>{o.size || "—"}</td>
                                                        <td>{o.sewing_factories?.name || "—"}</td>
                                                        <td className={styles.numCell}>{cut}</td>
                                                        <td className={styles.numCell}>
                                                            <span className={sewLoss > 0 ? styles.numLoss : ""}>{sewing}</span>
                                                            {sewLoss > 0 && <span className={styles.lossTag}>−{sewLoss}</span>}
                                                        </td>
                                                        <td className={styles.numCell}>
                                                            <span className={plLoss > 0 ? styles.numLoss : ""}>{final}</span>
                                                            {plLoss > 0 && <span className={styles.lossTagPurple}>−{plLoss}</span>}
                                                        </td>
                                                        <td className={styles.numCell}>
                                                            {totalLoss > 0
                                                                ? <span className={styles.totalLoss}>−{totalLoss}</span>
                                                                : <span className={styles.totalOk}>✓</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })()}
        </div>
    );
}

