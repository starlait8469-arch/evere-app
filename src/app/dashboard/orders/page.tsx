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
    name?: string;
};

type CartItem = {
    key: string; // unique key
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
    maxQty: number;
};

export default function OrdersPage() {
    const { lang } = useLanguage();
    const router = useRouter();
    const supabase = createClient();

    const [isAdmin, setIsAdmin] = useState(false);
    const [token, setToken] = useState("");
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    // 필터
    const [activeMain, setActiveMain] = useState("all");
    const [search, setSearch] = useState("");

    // 장바구니
    const [cart, setCart] = useState<CartItem[]>([]);
    const [qtyInputs, setQtyInputs] = useState<Record<string, number>>({});
    const [note, setNote] = useState("");

    // 주문 완료 슬립
    const [submitting, setSubmitting] = useState(false);
    const [slipData, setSlipData] = useState<{ orderId: string; items: CartItem[]; date: string } | null>(null);

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
            .order("main_category")
            .order("sub_category")
            .order("color");
        setInventory((data as InventoryItem[]) || []);
        // qty input 기본값 1로 초기화
        const defaults: Record<string, number> = {};
        (data || []).forEach((item: InventoryItem) => {
            defaults[item.id] = 1;
        });
        setQtyInputs(defaults);
        setLoading(false);
    };

    // ─── Cart logic ───
    const addToCart = useCallback((item: InventoryItem) => {
        const qty = qtyInputs[item.id] || 1;
        const key = `${item.main_category}__${item.sub_category}__${item.color}__${item.size}`;
        setCart(prev => {
            const existing = prev.find(c => c.key === key);
            if (existing) {
                return prev.map(c =>
                    c.key === key
                        ? { ...c, quantity: Math.min(c.quantity + qty, item.quantity) }
                        : c
                );
            }
            return [...prev, {
                key,
                main_category: item.main_category,
                sub_category: item.sub_category,
                color: item.color,
                size: item.size,
                quantity: Math.min(qty, item.quantity),
                maxQty: item.quantity,
            }];
        });
    }, [qtyInputs]);

    const updateCartQty = (key: string, qty: number) => {
        setCart(prev => prev.map(c => c.key === key ? { ...c, quantity: Math.max(1, Math.min(qty, c.maxQty)) } : c));
    };

    const removeFromCart = (key: string) => {
        setCart(prev => prev.filter(c => c.key !== key));
    };

    const totalCartQty = cart.reduce((s, c) => s + c.quantity, 0);

    // ─── Submit order ───
    const submitOrder = async () => {
        if (cart.length === 0) return;
        setSubmitting(true);
        const items = cart.map(c => ({
            main_category: c.main_category,
            sub_category: c.sub_category,
            color: c.color,
            size: c.size,
            quantity: c.quantity,
        }));
        const res = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ items, note }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) { alert(json.error || "Error"); return; }
        setSlipData({ orderId: json.orderId, items: [...cart], date: new Date().toLocaleDateString("es-AR") });
        setCart([]);
        setNote("");
    };

    // ─── Print slip ───
    const printOrder = (data: NonNullable<typeof slipData>) => {
        const rows = data.items.map(item => `
            <tr>
                <td>${item.main_category}</td>
                <td>${item.sub_category || "—"}</td>
                <td>${item.color || "—"}</td>
                <td>${item.size || "—"}</td>
                <td style="text-align:center;font-weight:700;">${item.quantity}</td>
            </tr>`).join("");
        const total = data.items.reduce((s, i) => s + i.quantity, 0);
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Pedido ${data.orderId.slice(0, 8)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,sans-serif; padding:32px; color:#111; }
  .header { border-bottom:3px solid #111; padding-bottom:16px; margin-bottom:20px; }
  .title { font-size:22px; font-weight:800; }
  .meta { margin-top:8px; display:flex; gap:32px; font-size:13px; color:#555; }
  .meta strong { color:#111; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  thead tr { background:#f0f0f0; }
  th { padding:10px 12px; text-align:left; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; border-bottom:2px solid #ddd; }
  td { padding:10px 12px; border-bottom:1px solid #eee; }
  tfoot td { font-weight:800; font-size:14px; background:#f9f9f9; border-top:2px solid #111; }
  .footer { margin-top:40px; display:flex; justify-content:space-between; font-size:12px; color:#777; }
  .sign { border-top:1px solid #aaa; padding-top:6px; min-width:120px; text-align:center; color:#333; }
  @media print { body { padding:16px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="title">Pedido</div>
    <div class="meta">
      <span>📅 Fecha: <strong>${data.date}</strong></span>
      <span>N° <strong>${data.orderId.slice(0, 8).toUpperCase()}</strong></span>
      <span>Total: <strong>${total}</strong> unidades</span>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Categoría</th><th>Subcategoría</th><th>Color</th><th>Talla</th><th style="text-align:center;">Cantidad</th></tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="4">Total</td><td style="text-align:center;">${total}</td></tr>
    </tfoot>
  </table>
  <div class="footer">
    <div class="sign">Preparado por<br/><br/>__________________</div>
    <div class="sign">Entregado por<br/><br/>__________________</div>
    <div class="sign">Recibido por<br/><br/>__________________</div>
  </div>
</body>
</html>`;
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    };

    if (!isAdmin) return null;

    // ─── Derived data ───
    const mainCats = ["all", ...Array.from(new Set(inventory.map(i => i.main_category).filter(Boolean)))];
    const filtered = inventory.filter(item => {
        if (activeMain !== "all" && item.main_category !== activeMain) return false;
        if (search) {
            const q = search.toLowerCase();
            if (!item.sub_category?.toLowerCase().includes(q) &&
                !item.color?.toLowerCase().includes(q) &&
                !item.size?.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // Group by sub_category for display
    const subGroups = new Map<string, InventoryItem[]>();
    filtered.forEach(item => {
        const key = `${item.main_category} › ${item.sub_category || "—"}`;
        if (!subGroups.has(key)) subGroups.set(key, []);
        subGroups.get(key)!.push(item);
    });

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>🧾 {lang === "ko" ? "가게 주문" : "Pedidos"}</h1>
                    <p className={styles.subtitle}>
                        {lang === "ko" ? "재고에서 상품을 선택해 주문서를 작성하세요" : "Seleccione productos del inventario para crear un pedido"}
                    </p>
                </div>
            </div>

            <div className={styles.layout}>
                {/* ─── Left: Inventory browser ─── */}
                <div className={styles.inventoryPanel}>
                    <div className={styles.filterBar}>
                        {mainCats.map(c => (
                            <button key={c}
                                className={`${styles.catTab} ${activeMain === c ? styles.catActive : ""}`}
                                onClick={() => setActiveMain(c)}>
                                {c === "all" ? (lang === "ko" ? "전체" : "Todos") : c}
                            </button>
                        ))}
                        <input
                            className={styles.searchInput}
                            placeholder={lang === "ko" ? "🔍 검색..." : "🔍 Buscar..."}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    {loading ? (
                        <div className={styles.empty}>Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className={styles.empty}>{lang === "ko" ? "재고 없음" : "Sin stock"}</div>
                    ) : (
                        <div className={styles.inventoryGroups}>
                            {Array.from(subGroups.entries()).map(([groupKey, items]) => (
                                <div key={groupKey} className={styles.invGroup}>
                                    <div className={styles.invGroupHeader}>{groupKey}</div>
                                    <div className={styles.invItems}>
                                        {items.map(item => {
                                            const itemKey = `${item.main_category}__${item.sub_category}__${item.color}__${item.size}`;
                                            const inCart = cart.find(c => c.key === itemKey);
                                            return (
                                                <div key={item.id} className={`${styles.invCard} ${inCart ? styles.invCardInCart : ""}`}>
                                                    <div className={styles.invCardTop}>
                                                        <div className={styles.invTags}>
                                                            {item.color && <span className={styles.tag}>{item.color}</span>}
                                                            {item.size && <span className={styles.tag}>{item.size}</span>}
                                                        </div>
                                                        <span className={styles.invStock}>
                                                            {lang === "ko" ? `재고 ${item.quantity}` : `Stock: ${item.quantity}`}
                                                        </span>
                                                    </div>
                                                    <div className={styles.invCardBottom}>
                                                        <div className={styles.qtyRow}>
                                                            <button className={styles.qtyBtn}
                                                                onClick={() => setQtyInputs(p => ({ ...p, [item.id]: Math.max(1, (p[item.id] || 1) - 1) }))}>−</button>
                                                            <input type="number" min="1" max={item.quantity}
                                                                className={styles.qtyInput}
                                                                value={qtyInputs[item.id] || 1}
                                                                onChange={e => setQtyInputs(p => ({ ...p, [item.id]: Math.max(1, Math.min(parseInt(e.target.value) || 1, item.quantity)) }))} />
                                                            <button className={styles.qtyBtn}
                                                                onClick={() => setQtyInputs(p => ({ ...p, [item.id]: Math.min((p[item.id] || 1) + 1, item.quantity) }))}>+</button>
                                                        </div>
                                                        <button className={styles.addBtn} onClick={() => addToCart(item)}>
                                                            {inCart ? "✓" : "+"} {lang === "ko" ? "추가" : "Agregar"}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── Right: Cart ─── */}
                <div className={styles.cartPanel}>
                    <div className={styles.cartHeader}>
                        <h2 className={styles.cartTitle}>
                            🛒 {lang === "ko" ? "장바구니" : "Carrito"}
                            {cart.length > 0 && <span className={styles.cartBadge}>{cart.length}</span>}
                        </h2>
                        {cart.length > 0 && (
                            <button className={styles.clearBtn} onClick={() => setCart([])}>
                                {lang === "ko" ? "비우기" : "Vaciar"}
                            </button>
                        )}
                    </div>

                    {cart.length === 0 ? (
                        <div className={styles.cartEmpty}>
                            {lang === "ko" ? "상품을 추가해 주세요" : "Agregue productos para continuar"}
                        </div>
                    ) : (
                        <>
                            <div className={styles.cartItems}>
                                {cart.map(item => (
                                    <div key={item.key} className={styles.cartItem}>
                                        <div className={styles.cartItemInfo}>
                                            <span className={styles.cartItemName}>
                                                {item.sub_category || item.main_category}
                                            </span>
                                            <div className={styles.cartItemTags}>
                                                {item.color && <span className={styles.tag}>{item.color}</span>}
                                                {item.size && <span className={styles.tag}>{item.size}</span>}
                                            </div>
                                        </div>
                                        <div className={styles.cartItemActions}>
                                            <div className={styles.qtyRow}>
                                                <button className={styles.qtyBtn}
                                                    onClick={() => updateCartQty(item.key, item.quantity - 1)}>−</button>
                                                <input type="number" min="1" max={item.maxQty}
                                                    className={styles.qtyInput}
                                                    value={item.quantity}
                                                    onChange={e => updateCartQty(item.key, parseInt(e.target.value) || 1)} />
                                                <button className={styles.qtyBtn}
                                                    onClick={() => updateCartQty(item.key, item.quantity + 1)}>+</button>
                                            </div>
                                            <button className={styles.removeBtn} onClick={() => removeFromCart(item.key)}>✕</button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className={styles.cartTotal}>
                                <span>{lang === "ko" ? "총 수량" : "Total"}</span>
                                <span className={styles.cartTotalQty}>{totalCartQty} {lang === "ko" ? "개" : "uds."}</span>
                            </div>

                            <textarea
                                className={styles.noteInput}
                                placeholder={lang === "ko" ? "메모 (선택)" : "Nota (opcional)"}
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                rows={2}
                            />

                            <button className={styles.submitBtn} onClick={submitOrder} disabled={submitting}>
                                {submitting
                                    ? (lang === "ko" ? "처리중..." : "Procesando...")
                                    : `🧾 ${lang === "ko" ? "주문서 생성" : "Crear pedido"}`}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ─── Slip modal ─── */}
            {slipData && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <div className={styles.slipIcon}>🧾</div>
                        <h3>{lang === "ko" ? "주문 완료!" : "¡Pedido creado!"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? `${slipData.items.length}가지 상품, 총 ${slipData.items.reduce((s, i) => s + i.quantity, 0)}개`
                                : `${slipData.items.length} producto(s), ${slipData.items.reduce((s, i) => s + i.quantity, 0)} unidades`}
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
                                🖨️ {lang === "ko" ? "주문전표 인쇄" : "Imprimir pedido"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
