"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import styles from "./inventory.module.css";

type MainCat = "hombre" | "mujer";

interface SubCategory { id: string; name: string; main_category: string; }

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
    const [newSubCatMain, setNewSubCatMain] = useState<MainCat>("hombre");
    const [catLoading, setCatLoading] = useState(false);
    const [deleteCatConfirm, setDeleteCatConfirm] = useState<string | null>(null);

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

            // 3. 사이즈 오름차순
            const sizeA = parseInt(a.size);
            const sizeB = parseInt(b.size);
            if (!isNaN(sizeA) && !isNaN(sizeB)) return sizeA - sizeB;

            return (a.size || "").localeCompare(b.size || "");
        });

        setItems(sortedData);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSubCategories();
        fetchItems();
        // 현재 유저 role 확인
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsAdmin(user?.user_metadata?.role === "admin");
        });
    }, [fetchSubCategories, fetchItems]);

    const currentSubs = subCategories
        .filter((c) => c.main_category === mainTab)
        .sort((a, b) => {
            const order = [
                "Camisa ML (SH-01)",
                "Camisa MC (SH-02)",
                "Pantalon tropical (PH-01)",
                "Saco tropical (CH-01)"
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
        const subMatch = filterSub === "all" || item.sub_category === filterSub;
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
        const payload = { ...form, quantity: Number(form.quantity) };
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
        setCatLoading(true);
        await supabase.from("categories").insert([{ main_category: newSubCatMain, name: newSubCat.trim() }]);
        setNewSubCat("");
        setCatLoading(false);
        fetchSubCategories();
    };

    const handleDeleteSubCat = async (id: string) => {
        await supabase.from("categories").delete().eq("id", id);
        setDeleteCatConfirm(null);
        fetchSubCategories();
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
                                        <div key={cat.id} className={styles.catItem}>
                                            <span>{cat.name}</span>
                                            {deleteCatConfirm === cat.id ? (
                                                <div className={styles.confirmRow}>
                                                    <button className={styles.confirmYes} onClick={() => handleDeleteSubCat(cat.id)}>{t("삭제", "Sí")}</button>
                                                    <button className={styles.confirmNo} onClick={() => setDeleteCatConfirm(null)}>{t("취소", "No")}</button>
                                                </div>
                                            ) : (
                                                <button className={styles.catDeleteBtn} onClick={() => setDeleteCatConfirm(cat.id)}>✕</button>
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
                                <select className={styles.input} value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })}>
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
                            {item.size && <span className={styles.metaTag}>📐 {item.size}</span>}
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

