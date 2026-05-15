"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./history.module.css";

type SalesHistoryItem = {
    id: string;
    quantity: number;
    unit_price: number;
    created_at: string;
    inventory: {
        name: string;
        main_category: string;
        sub_category: string;
        color: string;
        size: string;
    } | null;
    profiles: {
        username: string;
        role: string;
    } | null;
};

type DeliveryHistoryItem = {
    id: string;
    quantity: number;
    unit_price: number;
    created_at: string;
    store_order_items: {
        main_category: string;
        sub_category: string;
        color: string;
        size: string;
    } | null;
    profiles: {
        username: string;
        role: string;
    } | null;
};

export default function SalesHistoryPage() {
    const { t, lang } = useLanguage();
    const router = useRouter();

    // ─── 탭 ───
    const [tab, setTab] = useState<"daily" | "analytics">("daily");

    // ─── 일별 장부 ───
    const [selectedDate, setSelectedDate] = useState(() => {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    });
    const [salesList, setSalesList] = useState<SalesHistoryItem[]>([]);
    const [deliveriesList, setDeliveriesList] = useState<DeliveryHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // ─── 기간 분석 ───
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const firstOfMonth = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    })();
    const [rangeFrom, setRangeFrom] = useState(firstOfMonth);
    const [rangeTo, setRangeTo] = useState(todayStr);
    const [analyticsSales, setAnalyticsSales] = useState<SalesHistoryItem[]>([]);
    const [analyticsDeliveries, setAnalyticsDeliveries] = useState<DeliveryHistoryItem[]>([]);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsMainCat, setAnalyticsMainCat] = useState("all");

    const supabase = createClient();

    // ─── 권한 체크 ───
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) { router.replace("/auth/login"); return; }
            const role = session.user.user_metadata?.role;
            if (role !== "admin") { router.replace("/dashboard/sales"); }
        });
    }, []);

    // ─── 일별 fetch ───
    const fetchDaily = useCallback(async (date: string) => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`/api/sales-history?date=${date}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }));
                setFetchError(err.error || res.statusText);
            } else {
                const data = await res.json();
                setSalesList(data.sales || []);
                setDeliveriesList(data.deliveries || []);
            }
        } catch (err: any) {
            setFetchError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDaily(selectedDate); }, [selectedDate]);

    // ─── 기간 분석 fetch ───
    const fetchAnalytics = useCallback(async () => {
        if (!rangeFrom || !rangeTo) return;
        setAnalyticsLoading(true);
        try {
            const res = await fetch(`/api/sales-history?from=${rangeFrom}&to=${rangeTo}`);
            if (res.ok) {
                const data = await res.json();
                setAnalyticsSales(data.sales || []);
                setAnalyticsDeliveries(data.deliveries || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAnalyticsLoading(false);
        }
    }, [rangeFrom, rangeTo]);

    useEffect(() => {
        if (tab === "analytics") fetchAnalytics();
    }, [tab, rangeFrom, rangeTo]);

    // ─── helpers ───
    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString(lang === "ko" ? "ko-KR" : "es-ES", {
            hour: "2-digit", minute: "2-digit"
        });
    };

    const setQuickRange = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days + 1);
        const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        setRangeFrom(fmt(start));
        setRangeTo(fmt(end));
    };
    const setThisMonth = () => {
        const now = new Date();
        setRangeFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
        setRangeTo(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    };
    const setLastMonth = () => {
        const now = new Date();
        const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const m = now.getMonth() === 0 ? 12 : now.getMonth();
        setRangeFrom(`${y}-${String(m).padStart(2, '0')}-01`);
        setRangeTo(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(y, m, 0)));
    };

    // ─── 일별 합계 ───
    const totalSalesQty = salesList.reduce((a, c) => a + c.quantity, 0);
    const totalSalesAmount = salesList.reduce((a, c) => a + c.quantity * (c.unit_price || 0), 0);
    const totalDelivQty = deliveriesList.reduce((a, c) => a + c.quantity, 0);
    const totalDelivAmount = deliveriesList.reduce((a, c) => a + c.quantity * (c.unit_price || 0), 0);

    // ─── 분석 집계 ───
    type AggEntry = { main: string; sub: string; color: string; size: string; qty: number; amount: number };
    const aggEntries: AggEntry[] = [];
    analyticsSales.forEach(s => {
        aggEntries.push({
            main: s.inventory?.main_category || "—",
            sub: s.inventory?.sub_category || s.inventory?.name || "—",
            color: s.inventory?.color || "—",
            size: s.inventory?.size || "—",
            qty: s.quantity,
            amount: s.quantity * (s.unit_price || 0),
        });
    });
    analyticsDeliveries.forEach(d => {
        aggEntries.push({
            main: d.store_order_items?.main_category || "—",
            sub: d.store_order_items?.sub_category || "—",
            color: d.store_order_items?.color || "—",
            size: d.store_order_items?.size || "—",
            qty: d.quantity,
            amount: d.quantity * (d.unit_price || 0),
        });
    });

    const allMainCats = [...new Set(aggEntries.map(e => e.main))].sort();
    const filtered = analyticsMainCat === "all" ? aggEntries : aggEntries.filter(e => e.main === analyticsMainCat);

    // 카테고리별 합계 (뱃지용)
    type MainStat = { total: number };
    const mainStatMap = new Map<string, MainStat>();
    aggEntries.forEach(e => {
        if (!mainStatMap.has(e.main)) mainStatMap.set(e.main, { total: 0 });
        mainStatMap.get(e.main)!.total += e.qty;
    });
    const mainGrandTotal = aggEntries.reduce((s, e) => s + e.qty, 0);

    // 서브카테고리별 집계
    type SubStat = { sub: string; total: number; amount: number; colorMap: Map<string, { qty: number }> };
    const subStatMap = new Map<string, SubStat>();
    filtered.forEach(e => {
        if (!subStatMap.has(e.sub)) subStatMap.set(e.sub, { sub: e.sub, total: 0, amount: 0, colorMap: new Map() });
        const row = subStatMap.get(e.sub)!;
        row.total += e.qty;
        row.amount += e.amount;
        const ck = `${e.color} / ${e.size}`;
        if (!row.colorMap.has(ck)) row.colorMap.set(ck, { qty: 0 });
        row.colorMap.get(ck)!.qty += e.qty;
    });
    const subRows = Array.from(subStatMap.values()).sort((a, b) => b.total - a.total);
    const grandTotal = subRows.reduce((s, r) => s + r.total, 0);
    const grandAmount = subRows.reduce((s, r) => s + r.amount, 0);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{lang === "ko" ? "판매 장부" : "Historial de Ventas"}</h1>
                <p className={styles.subtitle}>
                    {lang === "ko" ? "일일 매출 및 납품 예약 기록 (관리자 전용)" : "Registro diario de ventas y entregas (Solo Admin)"}
                </p>
            </div>

            {/* 탭 */}
            <div className={styles.tabs}>
                <button className={`${styles.tab} ${tab === "daily" ? styles.tabActive : ""}`} onClick={() => setTab("daily")}>
                    📋 {lang === "ko" ? "일별 장부" : "Diario"}
                </button>
                <button className={`${styles.tab} ${tab === "analytics" ? styles.tabActive : ""}`} onClick={() => setTab("analytics")}>
                    📊 {lang === "ko" ? "기간별 분석" : "Análisis"}
                </button>
            </div>

            {/* ══ 일별 장부 ══ */}
            {tab === "daily" && (
                <>
                    <div className={styles.datePickerContainer}>
                        <label style={{ fontWeight: 600 }}>{lang === "ko" ? "날짜 선택:" : "Fecha:"}</label>
                        <input
                            type="date"
                            className={styles.dateInput}
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>

                    {loading ? (
                        <div className={styles.loading}>Loading...</div>
                    ) : fetchError ? (
                        <div className={styles.errorCard}>
                            <p>⚠️ Error: {fetchError}</p>
                            <button onClick={() => fetchDaily(selectedDate)} className={styles.retryBtn}>Retry</button>
                        </div>
                    ) : (
                        <>
                            <div className={styles.summaryContainer}>
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryTitle}>{lang === "ko" ? "현장 판매" : "Ventas Locales"}</div>
                                    <div className={styles.summaryValue}>${totalSalesAmount.toLocaleString()}</div>
                                    <div className={styles.summarySub}>{totalSalesQty} {lang === "ko" ? "개 완료" : "uds"}</div>
                                </div>
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryTitle}>{lang === "ko" ? "가게 주문 납품" : "Entregas a Tienda"}</div>
                                    <div className={styles.summaryValue}>${totalDelivAmount.toLocaleString()}</div>
                                    <div className={styles.summarySub}>{totalDelivQty} {lang === "ko" ? "개 완료" : "uds"}</div>
                                </div>
                                <div className={`${styles.summaryCard} ${styles.cardTotal}`}>
                                    <div className={styles.summaryTitle}>{lang === "ko" ? "총 합계" : "Total General"}</div>
                                    <div className={styles.summaryValue}>${(totalSalesAmount + totalDelivAmount).toLocaleString()}</div>
                                    <div className={styles.summarySub}>{totalSalesQty + totalDelivQty} {lang === "ko" ? "개" : "uds"}</div>
                                </div>
                            </div>

                            <h2 className={styles.sectionTitle}>{lang === "ko" ? "현장 판매 내역" : "Detalles de Ventas Locales"}</h2>
                            {salesList.length === 0 ? (
                                <div className={styles.emptyCard}>{lang === "ko" ? "판매 기록이 없습니다." : "No hay registros de ventas."}</div>
                            ) : (
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>{lang === "ko" ? "시간" : "Hora"}</th>
                                                <th>{lang === "ko" ? "품목" : "Artículo"}</th>
                                                <th>{lang === "ko" ? "색상/사이즈" : "Color/Talla"}</th>
                                                <th>{lang === "ko" ? "수량" : "Cant"}</th>
                                                <th>{lang === "ko" ? "단가" : "Precio Unit."}</th>
                                                <th>{lang === "ko" ? "합계" : "Total"}</th>
                                                <th>{lang === "ko" ? "담당자" : "Vendedor"}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {salesList.map(item => (
                                                <tr key={item.id}>
                                                    <td className={styles.dateCell}>{formatTime(item.created_at)}</td>
                                                    <td className={styles.itemCell}>{item.inventory?.sub_category || item.inventory?.name || "-"}</td>
                                                    <td className={styles.optionCell}>
                                                        <span className={styles.colorTag}>{item.inventory?.color || "-"}</span>
                                                        <span className={styles.sizeTag}>{item.inventory?.size || "-"}</span>
                                                    </td>
                                                    <td className={styles.qtyCell}>{item.quantity}</td>
                                                    <td>${(item.unit_price || 0).toLocaleString()}</td>
                                                    <td style={{ fontWeight: 'bold' }}>${(item.quantity * (item.unit_price || 0)).toLocaleString()}</td>
                                                    <td className={styles.userCell}>{item.profiles?.username || "Unknown"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <h2 className={styles.sectionTitle}>{lang === "ko" ? "가게 주문 납품 내역" : "Detalles de Entregas"}</h2>
                            {deliveriesList.length === 0 ? (
                                <div className={styles.emptyCard}>{lang === "ko" ? "납품 기록이 없습니다." : "No hay registros de entregas."}</div>
                            ) : (
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>{lang === "ko" ? "시간" : "Hora"}</th>
                                                <th>{lang === "ko" ? "품목" : "Artículo"}</th>
                                                <th>{lang === "ko" ? "색상/사이즈" : "Color/Talla"}</th>
                                                <th>{lang === "ko" ? "수량" : "Cant"}</th>
                                                <th>{lang === "ko" ? "단가" : "Precio Unit."}</th>
                                                <th>{lang === "ko" ? "합계" : "Total"}</th>
                                                <th>{lang === "ko" ? "담당자" : "Vendedor"}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deliveriesList.map(item => (
                                                <tr key={item.id}>
                                                    <td className={styles.dateCell}>{formatTime(item.created_at)}</td>
                                                    <td className={styles.itemCell}>{item.store_order_items?.sub_category || "-"}</td>
                                                    <td className={styles.optionCell}>
                                                        <span className={styles.colorTag}>{item.store_order_items?.color || "-"}</span>
                                                        <span className={styles.sizeTag}>{item.store_order_items?.size || "-"}</span>
                                                    </td>
                                                    <td className={styles.qtyCell}>{item.quantity}</td>
                                                    <td>${(item.unit_price || 0).toLocaleString()}</td>
                                                    <td style={{ fontWeight: 'bold' }}>${(item.quantity * (item.unit_price || 0)).toLocaleString()}</td>
                                                    <td className={styles.userCell}>{item.profiles?.username || "Unknown"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* ══ 기간별 분석 탭 ══ */}
            {tab === "analytics" && (
                <div className={styles.analyticsSection}>

                    {/* 기간 선택 */}
                    <div className={styles.analyticsHeader}>
                        <div className={styles.analyticsDateRow}>
                            <div className={styles.analyticsDateGroup}>
                                <label className={styles.analyticsDateLabel}>{lang === "ko" ? "시작일" : "Desde"}</label>
                                <input type="date" className={styles.analyticsDateInput} value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
                            </div>
                            <span className={styles.analyticsDateSep}>→</span>
                            <div className={styles.analyticsDateGroup}>
                                <label className={styles.analyticsDateLabel}>{lang === "ko" ? "종료일" : "Hasta"}</label>
                                <input type="date" className={styles.analyticsDateInput} value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
                            </div>
                        </div>
                        <div className={styles.analyticsQuickBtns}>
                            <button className={styles.quickBtn} onClick={() => setQuickRange(7)}>{lang === "ko" ? "최근 7일" : "7 días"}</button>
                            <button className={styles.quickBtn} onClick={() => setQuickRange(30)}>{lang === "ko" ? "최근 30일" : "30 días"}</button>
                            <button className={styles.quickBtn} onClick={setThisMonth}>{lang === "ko" ? "이번달" : "Este mes"}</button>
                            <button className={styles.quickBtn} onClick={setLastMonth}>{lang === "ko" ? "지난달" : "Mes ant."}</button>
                        </div>
                    </div>

                    {analyticsLoading ? (
                        <div className={styles.loading}>Loading...</div>
                    ) : (
                        <>
                            {/* 전체 요약 카드 */}
                            <div className={styles.summaryContainer}>
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryTitle}>{lang === "ko" ? "현장 판매 합계" : "Ventas totales"}</div>
                                    <div className={styles.summaryValue}>${analyticsSales.reduce((s, i) => s + i.quantity * (i.unit_price || 0), 0).toLocaleString()}</div>
                                    <div className={styles.summarySub}>{analyticsSales.reduce((s, i) => s + i.quantity, 0)} {lang === "ko" ? "개" : "uds."}</div>
                                </div>
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryTitle}>{lang === "ko" ? "납품 합계" : "Entregas totales"}</div>
                                    <div className={styles.summaryValue}>${analyticsDeliveries.reduce((s, i) => s + i.quantity * (i.unit_price || 0), 0).toLocaleString()}</div>
                                    <div className={styles.summarySub}>{analyticsDeliveries.reduce((s, i) => s + i.quantity, 0)} {lang === "ko" ? "개" : "uds."}</div>
                                </div>
                                <div className={`${styles.summaryCard} ${styles.cardTotal}`}>
                                    <div className={styles.summaryTitle}>{lang === "ko" ? "기간 전체 총합" : "Total del período"}</div>
                                    <div className={styles.summaryValue}>${grandAmount.toLocaleString()}</div>
                                    <div className={styles.summarySub}>{grandTotal} {lang === "ko" ? "개" : "uds."}</div>
                                </div>
                            </div>

                            {/* 카테고리 필터 탭 */}
                            <div className={styles.analyticsCatBar}>
                                <button
                                    className={`${styles.analyticsCatBtn} ${analyticsMainCat === "all" ? styles.analyticsCatActive : ""}`}
                                    onClick={() => setAnalyticsMainCat("all")}
                                >
                                    {lang === "ko" ? "전체" : "Todos"} <span className={styles.badge}>{mainGrandTotal}</span>
                                </button>
                                {allMainCats.map(cat => (
                                    <button
                                        key={cat}
                                        className={`${styles.analyticsCatBtn} ${analyticsMainCat === cat ? styles.analyticsCatActive : ""}`}
                                        onClick={() => setAnalyticsMainCat(cat)}
                                    >
                                        {cat} <span className={styles.badge}>{mainStatMap.get(cat)?.total ?? 0}</span>
                                    </button>
                                ))}
                            </div>

                            {/* 서브카테고리 결과 */}
                            {aggEntries.length === 0 ? (
                                <div className={styles.emptyCard}>
                                    📭 {lang === "ko" ? "해당 기간에 판매 내역이 없습니다." : "Sin registros en el período seleccionado."}
                                </div>
                            ) : (
                                <div className={styles.analyticsDetail}>
                                    <div className={styles.analyticsSubHead}>
                                        <span>{lang === "ko" ? "서브카테고리" : "Subcategoría"}</span>
                                        <span style={{ textAlign: "right" }}>{lang === "ko" ? "판매량" : "Vendido"}</span>
                                        <span style={{ textAlign: "right" }}>{lang === "ko" ? "비율" : "Ratio"}</span>
                                    </div>
                                    {subRows.map(sr => {
                                        const pct = grandTotal > 0 ? Math.round((sr.total / grandTotal) * 100) : 0;
                                        const colorEntries = Array.from(sr.colorMap.entries()).sort((a, b) => b[1].qty - a[1].qty);
                                        return (
                                            <div key={sr.sub} className={styles.analyticsSubRow}>
                                                <div className={styles.analyticsSubRowTop}>
                                                    <span className={styles.analyticsSubName}>{sr.sub}</span>
                                                    <span className={styles.analyticsSubQty}>{sr.total.toLocaleString()}</span>
                                                    <span className={styles.analyticsSubPct}>{pct}%</span>
                                                </div>
                                                <div className={styles.analyticsBar}>
                                                    <div className={styles.analyticsBarFill} style={{ width: `${pct}%` }} />
                                                </div>
                                                <div className={styles.analyticsColorRow}>
                                                    {colorEntries.map(([ck, v]) => (
                                                        <span key={ck} className={styles.analyticsColorTag}>
                                                            <span className={styles.analyticsColorKey}>{ck}</span>
                                                            <span className={styles.analyticsColorVal}>{v.qty}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
