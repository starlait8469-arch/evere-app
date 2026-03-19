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
    order_number?: string;
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

    // Production Status
    const [productionOrders, setProductionOrders] = useState<any[]>([]);

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

    // 계산서 직접 뽑기 모달
    type CustomInvoiceItem = { id: string; name: string; color: string; size: string; quantity: number; price: number };
    const emptyInvoiceItem = (): CustomInvoiceItem => ({
        id: Math.random().toString(36).slice(2),
        name: "", color: "", size: "", quantity: 1, price: 0
    });
    const [invoiceModalOrder, setInvoiceModalOrder] = useState<StoreOrder | null>(null);
    const [invoiceItems, setInvoiceItems] = useState<CustomInvoiceItem[]>([emptyInvoiceItem()]);
    const [invoiceSaving, setInvoiceSaving] = useState(false);
    const [invoiceDate, setInvoiceDate] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [invoiceNote, setInvoiceNote] = useState("");
    const [savedInvoiceOrders, setSavedInvoiceOrders] = useState<Set<string>>(new Set());

    // 주문 수정 모달
    type EditItem = { id: string; main_category: string; sub_category: string; color: string; size: string; quantity: number; delivered_qty: number; isNew?: boolean };
    const [editOrder, setEditOrder] = useState<StoreOrder | null>(null);
    const [editCustomerName, setEditCustomerName] = useState("");
    const [editNote, setEditNote] = useState("");
    const [editItems, setEditItems] = useState<EditItem[]>([]);
    const [editSubmitting, setEditSubmitting] = useState(false);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push("/auth/login"); return; }
            if (session.user.user_metadata?.role !== "admin") { router.push("/dashboard"); return; }
            setIsAdmin(true);
            setToken(session.access_token);
            fetchInventory();
            fetchProductionStatus();
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

    const fetchProductionStatus = async () => {
        // 완료되지 않은 모든 생산 오더 (stage != 'done')
        const { data, error } = await supabase
            .from("production_orders")
            .select(`
                id, stage, main_category, sub_category, color, size, quantity,
                sewing_factories(name)
            `)
            .neq("stage", "done");
        if (error) console.error("[fetchProductionStatus] error:", error);
        if (data) setProductionOrders(data);
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
            const itemMainLower = (item.main_category || "").trim().toLowerCase();
            const itemSubLower = (item.sub_category || "").trim().toLowerCase();
            const itemColorLower = (item.color || "").trim().toLowerCase();
            const itemSizeLower = (item.size || "").trim().toLowerCase();

            const stockQty = inventory.find(inv =>
                (inv.main_category || "").trim().toLowerCase() === itemMainLower &&
                (inv.sub_category || "").trim().toLowerCase() === itemSubLower &&
                (inv.color || "").trim().toLowerCase() === itemColorLower &&
                (inv.size || "").trim().toLowerCase() === itemSizeLower
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
        // await 없이 병렬로 호출 – 단, 최신 데이터 확보
        await fetchOrders();
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
    const stockQtyFor = (row: OrderRow) => {
        const rowMainLower = (row.main_category || "").trim().toLowerCase();
        const rowSubLower = (row.sub_category || "").trim().toLowerCase();
        const rowColorLower = (row.color || "").trim().toLowerCase();
        const rowSizeLower = (row.size || "").trim().toLowerCase();
        return inventory.find(i =>
            (i.main_category || "").trim().toLowerCase() === rowMainLower &&
            (i.sub_category || "").trim().toLowerCase() === rowSubLower &&
            (i.color || "").trim().toLowerCase() === rowColorLower &&
            (i.size || "").trim().toLowerCase() === rowSizeLower
        )?.quantity ?? -1;
    };

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
    const addRow = () => setRows(prev => {
        const last = prev[prev.length - 1];
        // 마지막 행의 품목+색상 값을 복사, size/quantity만 비우기
        return [...prev, {
            main_category: last.main_category,
            sub_category: last.sub_category,
            color: last.color,
            size: "",
            quantity: "",
        }];
    });
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
        const summaryMap = new Map<string, number>();
        data.items.forEach(item => {
            const key = `${item.sub_category || item.main_category || "—"} / ${item.color || "—"}`;
            summaryMap.set(key, (summaryMap.get(key) || 0) + parseInt(String(item.quantity), 10));
        });
        
        const summaryRowsHtml = Array.from(summaryMap.entries()).map(([key, qty]) => `
            <tr><td style="padding:4px 0; border:none; border-bottom:1px dashed #ccc;">${key}</td><td style="padding:4px 0; border:none; border-bottom:1px dashed #ccc; text-align:right; font-weight:700;">${qty}</td></tr>
        `).join("");
        
        const summaryHtml = `
            <div style="margin-bottom: 24px; padding: 12px 16px; background: #fdfdfd; border: 1px solid #ddd; border-radius: 4px;">
                <h3 style="font-size: 14px; margin-bottom: 8px; border-bottom: 2px solid #111; padding-bottom: 4px;">Resumen por Artículo y Color</h3>
                <table style="width:100%; border:none; margin:0; font-size:13px;"><tbody>${summaryRowsHtml}</tbody></table>
            </div>
        `;

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
  ${summaryHtml}
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

    // ─── Custom Invoice ───
    const openCustomInvoice = async (order: StoreOrder) => {
        // 날짜/번호 기본값 설정
        const today = new Date().toLocaleDateString("es-AR");
        const defaultNum = order.order_number || order.id.slice(0, 8).toUpperCase();
        setInvoiceDate(today);
        setInvoiceNumber(defaultNum);
        setInvoiceNote("");
        setInvoiceModalOrder(order);
        try {
            const res = await fetch(`/api/custom-invoices?orderId=${order.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.items && data.items.length > 0) {
                // 저장된 계산서가 있으면 불러오기
                const savedItems = data.items.filter((i: any) => !i._meta);
                const meta = data.items.find((i: any) => i._meta);
                setInvoiceItems(savedItems.length > 0 ? savedItems : [emptyInvoiceItem()]);
                if (meta) {
                    setInvoiceDate(meta.date || today);
                    setInvoiceNumber(meta.invoiceNumber || defaultNum);
                    setInvoiceNote(meta.note || "");
                }
            } else {
                // 저장된 계산서 없으면 빈 행 1개로 시작 (기존 주문 단가 불러오지 않음)
                setInvoiceItems([emptyInvoiceItem()]);
            }
        } catch (e) {
            console.error(e);
            setInvoiceItems([emptyInvoiceItem()]);
        }
    };

    const updateInvoiceItem = (idx: number, field: keyof CustomInvoiceItem, value: string | number) => {
        setInvoiceItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    };
    const addInvoiceRow = () => setInvoiceItems(prev => [...prev, emptyInvoiceItem()]);
    const removeInvoiceRow = (idx: number) => setInvoiceItems(prev => prev.filter((_, i) => i !== idx));

    const saveCustomInvoice = async (printAfter: boolean) => {
        if (!invoiceModalOrder) return;
        setInvoiceSaving(true);
        // 메타 정보를 _meta 마커와 함께 items에 포함
        const metaRow = { _meta: true, date: invoiceDate, invoiceNumber, note: invoiceNote };
        const payload = [...invoiceItems, metaRow];
        try {
            await fetch("/api/custom-invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    store_order_id: invoiceModalOrder.id,
                    customer_name: invoiceModalOrder.customer_name,
                    items: payload
                })
            });
            // 저장된 주문 ID 기록 (재인쇄 버튼 표시 용)
            setSavedInvoiceOrders(prev => new Set([...prev, invoiceModalOrder.id]));
            if (printAfter) {
                printCustomInvoice(invoiceModalOrder, invoiceItems, invoiceDate, invoiceNumber, invoiceNote);
            } else {
                setInvoiceModalOrder(null);
            }
        } catch (e) {
            console.error(e);
            alert("Error saving invoice");
        }
        setInvoiceSaving(false);
    };

    const reprintInvoice = async (order: StoreOrder) => {
        try {
            const res = await fetch(`/api/custom-invoices?orderId=${order.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.items) {
                const items = data.items.filter((i: any) => !i._meta);
                const meta = data.items.find((i: any) => i._meta);
                printCustomInvoice(
                    order, items,
                    meta?.date || new Date().toLocaleDateString("es-AR"),
                    meta?.invoiceNumber || order.order_number || order.id.slice(0, 8).toUpperCase(),
                    meta?.note || ""
                );
            }
        } catch (e) {
            console.error(e);
            alert("No se pudo recuperar la factura.");
        }
    };

    const printCustomInvoice = (
        order: StoreOrder,
        items: CustomInvoiceItem[],
        date: string,
        invNumber: string,
        note: string
    ) => {
        const summaryMap = new Map<string, number>();
        items.forEach(item => {
            const key = `${item.name || "—"} / ${item.color || "—"}`;
            summaryMap.set(key, (summaryMap.get(key) || 0) + Number(item.quantity));
        });
        
        const summaryRowsHtml = Array.from(summaryMap.entries()).map(([key, qty]) => `
            <tr><td style="padding:4px 0; border:none; border-bottom:1px dashed #ccc;">${key}</td><td style="padding:4px 0; border:none; border-bottom:1px dashed #ccc; text-align:right; font-weight:700;">${qty}</td></tr>
        `).join("");
        
        const summaryHtml = `
            <div style="margin-bottom: 24px; padding: 12px 16px; background: #fdfdfd; border: 1px solid #ddd; border-radius: 4px;">
                <h3 style="font-size: 14px; margin-bottom: 8px; border-bottom: 2px solid #111; padding-bottom: 4px;">Resumen por Artículo y Color</h3>
                <table style="width:100%; border:none; margin:0; font-size:13px;"><tbody>${summaryRowsHtml}</tbody></table>
            </div>
        `;

        const rowsHtml = items.map(item => `
            <tr>
                <td>${item.name || "—"}</td>
                <td>${item.color || "—"}</td>
                <td>${item.size || "—"}</td>
                <td style="text-align:center;">${item.quantity}</td>
                <td style="text-align:right;">$ ${Number(item.price).toLocaleString("es-AR")}</td>
                <td class="subtotal" style="text-align:right;">$ ${(item.quantity * Number(item.price)).toLocaleString("es-AR")}</td>
            </tr>`).join("");
        const totalQty = items.reduce((s, i) => s + Number(i.quantity), 0);
        const totalAmount = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.price)), 0);

        const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Factura - ${invNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,sans-serif; padding:32px; color:#111; }
  .header { border-bottom:3px solid #111; padding-bottom:16px; margin-bottom:20px; }
  .title { font-size:24px; font-weight:800; letter-spacing:-0.5px; }
  .meta { margin-top:8px; display:flex; gap:32px; font-size:14px; color:#555; flex-wrap:wrap; }
  .meta strong { color:#111; }
  .note-box { margin: 12px 0 20px; padding: 10px 14px; background:#f9f9f9; border-left: 3px solid #111; font-size:13px; color:#333; }
  table { width:100%; border-collapse:collapse; font-size:14px; margin-bottom: 24px; }
  thead tr { background:#f9f9f9; }
  th { padding:10px 12px; text-align:left; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; border-bottom:2px solid #ddd; border-top:2px solid #111; }
  td { padding:10px 12px; border-bottom:1px solid #eee; vertical-align:middle; }
  td.subtotal { font-weight: 600; }
  tfoot td { font-weight:800; font-size:15px; background:#f9f9f9; border-top:2px solid #111; border-bottom:2px solid #111; }
  .footer { margin-top:40px; display:flex; justify-content:flex-end; }
  .grand-total { font-size: 20px; font-weight: 800; border: 2px solid #111; padding: 12px 24px; }
  @media print { body { padding:16px; } }
</style></head>
<body>
  <div class="header">
    <div class="title">Comprobante Interno / Presupuesto</div>
    <div class="meta">
      <span>Fecha: <strong>${date}</strong></span>
      <span>N°: <strong>${invNumber}</strong></span>
      ${order.customer_name ? `<span>Cliente: <strong>${order.customer_name}</strong></span>` : ""}
    </div>
  </div>
  ${note ? `<div class="note-box">📝 ${note}</div>` : ""}
  ${summaryHtml}
  <table>
    <thead><tr><th>Artículo</th><th>Color</th><th>Talla</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Precio Un.</th><th style="text-align:right;">Subtotal</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="3">Total Unidades</td><td style="text-align:center;">${totalQty}</td><td colspan="2"></td></tr></tfoot>
  </table>
  <div class="footer">
    <div class="grand-total">Total a Pagar: $ ${totalAmount.toLocaleString("es-AR")}</div>
  </div>
</body></html>`;
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
        setInvoiceModalOrder(null);
    };

    // ─── 주문 수정 ───
    const openEditModal = (order: StoreOrder) => {
        setEditOrder(order);
        setEditCustomerName(order.customer_name || "");
        setEditNote(order.note || "");
        setEditItems(order.store_order_items.map(i => ({
            id: i.id,
            main_category: i.main_category,
            sub_category: i.sub_category,
            color: i.color,
            size: i.size,
            quantity: i.quantity,
            delivered_qty: i.delivered_qty ?? 0,
        })));
    };

    const submitEdit = async () => {
        if (!editOrder) return;
        setEditSubmitting(true);
        const res = await fetch("/api/orders", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                action: "edit",
                orderId: editOrder.id,
                customer_name: editCustomerName,
                note: editNote,
                items: editItems.map(i => ({
                    id: i.isNew ? undefined : i.id,
                    main_category: i.main_category,
                    sub_category: i.sub_category,
                    color: i.color,
                    size: i.size,
                    quantity: i.quantity,
                })),
            }),
        });
        setEditSubmitting(false);
        if (!res.ok) { const j = await res.json(); alert(j.error || "Error"); return; }
        setEditOrder(null);
        await fetchOrders();
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
                                                <span className={styles.orderId}>#{order.order_number || order.id.slice(0, 8).toUpperCase()}</span>
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

                                                        // 재고 비교를 위한 stockQty 계산 (대소문자 무시)
                                                        const itemMainLower = (item.main_category || "").trim().toLowerCase();
                                                        const itemSubLower = (item.sub_category || "").trim().toLowerCase();
                                                        const itemColorLower = (item.color || "").trim().toLowerCase();
                                                        const itemSizeLower = (item.size || "").trim().toLowerCase();

                                                        const invItem = inventory.find(i =>
                                                            (i.main_category || "").trim().toLowerCase() === itemMainLower &&
                                                            (i.sub_category || "").trim().toLowerCase() === itemSubLower &&
                                                            (i.color || "").trim().toLowerCase() === itemColorLower &&
                                                            (i.size || "").trim().toLowerCase() === itemSizeLower
                                                        );
                                                        const stockQty = invItem?.quantity ?? -1;
                                                        const isShortage = stockQty >= 0 && remaining > stockQty;

                                                        // 생산 진행 상황 집계 (대소문자 무시)
                                                        let cuttingQty = 0;
                                                        let sewingMap = new Map<string, number>();
                                                        let returnedQty = 0;
                                                        let finishingQty = 0;
                                                        let totalInProduction = 0;

                                                        if (isShortage) {
                                                            const relatedPo = productionOrders.filter(po =>
                                                                (po.main_category || "").trim().toLowerCase() === itemMainLower &&
                                                                (po.sub_category || "").trim().toLowerCase() === itemSubLower &&
                                                                (po.color || "").trim().toLowerCase() === itemColorLower &&
                                                                (po.size || "").trim().toLowerCase() === itemSizeLower
                                                            );

                                                            relatedPo.forEach(po => {
                                                                totalInProduction += po.quantity;
                                                                if (po.stage === "cutting") cuttingQty += po.quantity;
                                                                else if (po.stage === "returned") returnedQty += po.quantity;
                                                                else if (po.stage === "finishing") finishingQty += po.quantity;
                                                                else if (po.stage === "sewing") {
                                                                    const facName = (po.sewing_factories as any)?.name || (lang === "ko" ? "알 수 없음" : "Desconocido");
                                                                    sewingMap.set(facName, (sewingMap.get(facName) || 0) + po.quantity);
                                                                }
                                                            });
                                                        }

                                                        const shortageAmount = remaining - Math.max(0, stockQty);
                                                        const needsCutting = isShortage && (totalInProduction < shortageAmount);

                                                        return (
                                                            <div key={item.id} className={styles.itemRowContainer}>
                                                                <div className={styles.itemRow}>
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

                                                                {/* 🔴 재고 부족 및 생산 현황 알림 영역 */}
                                                                {isShortage && (
                                                                    <div className={styles.listPrdStatusRow}>
                                                                        <div className={styles.prdStatusText}>
                                                                            <span style={{ fontWeight: 600, marginRight: '4px' }}>
                                                                                {lang === "ko" ? "생산라인:" : "En prod.:"}
                                                                            </span>
                                                                            {totalInProduction === 0 ? (
                                                                                <span style={{ opacity: 0.6 }}>{lang === "ko" ? "진행 없음" : "Ninguno"}</span>
                                                                            ) : (
                                                                                <>
                                                                                    {cuttingQty > 0 && <span className={styles.prdStageTag}>✂️ 재단 {cuttingQty}</span>}
                                                                                    {Array.from(sewingMap.entries()).map(([fac, qty]) => (
                                                                                        <span key={fac} className={styles.prdStageTag}>🧵 {fac} ({qty})</span>
                                                                                    ))}
                                                                                    {returnedQty > 0 && <span className={styles.prdStageTag} style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>🏠 봉제입고 {returnedQty}</span>}
                                                                                    {finishingQty > 0 && <span className={styles.prdStageTag}>📦 Plancha {finishingQty}</span>}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        {needsCutting && (
                                                                            <div className={styles.listPrdStatusWarn}>
                                                                                ⚠️ {lang === "ko" ? "추가 재단 요망" : "Req. corte"}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
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
                                                            const items = order.store_order_items
                                                                .map(i => {
                                                                    const remaining = i.quantity - (i.delivered_qty || 0);
                                                                    return {
                                                                        main_category: i.main_category, sub_category: i.sub_category,
                                                                        color: i.color, size: i.size, quantity: String(remaining),
                                                                    };
                                                                })
                                                                .filter(i => parseInt(i.quantity, 10) > 0);

                                                            if (items.length === 0) {
                                                                alert(lang === "ko" ? "모두 납품되어 인쇄할 항목이 없습니다." : "Todos los artículos han sido entregados.");
                                                                return;
                                                            }

                                                            printOrder({ orderId: order.order_number || order.id, items, date: new Date(order.created_at).toLocaleDateString("es-AR"), customer: order.customer_name || "" });
                                                        }}>
                                                        🖨️ {lang === "ko" ? "재인쇄" : "Reimprimir"}
                                                    </button>
                                                    <button className={styles.actionBtnOutline} style={{ borderColor: "#8b5cf6", color: "#8b5cf6" }}
                                                        onClick={() => openCustomInvoice(order)}>
                                                        🧾 {lang === "ko" ? "계산서 작성" : "Factura Custom"}
                                                    </button>
                                                    {savedInvoiceOrders.has(order.id) && (
                                                        <button className={styles.actionBtnOutline} style={{ borderColor: "#059669", color: "#059669" }}
                                                            onClick={() => reprintInvoice(order)}>
                                                            📄 {lang === "ko" ? "계산서 PDF" : "PDF Factura"}
                                                        </button>
                                                    )}
                                                    {(order.status === "pending" || order.status === "partial") && (
                                                        <button className={styles.actionBtnOutline} style={{ borderColor: "#f59e0b", color: "#f59e0b" }}
                                                            onClick={() => openEditModal(order)}>
                                                            ✏️ {lang === "ko" ? "수정" : "Editar"}
                                                        </button>
                                                    )}
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

                        // 생산 진행 상황 집계 (재고 부족분 파악 시)
                        let cuttingQty = 0;
                        let sewingMap = new Map<string, number>();
                        let returnedQty = 0;
                        let finishingQty = 0;
                        let totalInProduction = 0;

                        if (isOverStock && row.main_category && row.sub_category) {
                            const rowMainLower = (row.main_category || "").trim().toLowerCase();
                            const rowSubLower = (row.sub_category || "").trim().toLowerCase();
                            const rowColorLower = (row.color || "").trim().toLowerCase();
                            const rowSizeLower = (row.size || "").trim().toLowerCase();

                            const relatedPo = productionOrders.filter(po =>
                                (po.main_category || "").trim().toLowerCase() === rowMainLower &&
                                (po.sub_category || "").trim().toLowerCase() === rowSubLower &&
                                (po.color || "").trim().toLowerCase() === rowColorLower &&
                                (po.size || "").trim().toLowerCase() === rowSizeLower
                            );

                            relatedPo.forEach(po => {
                                totalInProduction += po.quantity;
                                if (po.stage === "cutting") cuttingQty += po.quantity;
                                else if (po.stage === "returned") returnedQty += po.quantity;
                                else if (po.stage === "finishing") finishingQty += po.quantity;
                                else if (po.stage === "sewing") {
                                    const facName = (po.sewing_factories as any)?.name || (lang === "ko" ? "알 수 없음" : "Desconocido");
                                    sewingMap.set(facName, (sewingMap.get(facName) || 0) + po.quantity);
                                }
                            });
                        }

                        const shortage = orderedQty - Math.max(0, stockQty);
                        const needsCutting = isOverStock && (totalInProduction < shortage);

                        return (
                            <div key={idx} className={styles.orderRowContainer}>
                                <div className={styles.orderRow}>
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
                                        {sizes
                                            .filter(s => {
                                                // 이미 다른 행에서 같은 품목+색상으로 선택된 사이즈 제외
                                                const usedInOtherRows = rows
                                                    .filter((r, i) =>
                                                        i !== idx &&
                                                        r.main_category === row.main_category &&
                                                        r.sub_category === row.sub_category &&
                                                        r.color === row.color &&
                                                        r.size === s
                                                    );
                                                return usedInOtherRows.length === 0;
                                            })
                                            .map(s => <option key={s} value={s}>{s}</option>)
                                        }
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

                                {/* 🔴 재고 부족 알림 영역 */}
                                {isOverStock && (
                                    <div className={styles.prdStatusRow}>
                                        <div className={styles.prdStatusText}>
                                            <span style={{ fontWeight: 600, marginRight: '8px' }}>
                                                {lang === "ko" ? "현재 생산라인 진행:" : "En producción:"}
                                            </span>
                                            {totalInProduction === 0 ? (
                                                <span style={{ opacity: 0.6 }}>{lang === "ko" ? "진행 중인 건 없음" : "Ninguno en curso"}</span>
                                            ) : (
                                                <>
                                                    {cuttingQty > 0 && <span className={styles.prdStageTag}>✂️ 재단 {cuttingQty}</span>}
                                                    {Array.from(sewingMap.entries()).map(([fac, qty]) => (
                                                        <span key={fac} className={styles.prdStageTag}>🪡 {fac} ({qty})</span>
                                                    ))}
                                                    {returnedQty > 0 && <span className={styles.prdStageTag} style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>🏠 봉제입고 {returnedQty}</span>}
                                                    {finishingQty > 0 && <span className={styles.prdStageTag}>📦 Plancha {finishingQty}</span>}
                                                </>
                                            )}
                                        </div>
                                        {needsCutting && (
                                            <div className={styles.prdStatusWarn}>
                                                ⚠️ {lang === "ko" ? "생산 진행량이 부족하여 추가 재단이 필요합니다!" : "¡Falta cantidad en producción, requiere corte extra!"}
                                            </div>
                                        )}
                                    </div>
                                )}
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

            {/* ─── 주문 수정 모달 ─── */}
            {editOrder && (
                <div className={styles.modalOverlay} onClick={() => !editSubmitting && setEditOrder(null)}>
                    <div className={styles.deliveryModal} style={{ maxWidth: 680, width: "95vw" }} onClick={e => e.stopPropagation()}>
                        <div className={styles.deliveryModalHeader}>
                            <div>
                                <h3 className={styles.deliveryModalTitle}>
                                    ✏️ {lang === "ko" ? "주문 수정" : "Editar Pedido"}
                                </h3>
                                <p className={styles.deliveryModalSub}>
                                    #{editOrder.order_number || editOrder.id.slice(0, 8).toUpperCase()}
                                </p>
                            </div>
                            <button className={styles.modalCloseBtn} onClick={() => setEditOrder(null)} disabled={editSubmitting}>✕</button>
                        </div>

                        {/* 고객명 + 메모 */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                                    👤 {lang === "ko" ? "고객 이름" : "Cliente"}
                                </label>
                                <input
                                    type="text"
                                    value={editCustomerName}
                                    onChange={e => setEditCustomerName(e.target.value)}
                                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                                    📝 {lang === "ko" ? "메모" : "Nota"}
                                </label>
                                <input
                                    type="text"
                                    value={editNote}
                                    onChange={e => setEditNote(e.target.value)}
                                    placeholder={lang === "ko" ? "선택사항" : "Opcional"}
                                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
                                />
                            </div>
                        </div>

                        {/* 컬럼 헤더 */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 80px 80px 36px", gap: 6, padding: "8px 20px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
                            <span>{lang === "ko" ? "분류" : "Categ."}</span>
                            <span>{lang === "ko" ? "서브" : "Sub."}</span>
                            <span>{lang === "ko" ? "색상" : "Color"}</span>
                            <span>{lang === "ko" ? "사이즈" : "Talla"}</span>
                            <span style={{ textAlign: "center" }}>{lang === "ko" ? "수량" : "Cant."}</span>
                            <span style={{ textAlign: "center" }}>{lang === "ko" ? "납품" : "Entg."}</span>
                            <span />
                        </div>

                        {/* 아이템 목록 */}
                        <div style={{ maxHeight: 340, overflowY: "auto", padding: "8px 20px" }}>
                            {editItems.map((item, idx) => {
                                const minQty = item.delivered_qty;
                                const subs = subCatsFor(item.main_category);
                                const colors = colorsFor(item.main_category, item.sub_category);
                                const sizes = sizesFor(item.main_category, item.sub_category, item.color);
                                const selStyle = { padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12, width: "100%" };
                                const updateEdit = (field: string, value: string) => {
                                    setEditItems(prev => prev.map((it, i) => {
                                        if (i !== idx) return it;
                                        const updated = { ...it, [field]: value };
                                        if (field === "main_category") { updated.sub_category = ""; updated.color = ""; updated.size = ""; }
                                        if (field === "sub_category") { updated.color = ""; updated.size = ""; }
                                        if (field === "color") { updated.size = ""; }
                                        return updated;
                                    }));
                                };
                                return (
                                    <div key={item.id} style={{ marginBottom: 8 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 80px 80px 36px", gap: 6, alignItems: "center" }}>
                                            <select value={item.main_category} onChange={e => updateEdit("main_category", e.target.value)} style={selStyle}>
                                                <option value="">—</option>
                                                {mainCats.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <select value={item.sub_category} onChange={e => updateEdit("sub_category", e.target.value)} disabled={!item.main_category} style={selStyle}>
                                                <option value="">—</option>
                                                {subs.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <select value={item.color} onChange={e => updateEdit("color", e.target.value)} disabled={!item.sub_category} style={selStyle}>
                                                <option value="">—</option>
                                                {colors.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <select value={item.size} onChange={e => updateEdit("size", e.target.value)} disabled={!item.color} style={selStyle}>
                                                <option value="">—</option>
                                                {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <input
                                                type="number"
                                                min={minQty > 0 ? minQty : 1}
                                                value={item.quantity}
                                                onChange={e => {
                                                    const v = Math.max(minQty > 0 ? minQty : 1, parseInt(e.target.value) || 1);
                                                    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: v } : it));
                                                }}
                                                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 700, textAlign: "center", width: "100%" }}
                                            />
                                            <div style={{ textAlign: "center", fontSize: 12, color: item.delivered_qty > 0 ? "#059669" : "var(--text-muted)", fontWeight: 600 }}>
                                                {item.delivered_qty > 0 ? `✓ ${item.delivered_qty}` : "—"}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (item.delivered_qty > 0) {
                                                        alert(lang === "ko" ? "이미 납품된 품목은 삭제할 수 없습니다." : "No se puede eliminar un artículo ya entregado.");
                                                        return;
                                                    }
                                                    setEditItems(prev => prev.filter((_, i) => i !== idx));
                                                }}
                                                style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: item.delivered_qty > 0 ? "var(--border)" : "#ef4444", cursor: item.delivered_qty > 0 ? "not-allowed" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                                            >✕</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 항목 추가 버튼 */}
                        <div style={{ padding: "8px 20px" }}>
                            <button
                                onClick={() => setEditItems(prev => [...prev, {
                                    id: Math.random().toString(36).slice(2),
                                    main_category: "",
                                    sub_category: "",
                                    color: "",
                                    size: "",
                                    quantity: 1,
                                    delivered_qty: 0,
                                    isNew: true,
                                }])}
                                style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px dashed var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
                            >
                                + {lang === "ko" ? "항목 추가" : "Agregar artículo"}
                            </button>
                        </div>

                        {/* 안내 문구 */}
                        {editItems.some(i => i.delivered_qty > 0) && (
                            <div style={{ margin: "0 20px 8px", padding: "8px 12px", background: "rgba(251,191,36,0.1)", borderRadius: 6, fontSize: 12, color: "#92400e", border: "1px solid rgba(251,191,36,0.3)" }}>
                                ⚠️ {lang === "ko" ? "이미 납품된 수량보다 적게 설정할 수 없습니다." : "La cantidad no puede ser menor a la ya entregada."}
                            </div>
                        )}

                        {/* 액션 */}
                        <div className={styles.deliveryActions}>
                            <button className={styles.btnCancel} onClick={() => setEditOrder(null)} disabled={editSubmitting}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button
                                className={styles.btnDeliver}
                                style={{ background: "#f59e0b" }}
                                disabled={editSubmitting || editItems.length === 0}
                                onClick={submitEdit}
                            >
                                {editSubmitting
                                    ? (lang === "ko" ? "처리중..." : "Guardando...")
                                    : `✅ ${lang === "ko" ? "수정 저장" : "Guardar cambios"}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 계산서 작성 모달 ─── */}
            {invoiceModalOrder && (() => {
                const totalAmt = invoiceItems.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
                const aggregatedItems = (() => {
                    const map = new Map<string, { name: string; color: string; quantity: number }>();
                    invoiceModalOrder.store_order_items.forEach(i => {
                        const itemName = i.sub_category || i.main_category || "—";
                        const color = i.color || "—";
                        const key = `${itemName} / ${color}`;
                        if (!map.has(key)) map.set(key, { name: itemName, color, quantity: 0 });
                        map.get(key)!.quantity += i.quantity;
                    });
                    return Array.from(map.values());
                })();
                return (
                    <div className={styles.modalOverlay} onClick={() => !invoiceSaving && setInvoiceModalOrder(null)}>
                        <div className={styles.deliveryModal} style={{ maxWidth: 780, width: "95vw" }} onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className={styles.deliveryModalHeader}>
                                <div>
                                    <h3 className={styles.deliveryModalTitle}>
                                        🧾 {lang === "ko" ? "계산서 작성" : "Crear Factura"}
                                    </h3>
                                    {invoiceModalOrder.customer_name && (
                                        <p className={styles.deliveryModalSub}>👤 {invoiceModalOrder.customer_name}</p>
                                    )}
                                </div>
                                <button className={styles.modalCloseBtn} onClick={() => setInvoiceModalOrder(null)} disabled={invoiceSaving}>✕</button>
                            </div>

                            {/* Meta fields */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                                        {lang === "ko" ? "날짜" : "Fecha"}
                                    </label>
                                    <input
                                        type="text"
                                        value={invoiceDate}
                                        onChange={e => setInvoiceDate(e.target.value)}
                                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                                        {lang === "ko" ? "계산서 번호" : "N° Factura"}
                                    </label>
                                    <input
                                        type="text"
                                        value={invoiceNumber}
                                        onChange={e => setInvoiceNumber(e.target.value)}
                                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                                        {lang === "ko" ? "메모" : "Nota"}
                                    </label>
                                    <input
                                        type="text"
                                        value={invoiceNote}
                                        onChange={e => setInvoiceNote(e.target.value)}
                                        placeholder={lang === "ko" ? "선택사항" : "Opcional"}
                                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
                                    />
                                </div>
                            </div>

                            {/* Order Summary Memo */}
                            <div style={{ padding: "12px 20px", background: "rgba(99,102,241,0.08)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text)" }}>
                                <div style={{ fontWeight: 600, marginBottom: 8, color: "#4f46e5", display: "flex", alignItems: "center", gap: 6 }}>
                                    💡 <span>{lang === "ko" ? "주문 품목 요약 (계산서 입력 참고용)" : "Resumen del pedido (referencia)"}</span>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                    {aggregatedItems.map((agg, idx) => (
                                        <span key={idx} style={{ background: "var(--surface)", padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(99,102,241,0.2)", fontSize: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                                            {agg.name} <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span> {agg.color} <strong style={{ marginLeft: 6, color: "var(--text)" }}>{agg.quantity}</strong><span style={{ color: "var(--text-muted)", marginLeft: 2 }}>{lang === "ko" ? "장" : " uds."}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Column header */}
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px 110px 110px 32px", gap: 8, padding: "8px 20px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
                                <span>{lang === "ko" ? "품목명" : "Artículo"}</span>
                                <span>{lang === "ko" ? "색상" : "Color"}</span>
                                <span>{lang === "ko" ? "사이즈" : "Talla"}</span>
                                <span style={{ textAlign: "center" }}>{lang === "ko" ? "수량" : "Cant."}</span>
                                <span style={{ textAlign: "right" }}>{lang === "ko" ? "단가 ($)" : "Precio ($)"}</span>
                                <span style={{ textAlign: "right" }}>{lang === "ko" ? "소계" : "Subtotal"}</span>
                                <span />
                            </div>

                            {/* Item rows */}
                            <div style={{ maxHeight: 320, overflowY: "auto", padding: "8px 20px" }}>
                                {invoiceItems.map((item, idx) => {
                                    const subtotal = Number(item.quantity) * Number(item.price);
                                    return (
                                        <div key={item.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px 110px 110px 32px", gap: 8, alignItems: "center", marginBottom: 8 }}>
                                            <input
                                                type="text"
                                                value={item.name}
                                                onChange={e => updateInvoiceItem(idx, "name", e.target.value)}
                                                placeholder={lang === "ko" ? "품목명 입력" : "Nombre artículo"}
                                                style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: "100%" }}
                                            />
                                            <input
                                                type="text"
                                                value={item.color}
                                                onChange={e => updateInvoiceItem(idx, "color", e.target.value)}
                                                placeholder="—"
                                                style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: "100%" }}
                                            />
                                            <input
                                                type="text"
                                                value={item.size}
                                                onChange={e => updateInvoiceItem(idx, "size", e.target.value)}
                                                placeholder="—"
                                                style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: "100%" }}
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                value={item.quantity}
                                                onChange={e => updateInvoiceItem(idx, "quantity", parseInt(e.target.value) || 1)}
                                                style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: "100%", textAlign: "center" }}
                                            />
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={item.price}
                                                onChange={e => updateInvoiceItem(idx, "price", parseFloat(e.target.value) || 0)}
                                                style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: "100%", textAlign: "right" }}
                                            />
                                            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                                                $ {subtotal.toLocaleString("es-AR")}
                                            </div>
                                            <button
                                                onClick={() => removeInvoiceRow(idx)}
                                                disabled={invoiceItems.length === 1}
                                                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "#ef4444", cursor: invoiceItems.length === 1 ? "not-allowed" : "pointer", opacity: invoiceItems.length === 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
                                            >✕</button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add row + total */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderTop: "1px solid var(--border)" }}>
                                <button
                                    onClick={addInvoiceRow}
                                    style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px dashed var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
                                >
                                    + {lang === "ko" ? "항목 추가" : "Agregar línea"}
                                </button>
                                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                                    {lang === "ko" ? "합계:" : "Total:"} $ {totalAmt.toLocaleString("es-AR")}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className={styles.deliveryActions}>
                                <button className={styles.btnCancel} onClick={() => setInvoiceModalOrder(null)} disabled={invoiceSaving}>
                                    {lang === "ko" ? "취소" : "Cancelar"}
                                </button>
                                <button
                                    className={styles.btnDeliver}
                                    style={{ background: "#8b5cf6" }}
                                    disabled={invoiceSaving}
                                    onClick={() => saveCustomInvoice(false)}
                                >
                                    {invoiceSaving ? "..." : `💾 ${lang === "ko" ? "저장" : "Guardar"}`}
                                </button>
                                <button
                                    className={styles.btnDeliver}
                                    disabled={invoiceSaving}
                                    onClick={() => saveCustomInvoice(true)}
                                >
                                    {invoiceSaving ? "..." : `🖨️ ${lang === "ko" ? "저장 후 인쇄" : "Guardar e Imprimir"}`}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
