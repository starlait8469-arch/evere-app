"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./sales.module.css";
// 타입 임시 무시 또는 올바른 타입 임포트
// import type { Database } from "@/lib/supabase/database.types"; 
import { User } from "@supabase/supabase-js";

// Inventory 타입 (조인된 데이터 포함)
type InventoryItem = {
    id: string;
    name: string;
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
};

export default function SalesPage() {
    const { t, lang } = useLanguage();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [categoryPrices, setCategoryPrices] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // 판매 폼 상태 (아이템 ID -> 수량 문자열)
    const [sellInputs, setSellInputs] = useState<Record<string, string>>({});
    // 확인 팝업 (판매할 상세 정보)
    const [confirmSale, setConfirmSale] = useState<{ id: string, name: string, sub: string, qty: number } | null>(null);

    const supabase = createClient();
    const [filterSub, setFilterSub] = useState("all");

    useEffect(() => {
        // 현재 인증된 유저 가져오기
        supabase.auth.getUser().then(({ data: { user } }) => {
            setCurrentUser(user);
        });
        fetchAvailableItems();
    }, []);

    const fetchAvailableItems = async () => {
        setLoading(true);
        // 수량이 1개 이상인(재고가 있는) 품목과 카테고리 정보 가져오기
        const [invRes, catRes] = await Promise.all([
            supabase.from("inventory").select("*").gt("quantity", 0),
            supabase.from("categories").select("name, price")
        ]);

        if (catRes.data) {
            const prices: Record<string, number> = {};
            catRes.data.forEach(c => prices[c.name] = c.price || 0);
            setCategoryPrices(prices);
        }

        const data = invRes.data;
        const error = invRes.error;

        if (error) {
            console.error("Error fetching items:", error);
        } else if (data) {
            // 커스텀 정렬 로직 (재고 페이지와 유사하게 적용)
            const sortedData = [...data].sort((a, b) => {
                // 서브 카테고리 우선
                if (a.sub_category !== b.sub_category) {
                    const order = [
                        "Camisa ML (SH-01)", "Camisa MC (SH-02)", "Pantalon tropical (PH-01)", "Saco tropical (CH-01)",
                        "Camisa ML (S-01)", "Camisa 3/4 (S-02)", "Camisa MC (S-03)", "Camisa Elastizada ML (S-04)",
                        "Pollera tropical (Sk-01)", "Pantalon tropical (P-01)", "Saco tropical (C-01)",
                        "Pantalon sastrera (P-02)", "Saco Sastrera (C-02)", "Pantalon gabardina (P-03)"
                    ];
                    const idxA = order.findIndex(o => o.toLowerCase() === (a.sub_category || "").toLowerCase());
                    const idxB = order.findIndex(o => o.toLowerCase() === (b.sub_category || "").toLowerCase());
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return (a.sub_category || "").localeCompare(b.sub_category || "");
                }

                // 색상
                const getColorRank = (color: string) => {
                    const c = (color || "").toLowerCase();
                    if (c === "blanco") return 1;
                    if (c === "negro") return 2;
                    if (c === "azul") return 3;
                    if (c === "gris") return 4;
                    return 5;
                };
                const rankA = getColorRank(a.color);
                const rankB = getColorRank(b.color);
                if (rankA !== rankB) return rankA - rankB;
                if (rankA === 5 && a.color !== b.color) return (a.color || "").localeCompare(b.color || "");

                // 사이즈
                const sizeOrder = ["s", "m", "l", "xl", "xxl"];
                const sA = (a.size || "").toLowerCase();
                const sB = (b.size || "").toLowerCase();
                const sIdxA = sizeOrder.indexOf(sA);
                const sIdxB = sizeOrder.indexOf(sB);
                if (sIdxA !== -1 && sIdxB !== -1) return sIdxA - sIdxB;
                if (sIdxA !== -1) return -1;
                if (sIdxB !== -1) return 1;

                const numA = parseInt(a.size);
                const numB = parseInt(b.size);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

                return sA.localeCompare(sB);
            });
            setItems(sortedData);
        }
        setLoading(false);
    };

    // 현재 있는 서브 카테고리 목록 추출
    const availableSubs = Array.from(new Set(items.map(i => i.sub_category).filter(Boolean)));

    const filtered = items.filter(item => filterSub === "all" || item.sub_category === filterSub);

    const handleSellInput = (id: string, value: string) => {
        setSellInputs(prev => ({ ...prev, [id]: value }));
    };

    // 판매 확인 버튼 클릭 시
    const clickSell = (item: InventoryItem) => {
        const val = sellInputs[item.id];
        if (!val) return;
        const qty = parseInt(val, 10);
        if (isNaN(qty) || qty <= 0) return;

        // 현재 재고보다 초과해서 팔 수 없음
        if (qty > item.quantity) {
            alert(t("insufficientStock") || "재고 부족!");
            return;
        }

        setConfirmSale({ id: item.id, name: item.name, sub: item.sub_category, qty });
    };

    // 실제 판매 로직 (재고 차감 & 이력 기록)
    const executeSale = async () => {
        if (!confirmSale || !currentUser) return;

        const item = items.find(i => i.id === confirmSale.id);
        if (!item) return;

        const newQty = item.quantity - confirmSale.qty;

        // 1. 재고 차감 업데이트
        const { error: invError } = await supabase
            .from("inventory")
            .update({ quantity: newQty })
            .eq("id", item.id);

        if (invError) {
            alert("Error updating inventory");
            return;
        }

        // 2. 판매 장부에 기록
        const currentPrice = categoryPrices[item.sub_category] || 0;
        const { error: historyError } = await supabase
            .from("sales_history")
            .insert([{
                inventory_id: item.id,
                quantity: confirmSale.qty,
                unit_price: currentPrice,
                sold_by: currentUser.id
            }]);

        if (historyError) {
            console.error("Error recording sale:", historyError);
            alert("Error recording sale: " + historyError.message);
        } else {
            alert(lang === "ko" ? "판매가 완료되었습니다." : "Venta registrada con éxito.");
        }

        // 로컬 상태 즉시 업데이트
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i).filter(i => i.quantity > 0)); // 재고 0되면 목록에서 제외
        setSellInputs(prev => {
            const next = { ...prev };
            delete next[item.id];
            return next;
        });
        setConfirmSale(null);
    };


    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t("salesRecord") || "판매 등록"}</h1>
                <p className={styles.subtitle}>
                    {t("onlyInStock") || "재고가 있는 품목만 표시됩니다."}
                </p>
            </div>

            <select
                className={styles.subSelect}
                value={filterSub}
                onChange={(e) => setFilterSub(e.target.value)}
            >
                <option value="all">{t("viewAll") || "전체 보기"}</option>
                {availableSubs.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>

            {loading ? (
                <div className={styles.loading}>Loading...</div>
            ) : filtered.length === 0 ? (
                <div className={styles.emptyCard}>
                    {t("noStockAvailable") || "판매 가능한 재고가 없습니다."}
                </div>
            ) : (
                <div className={styles.list}>
                    {filtered.map(item => (
                        <div key={item.id} className={styles.saleCard}>
                            <div className={styles.itemInfo}>
                                <div className={styles.itemName}>{item.sub_category || item.name}</div>
                                <div className={styles.itemMeta}>
                                    <span className={styles.colorTag}>{item.color}</span>
                                    <span className={styles.sizeTag}>{t("size") || "사이즈"} {item.size}</span>
                                </div>
                            </div>

                            <div className={styles.stockInfo}>
                                <div className={styles.stockLabel}>{t("currentStock") || "현재 재고"}</div>
                                <div className={styles.stockNum}>{item.quantity}</div>
                            </div>

                            <div className={styles.actionArea}>
                                <input
                                    type="number"
                                    min="1"
                                    max={item.quantity}
                                    className={styles.sellInput}
                                    placeholder="Qty"
                                    value={sellInputs[item.id] || ""}
                                    onChange={(e) => handleSellInput(item.id, e.target.value)}
                                />
                                <button className={styles.sellBtn} onClick={() => clickSell(item)} disabled={!sellInputs[item.id] || parseInt(sellInputs[item.id]) <= 0}>
                                    {t("sell") || "판매"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 판매 확인 모달 */}
            {confirmSale && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <h3 className={styles.modalTitle}>{t("confirmSale") || "판매 확인"}</h3>
                        <p className={styles.modalText}>
                            <strong>{confirmSale.sub || confirmSale.name}</strong> <br />
                            {confirmSale.qty} {t("saleQuestion") || "개 판매하시겠습니까?"}
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setConfirmSale(null)}>
                                {t("cancel")}
                            </button>
                            <button className={styles.btnConfirm} onClick={executeSale}>
                                {t("confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
