"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./history.module.css";

// 판매 기록 데이터 형태
type SalesHistoryItem = {
    id: string;
    quantity: number;
    created_at: string;
    inventory: {
        name: string;
        main_category: string;
        sub_category: string;
        color: string;
        size: string;
    } | null;
    profiles: {
        full_name: string;
        role: string;
    } | null;
};

export default function SalesHistoryPage() {
    const { t, lang } = useLanguage();
    const router = useRouter();
    const [historyList, setHistoryList] = useState<SalesHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const supabase = createClient();

    useEffect(() => {
        const checkAccessAndFetch = async () => {
            // 1. 권한 체크 (Admin만 접근 가능)
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.replace("/auth/login");
                return;
            }

            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", session.user.id)
                .single();

            if (!profile || profile.role !== "admin") {
                // 직원은 접근 불가 -> 일반 판매 화면이나 대시보드로 튕김
                router.replace("/dashboard/sales");
                return;
            }

            // 2. 판매 장부 데이터 가져오기 
            // supabase-js v2 조인 문법 (inventory & profiles 테이블)
            const { data, error } = await supabase
                .from("sales_history")
                .select(`
                    id,
                    quantity,
                    created_at,
                    inventory ( name, main_category, sub_category, color, size ),
                    profiles!sales_history_sold_by_fkey ( full_name, role )
                `)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Error fetching sales history:", error);
            } else if (data) {
                setHistoryList(data as unknown as SalesHistoryItem[]);
            }
            setLoading(false);
        };

        checkAccessAndFetch();
    }, [router]);

    // 날짜 포맷팅 유틸
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString(lang === "ko" ? "ko-KR" : "es-ES", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit"
        });
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{lang === "ko" ? "판매 장부" : "Historial de Ventas"}</h1>
                <p className={styles.subtitle}>
                    {lang === "ko" ? "최신 판매 내역(관리자 전용)" : "Últimas ventas registradas (Solo Admin)"}
                </p>
            </div>

            {loading ? (
                <div className={styles.loading}>Loading...</div>
            ) : historyList.length === 0 ? (
                <div className={styles.emptyCard}>
                    {lang === "ko" ? "판매 기록이 없습니다." : "No hay registros de ventas."}
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{lang === "ko" ? "일시" : "Fecha"}</th>
                                <th>{lang === "ko" ? "품목" : "Artículo"}</th>
                                <th>{lang === "ko" ? "옵션(색상/사이즈)" : "Opción (Color/Talla)"}</th>
                                <th>{lang === "ko" ? "판매수량" : "Cantidad"}</th>
                                <th>{lang === "ko" ? "담당자" : "Vendedor"}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyList.map(item => (
                                <tr key={item.id}>
                                    <td className={styles.dateCell}>{formatDate(item.created_at)}</td>
                                    <td className={styles.itemCell}>
                                        {item.inventory?.sub_category || item.inventory?.name || "-"}
                                    </td>
                                    <td className={styles.optionCell}>
                                        <span className={styles.colorTag}>{item.inventory?.color || "-"}</span>
                                        <span className={styles.sizeTag}>{item.inventory?.size || "-"}</span>
                                    </td>
                                    <td className={styles.qtyCell}>{item.quantity}</td>
                                    <td className={styles.userCell}>
                                        {item.profiles?.full_name || "Unknown"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
