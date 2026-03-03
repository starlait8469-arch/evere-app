"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./production.module.css";

type Stage = "cutting" | "sewing" | "finishing" | "done";

type ProductionOrder = {
    id: string;
    main_category: string;
    sub_category: string;
    color: string;
    size: string;
    quantity: number;
    stage: Stage;
    factory_id: string | null;
    created_at: string;
    sewing_factories?: { name: string } | null;
};

type SewingFactory = {
    id: string;
    name: string;
};

type Category = {
    id: string;
    name: string;
    main_category: string;
};

const STAGES: { key: Stage; ko: string; es: string; color: string }[] = [
    { key: "cutting", ko: "재단중", es: "En corte", color: "#f59e0b" },
    { key: "sewing", ko: "봉제중", es: "En costura", color: "#3b82f6" },
    { key: "finishing", ko: "완성중", es: "En terminación", color: "#8b5cf6" },
    { key: "done", ko: "입고완료", es: "Ingresado", color: "#10b981" },
];

const NEXT_STAGE: Record<Stage, Stage | null> = {
    cutting: "sewing",
    sewing: "finishing",
    finishing: "done",
    done: null,
};

export default function ProductionPage() {
    const { lang } = useLanguage();
    const supabase = createClient();

    // 관리자 여부
    const [isAdmin, setIsAdmin] = useState(false);

    // 공정 현황
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [factories, setFactories] = useState<SewingFactory[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStage, setFilterStage] = useState<Stage | "all">("all");

    // 탭
    const [tab, setTab] = useState<"status" | "new">("status");

    // 신규 등록 폼 - 배치 방식 (색상 공통, 여러 행)
    const [categories, setCategories] = useState<Category[]>([]);
    const [batchColor, setBatchColor] = useState("");
    type BatchRow = { main_category: string; sub_category: string; size: string; quantity: string; };
    const emptyRow = (): BatchRow => ({ main_category: "", sub_category: "", size: "", quantity: "" });
    const [batchRows, setBatchRows] = useState<BatchRow[]>([emptyRow()]);
    const [newLoading, setNewLoading] = useState(false);
    const [newSuccess, setNewSuccess] = useState(false);

    // 봉제 공장 선택 모달
    const [factoryModal, setFactoryModal] = useState<{ orderId: string; } | null>(null);
    const [selectedFactory, setSelectedFactory] = useState("");

    // 단계 이동 확인 모달
    const [advanceModal, setAdvanceModal] = useState<{ order: ProductionOrder } | null>(null);
    // 롤백 확인 모달
    const [rollbackModal, setRollbackModal] = useState<{ order: ProductionOrder } | null>(null);
    // 삭제 확인 모달 (관리자 전용)
    const [deleteModal, setDeleteModal] = useState<{ order: ProductionOrder } | null>(null);
    // 수정 모달 (관리자 전용)
    const [editModal, setEditModal] = useState<ProductionOrder | null>(null);
    const [editForm, setEditForm] = useState({ main_category: "", sub_category: "", color: "", size: "", quantity: "" });

    useEffect(() => {
        // 관리자 체크
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user.user_metadata?.role === "admin") setIsAdmin(true);
        });
        fetchOrders();
        fetchFactories();
        fetchCategories();
    }, []);


    const fetchOrders = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("production_orders")
            .select("*, sewing_factories(name)")
            .order("created_at", { ascending: false });
        if (data) setOrders(data as unknown as ProductionOrder[]);
        setLoading(false);
    };

    const fetchFactories = async () => {
        const { data } = await supabase.from("sewing_factories").select("id, name").order("name");
        if (data) setFactories(data);
    };

    const fetchCategories = async () => {
        const { data } = await supabase
            .from("categories")
            .select("*")
            .order("name");
        if (data) setCategories(data);
    };

    // 이전 단계 맵
    const PREV_STAGE: Record<Stage, Stage | null> = {
        cutting: null,
        sewing: "cutting",
        finishing: "sewing",
        done: "finishing",
    };

    // 다음 단계 이동 (확인 모달 열기)
    const openAdvance = (order: ProductionOrder) => {
        const nextStage = NEXT_STAGE[order.stage];
        if (!nextStage) return;
        // 봉제 단계로 넘어갈 때는 기존 공장 선택 모달
        if (nextStage === "sewing") {
            setSelectedFactory("");
            setFactoryModal({ orderId: order.id });
            return;
        }
        // 나머지 단계는 확인 모달
        setAdvanceModal({ order });
    };

    // 다음 단계 이동 실행
    const doAdvance = async () => {
        if (!advanceModal) return;
        const order = advanceModal.order;
        const nextStage = NEXT_STAGE[order.stage];
        if (!nextStage) return;
        setAdvanceModal(null);

        if (nextStage === "done") {
            // 입고 완료: inventory에 수량 추가
            const { data: existing } = await supabase
                .from("inventory")
                .select("id, quantity")
                .eq("main_category", order.main_category)
                .eq("sub_category", order.sub_category || "")
                .eq("color", order.color || "")
                .eq("size", order.size || "")
                .maybeSingle();

            if (existing) {
                await supabase
                    .from("inventory")
                    .update({ quantity: existing.quantity + order.quantity })
                    .eq("id", existing.id);
            } else {
                await supabase.from("inventory").insert([{
                    name: order.sub_category || order.main_category,
                    main_category: order.main_category,
                    sub_category: order.sub_category || "",
                    color: order.color || "",
                    size: order.size || "",
                    quantity: order.quantity,
                }]);
            }
            await supabase
                .from("production_orders")
                .update({ stage: "done", completed_at: new Date().toISOString() })
                .eq("id", order.id);
        } else {
            await supabase.from("production_orders").update({ stage: nextStage }).eq("id", order.id);
        }
        fetchOrders();
    };

    // 롤백 (이전 단계로) 확인 모달 열기
    const openRollback = (order: ProductionOrder) => {
        const prev = PREV_STAGE[order.stage];
        if (!prev) return;
        setRollbackModal({ order });
    };

    // 롤백 실행
    const doRollback = async () => {
        if (!rollbackModal) return;
        const order = rollbackModal.order;
        const prevStage = PREV_STAGE[order.stage];
        if (!prevStage) return;
        setRollbackModal(null);

        // done → finishing으로 돌릴 때 inventory에서 수량 차감
        if (order.stage === "done") {
            const { data: existing } = await supabase
                .from("inventory")
                .select("id, quantity")
                .eq("main_category", order.main_category)
                .eq("sub_category", order.sub_category || "")
                .eq("color", order.color || "")
                .eq("size", order.size || "")
                .maybeSingle();

            if (existing) {
                const newQty = Math.max(0, existing.quantity - order.quantity);
                await supabase.from("inventory").update({ quantity: newQty }).eq("id", existing.id);
            }
        }

        await supabase
            .from("production_orders")
            .update({ stage: prevStage, completed_at: null, factory_id: prevStage === "cutting" ? null : undefined })
            .eq("id", order.id);
        fetchOrders();
    };


    // 관리자 전용: 공정 카드 삭제
    const doDelete = async () => {
        if (!deleteModal) return;
        const res = await fetch("/api/production-orders", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: deleteModal.order.id }),
        });
        setDeleteModal(null);
        if (res.ok) fetchOrders();
    };

    // 관리자 전용: 수정 모달 열기
    const openEdit = (order: ProductionOrder) => {
        setEditModal(order);
        setEditForm({
            main_category: order.main_category,
            sub_category: order.sub_category,
            color: order.color,
            size: order.size,
            quantity: String(order.quantity),
        });
    };

    // 관리자 전용: 수정 저장
    const saveEdit = async () => {
        if (!editModal) return;
        await fetch("/api/production-orders", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: editModal.id,
                main_category: editForm.main_category,
                sub_category: editForm.sub_category,
                color: editForm.color,
                size: editForm.size,
                quantity: parseInt(editForm.quantity, 10),
            }),
        });
        setEditModal(null);
        fetchOrders();
    };

    const confirmFactory = async () => {
        if (!factoryModal || !selectedFactory) return;
        await supabase
            .from("production_orders")
            .update({ stage: "sewing", factory_id: selectedFactory })
            .eq("id", factoryModal.orderId);
        setFactoryModal(null);
        fetchOrders();
    };

    // 신규 공정 등록 (배치 - 여러 행 한번에 insert)
    const submitNew = async () => {
        const validRows = batchRows.filter(r => r.main_category && r.quantity);
        if (validRows.length === 0) return;
        setNewLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        const inserts = validRows.map(r => ({
            main_category: r.main_category,
            sub_category: r.sub_category,
            color: batchColor,
            size: r.size,
            quantity: parseInt(r.quantity, 10),
            stage: "cutting" as Stage,
            created_by: user?.id || null,
        }));
        await supabase.from("production_orders").insert(inserts);
        setBatchRows([emptyRow()]);
        setBatchColor("");
        setNewLoading(false);
        setNewSuccess(true);
        setTimeout(() => setNewSuccess(false), 3000);
        fetchOrders();
        setTab("status");
    };

    // 배치 행 업데이트
    const updateBatchRow = (i: number, field: keyof BatchRow, value: string) => {
        setBatchRows(rows => rows.map((r, idx) => {
            if (idx !== i) return r;
            const updated = { ...r, [field]: value };
            // main_category 바뀌면 sub_category 초기화
            if (field === "main_category") updated.sub_category = "";
            return updated;
        }));
    };

    const addBatchRow = () => setBatchRows(rows => [...rows, emptyRow()]);
    const removeBatchRow = (i: number) => setBatchRows(rows => rows.filter((_, idx) => idx !== i));

    // 메인 카테고리 목록 (hombre/mujer 등 unique 값)
    const mainCategories = [...new Set(categories.map(c => c.main_category).filter(Boolean))];
    // 특정 행의 서브카테고리 목록
    const getSubCats = (mainCat: string) =>
        categories.filter(c => c.main_category === mainCat).map(c => c.name);

    const filtered = filterStage === "all" ? orders : orders.filter(o => o.stage === filterStage);

    const stageInfo = (key: Stage) => STAGES.find(s => s.key === key)!;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{lang === "ko" ? "생산라인" : "Línea de Producción"}</h1>
                <p className={styles.subtitle}>{lang === "ko" ? "공정 단계별 현황을 관리하세요" : "Gestión del flujo de producción"}</p>
            </div>

            {/* 탭 */}
            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${tab === "status" ? styles.tabActive : ""}`}
                    onClick={() => setTab("status")}
                >
                    {lang === "ko" ? "📋 공정 현황" : "📋 Estado"}
                </button>
                <button
                    className={`${styles.tab} ${tab === "new" ? styles.tabActive : ""}`}
                    onClick={() => setTab("new")}
                >
                    {lang === "ko" ? "➕ 신규 등록" : "➕ Nueva Orden"}
                </button>
            </div>

            {/* ─── 탭1: 공정 현황 ─── */}
            {tab === "status" && (
                <>
                    {/* 단계 필터 */}
                    <div className={styles.stageFilter}>
                        <button
                            className={`${styles.filterBtn} ${filterStage === "all" ? styles.filterBtnActive : ""}`}
                            onClick={() => setFilterStage("all")}
                        >
                            {lang === "ko" ? "전체" : "Todos"}
                        </button>
                        {STAGES.map(s => (
                            <button
                                key={s.key}
                                className={`${styles.filterBtn} ${filterStage === s.key ? styles.filterBtnActive : ""}`}
                                style={filterStage === s.key ? { background: s.color, color: "#fff", borderColor: s.color } : {}}
                                onClick={() => setFilterStage(s.key)}
                            >
                                {lang === "ko" ? s.ko : s.es}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className={styles.empty}>Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className={styles.empty}>
                            {lang === "ko" ? "공정이 없습니다." : "No hay órdenes."}
                        </div>
                    ) : (
                        <div className={styles.cardGrid}>
                            {filtered.map(order => {
                                const info = stageInfo(order.stage);
                                const next = NEXT_STAGE[order.stage];
                                const nextInfo = next ? stageInfo(next) : null;
                                return (
                                    <div key={order.id} className={styles.orderCard}>
                                        <div className={styles.cardTop}>
                                            <span
                                                className={styles.stageBadge}
                                                style={{ background: info.color + "20", color: info.color }}
                                            >
                                                {lang === "ko" ? info.ko : info.es}
                                            </span>
                                            <span className={styles.qty}>{order.quantity}{lang === "ko" ? "개" : " uds."}</span>
                                        </div>
                                        <div className={styles.itemName}>{order.sub_category || order.main_category}</div>
                                        <div className={styles.itemMeta}>
                                            {order.color && <span className={styles.tag}>{order.color}</span>}
                                            {order.size && <span className={styles.tag}>{order.size}</span>}
                                        </div>
                                        {order.stage === "sewing" && order.sewing_factories && (
                                            <div className={styles.factoryLabel}>
                                                🏭 {order.sewing_factories.name}
                                            </div>
                                        )}
                                        <div className={styles.cardDate}>
                                            {new Date(order.created_at).toLocaleDateString()}
                                        </div>
                                        <div className={styles.cardActions}>
                                            {/* 관리자 전용: 수정/삭제 버튼 */}
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        className={styles.editBtn}
                                                        onClick={() => openEdit(order)}
                                                        title={lang === "ko" ? "수정" : "Editar"}
                                                    >✏️</button>
                                                    <button
                                                        className={styles.deleteCardBtn}
                                                        onClick={() => setDeleteModal({ order })}
                                                        title={lang === "ko" ? "삭제" : "Eliminar"}
                                                    >🗑️</button>
                                                </>
                                            )}
                                            {/* 이전 단계 롤백 버튼 (cutting 제외) */}
                                            {PREV_STAGE[order.stage] && (
                                                <button
                                                    className={styles.rollbackBtn}
                                                    onClick={() => openRollback(order)}
                                                    title={lang === "ko" ? "이전 단계로" : "Retroceder"}
                                                >
                                                    ↩
                                                </button>
                                            )}
                                            {/* 다음 단계 이동 버튼 */}
                                            {nextInfo && (
                                                <button
                                                    className={styles.advanceBtn}
                                                    style={{ background: nextInfo.color }}
                                                    onClick={() => openAdvance(order)}
                                                >
                                                    → {lang === "ko" ? nextInfo.ko : nextInfo.es}
                                                </button>
                                            )}

                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ─── 관리자 전용: 삭제 확인 모달 ─── */}
            {deleteModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <h3>🗑️ {lang === "ko" ? "공정 삭제" : "Eliminar orden"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? `"${deleteModal.order.sub_category || deleteModal.order.main_category}" (${deleteModal.order.quantity}개)을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
                                : `¿Eliminar "${deleteModal.order.sub_category || deleteModal.order.main_category}" (${deleteModal.order.quantity})? Esta acción no se puede deshacer.`}
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setDeleteModal(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnDelete} onClick={doDelete}>
                                {lang === "ko" ? "삭제" : "Eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 관리자 전용: 수정 모달 ─── */}
            {editModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox} style={{ maxWidth: 420 }}>
                        <h3>✏️ {lang === "ko" ? "공정 수정" : "Editar orden"}</h3>
                        <div className={styles.editGrid}>
                            <div className={styles.editGroup}>
                                <label>{lang === "ko" ? "분류" : "Categoría"}</label>
                                <select value={editForm.main_category} onChange={e => setEditForm(f => ({ ...f, main_category: e.target.value, sub_category: "" }))}>
                                    <option value="">{lang === "ko" ? "선택" : "Sel."}</option>
                                    {[...new Set(categories.map(c => c.main_category).filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className={styles.editGroup}>
                                <label>{lang === "ko" ? "서브카테고리" : "Subcategoría"}</label>
                                <select value={editForm.sub_category} onChange={e => setEditForm(f => ({ ...f, sub_category: e.target.value }))} disabled={!editForm.main_category}>
                                    <option value="">{lang === "ko" ? "선택" : "Sel."}</option>
                                    {categories.filter(c => c.main_category === editForm.main_category).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className={styles.editGroup}>
                                <label>{lang === "ko" ? "색상" : "Color"}</label>
                                <input type="text" value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} />
                            </div>
                            <div className={styles.editGroup}>
                                <label>{lang === "ko" ? "사이즈" : "Talla"}</label>
                                <input type="text" value={editForm.size} onChange={e => setEditForm(f => ({ ...f, size: e.target.value }))} />
                            </div>
                            <div className={styles.editGroup}>
                                <label>{lang === "ko" ? "수량" : "Cantidad"}</label>
                                <input type="number" min="1" value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} />
                            </div>
                        </div>
                        <div className={styles.modalActions} style={{ marginTop: 16 }}>
                            <button className={styles.btnCancel} onClick={() => setEditModal(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnConfirm} onClick={saveEdit}>
                                {lang === "ko" ? "저장" : "Guardar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 단계 이동 확인 모달 ─── */}
            {advanceModal && (() => {
                const next = NEXT_STAGE[advanceModal.order.stage];
                const nextInfo = next ? stageInfo(next) : null;
                return (
                    <div className={styles.modalOverlay}>
                        <div className={styles.modalBox}>
                            <h3>{lang === "ko" ? "✅ 단계 이동 확인" : "✅ Confirmar avance"}</h3>
                            <p className={styles.modalSub}>
                                {lang === "ko"
                                    ? `"${advanceModal.order.sub_category || advanceModal.order.main_category}" (${advanceModal.order.quantity}개)을 다음 단계로 이동하시겠습니까?`
                                    : `¿Mover "${advanceModal.order.sub_category || advanceModal.order.main_category}" (${advanceModal.order.quantity}) al siguiente paso?`}
                            </p>
                            {nextInfo && (
                                <p style={{ fontWeight: 700, color: nextInfo.color, fontSize: 15, margin: "8px 0 20px" }}>
                                    → {lang === "ko" ? nextInfo.ko : nextInfo.es}
                                    {next === "done" && (lang === "ko" ? " (재고에 자동 추가됩니다)" : " (se agregará al inventario)")}
                                </p>
                            )}
                            <div className={styles.modalActions}>
                                <button className={styles.btnCancel} onClick={() => setAdvanceModal(null)}>
                                    {lang === "ko" ? "취소" : "Cancelar"}
                                </button>
                                <button className={styles.btnConfirm} onClick={doAdvance} style={{ background: nextInfo?.color }}>
                                    {lang === "ko" ? "이동" : "Mover"}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ─── 롤백 확인 모달 ─── */}
            {rollbackModal && (() => {
                const prev = PREV_STAGE[rollbackModal.order.stage];
                const prevInfo = prev ? stageInfo(prev) : null;
                return (
                    <div className={styles.modalOverlay}>
                        <div className={styles.modalBox}>
                            <h3>⚠️ {lang === "ko" ? "이전 단계로 되돌리기" : "Retroceder paso"}</h3>
                            <p className={styles.modalSub}>
                                {lang === "ko"
                                    ? `"${rollbackModal.order.sub_category || rollbackModal.order.main_category}" (${rollbackModal.order.quantity}개)을 이전 단계로 되돌리시겠습니까?`
                                    : `¿Retroceder "${rollbackModal.order.sub_category || rollbackModal.order.main_category}" (${rollbackModal.order.quantity}) al paso anterior?`}
                            </p>
                            {prevInfo && (
                                <p style={{ fontWeight: 700, color: prevInfo.color, fontSize: 15, margin: "8px 0 20px" }}>
                                    ↩ {lang === "ko" ? prevInfo.ko : prevInfo.es}
                                    {rollbackModal.order.stage === "done" && (lang === "ko" ? " (재고에서 수량이 차감됩니다)" : " (se restará del inventario)")}
                                </p>
                            )}
                            <div className={styles.modalActions}>
                                <button className={styles.btnCancel} onClick={() => setRollbackModal(null)}>
                                    {lang === "ko" ? "취소" : "Cancelar"}
                                </button>
                                <button className={styles.btnConfirm} onClick={doRollback} style={{ background: "#ef4444" }}>
                                    {lang === "ko" ? "되돌리기" : "Retroceder"}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}


            {/* ─── 탭2: 신규 등록 (배치) ─── */}
            {tab === "new" && (
                <div className={styles.newForm}>
                    <h2 className={styles.formTitle}>{lang === "ko" ? "신규 생산 공정 등록" : "Registrar Nueva Orden"}</h2>
                    {newSuccess && (
                        <div className={styles.successMsg}>
                            ✅ {lang === "ko" ? "등록되었습니다!" : "¡Orden(es) registrada(s)!"}
                        </div>
                    )}

                    {/* 공통 색상 */}
                    <div className={styles.colorRow}>
                        <label className={styles.colorLabel}>{lang === "ko" ? "🎨 공통 색상 (Color):" : "🎨 Color (común):"}</label>
                        <input
                            className={styles.colorInput}
                            type="text"
                            placeholder="ej. Negro, Azul..."
                            value={batchColor}
                            onChange={e => setBatchColor(e.target.value)}
                        />
                    </div>

                    {/* 행 목록 */}
                    <div className={styles.batchTable}>
                        {/* 헤더 */}
                        <div className={styles.batchHeader}>
                            <span>{lang === "ko" ? "분류" : "Categoría"}</span>
                            <span>{lang === "ko" ? "서브카테고리" : "Subcategoría"}</span>
                            <span>{lang === "ko" ? "사이즈" : "Talla"}</span>
                            <span>{lang === "ko" ? "수량" : "Cant."}</span>
                            <span></span>
                        </div>
                        {batchRows.map((row, i) => (
                            <div key={i} className={styles.batchRow}>
                                {/* 메인 카테고리 */}
                                <select
                                    value={row.main_category}
                                    onChange={e => updateBatchRow(i, "main_category", e.target.value)}
                                >
                                    <option value="">{lang === "ko" ? "선택" : "Sel."}</option>
                                    {mainCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                {/* 서브 카테고리 */}
                                <select
                                    value={row.sub_category}
                                    onChange={e => updateBatchRow(i, "sub_category", e.target.value)}
                                    disabled={!row.main_category}
                                >
                                    <option value="">{lang === "ko" ? "선택" : "Sel."}</option>
                                    {getSubCats(row.main_category).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {/* 사이즈 */}
                                <input
                                    type="text"
                                    placeholder="M, L, 42..."
                                    value={row.size}
                                    onChange={e => updateBatchRow(i, "size", e.target.value)}
                                />
                                {/* 수량 */}
                                <input
                                    type="number"
                                    min="1"
                                    placeholder="0"
                                    value={row.quantity}
                                    onChange={e => updateBatchRow(i, "quantity", e.target.value)}
                                />
                                {/* 삭제 */}
                                <button
                                    className={styles.removeRowBtn}
                                    onClick={() => removeBatchRow(i)}
                                    disabled={batchRows.length === 1}
                                    title="Remove"
                                >✕</button>
                            </div>
                        ))}
                    </div>

                    {/* 행 추가 버튼 */}
                    <button className={styles.addRowBtn} onClick={addBatchRow}>
                        + {lang === "ko" ? "항목 추가" : "Agregar fila"}
                    </button>

                    <button
                        className={styles.submitBtn}
                        onClick={submitNew}
                        disabled={newLoading || batchRows.every(r => !r.main_category || !r.quantity)}
                    >
                        {newLoading ? "..." : (lang === "ko" ? `🏭 재단 시작 (${batchRows.filter(r => r.main_category && r.quantity).length}건)` : `🏭 Iniciar corte (${batchRows.filter(r => r.main_category && r.quantity).length})`)}
                    </button>
                </div>
            )}


            {/* ─── 봉제 공장 선택 모달 ─── */}
            {factoryModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <h3>{lang === "ko" ? "봉제 공장 선택" : "Seleccionar taller"}</h3>
                        <p className={styles.modalSub}>{lang === "ko" ? "보낼 봉제 공장을 선택하세요" : "Elige el taller de costura"}</p>
                        <select
                            className={styles.factorySelect}
                            value={selectedFactory}
                            onChange={e => setSelectedFactory(e.target.value)}
                        >
                            <option value="">{lang === "ko" ? "선택..." : "Seleccionar..."}</option>
                            {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setFactoryModal(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnConfirm} onClick={confirmFactory} disabled={!selectedFactory}>
                                {lang === "ko" ? "봉제 시작" : "Enviar a costura"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
