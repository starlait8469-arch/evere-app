"use client";

import { useEffect, useState } from "react";
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

const emptyRow = (): OrderRow => ({
    main_category: "",
    sub_category: "",
    color: "",
    size: "",
    quantity: "",
});

export default function OrdersPage() {
    const { lang } = useLanguage();
    const router = useRouter();
    const supabase = createClient();

    const [isAdmin, setIsAdmin] = useState(false);
    const [token, setToken] = useState("");
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<OrderRow[]>([emptyRow()]);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [slipData, setSlipData] = useState<{ orderId: string; items: OrderRow[]; date: string } | null>(null);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push("/auth/login"); return; }
            if (session.user.user_metadata?.role !== "admin") { router.push("/dashboard"); return; }
            setIsAdmin(true);
            setToken(session.access_token);
            fetchInventory();
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchInventory = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("inventory")
            .select("*")
            .gt("quantity", 0)
            .order("main_category").order("sub_category").order("color");
        setInventory((data as InventoryItem[]) || []);
        setLoading(false);
    };

    // ─── Derived option lists ───
    const mainCats = [...new Set(inventory.map(i => i.main_category).filter(Boolean))];

    const subCatsFor = (main: string) =>
        [...new Set(inventory.filter(i => i.main_category === main).map(i => i.sub_category).filter(Boolean))];

    const colorsFor = (main: string, sub: string) =>
        [...new Set(inventory.filter(i => i.main_category === main && i.sub_category === sub).map(i => i.color).filter(Boolean))];

    const sizesFor = (main: string, sub: string, color: string) =>
        [...new Set(inventory.filter(i => i.main_category === main && i.sub_category === sub && i.color === color).map(i => i.size).filter(Boolean))];

    const maxQtyFor = (row: OrderRow) => {
        const item = inventory.find(i =>
            i.main_category === row.main_category &&
            i.sub_category === row.sub_category &&
            i.color === row.color &&
            i.size === row.size
        );
        return item?.quantity ?? 0;
    };

    // ─── Row updates ───
    const updateRow = (idx: number, field: keyof OrderRow, value: string) => {
        setRows(prev => prev.map((r, i) => {
            if (i !== idx) return r;
            const updated = { ...r, [field]: value };
            // 상위 필드 바뀌면 하위 필드 초기화
            if (field === "main_category") { updated.sub_category = ""; updated.color = ""; updated.size = ""; }
            if (field === "sub_category") { updated.color = ""; updated.size = ""; }
            if (field === "color") { updated.size = ""; }
            return updated;
        }));
    };

    const addRow = () => setRows(prev => [...prev, emptyRow()]);
    const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

    const validRows = rows.filter(r =>
        r.main_category && r.sub_category && r.quantity && parseInt(r.quantity) > 0
    );

    const totalQty = validRows.reduce((s, r) => s + parseInt(r.quantity || "0"), 0);

    // ─── Submit ───
    const submitOrder = async () => {
        if (validRows.length === 0) return;
        setSubmitting(true);
        const items = validRows.map(r => ({
            main_category: r.main_category,
            sub_category: r.sub_category,
            color: r.color,
            size: r.size,
            quantity: parseInt(r.quantity),
        }));
        const res = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ items, note }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) { alert(json.error || "Error"); return; }
        setSlipData({ orderId: json.orderId, items: [...validRows], date: new Date().toLocaleDateString("es-AR") });
        setRows([emptyRow()]);
        setNote("");
    };

    // ─── Print ───
    const printOrder = (data: NonNullable<typeof slipData>) => {
        const rows = data.items.map(item => `
            <tr>
                <td>${item.main_category}</td>
                <td>${item.sub_category || "—"}</td>
                <td>${item.color || "—"}</td>
                <td>${item.size || "—"}</td>
                <td style="text-align:center;font-weight:700;">${item.quantity}</td>
            </tr>`).join("");
        const total = data.items.reduce((s, i) => s + parseInt(String(i.quantity)), 0);
        const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/>
<title>Pedido</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,sans-serif; padding:32px; color:#111; }
  .header { border-bottom:3px solid #111; padding-bottom:16px; margin-bottom:20px; }
  .title { font-size:22px; font-weight:800; }
  .meta { margin-top:8px; display:flex; gap:32px; font-size:13px; color:#555; }
  .meta strong { color:#111; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  thead tr { background:#f0f0f0; }
  th { padding:10px 12px; text-align:left; font-size:12px; font-weight:700; text-transform:uppercase; border-bottom:2px solid #ddd; }
  td { padding:10px 12px; border-bottom:1px solid #eee; }
  tfoot td { font-weight:800; font-size:14px; background:#f9f9f9; border-top:2px solid #111; }
  .footer { margin-top:40px; display:flex; justify-content:space-between; }
  .sign { border-top:1px solid #aaa; padding-top:6px; min-width:120px; text-align:center; font-size:12px; color:#555; }
  @media print { body { padding:16px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="title">Pedido</div>
    <div class="meta">
      <span>Fecha: <strong>${data.date}</strong></span>
      <span>N° <strong>${data.orderId.slice(0, 8).toUpperCase()}</strong></span>
      <span>Total: <strong>${total}</strong> uds.</span>
    </div>
  </div>
  <table>
    <thead><tr><th>Categoría</th><th>Subcategoría</th><th>Color</th><th>Talla</th><th style="text-align:center;">Cant.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td style="text-align:center;">${total}</td></tr></tfoot>
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

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>🧾 {lang === "ko" ? "가게 주문" : "Pedidos"}</h1>
                    <p className={styles.subtitle}>
                        {lang === "ko" ? "항목을 선택하고 수량을 입력해 주문서를 작성하세요" : "Seleccione productos e ingrese cantidades para crear un pedido"}
                    </p>
                </div>
            </div>

            {loading ? (
                <div className={styles.empty}>Loading...</div>
            ) : (
                <div className={styles.formCard}>
                    {/* ─── Rows ─── */}
                    <div className={styles.rowsHeader}>
                        <span className={styles.colLabel}>{lang === "ko" ? "분류" : "Categ."}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "서브" : "Subcateg."}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "색상" : "Color"}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "사이즈" : "Talla"}</span>
                        <span className={styles.colLabel}>{lang === "ko" ? "수량" : "Cant."}</span>
                        <span />
                    </div>

                    {rows.map((row, idx) => {
                        const subs = subCatsFor(row.main_category);
                        const colors = colorsFor(row.main_category, row.sub_category);
                        const sizes = sizesFor(row.main_category, row.sub_category, row.color);
                        const maxQty = maxQtyFor(row);

                        return (
                            <div key={idx} className={styles.orderRow}>
                                {/* main_category */}
                                <select className={styles.sel} value={row.main_category}
                                    onChange={e => updateRow(idx, "main_category", e.target.value)}>
                                    <option value="">—</option>
                                    {mainCats.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>

                                {/* sub_category */}
                                <select className={styles.sel} value={row.sub_category}
                                    onChange={e => updateRow(idx, "sub_category", e.target.value)}
                                    disabled={!row.main_category}>
                                    <option value="">—</option>
                                    {subs.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>

                                {/* color */}
                                <select className={styles.sel} value={row.color}
                                    onChange={e => updateRow(idx, "color", e.target.value)}
                                    disabled={!row.sub_category}>
                                    <option value="">—</option>
                                    {colors.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>

                                {/* size */}
                                <select className={styles.sel} value={row.size}
                                    onChange={e => updateRow(idx, "size", e.target.value)}
                                    disabled={!row.color}>
                                    <option value="">—</option>
                                    {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>

                                {/* quantity */}
                                <div className={styles.qtyCell}>
                                    <input type="number" min="1" max={maxQty || undefined}
                                        className={styles.qtyInput}
                                        placeholder="0"
                                        value={row.quantity}
                                        onChange={e => updateRow(idx, "quantity", e.target.value)} />
                                    {maxQty > 0 && (
                                        <span className={styles.maxHint}>/{maxQty}</span>
                                    )}
                                </div>

                                {/* remove */}
                                <button className={styles.removeBtn}
                                    onClick={() => removeRow(idx)}
                                    disabled={rows.length === 1}>✕</button>
                            </div>
                        );
                    })}

                    {/* add row */}
                    <button className={styles.addRowBtn} onClick={addRow}>
                        + {lang === "ko" ? "항목 추가" : "Agregar línea"}
                    </button>

                    {/* Note + Summary + Submit */}
                    <div className={styles.footer}>
                        <textarea className={styles.noteInput}
                            placeholder={lang === "ko" ? "메모 (선택)" : "Nota (opcional)"}
                            value={note} onChange={e => setNote(e.target.value)} rows={2} />
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
                            <button className={styles.btnCancel} onClick={() => { setSlipData(null); fetchInventory(); }}>
                                {lang === "ko" ? "닫기" : "Cerrar"}
                            </button>
                            <button className={styles.btnPrint} onClick={() => { printOrder(slipData); setSlipData(null); fetchInventory(); }}>
                                🖨️ {lang === "ko" ? "주문전표 인쇄" : "Imprimir"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
