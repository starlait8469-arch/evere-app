"use client";

import { useEffect, useState } from "react";
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

    const [selectedDate, setSelectedDate] = useState(() => {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    });
    const [salesList, setSalesList] = useState<SalesHistoryItem[]>([]);
    const [deliveriesList, setDeliveriesList] = useState<DeliveryHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        const checkAccessAndFetch = async () => {
            setLoading(true);
            setFetchError(null);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.replace("/auth/login");
                return;
            }

            const role = session.user.user_metadata?.role;
            if (role !== "admin") {
                router.replace("/dashboard/sales");
                return;
            }

            try {
                const res = await fetch(`/api/sales-history?date=${selectedDate}`);
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
        };

        checkAccessAndFetch();
    }, [router, selectedDate, supabase.auth]);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString(lang === "ko" ? "ko-KR" : "es-ES", {
            hour: "2-digit", minute: "2-digit"
        });
    };

    const totalSalesQty = salesList.reduce((acc, curr) => acc + curr.quantity, 0);
    const totalSalesAmount = salesList.reduce((acc, curr) => acc + (curr.quantity * (curr.unit_price || 0)), 0);

    const totalDeliveriesQty = deliveriesList.reduce((acc, curr) => acc + curr.quantity, 0);
    const totalDeliveriesAmount = deliveriesList.reduce((acc, curr) => acc + (curr.quantity * (curr.unit_price || 0)), 0);

    const grandTotalQty = totalSalesQty + totalDeliveriesQty;
    const grandTotalAmount = totalSalesAmount + totalDeliveriesAmount;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{lang === "ko" ? "판매 장부" : "Historial de Ventas"}</h1>
                <p className={styles.subtitle}>
                    {lang === "ko" ? "일일 매출 및 납품 예약 기록 (관리자 전용)" : "Registro diario de ventas y entregas (Solo Admin)"}
                </p>
            </div>

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
                    <button onClick={() => window.location.reload()} className={styles.retryBtn}>Retry</button>
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
                            <div className={styles.summaryValue}>${totalDeliveriesAmount.toLocaleString()}</div>
                            <div className={styles.summarySub}>{totalDeliveriesQty} {lang === "ko" ? "개 완료" : "uds"}</div>
                        </div>
                        <div className={`${styles.summaryCard} ${styles.cardTotal}`}>
                            <div className={styles.summaryTitle}>{lang === "ko" ? "총 합계" : "Total General"}</div>
                            <div className={styles.summaryValue}>${grandTotalAmount.toLocaleString()}</div>
                            <div className={styles.summarySub}>{grandTotalQty} {lang === "ko" ? "개" : "uds"}</div>
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
                                            <td className={styles.dateCell}>{formatDate(item.created_at)}</td>
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
                                            <td className={styles.dateCell}>{formatDate(item.created_at)}</td>
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
        </div>
    );
}
