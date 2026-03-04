"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./orders.module.css";

type InventoryItem = {
    id: string;
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
};

type OrderRow = {
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: string;
};

type StoreOrderItem = {
    id: string;
    order_id: string;
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
    delivered_qty: number;
};

type StoreOrder = {
    id: string;
    created_at: string;
    customer_name: string | null;
    note: string | null;
    total_qty: number;
    status: string;
    store_order_items: StoreOrderItem[];
};

// 납품 모달에서 사용하는 각 품목 행
type DeliveryRow = {
    itemId: string;
    label: string;           // 표시명
    color: string;
    size: string;
    orderedQty: number;
    deliveredQty: number;    // 기 납품 수량
    thisQty: number;         // 이번 납품 수량 (입력값)
    stockQty: number;        // 현재 재고
};

const emptyRow = (): OrderRow => ({
    main_category: "", sub_category: "", color: "", size: "", quantity: "",
});

const STATUS_LABELS: Record<string, { ko: string; es: string; color: string }> = {
    pending: { ko: "주문접수", es: "Pendiente", color: "#f59e0b" },
    partial: { ko: "일부납품", es: "Parcial", color: "#8b5cf6" },
    delivered: { ko: "납품완료", es: "Entregado", color: "#6366f1" },
    cancelled: { ko: "취소", es: "Cancelado", color: "#ef4444" },
};

