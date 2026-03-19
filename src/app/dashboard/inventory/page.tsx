"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import styles from "./inventory.module.css";

type MainCat = "hombre" | "mujer";

interface SubCategory { id: string; name: string; main_category: string; price: number; }

interface InventoryItem {
    id: string;
    name: string;
    main_category: MainCat;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
}

const emptyForm = { name: "", main_category: "hombre" as MainCat, sub_category: "", color: "", size: "", quantity: 0 };

export default function InventoryPage() {
    const { lang } = useLanguage();
    const t = (ko: string, es: string) => lang === "ko" ? ko : es;
    const supabase = createClient();

    const [mainTab, setMainTab] = useState<MainCat>("hombre");
    const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
    const [filterSub, setFilterSub] = useState("all");
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState<InventoryItem | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState("");
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    // 수량 입고 입력 상태: { id, value }
    const [qtyInput, setQtyInput] = useState<{ id: string; value: string } | null>(null);
    // 되돌리기: 마지막 변경 이전 수량
    const [prevQty, setPrevQty] = useState<{ id: string; qty: number } | null>(null);
    const [rollbackConfirm, setRollbackConfirm] = useState<string | null>(null);

    // 현재 유저 역할
    const [isAdmin, setIsAdmin] = useState(false);

    // Category management
    const [showCatManager, setShowCatManager] = useState(false);
    const [newSubCat, setNewSubCat] = useState("");
    const [newSubCatPrice, setNewSubCatPrice] = useState("0");
    const [newSubCatMain, setNewSubCatMain] = useState<MainCat>("hombre");
    const [catLoading, setCatLoading] = useState(false);
    const [deleteCatConfirm, setDeleteCatConfirm] = useState<string | null>(null);
    const [editCatId, setEditCatId] = useState<string | null>(null);
    const [editCatName, setEditCatName] = useState("");
    const [editCatPrice, setEditCatPrice] = useState("0");

    const [activeCatOptionsId, setActiveCatOptionsId] = useState<string | null>(null);
    const [optionColors, setOptionColors] = useState("");
    const [optionSizes, setOptionSizes] = useState("");
    const [optionLoading, setOptionLoading] = useState(false);

    const fetchSubCategories = useCallback(async () => {
        const { data } = await supabase.from("categories").select("*").order("name");
        setSubCategories(data ?? []);
    }, []);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from("inventory")
            .select("*");

        const sortedData = (data ?? []).sort((a, b) => {
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

            // 1. 색상 우선순위
            if (rankA !== rankB) return rankA - rankB;

            // 2. 다른 색상이면 알파벳 순
            if (rankA === 5) {
                const cA = (a.color || "").toLowerCase();
                const cB = (b.color || "").toLowerCase();
                if (cA !== cB) return cA.localeCompare(cB);
            }

            // 3. 사이즈 정렬 (문자열 사이즈 우선)
            const sizeOrder = ["s", "m", "l", "xl", "xxl"];
            const sA = (a.size || "").toLowerCase();
            const sB = (b.size || "").toLowerCase();

            const idxA = sizeOrder.indexOf(sA);
            const idxB = sizeOrder.indexOf(sB);

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1; // S, M, L 등이 숫자보다 앞에 오거나 뒤에 오게 할 수 있음. 보통 먼저 오도록.
            if (idxB !== -1) return 1;

            // 4. 숫자 사이즈 오름차순
            const numA = parseInt(a.size);
            const numB = parseInt(b.size);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

            return sA.localeCompare(sB);
        });

        setItems(sortedData);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSubCategories();
        fetchItems();
        // 현재 유저 role 확인
        supabase.auth.getSession().then(({ data: { session } }) => {
            setIsAdmin(session?.user?.user_metadata?.role === "admin");
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchSubCategories, fetchItems]);

    const currentSubs = subCategories
        .filter((c) => c.main_category === mainTab)
        .sort((a, b) => {
            const order = [
                // Hombre
                "Camisa ML (SH-01)",
                "Camisa MC (SH-02)",
                "Pantalon tropical (PH-01)",
                "Saco tropical (CH-01)",
                // Mujer
                "Camisa ML (S-01)",
                "Camisa 3/4 (S-02)",
                "Camisa MC (S-03)",
                "Camisa Elastizada ML (S-04)",
                "Pollera tropical (Sk-01)",
                "Pantalon tropical (P-01)",
                "Saco tropical (C-01)",
                "Pantalon sastrera (P-02)",
                "Saco sastrera (C-02)",
                "Pantalon gabardina (P-03)"
            ];

            const idxA = order.findIndex(o => o.toLowerCase() === a.name.toLowerCase());
            const idxB = order.findIndex(o => o.toLowerCase() === b.name.toLowerCase());

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;

            return a.name.localeCompare(b.name);
        });

    const filtered = items.filter((item) => {
        const mainMatch = item.main_category === mainTab;
        const subMatch = filterSub === "all" ||
            (item.sub_category || "").trim().toLowerCase() === filterSub.trim().toLowerCase();
        return mainMatch && subMatch;
    });

    const totalQty = filtered.reduce((s, i) => s + i.quantity, 0);

    // ── Inventory CRUD ──
    const openCreate = () => {
        setEditItem(null);
        setForm({ ...emptyForm, main_category: mainTab });
        setFormError("");
        setShowForm(true);
    };

    const openEdit = (item: InventoryItem) => {
        setEditItem(item);
        setForm({ name: item.name, main_category: item.main_category, sub_category: item.sub_category, color: item.color, size: item.size, quantity: item.quantity });
        setFormError("");
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");
        if (!form.name.trim()) { setFormError(t("품목명을 입력하세요.", "Ingresa el nombre del artículo.")); return; }
        if (form.quantity < 0) { setFormError(t("수량은 0 이상이어야 합니다.", "La cantidad debe ser 0 o más.")); return; }
        setFormLoading(true);
        const payload = {
            ...form,
            name: form.name.toUpperCase(),
            sub_category: form.sub_category,
            quantity: Number(form.quantity)
        };
        if (editItem) {
            const { error } = await supabase.from("inventory").update(payload).eq("id", editItem.id);
            if (error) { setFormError(error.message); setFormLoading(false); return; }
        } else {
            const { error } = await supabase.from("inventory").insert([payload]);
            if (error) { setFormError(error.message); setFormLoading(false); return; }
        }
        setShowForm(false);
        setFormLoading(false);
        fetchItems();
    };

    const handleDelete = async (id: string) => {
        await supabase.from("inventory").delete().eq("id", id);
        setDeleteConfirm(null);
        fetchItems();
    };

    // 수량 입고 확인
    const handleQtyConfirm = async (id: string) => {
        const item = items.find((i) => i.id === id);
        if (!item || !qtyInput) return;
        const delta = parseInt(qtyInput.value, 10);
        if (isNaN(delta) || delta === 0) { setQtyInput(null); return; }
        const oldQty = item.quantity;
        const newQty = Math.max(0, item.quantity + delta);
        await supabase.from("inventory").update({ quantity: newQty }).eq("id", id);
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, quantity: newQty } : i));
        setPrevQty({ id, qty: oldQty }); // 이전 수량 저장
        setQtyInput(null);
    };

    // 되돌리기 확인
    const handleRollback = async (id: string) => {
        if (!prevQty || prevQty.id !== id) return;
        await supabase.from("inventory").update({ quantity: prevQty.qty }).eq("id", id);
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, quantity: prevQty.qty } : i));
        setPrevQty(null);
        setRollbackConfirm(null);
    };

    // ── Category CRUD ──
    const handleAddSubCat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSubCat.trim()) return;
        // 대소문자 무시 중복 체크
        const trimmed = newSubCat.trim().toUpperCase();
        const priceNum = parseInt(newSubCatPrice, 10) || 0;
        const isDuplicate = subCategories.some(
            c => c.main_category === newSubCatMain &&
                c.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            alert(lang === "ko" ? "이미 동일한 이름의 카테고리가 있습니다." : "Ya existe una categoría con ese nombre.");
            return;
        }
        setCatLoading(true);
        await supabase.from("categories").insert([{ main_category: newSubCatMain, name: trimmed, price: priceNum }]);
        setNewSubCat("");
        setNewSubCatPrice("0");
        setCatLoading(false);
        fetchSubCategories();
    };

    const handleUpdateSubCat = async (id: string) => {
        const priceNum = parseInt(editCatPrice, 10) || 0;
        const nameVal = editCatName.trim().toUpperCase();
        if (!nameVal) return;
        setCatLoading(true);
        const { error } = await supabase.from("categories").update({ price: priceNum, name: nameVal }).eq("id", id);
        if (error) {
            console.error("Update error:", error);
            alert("저장 실패: " + error.message);
        }
        setEditCatId(null);
        setCatLoading(false);
        fetchSubCategories();
    };

    const handleDeleteSubCat = async (id: string) => {
        await supabase.from("categories").delete().eq("id", id);
        setDeleteCatConfirm(null);
        fetchSubCategories();
    };

    const handleGenerateOptions = async (cat: SubCategory) => {
        if (!optionColors.trim() && !optionSizes.trim()) return;
        setOptionLoading(true);

        const colors = optionColors.split(",").map(c => c.trim()).filter(Boolean);
        const sizes = optionSizes.split(",").map(s => s.trim()).filter(Boolean);

        const finalColors = colors.length > 0 ? colors : [""];
        const finalSizes = sizes.length > 0 ? sizes : [""];

        const newItems: any[] = [];
        for (const c of finalColors) {
            for (const s of finalSizes) {
                newItems.push({
                    name: cat.name.toUpperCase(),
                    main_category: cat.main_category,
                    sub_category: cat.name,
                    color: c,
                    size: s,
                    quantity: 0
                });
            }
        }

        if (newItems.length > 0) {
            const { error } = await supabase.from("inventory").insert(newItems);
            if (error) {
                alert(lang === "ko" ? "옵션 생성 실패: " + error.message : "Error al generar: " + error.message);
            } else {
                alert(lang === "ko" ? `${newItems.length}개의 항목이 일괄 생성되었습니다.` : `Se generaron ${newItems.length} artículos.`);
                setActiveCatOptionsId(null);
                setOptionColors("");
                setOptionSizes("");
                fetchItems();
            }
        }
        setOptionLoading(false);
    };

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>{t("재고 관리", "Gestión de inventario")}</h1>
                    <p className={styles.subtitle}>
                        {t(`${filtered.length}개 품목 · 총 ${totalQty.toLocaleString()}개`, `${filtered.length} artículos · ${totalQty.toLocaleString()} uds`)}
                    </p>
                </div>
                <div className={styles.headerActions}>
                    {isAdmin && (
                        <button className={styles.catMgrBtn} onClick={() => setShowCatManager(!showCatManager)}>
                            🗂 {t("카테고리 관리", "Categorías")}
                        </button>
                    )}
                    {isAdmin && (
                        <button className={styles.addBtn} onClick={openCreate}>
                            + {t("품목 추가", "Añadir")}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Category Manager (admin only) ── */}
            {isAdmin && showCatManager && (
                <div className={styles.catManager}>
                    <h2 className={styles.catManagerTitle}>{t("서브 카테고리 관리", "Gestión de subcategorías")}</h2>
                    <form onSubmit={handleAddSubCat} className={styles.catAddRow}>
                        <select className={styles.catSelect} value={newSubCatMain} onChange={(e) => setNewSubCatMain(e.target.value as MainCat)}>
                            <option value="hombre">Hombre</option>
                            <option value="mujer">Mujer</option>
                        </select>
                        <input
                            className={styles.catInput}
                            placeholder={t("새 서브 카테고리 이름", "Nombre de subcategoría")}
                            value={newSubCat}
                            onChange={(e) => setNewSubCat(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <input
                            className={styles.catInput}
                            type="number"
                            placeholder={t("단가 ($)", "Precio ($)")}
                            value={newSubCatPrice}
                            onChange={(e) => setNewSubCatPrice(e.target.value)}
                            style={{ width: "100px" }}
                        />
                        <button className={styles.catAddBtn} type="submit" disabled={catLoading}>
                            {catLoading ? "..." : t("추가", "Añadir")}
                        </button>
                    </form>

                    <div className={styles.catLists}>
                        {(["hombre", "mujer"] as MainCat[]).map((mc) => (
                            <div key={mc} className={styles.catGroup}>
                                <div className={`${styles.catGroupTitle} ${mc === "hombre" ? styles.catHombre : styles.catMujer}`}>
                                    {mc === "hombre" ? "🧔 Hombre" : "👩 Mujer"}
                                </div>
                                {subCategories.filter((c) => c.main_category === mc).length === 0 ? (
                                    <div className={styles.catEmpty}>{t("서브 카테고리 없음", "Sin subcategorías")}</div>
                                ) : (
                                    subCategories.filter((c) => c.main_category === mc).map((cat) => (
                                        <div key={cat.id} style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                                            <div className={styles.catItem}>
                                                {editCatId === cat.id ? (
                                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
                                                        <input
                                                            type="text"
                                                            className={styles.catInput}
                                                            style={{ flex: 1, padding: "4px" }}
                                                            value={editCatName}
                                                            onChange={(e) => setEditCatName(e.target.value)}
                                                        />
                                                        <input
                                                            type="number"
                                                            className={styles.catInput}
                                                            style={{ width: "80px", padding: "4px" }}
                                                            value={editCatPrice}
                                                            onChange={(e) => setEditCatPrice(e.target.value)}
                                                        />
                                                        <button className={styles.confirmYes} disabled={catLoading} onClick={() => handleUpdateSubCat(cat.id)}>
                                                            {t("저장", "Guardar")}
                                                        </button>
                                                        <button className={styles.confirmNo} onClick={() => setEditCatId(null)}>
                                                            {t("취소", "Cancelar")}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => { setEditCatId(cat.id); setEditCatName(cat.name); setEditCatPrice(String(cat.price || 0)); }}>
                                                        <span>{cat.name}</span>
                                                        <span style={{ fontSize: "14px", color: "#666", marginRight: "10px" }}>
                                                            ${(cat.price || 0).toLocaleString()} ✏️
                                                        </span>
                                                    </div>
                                                )}

                                                {deleteCatConfirm === cat.id ? (
                                                    <div className={styles.confirmRow}>
                                                        <button className={styles.confirmYes} onClick={() => handleDeleteSubCat(cat.id)}>{t("삭제", "Sí")}</button>
                                                        <button className={styles.confirmNo} onClick={() => setDeleteCatConfirm(null)}>{t("취소", "No")}</button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: "flex", gap: "6px" }}>
                                                        <button style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", padding: "0 4px" }} title={t("옵션 추가", "Añadir opciones")} onClick={() => {
                                                            setActiveCatOptionsId(activeCatOptionsId === cat.id ? null : cat.id);
                                                            setOptionColors(""); setOptionSizes("");
                                                        }}>➕</button>
                                                        <button className={styles.catDeleteBtn} onClick={() => setDeleteCatConfirm(cat.id)}>✕</button>
                                                    </div>
                                                )}
                                            </div>
                                            {activeCatOptionsId === cat.id && (
                                                <div style={{ padding: "12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "14px", marginTop: "2px" }}>
                                                    <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#374151" }}>{t("옵션 일괄 생성", "Generar opciones en lote")}</h4>
                                                    <div style={{ marginBottom: "10px" }}>
                                                        <label style={{ display: "block", marginBottom: "4px", color: "#6b7280", fontSize: "12px" }}>{t("색상 (쉼표로 구분)", "Colores (separados por coma)")}</label>
                                                        <input className={styles.catInput} value={optionColors} onChange={e => setOptionColors(e.target.value)} placeholder="Blanco, Negro, Azul" style={{ width: "100%", padding: "6px", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ marginBottom: "10px" }}>
                                                        <label style={{ display: "block", marginBottom: "4px", color: "#6b7280", fontSize: "12px" }}>{t("사이즈 (쉼표로 구분)", "Tallas (separadas por coma)")}</label>
                                                        <input className={styles.catInput} value={optionSizes} onChange={e => setOptionSizes(e.target.value)} placeholder="S, M, L, XL" style={{ width: "100%", padding: "6px", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                                        <button className={styles.confirmNo} onClick={() => setActiveCatOptionsId(null)}>{t("취소", "Cancelar")}</button>
                                                        <button className={styles.confirmYes} disabled={optionLoading} onClick={() => handleGenerateOptions(cat)}>
                                                            {optionLoading ? "..." : t("생성", "Generar")}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Main Category Tabs ── */}
            <div className={styles.mainTabs}>
                <button className={`${styles.mainTab} ${mainTab === "hombre" ? styles.mainTabActive : ""}`} onClick={() => { setMainTab("hombre"); setFilterSub("all"); }}>
                    🧔 Hombre
                </button>
                <button className={`${styles.mainTab} ${mainTab === "mujer" ? styles.mainTabActive : ""}`} onClick={() => { setMainTab("mujer"); setFilterSub("all"); }}>
                    👩 Mujer
                </button>
            </div>

            {/* ── Sub-category filter ── */}
            <select
                className={styles.subSelect}
                value={filterSub}
                onChange={(e) => setFilterSub(e.target.value)}
            >
                <option value="all">{t("전체", "Todos")}</option>
                {currentSubs.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                ))}
            </select>

            {/* ── Add/Edit Form (admin only) ── */}
            {isAdmin && showForm && (
                <div className={styles.formCard}>
                    <h2 className={styles.formTitle}>{editItem ? t("품목 수정", "Editar artículo") : t("새 품목 추가", "Nuevo artículo")}</h2>
                    <form onSubmit={handleSubmit}>
                        <div className={styles.formGrid}>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("품목명 *", "Artículo *")}</label>
                                <input className={styles.input} placeholder={t("품목명", "Nombre")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("메인 카테고리", "Categoría principal")}</label>
                                <select className={styles.input} value={form.main_category} onChange={(e) => setForm({ ...form, main_category: e.target.value as MainCat, sub_category: "" })}>
                                    <option value="hombre">Hombre</option>
                                    <option value="mujer">Mujer</option>
                                </select>
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("서브 카테고리", "Subcategoría")}</label>
                                <select
                                    className={styles.input}
                                    value={subCategories.find(c => c.name.toLowerCase() === (form.sub_category || "").toLowerCase())?.name || form.sub_category}
                                    onChange={(e) => setForm({ ...form, sub_category: e.target.value })}
                                >
                                    <option value="">{t("선택 (선택사항)", "Seleccionar (opcional)")}</option>
                                    {subCategories.filter((c) => c.main_category === form.main_category).map((c) => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("색상", "Color")}</label>
                                <input className={styles.input} placeholder={t("예: 화이트", "Ej: Blanco")} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("사이즈", "Talla")}</label>
                                <input className={styles.input} placeholder="S / M / L / XL" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("수량", "Cantidad")}</label>
                                <input className={styles.input} type="number" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
                            </div>
                        </div>
                        {formError && <div className={styles.error}>{formError}</div>}
                        <div className={styles.formActions}>
                            <button className={styles.cancelBtn} type="button" onClick={() => setShowForm(false)}>{t("취소", "Cancelar")}</button>
                            <button className={styles.submitBtn} type="submit" disabled={formLoading}>
                                {formLoading ? "..." : (editItem ? t("수정", "Guardar") : t("추가", "Añadir"))}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Inventory Table (desktop) ── */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.empty}>{t("불러오는 중...", "Cargando...")}</div>
                ) : filtered.length === 0 ? (
                    <div className={styles.empty}>{t("재고 항목이 없습니다.", "No hay artículos.")}</div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{t("품목명", "Artículo")}</th>
                                <th>{t("서브 카테고리", "Subcategoría")}</th>
                                <th>{t("색상", "Color")}</th>
                                <th>{t("사이즈", "Talla")}</th>
                                <th style={{ textAlign: "center" }}>{t("수량", "Cantidad")}</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item) => (
                                <tr key={item.id}>
                                    <td className={styles.nameCell}>{item.name}</td>
                                    <td>{item.sub_category ? <span className={styles.catBadge}>{item.sub_category}</span> : <span className={styles.muted}>-</span>}</td>
                                    <td className={styles.muted}>{item.color || "-"}</td>
                                    <td className={styles.muted}>{item.size || "-"}</td>
                                    <td>
                                        {/* 수량 + 입고 */}
                                        {qtyInput?.id === item.id ? (
                                            <div className={styles.qtyCell}>
                                                <span className={`${styles.qtyNum} ${item.quantity === 0 ? styles.qtyZero : ""}`}>{item.quantity}</span>
                                                <span className={styles.qtyPlus}>+</span>
                                                <input
                                                    className={styles.qtyInputField}
                                                    type="number"
                                                    autoFocus
                                                    value={qtyInput.value}
                                                    onChange={(e) => setQtyInput({ id: item.id, value: e.target.value })}
                                                    onKeyDown={(e) => e.key === "Enter" && handleQtyConfirm(item.id)}
                                                    placeholder="0"
                                                />
                                                <button className={styles.qtyConfirmBtn} onClick={() => handleQtyConfirm(item.id)}>{t("확인", "OK")}</button>
                                                <button className={styles.qtyCancelBtn} onClick={() => setQtyInput(null)}>×</button>
                                            </div>
                                        ) : (
                                            <div className={styles.qtyCell}>
                                                <span className={`${styles.qtyNum} ${item.quantity === 0 ? styles.qtyZero : ""}`}>{item.quantity}</span>
                                                <button className={styles.qtyAddBtn} onClick={() => setQtyInput({ id: item.id, value: "" })}>{t("입고", "Entrada")}</button>
                                                {prevQty?.id === item.id && (
                                                    rollbackConfirm === item.id ? (
                                                        <>
                                                            <span className={styles.rollbackMsg}>{t(`이전 (${prevQty.qty}개)로?`, `¿Volver a ${prevQty.qty}?`)}</span>
                                                            <button className={styles.rollbackYes} onClick={() => handleRollback(item.id)}>{t("확인", "Sí")}</button>
                                                            <button className={styles.qtyCancelBtn} onClick={() => setRollbackConfirm(null)}>{t("취소", "No")}</button>
                                                        </>
                                                    ) : (
                                                        <button className={styles.rollbackBtn} onClick={() => setRollbackConfirm(item.id)}>{t("↩ 되돌리기", "↩ Deshacer")}</button>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div className={styles.actions}>
                                            {isAdmin && <button className={styles.editBtn} onClick={() => openEdit(item)}>{t("수정", "Editar")}</button>}
                                            {isAdmin && (deleteConfirm === item.id ? (
                                                <>
                                                    <button className={styles.confirmYes} onClick={() => handleDelete(item.id)}>{t("삭제", "Sí")}</button>
                                                    <button className={styles.confirmNo} onClick={() => setDeleteConfirm(null)}>{t("취소", "No")}</button>
                                                </>
                                            ) : (
                                                <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(item.id)}>{t("삭제", "Eliminar")}</button>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Mobile Card List ── */}
            <div className={styles.cardList}>
                {loading ? (
                    <div className={styles.empty}>{t("불러오는 중...", "Cargando...")}</div>
                ) : filtered.length === 0 ? (
                    <div className={styles.empty}>{t("재고 항목이 없습니다.", "No hay artículos.")}</div>
                ) : filtered.map((item) => (
                    <div key={item.id} className={styles.itemCard}>
                        <div className={styles.itemCardTop}>
                            <div className={styles.itemCardName}>{item.name}</div>
                            {item.sub_category && <span className={styles.catBadge}>{item.sub_category}</span>}
                        </div>
                        <div className={styles.itemCardMeta}>
                            {item.color && <span className={styles.metaTag}>🎨 {item.color}</span>}
                            {item.size && <span className={styles.metaTag}>{t("사이즈", "Talla")} {item.size}</span>}
                        </div>
                        {/* 모바일: 수량 + 입고 */}
                        {qtyInput?.id === item.id ? (
                            <div className={styles.qtyInputRow}>
                                <span className={`${styles.qtyNumLg} ${item.quantity === 0 ? styles.qtyZeroLg : ""}`}>{item.quantity}</span>
                                <span className={styles.qtyPlusLg}>+</span>
                                <input
                                    className={styles.qtyInputFieldLg}
                                    type="number"
                                    inputMode="numeric"
                                    autoFocus
                                    value={qtyInput.value}
                                    onChange={(e) => setQtyInput({ id: item.id, value: e.target.value })}
                                    placeholder="0"
                                />
                                <button className={styles.qtyConfirmBtnLg} onClick={() => handleQtyConfirm(item.id)}>{t("확인", "OK")}</button>
                                <button className={styles.qtyCancelBtnLg} onClick={() => setQtyInput(null)}>×</button>
                            </div>
                        ) : (
                            <div className={styles.itemCardBottom}>
                                <div className={styles.qtyGroup}>
                                    <span className={`${styles.qtyNumLg} ${item.quantity === 0 ? styles.qtyZeroLg : ""}`}>{item.quantity}</span>
                                    <button className={styles.qtyAddBtnLg} onClick={() => setQtyInput({ id: item.id, value: "" })}>{t("입고", "Entrada")}</button>
                                    {prevQty?.id === item.id && (
                                        rollbackConfirm === item.id ? (
                                            <div className={styles.rollbackDialogLg}>
                                                <span className={styles.rollbackMsgLg}>{t(`이전 값(${prevQty.qty}개)으로
되돌리갬습니까?`, `¿Volver a ${prevQty.qty}?`)}</span>
                                                <div className={styles.rollbackDialogBtns}>
                                                    <button className={styles.rollbackYesLg} onClick={() => handleRollback(item.id)}>{t("확인", "Sí")}</button>
                                                    <button className={styles.qtyCancelBtnLg} onClick={() => setRollbackConfirm(null)}>{t("취소", "No")}</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button className={styles.rollbackBtnLg} onClick={() => setRollbackConfirm(item.id)}>{t("↩ 되돌리기", "↩ Deshacer")}</button>
                                        )
                                    )}
                                </div>
                                {isAdmin && (
                                    <div className={styles.cardActions}>
                                        <button className={styles.editBtnSm} onClick={() => openEdit(item)}>{t("수정", "Editar")}</button>
                                        {deleteConfirm === item.id ? (
                                            <>
                                                <button className={styles.confirmYes} onClick={() => handleDelete(item.id)}>{t("삭제", "Sí")}</button>
                                                <button className={styles.confirmNo} onClick={() => setDeleteConfirm(null)}>{t("취소", "No")}</button>
                                            </>
                                        ) : (
                                            <button className={styles.deleteBtnSm} onClick={() => setDeleteConfirm(item.id)}>{t("삭제", "Eliminar")}</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

