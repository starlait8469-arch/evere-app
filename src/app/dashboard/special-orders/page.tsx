"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./special.module.css";

type SpecialOrder = {
    id: string;
    customer_name: string;
    order_date: string;
    due_date: string;
    memo: string | null;
    status: string;
    created_at: string;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const dueDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
};
const fmtDate = (s: string) => {
    const d = new Date(s + "T00:00:00");
    return d.toLocaleDateString("es-AR", { year: "numeric", month: "short", day: "numeric" });
};
const daysLeft = (due: string) => {
    const diff = new Date(due + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0);
    return Math.ceil(diff / 86400000);
};

export default function SpecialOrdersPage() {
    const { lang } = useLanguage();
    const router = useRouter();
    const supabase = createClient();

    const [isAdmin, setIsAdmin] = useState(false);
    const [orders, setOrders] = useState<SpecialOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<"all" | "active" | "done">("active");

    // Form state
    const [customerName, setCustomerName] = useState("");
    const [orderDate, setOrderDate] = useState(todayStr());
    const [dueDate, setDueDate] = useState(dueDateStr());
    const [memo, setMemo] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) { router.push("/auth/login"); return; }
            if (session.user.user_metadata?.role !== "admin") { router.push("/dashboard"); return; }
            setIsAdmin(true);
            fetchOrders();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("special_orders")
            .select("*")
            .order("created_at", { ascending: false });
        setOrders((data as SpecialOrder[]) || []);
        setLoading(false);
    };

    const saveOrder = async () => {
        if (!customerName.trim()) return;
        setSaving(true);
        await supabase.from("special_orders").insert([{
            customer_name: customerName.trim(),
            order_date: orderDate,
            due_date: dueDate,
            memo: memo || null,
            status: "active",
        }]);
        setSaving(false);
        setCustomerName(""); setOrderDate(todayStr()); setDueDate(dueDateStr()); setMemo("");
        setShowForm(false);
        fetchOrders();
    };

    const setStatus = async (id: string, status: string) => {
        await supabase.from("special_orders").update({ status }).eq("id", id);
        fetchOrders();
    };

    const deleteOrder = async (id: string) => {
        if (!confirm(lang === "ko" ? "삭제하시겠습니까?" : "¿Eliminar?")) return;
        await supabase.from("special_orders").delete().eq("id", id);
        fetchOrders();
    };

    const saveMemo = async (id: string, newMemo: string) => {
        await supabase.from("special_orders").update({ memo: newMemo }).eq("id", id);
    };

    if (!isAdmin) return null;

    const filtered = filterStatus === "all" ? orders : orders.filter(o => o.status === filterStatus);

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>📋 {lang === "ko" ? "특수 주문" : "Pedidos Especiales"}</h1>
                    <p className={styles.subtitle}>
                        {lang === "ko" ? "가게에 없는 품목 특별 주문 메모" : "Notas de pedidos especiales fuera de stock"}
                    </p>
                </div>
                <button className={styles.newBtn} onClick={() => { setShowForm(true); window.scrollTo(0, 0); }}>
                    + {lang === "ko" ? "새 특주" : "Nuevo"}
                </button>
            </div>

            {/* New Order Form */}
            {showForm && (
                <div className={styles.formCard}>
                    <div className={styles.formTitle}>
                        {lang === "ko" ? "✏️ 새 특수 주문" : "✏️ Nuevo pedido especial"}
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>👤 {lang === "ko" ? "고객 이름" : "Cliente"}</label>
                            <input
                                className={styles.formInput}
                                placeholder={lang === "ko" ? "고객 이름..." : "Nombre del cliente..."}
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>📅 {lang === "ko" ? "주문 날짜" : "Fecha pedido"}</label>
                            <input type="date" className={styles.formInput} value={orderDate}
                                onChange={e => setOrderDate(e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>⏰ {lang === "ko" ? "납품 기일" : "Fecha entrega"}</label>
                            <input type="date" className={styles.formInput} value={dueDate}
                                onChange={e => setDueDate(e.target.value)} />
                            <span className={styles.formHint}>
                                {lang === "ko" ? "(주문일 기준 +30일 자동)" : "(auto +30 días)"}
                            </span>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>📝 {lang === "ko" ? "주문 메모" : "Nota de pedido"}</label>
                        <textarea
                            className={styles.memoArea}
                            placeholder={lang === "ko"
                                ? "품목, 수량, 색상, 사이즈 등 자유롭게 메모하세요...\n\n예)\n- 파란 셔츠 L 3장\n- 흰 바지 M 5장"
                                : "Anotar artículos, cantidades, colores, tallas...\n\nEjemplo:\n- Camisa azul talla L x3\n- Pantalón blanco talla M x5"}
                            value={memo}
                            onChange={e => setMemo(e.target.value)}
                            rows={10}
                        />
                    </div>

                    <div className={styles.formActions}>
                        <button className={styles.cancelBtn} onClick={() => setShowForm(false)}>
                            {lang === "ko" ? "취소" : "Cancelar"}
                        </button>
                        <button className={styles.saveBtn} onClick={saveOrder} disabled={!customerName.trim() || saving}>
                            {saving ? "..." : `💾 ${lang === "ko" ? "저장" : "Guardar"}`}
                        </button>
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className={styles.filterBar}>
                {(["active", "all", "done"] as const).map(f => (
                    <button key={f}
                        className={`${styles.filterBtn} ${filterStatus === f ? styles.filterActive : ""}`}
                        onClick={() => setFilterStatus(f)}>
                        {f === "active" ? (lang === "ko" ? "진행중" : "Pendiente")
                            : f === "done" ? (lang === "ko" ? "완료" : "Completado")
                                : (lang === "ko" ? "전체" : "Todos")}
                    </button>
                ))}
                <span className={styles.count}>
                    {filtered.length}{lang === "ko" ? "건" : " pedidos"}
                </span>
            </div>

            {/* List */}
            {loading ? (
                <div className={styles.empty}>Loading...</div>
            ) : filtered.length === 0 ? (
                <div className={styles.empty}>{lang === "ko" ? "주문 없음" : "Sin pedidos"}</div>
            ) : (
                <div className={styles.orderList}>
                    {filtered.map(order => {
                        const dl = daysLeft(order.due_date);
                        const isExpanded = expandedId === order.id;
                        const isDone = order.status === "done";
                        const urgentColor = dl < 0 ? "#ef4444" : dl <= 7 ? "#f97316" : dl <= 14 ? "#f59e0b" : "#10b981";

                        return (
                            <div key={order.id} className={`${styles.orderCard} ${isDone ? styles.orderDone : ""}`}>
                                {/* Card Top */}
                                <div className={styles.cardTop} onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                                    <div className={styles.cardLeft}>
                                        <span className={styles.cardCustomer}>
                                            {isDone ? "✅ " : "📋 "}{order.customer_name}
                                        </span>
                                        <div className={styles.cardDates}>
                                            <span>{lang === "ko" ? "주문" : "Pedido"}: {fmtDate(order.order_date)}</span>
                                            <span className={styles.separator}>·</span>
                                            <span>{lang === "ko" ? "납품" : "Entrega"}: {fmtDate(order.due_date)}</span>
                                        </div>
                                    </div>
                                    <div className={styles.cardRight}>
                                        {!isDone && (
                                            <span className={styles.daysLeft} style={{ color: urgentColor, borderColor: urgentColor + "40", background: urgentColor + "10" }}>
                                                {dl < 0
                                                    ? (lang === "ko" ? `${Math.abs(dl)}일 초과` : `${Math.abs(dl)}d venc.`)
                                                    : (lang === "ko" ? `D-${dl}` : `${dl}d`)}
                                            </span>
                                        )}
                                        <span className={styles.chevron}>{isExpanded ? "▲" : "▼"}</span>
                                    </div>
                                </div>

                                {/* Memo preview (collapsed) */}
                                {!isExpanded && order.memo && (
                                    <div className={styles.memoPreview}>{order.memo}</div>
                                )}

                                {/* Expanded */}
                                {isExpanded && (
                                    <div className={styles.cardDetail}>
                                        <textarea
                                            className={styles.memoEditArea}
                                            defaultValue={order.memo ?? ""}
                                            onBlur={e => saveMemo(order.id, e.target.value)}
                                            placeholder={lang === "ko" ? "메모..." : "Nota..."}
                                            rows={8}
                                        />
                                        <div className={styles.cardActions}>
                                            {!isDone ? (
                                                <button className={styles.doneBtn} onClick={() => setStatus(order.id, "done")}>
                                                    ✅ {lang === "ko" ? "완료 처리" : "Completar"}
                                                </button>
                                            ) : (
                                                <button className={styles.reopenBtn} onClick={() => setStatus(order.id, "active")}>
                                                    🔄 {lang === "ko" ? "재개" : "Reabrir"}
                                                </button>
                                            )}
                                            <button className={styles.deleteBtn} onClick={() => deleteOrder(order.id)}>
                                                🗑 {lang === "ko" ? "삭제" : "Eliminar"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