export default function OrdersPage() {
    const { lang } = useLanguage();
    const router = useRouter();
    const supabase = createClient();

    const [isAdmin, setIsAdmin] = useState(false);
    const [token, setToken] = useState("");
    const [tab, setTab] = useState<"list" | "new">("list");

    // Inventory
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState(true);

    // Orders list
    const [orders, setOrders] = useState<StoreOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>("all");

    // New order form
    const [rows, setRows] = useState<OrderRow[]>([emptyRow()]);
    const [customerName, setCustomerName] = useState("");
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [slipData, setSlipData] = useState<{ orderId: string; items: OrderRow[]; date: string; customer: string } | null>(null);

    // 납품 모달
    const [deliveryOrder, setDeliveryOrder] = useState<StoreOrder | null>(null);
    const [deliveryRows, setDeliveryRows] = useState<DeliveryRow[]>([]);
    const [delivering, setDelivering] = useState(false);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push("/auth/login"); return; }
            if (session.user.user_metadata?.role !== "admin") { router.push("/dashboard"); return; }
            setIsAdmin(true);
            setToken(session.access_token);
            fetchInventory();
            fetchOrders(session.access_token);
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchInventory = async () => {
        setInventoryLoading(true);
        const { data } = await supabase
            .from("inventory").select("*")
            .order("main_category").order("sub_category").order("color");
        setInventory((data as InventoryItem[]) || []);
        setInventoryLoading(false);
    };

    const fetchOrders = useCallback(async (tkn?: string) => {
        setOrdersLoading(true);
        const t = tkn || token;
        const res = await fetch("/api/orders", {
            headers: { Authorization: `Bearer ${t}` },
        });
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
        setOrdersLoading(false);
    }, [token]);

    // ─── Status update (취소, 납품완료 수동 처리용) ───
    const updateStatus = async (orderId: string, status: string) => {
        await fetch("/api/orders", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ orderId, status }),
        });
        fetchOrders();
    };

    // ─── 납품 모달 오픈 ───
    const openDeliveryModal = (order: StoreOrder) => {
        const rows: DeliveryRow[] = order.store_order_items.map(item => {
            const stockQty = inventory.find(inv =>
                inv.main_category === item.main_category &&
                inv.sub_category === (item.sub_category || "") &&
                inv.color === (item.color || "") &&
                inv.size === (item.size || "")
            )?.quantity ?? 0;

            const remaining = item.quantity - (item.delivered_qty ?? 0);
            // 기본값: 잔여수량과 재고 중 작은 값 (단, 0보다 크면)
            const defaultQty = Math.min(remaining, stockQty);

            return {
                itemId: item.id,
                label: item.sub_category || item.main_category,
                color: item.color,
                size: item.size,
                orderedQty: item.quantity,
                deliveredQty: item.delivered_qty ?? 0,
                thisQty: defaultQty > 0 ? defaultQty : 0,
                stockQty,
            };
        });
        setDeliveryRows(rows);
        setDeliveryOrder(order);
    };

    // ─── 납품 확인 ───
    const submitDelivery = async () => {
        if (!deliveryOrder) return;
        const deliveries = deliveryRows
            .filter(r => r.thisQty > 0)
            .map(r => ({ itemId: r.itemId, qty: r.thisQty }));

        if (deliveries.length === 0) return;

        setDelivering(true);
        await fetch("/api/orders", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: "deliver", orderId: deliveryOrder.id, deliveries }),
        });
        setDelivering(false);
        setDeliveryOrder(null);
        fetchOrders();
        fetchInventory();
    };

    // ─── Inventory-derived options ───
    const mainCats = [...new Set(inventory.map(i => i.main_category).filter(Boolean))];
    const subCatsFor = (main: string) => [...new Set(inventory.filter(i => i.main_category === main).map(i => i.sub_category).filter(Boolean))];
    const colorsFor = (main: string, sub: string) => [...new Set(inventory.filter(i => i.main_category === main && i.sub_category === sub).map(i => i.color).filter(Boolean))];
    const sizesFor = (main: string, sub: string, color: string) => [...new Set(inventory.filter(i => i.main_category === main && i.sub_category === sub && i.color === color).map(i => i.size).filter(Boolean))].sort((a, b) => {
        const na = parseFloat(a), nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
    });
    const stockQtyFor = (row: OrderRow) => inventory.find(i => i.main_category === row.main_category && i.sub_category === row.sub_category && i.color === row.color && i.size === row.size)?.quantity ?? -1;

    // ─── Row updates ───
    const updateRow = (idx: number, field: keyof OrderRow, value: string) => {
        setRows(prev => prev.map((r, i) => {
            if (i !== idx) return r;
            const updated = { ...r, [field]: value };
            if (field === "main_category") { updated.sub_category = ""; updated.color = ""; updated.size = ""; }
            if (field === "sub_category") { updated.color = ""; updated.size = ""; }
            if (field === "color") { updated.size = ""; }
            return updated;
        }));
    };
    const addRow = () => setRows(prev => [...prev, emptyRow()]);
    const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

    const validRows = rows.filter(r => r.main_category && r.sub_category && r.quantity && parseInt(r.quantity) > 0);
    const totalQty = validRows.reduce((s, r) => s + parseInt(r.quantity || "0"), 0);

    // ─── Submit ───
    const submitOrder = async () => {
        if (validRows.length === 0) return;
        setSubmitting(true);
        const items = validRows.map(r => ({
            main_category: r.main_category, sub_category: r.sub_category,
            color: r.color, size: r.size, quantity: parseInt(r.quantity),
        }));
        const res = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ items, note, customer_name: customerName }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) { alert(json.error || "Error"); return; }
        setSlipData({ orderId: json.orderId, items: [...validRows], date: new Date().toLocaleDateString("es-AR"), customer: customerName });
        setRows([emptyRow()]);
        setCustomerName("");
        setNote("");
        fetchOrders();
    };

    // ─── Print ───
    const printOrder = (data: NonNullable<typeof slipData>) => {
        const rowsHtml = data.items.map(item => `
            <tr>
                <td>${item.main_category}</td>
                <td>${item.sub_category || "—"}</td>
                <td>${item.color || "—"}</td>
                <td>${item.size || "—"}</td>
                <td style="text-align:center;font-weight:700;">${item.quantity}</td>
                <td class="check"><span class="box">□</span></td>
            </tr>`).join("");
        const total = data.items.reduce((s, i) => s + parseInt(String(i.quantity)), 0);
        const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Pedido</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,sans-serif; padding:32px; color:#111; }
  .header { border-bottom:3px solid #111; padding-bottom:16px; margin-bottom:20px; }
  .title { font-size:22px; font-weight:800; letter-spacing:-0.5px; }
  .meta { margin-top:8px; display:flex; gap:32px; font-size:13px; color:#555; flex-wrap:wrap; }
  .meta strong { color:#111; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  thead tr { background:#f0f0f0; }
  th { padding:10px 12px; text-align:left; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; border-bottom:2px solid #ddd; }
  td { padding:10px 12px; border-bottom:1px solid #eee; vertical-align:middle; }
  td.check { width:36px; text-align:center; }
  .box { font-size:18px; line-height:1; }
  tfoot td { font-weight:800; font-size:14px; background:#f9f9f9; border-top:2px solid #111; }
  .footer { margin-top:40px; display:flex; justify-content:space-between; }
  .sign { border-top:1px solid #aaa; padding-top:6px; min-width:120px; text-align:center; font-size:12px; color:#555; }
  @media print { body { padding:16px; } }
</style></head>
<body>
  <div class="header">
    <div class="title">Pedido</div>
    <div class="meta">
      <span>Fecha: <strong>${data.date}</strong></span>
      <span>N°: <strong>${data.orderId.slice(0, 8).toUpperCase()}</strong></span>
      ${data.customer ? `<span>Cliente: <strong>${data.customer}</strong></span>` : ""}
      <span>Total: <strong>${total}</strong> uds.</span>
    </div>
  </div>
  <table>
    <thead><tr><th>Categoría</th><th>Subcategoría</th><th>Color</th><th>Talla</th><th style="text-align:center;">Cantidad</th><th style="width:36px;text-align:center;">✓</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td style="text-align:center;">${total}</td><td></td></tr></tfoot>
  </table>
  <div class="footer">
    <div class="sign">Preparado por<br/><br/>__________________</div>
    <div class="sign">Entregado por<br/><br/>__________________</div>
    <div class="sign">Recibido por<br/><br/>__________________</div>
  </div>
</body></html>`;
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    };

    if (!isAdmin) return null;

    const filteredOrders = filterStatus === "all"
        ? orders
        : orders.filter(o => o.status === filterStatus);

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <h1 className={styles.title}>🧾 {lang === "ko" ? "가게 주문" : "Pedidos"}</h1>
                <div className={styles.tabs}>
                    <button className={`${styles.tab} ${tab === "list" ? styles.tabActive : ""}`} onClick={() => setTab("list")}>
                        {lang === "ko" ? "📋 주문 목록" : "📋 Lista"}
                    </button>
                    <button className={`${styles.tab} ${tab === "new" ? styles.tabActive : ""}`} onClick={() => setTab("new")}>
                        {lang === "ko" ? "＋ 새 주문" : "＋ Nuevo"}
                    </button>
                </div>
            </div>

            {/* ═══ TAB: 주문 목록 ═══ */}
            {tab === "list" && (
                <div className={styles.listSection}>
                    {/* 필터 */}
                    <div className={styles.filterBar}>
                        {["all", "pending", "partial", "delivered", "cancelled"].map(s => (
                            <button key={s}
                                className={`${styles.filterBtn} ${filterStatus === s ? styles.filterActive : ""}`}
                                onClick={() => setFilterStatus(s)}>
                                {s === "all"
                                    ? (lang === "ko" ? "전체" : "Todos")
                                    : (lang === "ko" ? STATUS_LABELS[s]?.ko : STATUS_LABELS[s]?.es)}
                            </button>
                        ))}
                        <button className={styles.refreshBtn} onClick={() => fetchOrders()}>↺</button>
                    </div>

                    {ordersLoading ? (
                        <div className={styles.empty}>Loading...</div>
                    ) : filteredOrders.length === 0 ? (
                        <div className={styles.empty}>{lang === "ko" ? "주문 없음" : "Sin pedidos"}</div>
                    ) : (
                        <div className={styles.orderCards}>
                            {filteredOrders.map(order => {
                                const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
                                const isExpanded = expandedId === order.id;
                                return (
                                    <div key={order.id} className={styles.orderCard}>
                                        <div className={styles.orderCardTop} onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                                            <div className={styles.orderMeta}>
                                                {order.customer_name && (
                                                    <span className={styles.customerName}>👤 {order.customer_name}</span>
                                                )}
                                                <span className={styles.orderId}>#{order.id.slice(0, 8).toUpperCase()}</span>
                                                <span className={styles.orderDate}>{new Date(order.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <div className={styles.orderRight}>
                                                <span className={styles.orderQty}>{order.total_qty} {lang === "ko" ? "개" : "uds."}</span>
                                                <span className={styles.statusBadge} style={{ background: st.color + "20", color: st.color, border: `1px solid ${st.color}40` }}>
                                                    {lang === "ko" ? st.ko : st.es}
                                                </span>
                                                <span className={styles.chevron}>{isExpanded ? "▲" : "▼"}</span>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className={styles.orderDetail}>
                                                {/* 아이템 목록 */}
                                                <div className={styles.itemList}>
                                                    {order.store_order_items?.map(item => {
                                                        const delivered = item.delivered_qty ?? 0;
                                                        const remaining = item.quantity - delivered;
                                                        return (
                                                            <div key={item.id} className={styles.itemRow}>
                                                                <span className={styles.itemName}>{item.sub_category || item.main_category}</span>
                                                                <div className={styles.itemTags}>
                                                                    {item.color && <span className={styles.tag}>{item.color}</span>}
                                                                    {item.size && <span className={styles.tag}>{item.size}</span>}
                                                                </div>
                                                                <div className={styles.itemQtyGroup}>
                                                                    <span className={styles.itemQty}>× {item.quantity}</span>
                                                                    {delivered > 0 && (
                                                                        <span className={styles.itemDelivered}>
                                                                            ✓ {delivered}
                                                                            {remaining > 0 && <span className={styles.itemRemaining}> / 잔{remaining}</span>}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {order.note && <p className={styles.orderNote}>📝 {order.note}</p>}

                                                {/* 액션 버튼 */}
                                                <div className={styles.orderActions}>
                                                    {(order.status === "pending" || order.status === "partial") && (
                                                        <>
                                                            <button
                                                                className={styles.actionBtn}
                                                                style={{ background: "#059669" }}
                                                                onClick={() => openDeliveryModal(order)}
                                                            >
                                                                📦 {lang === "ko"
                                                                    ? (order.status === "partial" ? "추가 납품" : "납품하기")
                                                                    : (order.status === "partial" ? "Entregar más" : "Entregar")}
                                                            </button>
                                                            <button className={styles.actionBtnOutline} style={{ borderColor: "#ef4444", color: "#ef4444" }}
                                                                onClick={() => updateStatus(order.id, "cancelled")}>
                                                                {lang === "ko" ? "취소" : "Cancelar"}
                                                            </button>
                                                        </>
                                                    )}
                                                    {order.status === "delivered" && (
                                                        <span className={styles.deliveredBadge}>
                                                            ✅ {lang === "ko" ? "납품완료" : "Entregado"}
                                                        </span>
                                                    )}
                                                    <button className={styles.actionBtnOutline}
                                                        onClick={() => {
                                                            const items = order.store_order_items.map(i => ({
                                                                main_category: i.main_category, sub_category: i.sub_category,
                                                                color: i.color, size: i.size, quantity: String(i.quantity),
                                                            }));
                                                            printOrder({ orderId: order.id, items, date: new Date(order.created_at).toLocaleDateString("es-AR"), customer: order.customer_name || "" });
                                                        }}>
                                                        🖨️ {lang === "ko" ? "재인쇄" : "Reimprimir"}
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
            )}

            {/* ═══ TAB: 새 주문 ═══ */}
            {tab === "new" && (
                <div className={styles.formCard}>
                    {/* 고객명 + 메모 */}
                    <div className={styles.topInputs}>
                        <div className={styles.inputGroup}>
                            <label className={styles.inputLabel}>👤 {lang === "ko" ? "고객 이름" : "Cliente"}</label>
                            <input className={styles.textInput}
                                placeholder={lang === "ko" ? "고객 이름 입력..." : "Nombre del cliente..."}
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)} />
                        </div>
                        <div className={styles.inputGroup}>
                            <label className={styles.inputLabel}>📝 {lang === "ko" ? "메모" : "Nota"}</label>
                            <input className={styles.textInput}
                                placeholder={lang === "ko" ? "메모 (선택)" : "Nota opcional"}
                                value={note}
                                onChange={e => setNote(e.target.value)} />
                        </div>
                    </div>

                    {/* Row Header */}
                    <div className={styles.rowsHeader}>
                        <span className={styles.colLabel}>{lang === "ko" ? "분류" : "Categ."}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "서브" : "Subcateg."}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "색상" : "Color"}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "사이즈" : "Talla"}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "수량" : "Cant."}</span>
                        <span />
                    </div>

                    {inventoryLoading ? <div className={styles.empty}>Loading...</div> : rows.map((row, idx) => {
                        const subs = subCatsFor(row.main_category);
                        const colors = colorsFor(row.main_category, row.sub_category);
                        const sizes = sizesFor(row.main_category, row.sub_category, row.color);
                        const stockQty = stockQtyFor(row);
                        const orderedQty = parseInt(row.quantity || "0");
                        const isOverStock = stockQty >= 0 && orderedQty > stockQty;
                        return (
                            <div key={idx} className={styles.orderRow}>
                                <select className={styles.sel} value={row.main_category} onChange={e => updateRow(idx, "main_category", e.target.value)}>
                                    <option value="">—</option>
                                    {mainCats.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <select className={styles.sel} value={row.sub_category} onChange={e => updateRow(idx, "sub_category", e.target.value)} disabled={!row.main_category}>
                                    <option value="">—</option>
                                    {subs.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <select className={styles.sel} value={row.color} onChange={e => updateRow(idx, "color", e.target.value)} disabled={!row.sub_category}>
                                    <option value="">—</option>
                                    {colors.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <select className={styles.sel} value={row.size} onChange={e => updateRow(idx, "size", e.target.value)} disabled={!row.color}>
                                    <option value="">—</option>
                                    {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <div className={styles.qtyCell}>
                                    <input type="number" min="1"
                                        className={`${styles.qtyInput} ${isOverStock ? styles.qtyInputWarn : ""}`}
                                        placeholder="0"
                                        value={row.quantity}
                                        onChange={e => updateRow(idx, "quantity", e.target.value)} />
                                    {stockQty >= 0 && (
                                        <span className={`${styles.maxHint} ${isOverStock ? styles.maxHintWarn : ""}`}>
                                            /{stockQty}
                                        </span>
                                    )}
                                </div>
                                <button className={styles.removeBtn} onClick={() => removeRow(idx)} disabled={rows.length === 1}>✕</button>
                            </div>
                        );
                    })}

                    <button className={styles.addRowBtn} onClick={addRow}>
                        + {lang === "ko" ? "항목 추가" : "Agregar línea"}
                    </button>

                    <div className={styles.footer}>
                        <div className={styles.footerRight}>
                            <div className={styles.totalRow}>
                                <span className={styles.totalLabel}>{lang === "ko" ? "총 수량" : "Total"}</span>
                                <span className={styles.totalVal}>{totalQty}</span>
                            </div>
                            <button className={styles.submitBtn}
                                onClick={submitOrder}
                                disabled={validRows.length === 0 || submitting}>
                                {submitting
                                    ? (lang === "ko" ? "처리중..." : "Procesando...")
                                    : `🧾 ${lang === "ko" ? "주문서 생성" : "Crear pedido"}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Slip modal ─── */}
            {slipData && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <div className={styles.slipIcon}>🧾</div>
                        <h3>{lang === "ko" ? "주문 완료!" : "¡Pedido creado!"}</h3>
                        {slipData.customer && <p className={styles.customerNameSlip}>👤 {slipData.customer}</p>}
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? `${slipData.items.length}가지, 총 ${slipData.items.reduce((s, i) => s + parseInt(String(i.quantity)), 0)}개`
                                : `${slipData.items.length} línea(s), ${slipData.items.reduce((s, i) => s + parseInt(String(i.quantity)), 0)} uds.`}
                        </p>
                        <div className={styles.slipPreview}>
                            {slipData.items.map((item, i) => (
                                <div key={i} className={styles.slipRow}>
                                    <span className={styles.slipItem}>{item.sub_category || item.main_category}</span>
                                    <div className={styles.slipTags}>
                                        {item.color && <span className={styles.tag}>{item.color}</span>}
                                        {item.size && <span className={styles.tag}>{item.size}</span>}
                                    </div>
                                    <span className={styles.slipQty}>{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => { setSlipData(null); setTab("list"); }}>
                                {lang === "ko" ? "목록으로" : "Ver lista"}
                            </button>
                            <button className={styles.btnPrint} onClick={() => { printOrder(slipData); setSlipData(null); setTab("list"); }}>
                                🖨️ {lang === "ko" ? "주문전표 인쇄" : "Imprimir"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 납품 모달 ─── */}
            {deliveryOrder && (
                <div className={styles.modalOverlay} onClick={() => !delivering && setDeliveryOrder(null)}>
                    <div className={styles.deliveryModal} onClick={e => e.stopPropagation()}>
                        <div className={styles.deliveryModalHeader}>
                            <div>
                                <h3 className={styles.deliveryModalTitle}>
                                    📦 {lang === "ko" ? "납품 처리" : "Entregar"}
                                </h3>
                                {deliveryOrder.customer_name && (
                                    <p className={styles.deliveryModalSub}>👤 {deliveryOrder.customer_name}</p>
                                )}
                            </div>
                            <button className={styles.modalCloseBtn} onClick={() => setDeliveryOrder(null)} disabled={delivering}>✕</button>
                        </div>

                        {/* 컬럼 헤더 */}
                        <div className={styles.deliveryColHeader}>
                            <span>{lang === "ko" ? "품목" : "Artículo"}</span>
                            <span style={{ textAlign: "center" }}>{lang === "ko" ? "주문" : "Ped."}</span>
                            <span style={{ textAlign: "center" }}>{lang === "ko" ? "기납품" : "Entregado"}</span>
                            <span style={{ textAlign: "center" }}>{lang === "ko" ? "재고" : "Stock"}</span>
                            <span style={{ textAlign: "center" }}>{lang === "ko" ? "이번납품" : "Ahora"}</span>
                        </div>

                        <div className={styles.deliveryItemList}>
                            {deliveryRows.map((row, idx) => {
                                const remaining = row.orderedQty - row.deliveredQty;
                                const isOverStock = row.thisQty > row.stockQty;
                                const isFullyDelivered = remaining <= 0;
                                return (
                                    <div key={row.itemId} className={`${styles.deliveryItem} ${isFullyDelivered ? styles.deliveryItemDone : ""}`}>
                                        <div className={styles.deliveryItemName}>
                                            <span>{row.label}</span>
                                            <div className={styles.deliveryItemTags}>
                                                {row.color && <span className={styles.tag}>{row.color}</span>}
                                                {row.size && <span className={styles.tag}>{row.size}</span>}
                                            </div>
                                        </div>
                                        <span className={styles.deliveryNum}>{row.orderedQty}</span>
                                        <span className={styles.deliveryNum} style={{ color: row.deliveredQty > 0 ? "#059669" : "var(--text-muted)" }}>
                                            {row.deliveredQty > 0 ? `✓ ${row.deliveredQty}` : "—"}
                                        </span>
                                        <span className={`${styles.deliveryNum} ${row.stockQty === 0 ? styles.stockZero : ""}`}>
                                            {row.stockQty}
                                        </span>
                                        {isFullyDelivered ? (
                                            <span className={styles.deliveryDoneLabel}>
                                                {lang === "ko" ? "완료" : "Listo"}
                                            </span>
                                        ) : (
                                            <input
                                                type="number"
                                                min={0}
                                                max={remaining}
                                                className={`${styles.deliveryQtyInput} ${isOverStock ? styles.qtyInputWarn : ""}`}
                                                value={row.thisQty}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    setDeliveryRows(prev => prev.map((r, i) =>
                                                        i === idx ? { ...r, thisQty: val } : r
                                                    ));
                                                }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* 재고 초과 경고 */}
                        {deliveryRows.some(r => r.thisQty > r.stockQty) && (
                            <div className={styles.deliveryWarn}>
                                ⚠️ {lang === "ko" ? "재고보다 많이 납품합니다. 재고가 0이 됩니다." : "Cantidad supera el stock disponible."}
                            </div>
                        )}

                        <div className={styles.deliveryActions}>
                            <button className={styles.btnCancel} onClick={() => setDeliveryOrder(null)} disabled={delivering}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button
                                className={styles.btnDeliver}
                                disabled={delivering || deliveryRows.every(r => r.thisQty <= 0)}
                                onClick={submitDelivery}
                            >
                                {delivering
                                    ? (lang === "ko" ? "처리중..." : "Procesando...")
                                    : `📦 ${lang === "ko" ? "납품 확인" : "Confirmar entrega"}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
