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
    type: string;
    sub_categories?: { id: string; name: string }[];
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

    // 공정 현황
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [factories, setFactories] = useState<SewingFactory[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStage, setFilterStage] = useState<Stage | "all">("all");

    // 탭
    const [tab, setTab] = useState<"status" | "new">("status");

    // 신규 등록 폼
    const [categories, setCategories] = useState<Category[]>([]);
    const [newForm, setNewForm] = useState({
        main_category: "",
        sub_category: "",
        color: "",
        size: "",
        quantity: "",
    });
    const [newLoading, setNewLoading] = useState(false);
    const [newSuccess, setNewSuccess] = useState(false);

    // 봉제 공장 선택 모달
    const [factoryModal, setFactoryModal] = useState<{ orderId: string; } | null>(null);
    const [selectedFactory, setSelectedFactory] = useState("");

    useEffect(() => {
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
            .select("*, sub_categories(*)")
            .order("name");
        if (data) setCategories(data);
    };

    // 다음 단계로 이동
    const advanceStage = async (order: ProductionOrder) => {
        const nextStage = NEXT_STAGE[order.stage];
        if (!nextStage) return;

        // 봉제 단계로 넘어갈 때 공장 선택 모달
        if (nextStage === "sewing") {
            setSelectedFactory("");
            setFactoryModal({ orderId: order.id });
            return;
        }

        // 입고 완료 단계: inventory에 수량 추가 (직접 upsert)
        if (nextStage === "done") {
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

            fetchOrders();
            return;
        }

        await supabase.from("production_orders").update({ stage: nextStage }).eq("id", order.id);
        fetchOrders();
    };

    // 봉제 공장 선택 확인
    const confirmFactory = async () => {
        if (!factoryModal || !selectedFactory) return;
        await supabase
            .from("production_orders")
            .update({ stage: "sewing", factory_id: selectedFactory })
            .eq("id", factoryModal.orderId);
        setFactoryModal(null);
        fetchOrders();
    };

    // 신규 공정 등록
    const submitNew = async () => {
        if (!newForm.main_category || !newForm.quantity) return;
        setNewLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("production_orders").insert([{
            main_category: newForm.main_category,
            sub_category: newForm.sub_category,
            color: newForm.color,
            size: newForm.size,
            quantity: parseInt(newForm.quantity, 10),
            stage: "cutting",
            created_by: user?.id || null,
        }]);
        setNewForm({ main_category: "", sub_category: "", color: "", size: "", quantity: "" });
        setNewLoading(false);
        setNewSuccess(true);
        setTimeout(() => setNewSuccess(false), 3000);
        fetchOrders();
        setTab("status");
    };

    const mainCategories = [...new Set(categories.map(c => c.name))];
    const selectedCat = categories.find(c => c.name === newForm.main_category);
    const subCategories = selectedCat?.sub_categories?.map(s => s.name) ?? [];

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
                                        {nextInfo && (
                                            <button
                                                className={styles.advanceBtn}
                                                style={{ background: nextInfo.color }}
                                                onClick={() => advanceStage(order)}
                                            >
                                                → {lang === "ko" ? nextInfo.ko : nextInfo.es}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ─── 탭2: 신규 등록 ─── */}
            {tab === "new" && (
                <div className={styles.newForm}>
                    <h2 className={styles.formTitle}>{lang === "ko" ? "신규 생산 공정 등록" : "Registrar Nueva Orden"}</h2>
                    {newSuccess && (
                        <div className={styles.successMsg}>
                            ✅ {lang === "ko" ? "등록되었습니다!" : "¡Orden registrada!"}
                        </div>
                    )}

                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>{lang === "ko" ? "메인 카테고리" : "Categoría principal"}</label>
                            <select
                                value={newForm.main_category}
                                onChange={e => setNewForm(f => ({ ...f, main_category: e.target.value, sub_category: "" }))}
                            >
                                <option value="">{lang === "ko" ? "선택..." : "Seleccionar..."}</option>
                                {mainCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        {subCategories.length > 0 && (
                            <div className={styles.formGroup}>
                                <label>{lang === "ko" ? "서브 카테고리" : "Subcategoría"}</label>
                                <select
                                    value={newForm.sub_category}
                                    onChange={e => setNewForm(f => ({ ...f, sub_category: e.target.value }))}
                                >
                                    <option value="">{lang === "ko" ? "선택..." : "Seleccionar..."}</option>
                                    {subCategories.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        )}
                        <div className={styles.formGroup}>
                            <label>{lang === "ko" ? "색상" : "Color"}</label>
                            <input
                                type="text"
                                placeholder="ej. Negro"
                                value={newForm.color}
                                onChange={e => setNewForm(f => ({ ...f, color: e.target.value }))}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>{lang === "ko" ? "사이즈" : "Talla"}</label>
                            <input
                                type="text"
                                placeholder="ej. M, L, 42"
                                value={newForm.size}
                                onChange={e => setNewForm(f => ({ ...f, size: e.target.value }))}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>{lang === "ko" ? "수량" : "Cantidad"}</label>
                            <input
                                type="number"
                                min="1"
                                placeholder="0"
                                value={newForm.quantity}
                                onChange={e => setNewForm(f => ({ ...f, quantity: e.target.value }))}
                            />
                        </div>
                    </div>

                    <button
                        className={styles.submitBtn}
                        onClick={submitNew}
                        disabled={newLoading || !newForm.main_category || !newForm.quantity}
                    >
                        {newLoading ? "..." : (lang === "ko" ? "🏭 재단 시작" : "🏭 Iniciar corte")}
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
