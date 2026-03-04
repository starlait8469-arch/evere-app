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
    original_qty: number | null;       // 재단 원래 수량
    sewing_returned_qty: number | null; // 봉제에서 돌아온 수량
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
    { key: "sewing", ko: "봉제 보내기", es: "Enviar a costura", color: "#3b82f6" },
    { key: "finishing", ko: "plancha 보내기", es: "Enviar a plancha", color: "#8b5cf6" },
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
    const [tab, setTab] = useState<"status" | "new" | "fabric">("status");

    // 천 재고
    type FabricItem = { id: string; name: string; quantity: number; unit: string; note: string | null };
    const [fabrics, setFabrics] = useState<FabricItem[]>([]);
    const [fabricLoading, setFabricLoading] = useState(false);
    const [newFabricName, setNewFabricName] = useState("");
    const [newFabricUnit, setNewFabricUnit] = useState("m");
    const [addingFabric, setAddingFabric] = useState(false);
    const [fabricAction, setFabricAction] = useState<{ id: string; type: "in" | "out"; val: string } | null>(null);
    const [lastFabricOp, setLastFabricOp] = useState<{ id: string; name: string; prevQty: number; newQty: number } | null>(null);

    // 신규 등록 폼 - 배치 방식 (색상 공통, 여러 행)
    const [categories, setCategories] = useState<Category[]>([]);
    const [batchColor, setBatchColor] = useState("");
    type BatchRow = { main_category: string; sub_category: string; size: string; quantity: string; };
    const emptyRow = (): BatchRow => ({ main_category: "", sub_category: "", size: "", quantity: "" });
    const [batchRows, setBatchRows] = useState<BatchRow[]>([emptyRow()]);
    const [newLoading, setNewLoading] = useState(false);
    const [newSuccess, setNewSuccess] = useState(false);

    // 봉제 공장 선택 모달
    const [factoryModal, setFactoryModal] = useState<{ orderId: string | null; bulkIds?: string[] } | null>(null);
    const [selectedFactory, setSelectedFactory] = useState("");
    // 재단중 다중 선택
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // 단계 이동 확인 모달
    const [advanceModal, setAdvanceModal] = useState<{ order: ProductionOrder } | null>(null);
    const [advanceQty, setAdvanceQty] = useState<number>(0); // 실제 입고 수량 조정
    // 롤백 확인 모달
    const [rollbackModal, setRollbackModal] = useState<{ order: ProductionOrder } | null>(null);
    // 봉제중 다중 선택 (plancha 일괄 발송)
    const [selectedSewingIds, setSelectedSewingIds] = useState<Set<string>>(new Set());
    // plancha 일괄 발송 모달
    type PlanchaItem = { order: ProductionOrder; qty: number };
    const [planchaModal, setPlanchaModal] = useState<PlanchaItem[] | null>(null);
    const [planchaSlip, setPlanchaSlip] = useState<DispatchSlip | null>(null);
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
        fetchFabrics();
    }, []);


    const fetchOrders = async () => {
        setLoading(true);

        // done 단계 중 오늘(자정 기준) 이전에 완료된 것은 메인 뷰에서 제외
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

        const { data } = await supabase
            .from("production_orders")
            .select("*, sewing_factories(name)")
            .or(`stage.neq.done,completed_at.gte.${todayMidnight.toISOString()}`)
            .order("created_at", { ascending: false });
        if (data) setOrders(data as unknown as ProductionOrder[]);
        setLoading(false);
    };

    const fetchFactories = async () => {
        const { data } = await supabase.from("sewing_factories").select("id, name").order("name");
        if (data) setFactories(data);
    };

    const fetchFabrics = async () => {
        setFabricLoading(true);
        const { data } = await supabase.from("fabric_inventory").select("*").order("name");
        setFabrics((data as FabricItem[]) || []);
        setFabricLoading(false);
    };

    const addFabric = async () => {
        if (!newFabricName.trim()) return;
        await supabase.from("fabric_inventory").insert([{ name: newFabricName.trim(), unit: newFabricUnit, quantity: 0 }]);
        setNewFabricName(""); setNewFabricUnit("m"); setAddingFabric(false);
        fetchFabrics();
    };

    const confirmFabricAction = async () => {
        if (!fabricAction) return;
        const amt = parseFloat(fabricAction.val);
        if (isNaN(amt) || amt <= 0) return;
        const item = fabrics.find(f => f.id === fabricAction.id);
        if (!item) return;
        const newQty = fabricAction.type === "in"
            ? item.quantity + amt
            : Math.max(0, item.quantity - amt);
        setLastFabricOp({ id: item.id, name: item.name, prevQty: item.quantity, newQty });
        await supabase.from("fabric_inventory").update({ quantity: newQty }).eq("id", fabricAction.id);
        setFabricAction(null);
        fetchFabrics();
    };

    const undoFabricOp = async () => {
        if (!lastFabricOp) return;
        await supabase.from("fabric_inventory").update({ quantity: lastFabricOp.prevQty }).eq("id", lastFabricOp.id);
        setLastFabricOp(null);
        fetchFabrics();
    };

    const deleteFabric = async (id: string) => {
        await supabase.from("fabric_inventory").delete().eq("id", id);
        fetchFabrics();
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
        setAdvanceQty(order.quantity); // 기본값을 현재 수량으로
        setAdvanceModal({ order });
    };

    // 다음 단계 이동 실행 (실제 수량 사용)
    const doAdvance = async () => {
        if (!advanceModal) return;
        const order = advanceModal.order;
        const nextStage = NEXT_STAGE[order.stage];
        if (!nextStage) return;
        setAdvanceModal(null);

        const realQty = advanceQty > 0 ? advanceQty : order.quantity;

        if (nextStage === "done") {
            // 입고 완료: inventory에 수량 추가 (advanceQty 사용)
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
                    .update({ quantity: existing.quantity + realQty })
                    .eq("id", existing.id);
            } else {
                await supabase.from("inventory").insert([{
                    name: order.sub_category || order.main_category,
                    main_category: order.main_category,
                    sub_category: order.sub_category || "",
                    color: order.color || "",
                    size: order.size || "",
                    quantity: realQty,
                }]);
            }
            await supabase
                .from("production_orders")
                .update({ stage: "done", quantity: realQty, completed_at: new Date().toISOString() })
                .eq("id", order.id);
        } else {
            // 수량 변경 + 단계 업데이트
            // 봉제 단계에서 다음으로 넘어갈 때 sewing_returned_qty 기록
            const extraFields = order.stage === "sewing"
                ? { sewing_returned_qty: realQty }
                : {};
            await supabase.from("production_orders")
                .update({ stage: nextStage, quantity: realQty, ...extraFields })
                .eq("id", order.id);

            // 봉제 → plancha 이동 시 출고전표 인쇄 모달 표시
            if (order.stage === "sewing") {
                const date = new Date().toLocaleDateString("es-AR");
                setPlanchaSlip({
                    factoryName: "Plancha",
                    date,
                    orders: [{ ...order, quantity: realQty }],
                });
            }
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


    // 봉제중 카드 선택 토글 (plancha 일괄 발송용)
    const toggleSewing = (id: string) => {
        setSelectedSewingIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 선택된 봉제중 목록을 plancha 일괄 발송 모달로
    const openBulkPlancha = () => {
        const selected = orders.filter(o => selectedSewingIds.has(o.id) && o.stage === "sewing");
        if (selected.length === 0) return;
        setPlanchaModal(selected.map(o => ({ order: o, qty: o.quantity })));
    };

    // plancha 발송 실행 + 인쇄 슬립 생성
    const doBulkPlancha = async () => {
        if (!planchaModal) return;
        for (const item of planchaModal) {
            await supabase.from("production_orders")
                .update({ stage: "finishing", quantity: item.qty, sewing_returned_qty: item.qty })
                .eq("id", item.order.id);
        }
        const date = new Date().toLocaleDateString("es-AR");
        setPlanchaSlip({
            factoryName: "Plancha",
            date,
            orders: planchaModal.map(item => ({
                ...item.order,
                quantity: item.qty,
            })),
        });
        setPlanchaModal(null);
        setSelectedSewingIds(new Set());
        fetchOrders();
    };

    // plancha 출고전표 인쇄 (스페인어 고정)
    const printPlanchaSlip = (slip: DispatchSlip) => {
        const rows = slip.orders.map(o => `
            <tr>
                <td>${o.main_category}</td>
                <td>${o.sub_category || "-"}</td>
                <td>${o.color || "-"}</td>
                <td>${o.size || "-"}</td>
                <td style="text-align:center;font-weight:700;">${o.quantity}</td>
            </tr>`).join("");

        const total = slip.orders.reduce((s, o) => s + o.quantity, 0);
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Plancha - ${slip.date}</title>
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
    <div class="title">Envío a Plancha</div>
    <div class="meta">
      <span>📅 Fecha: <strong>${slip.date}</strong></span>
      <span>Total: <strong>${slip.orders.length}</strong> orden(es)</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Categoría</th><th>Subcategoría</th><th>Color</th><th>Talla</th>
        <th style="text-align:center;">Cantidad</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">Total</td>
        <td style="text-align:center;">${total}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">
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

    // 출고전표 인쇄
    type DispatchSlip = { factoryName: string; date: string; orders: ProductionOrder[] };
    const [dispatchSlip, setDispatchSlip] = useState<DispatchSlip | null>(null);

    const printDispatchSlip = (slip: DispatchSlip) => {
        const rows = slip.orders.map(o => `
            <tr>
                <td>${o.main_category}</td>
                <td>${o.sub_category || "-"}</td>
                <td>${o.color || "-"}</td>
                <td>${o.size || "-"}</td>
                <td style="text-align:center;font-weight:700;">${o.quantity}</td>
            </tr>`).join("");

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Remisión de Costura - ${slip.factoryName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,sans-serif; padding:32px; color:#111; }
  .header { border-bottom:3px solid #111; padding-bottom:16px; margin-bottom:20px; }
  .title { font-size:22px; font-weight:800; letter-spacing:-0.5px; }
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
    <div class="title">Remisión de Costura</div>
    <div class="meta">
      <span>📅 Fecha: <strong>${slip.date}</strong></span>
      <span>🏭 Taller: <strong>${slip.factoryName}</strong></span>
      <span>Total: <strong>${slip.orders.length}</strong> orden(es)</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Categoría</th>
        <th>Subcategoría</th>
        <th>Color</th>
        <th>Talla</th>
        <th style="text-align:center;">Cantidad</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">Total</td>
        <td style="text-align:center;">${slip.orders.reduce((s, o) => s + o.quantity, 0)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
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

    // 봉제 공장 선택 확인 (단독 또는 다중)
    const confirmFactory = async () => {
        if (!factoryModal || !selectedFactory) return;
        const ids = factoryModal.bulkIds && factoryModal.bulkIds.length > 0
            ? factoryModal.bulkIds
            : [factoryModal.orderId].filter(Boolean) as string[];

        // 발송할 주문 정보 수집 (인쇄용)
        const dispatchOrders = orders.filter(o => ids.includes(o.id));
        const factoryObj = factories.find(f => f.id === selectedFactory);

        for (const id of ids) {
            await supabase
                .from("production_orders")
                .update({ stage: "sewing", factory_id: selectedFactory })
                .eq("id", id);
        }
        setFactoryModal(null);
        setSelectedIds(new Set());

        // 출고전표 데이터 저장 → 인쇄 유도
        if (factoryObj && dispatchOrders.length > 0) {
            setDispatchSlip({
                factoryName: factoryObj.name,
                date: new Date().toLocaleDateString("ko-KR"),
                orders: dispatchOrders,
            });
        }

        fetchOrders();
    };

    // 재단중 카드 선택 토글
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 선택된 재단중 목록을 일괄 봉제공장으로 보내기
    const openBulkFactory = () => {
        if (selectedIds.size === 0) return;
        setSelectedFactory("");
        setFactoryModal({ orderId: null, bulkIds: [...selectedIds] });
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
            original_qty: parseInt(r.quantity, 10),
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
                <button
                    className={`${styles.tab} ${tab === "fabric" ? styles.tabActive : ""}`}
                    onClick={() => setTab("fabric")}
                >
                    🧵 {lang === "ko" ? "천 재고" : "Telas"}
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
                    ) : (() => {
                        // 카테고리/서브카테고리별 그룹화
                        const groups: { label: string; orders: ProductionOrder[] }[] = [];
                        const groupMap = new Map<string, ProductionOrder[]>();
                        filtered.forEach(o => {
                            const key = `${o.main_category}__${o.sub_category || ""}`;
                            if (!groupMap.has(key)) groupMap.set(key, []);
                            groupMap.get(key)!.push(o);
                        });
                        groupMap.forEach((orders, key) => {
                            const [main, sub] = key.split("__");
                            const label = sub ? `${main} › ${sub}` : main;
                            // color 알파벳순 → size 숫자 오름차순 정렬
                            const sorted = [...orders].sort((a, b) => {
                                const colorCmp = (a.color || "").localeCompare(b.color || "");
                                if (colorCmp !== 0) return colorCmp;
                                const na = parseFloat(a.size), nb = parseFloat(b.size);
                                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                                return (a.size || "").localeCompare(b.size || "");
                            });
                            groups.push({ label, orders: sorted });
                        });


                        // 재단중 카드 선택된 개수 (일괄 발송 바)
                        const cuttingSelected = [...selectedIds].filter(id =>
                            filtered.find(o => o.id === id && o.stage === "cutting")
                        );

                        // 봉제중 카드 선택된 개수 (plancha 일괄 발송 바)
                        const sewingSelected = [...selectedSewingIds].filter(id =>
                            filtered.find(o => o.id === id && o.stage === "sewing")
                        );

                        return (
                            <>
                                {/* 일괄 봉제공장 발송 바 */}
                                {cuttingSelected.length > 0 && (
                                    <div className={styles.bulkBar}>
                                        <span>{lang === "ko" ? `${cuttingSelected.length}개 선택됨` : `${cuttingSelected.length} seleccionado(s)`}</span>
                                        <button className={styles.bulkBtn} onClick={openBulkFactory}>
                                            🏭 {lang === "ko" ? "봉제공장으로 보내기" : "Enviar a costura"}
                                        </button>
                                        <button className={styles.bulkClear} onClick={() => setSelectedIds(new Set())}>✕</button>
                                    </div>
                                )}
                                {/* 봉제중 → plancha 일괄 발송 바 */}
                                {sewingSelected.length > 0 && (
                                    <div className={styles.bulkBar} style={{ background: "#8b5cf6" }}>
                                        <span>{lang === "ko" ? `${sewingSelected.length}개 선택됨` : `${sewingSelected.length} seleccionado(s)`}</span>
                                        <button className={styles.bulkBtn} onClick={openBulkPlancha}>
                                            🔧 {lang === "ko" ? "plancha로 보내기" : "Enviar a plancha"}
                                        </button>
                                        <button className={styles.bulkClear} onClick={() => setSelectedSewingIds(new Set())}>✕</button>
                                    </div>
                                )}


                                {groups.map(group => (
                                    <div key={group.label} className={styles.group}>
                                        <div className={styles.groupHeader}>
                                            <span className={styles.groupLabel}>{group.label}</span>
                                            <span className={styles.groupCount}>{group.orders.length}{lang === "ko" ? "건" : " ord."}</span>
                                        </div>
                                        <div className={styles.cardGrid}>
                                            {group.orders.map(order => {
                                                const info = stageInfo(order.stage);
                                                const next = NEXT_STAGE[order.stage];
                                                const nextInfo = next ? stageInfo(next) : null;
                                                const isCutting = order.stage === "cutting";
                                                const isSewing = order.stage === "sewing";
                                                const isChecked = selectedIds.has(order.id) || selectedSewingIds.has(order.id);
                                                return (
                                                    <div
                                                        key={order.id}
                                                        className={`${styles.orderCard} ${isChecked ? styles.orderCardSelected : ""}`}
                                                    >
                                                        {/* 재단중: 봉제공장 발송 체크박스 */}
                                                        {isCutting && (
                                                            <label className={styles.checkRow}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedIds.has(order.id)}
                                                                    onChange={() => toggleSelect(order.id)}
                                                                />
                                                                <span className={styles.checkLabel}>
                                                                    {lang === "ko" ? "선택" : "Sel."}
                                                                </span>
                                                            </label>
                                                        )}
                                                        {/* 봉제중: plancha 발송 체크박스 */}
                                                        {isSewing && (
                                                            <label className={styles.checkRow} style={{ color: "#8b5cf6" }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedSewingIds.has(order.id)}
                                                                    onChange={() => toggleSewing(order.id)}
                                                                    style={{ accentColor: "#8b5cf6" }}
                                                                />
                                                                <span className={styles.checkLabel}>
                                                                    {lang === "ko" ? "선택" : "Sel."}
                                                                </span>
                                                            </label>
                                                        )}
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
                                                        {/* 봉제 손실 표시 (sewing_returned_qty < original_qty) */}
                                                        {order.sewing_returned_qty != null && order.original_qty != null && order.sewing_returned_qty < order.original_qty && (
                                                            <div className={styles.lossRow}>
                                                                <span className={styles.lossBadge}>
                                                                    🪡 {lang === "ko"
                                                                        ? `봉제 -${order.original_qty - order.sewing_returned_qty}개`
                                                                        : `Costura -${order.original_qty - order.sewing_returned_qty}`}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {/* plancha 손실 표시 (quantity < sewing_returned_qty, finishing 이후) */}
                                                        {(order.stage === "finishing" || order.stage === "done") &&
                                                            order.sewing_returned_qty != null &&
                                                            order.quantity < order.sewing_returned_qty && (
                                                                <div className={styles.lossRow}>
                                                                    <span className={styles.lossBadge} style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
                                                                        🔧 {lang === "ko"
                                                                            ? `plancha -${order.sewing_returned_qty - order.quantity}개`
                                                                            : `Plancha -${order.sewing_returned_qty - order.quantity}`}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        <div className={styles.cardDate}>
                                                            {new Date(order.created_at).toLocaleDateString()}
                                                        </div>

                                                        <div className={styles.cardActions}>
                                                            {isAdmin && (
                                                                <>
                                                                    <button className={styles.editBtn} onClick={() => openEdit(order)} title={lang === "ko" ? "수정" : "Editar"}>✏️</button>
                                                                    <button className={styles.deleteCardBtn} onClick={() => setDeleteModal({ order })} title={lang === "ko" ? "삭제" : "Eliminar"}>🗑️</button>
                                                                </>
                                                            )}
                                                            {PREV_STAGE[order.stage] && (
                                                                <button className={styles.rollbackBtn} onClick={() => openRollback(order)} title={lang === "ko" ? "이전 단계로" : "Retroceder"}>↩</button>
                                                            )}
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
                                    </div>
                                ))}
                            </>
                        );
                    })()}
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

            {/* ─── plancha 일괄 발송 모달 (수량 조정) ─── */}
            {planchaModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox} style={{ maxWidth: 480 }}>
                        <h3>🔧 {lang === "ko" ? "plancha 발송 확인" : "Enviar a Plancha"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? "실제 입고 수량을 확인하고 수정해 주세요."
                                : "Verifique y ajuste las cantidades reales recibidas."}
                        </p>
                        <div className={styles.planchaList}>
                            {planchaModal.map((item, i) => (
                                <div key={item.order.id} className={styles.planchaItem}>
                                    <div className={styles.planchaName}>
                                        <span>{item.order.sub_category || item.order.main_category}</span>
                                        {item.order.color && <span className={styles.tag}>{item.order.color}</span>}
                                        {item.order.size && <span className={styles.tag}>{item.order.size}</span>}
                                    </div>
                                    <div className={styles.qtyRow}>
                                        <button className={styles.qtyBtn}
                                            onClick={() => setPlanchaModal(m => m!.map((it, idx) => idx === i ? { ...it, qty: Math.max(1, it.qty - 1) } : it))}>−</button>
                                        <input
                                            type="number" min="1"
                                            className={styles.qtyInput}
                                            value={item.qty}
                                            onChange={e => {
                                                const v = Math.max(1, parseInt(e.target.value) || 1);
                                                setPlanchaModal(m => m!.map((it, idx) => idx === i ? { ...it, qty: v } : it));
                                            }}
                                        />
                                        <button className={styles.qtyBtn}
                                            onClick={() => setPlanchaModal(m => m!.map((it, idx) => idx === i ? { ...it, qty: it.qty + 1 } : it))}>+</button>
                                    </div>
                                    {item.qty !== item.order.quantity && (
                                        <span className={styles.qtyDiff}>
                                            {lang === "ko" ? `원래 ${item.order.quantity}개` : `Orig. ${item.order.quantity}`}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className={styles.modalActions} style={{ marginTop: 16 }}>
                            <button className={styles.btnCancel} onClick={() => setPlanchaModal(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnConfirm} style={{ background: "#8b5cf6" }} onClick={doBulkPlancha}>
                                🔧 {lang === "ko" ? "plancha 발송" : "Enviar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── plancha 출고전표 인쇄 모달 ─── */}
            {planchaSlip && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox} style={{ maxWidth: 420 }}>
                        <div className={styles.slipIcon}>🔧</div>
                        <h3>{lang === "ko" ? "plancha 발송 완료!" : "¡Enviado a Plancha!"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? `${planchaSlip.orders.length}건이 plancha로 발송되었습니다.`
                                : `${planchaSlip.orders.length} orden(es) enviadas a plancha.`}
                        </p>
                        <div className={styles.slipPreview}>
                            {planchaSlip.orders.map((o, i) => (
                                <div key={i} className={styles.slipRow}>
                                    <span className={styles.slipItem}>{o.sub_category || o.main_category}</span>
                                    <div className={styles.slipTags}>
                                        {o.color && <span className={styles.tag}>{o.color}</span>}
                                        {o.size && <span className={styles.tag}>{o.size}</span>}
                                    </div>
                                    <span className={styles.slipQty}>{o.quantity}</span>
                                </div>
                            ))}
                            <div className={styles.slipTotal}>
                                <span>{lang === "ko" ? "합계" : "Total"}</span>
                                <span className={styles.slipQty}>{planchaSlip.orders.reduce((s, o) => s + o.quantity, 0)}</span>
                            </div>
                        </div>
                        <div className={styles.modalActions} style={{ marginTop: 16 }}>
                            <button className={styles.btnCancel} onClick={() => setPlanchaSlip(null)}>
                                {lang === "ko" ? "닫기" : "Cerrar"}
                            </button>
                            <button className={styles.btnPrint} onClick={() => { printPlanchaSlip(planchaSlip); setPlanchaSlip(null); }}>
                                🖨️ {lang === "ko" ? "plancha 전표 인쇄" : "Imprimir plancha"}
                            </button>
                        </div>
                    </div>
                </div>
            )}


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
                                    ? `"${advanceModal.order.sub_category || advanceModal.order.main_category}" 다음 단계로 이동합니다.`
                                    : `Mover "${advanceModal.order.sub_category || advanceModal.order.main_category}" al siguiente paso.`}
                            </p>
                            {nextInfo && (
                                <p style={{ fontWeight: 700, color: nextInfo.color, fontSize: 15, margin: "6px 0 14px" }}>
                                    → {lang === "ko" ? nextInfo.ko : nextInfo.es}
                                    {next === "done" && (lang === "ko" ? " (재고에 자동 추가됩니다)" : " (se agregará al inventario)")}
                                </p>
                            )}
                            {/* 실제 입고 수량 조정 */}
                            <div className={styles.qtyAdjust}>
                                <label className={styles.qtyLabel}>
                                    {lang === "ko" ? "📦 실제 입고 수량" : "📦 Cantidad real recibida"}
                                </label>
                                <div className={styles.qtyRow}>
                                    <button className={styles.qtyBtn} onClick={() => setAdvanceQty(q => Math.max(1, q - 1))}>−</button>
                                    <input
                                        type="number"
                                        min="1"
                                        className={styles.qtyInput}
                                        value={advanceQty}
                                        onChange={e => setAdvanceQty(Math.max(1, parseInt(e.target.value) || 1))}
                                    />
                                    <button className={styles.qtyBtn} onClick={() => setAdvanceQty(q => q + 1)}>+</button>
                                </div>
                                {advanceQty !== advanceModal.order.quantity && (
                                    <p className={styles.qtyDiff}>
                                        {lang === "ko"
                                            ? `원래 수량 ${advanceModal.order.quantity}개 → 실제 ${advanceQty}개`
                                            : `Original: ${advanceModal.order.quantity} → Real: ${advanceQty}`}
                                    </p>
                                )}
                            </div>
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


            {/* ─── 출고전표 인쇄 유도 모달 ─── */}
            {dispatchSlip && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox} style={{ maxWidth: 420 }}>
                        <div className={styles.slipIcon}>🏭</div>
                        <h3>{lang === "ko" ? "봉제공장 발송 완료!" : "¡Enviado a costura!"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? `${dispatchSlip.factoryName}으로 ${dispatchSlip.orders.length}건이 발송되었습니다.`
                                : `${dispatchSlip.orders.length} orden(es) enviadas a ${dispatchSlip.factoryName}.`}
                        </p>

                        {/* 미리보기 테이블 */}
                        <div className={styles.slipPreview}>
                            {dispatchSlip.orders.map((o, i) => (
                                <div key={i} className={styles.slipRow}>
                                    <span className={styles.slipItem}>{o.sub_category || o.main_category}</span>
                                    <div className={styles.slipTags}>
                                        {o.color && <span className={styles.tag}>{o.color}</span>}
                                        {o.size && <span className={styles.tag}>{o.size}</span>}
                                    </div>
                                    <span className={styles.slipQty}>{o.quantity}{lang === "ko" ? "개" : ""}</span>
                                </div>
                            ))}
                            <div className={styles.slipTotal}>
                                <span>{lang === "ko" ? "합계" : "Total"}</span>
                                <span className={styles.slipQty}>
                                    {dispatchSlip.orders.reduce((s, o) => s + o.quantity, 0)}{lang === "ko" ? "개" : ""}
                                </span>
                            </div>
                        </div>

                        <div className={styles.modalActions} style={{ marginTop: 16 }}>
                            <button className={styles.btnCancel} onClick={() => setDispatchSlip(null)}>
                                {lang === "ko" ? "닫기" : "Cerrar"}
                            </button>
                            <button className={styles.btnPrint} onClick={() => { printDispatchSlip(dispatchSlip); setDispatchSlip(null); }}>
                                🖨️ {lang === "ko" ? "출고전표 인쇄" : "Imprimir remisión"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* ─── 탭3: 천 재고 ─── */}
            {tab === "fabric" && (
                <div className={styles.fabricTab}>
                    <div className={styles.fabricHeader}>
                        <h2 className={styles.fabricTitle}>
                            🧵 {lang === "ko" ? "천 재고 관리" : "Stock de telas"}
                        </h2>
                        {isAdmin && (
                            <button className={styles.addFabricBtn} onClick={() => setAddingFabric(true)}>
                                + {lang === "ko" ? "원단 추가" : "Agregar tela"}
                            </button>
                        )}
                    </div>

                    {/* 롤백 토스트 */}
                    {lastFabricOp && (
                        <div className={styles.fabricToast}>
                            <span>
                                {lang === "ko"
                                    ? `"${lastFabricOp.name}" ${lastFabricOp.prevQty} → ${lastFabricOp.newQty}${fabrics.find(f => f.id === lastFabricOp.id)?.unit ?? ""}`
                                    : `"${lastFabricOp.name}" ${lastFabricOp.prevQty} → ${lastFabricOp.newQty}${fabrics.find(f => f.id === lastFabricOp.id)?.unit ?? ""}`}
                            </span>
                            <button className={styles.fabricUndoBtn} onClick={undoFabricOp}>
                                ↩ {lang === "ko" ? "롤백" : "Revertir"}
                            </button>
                            <button className={styles.fabricToastClose} onClick={() => setLastFabricOp(null)}>✕</button>
                        </div>
                    )}

                    {/* 신규 원단 추가 폼 (관리자) */}
                    {addingFabric && (
                        <div className={styles.fabricAddForm}>
                            <input
                                className={styles.fabricInput}
                                placeholder={lang === "ko" ? "원단 이름 (예: 면 30수)" : "Nombre (ej: algodón 30)"}
                                value={newFabricName}
                                onChange={e => setNewFabricName(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && addFabric()}
                                autoFocus
                            />
                            <select className={styles.fabricUnitSel} value={newFabricUnit} onChange={e => setNewFabricUnit(e.target.value)}>
                                {["m", "kg", "yd", "롤"].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <button className={styles.fabricConfirmBtn} onClick={addFabric}>✓</button>
                            <button className={styles.fabricCancelBtn} onClick={() => { setAddingFabric(false); setNewFabricName(""); }}>✕</button>
                        </div>
                    )}

                    {/* 원단 목록 */}
                    {fabricLoading ? (
                        <div className={styles.empty}>Loading...</div>
                    ) : fabrics.length === 0 ? (
                        <div className={styles.empty}>
                            {lang === "ko" ? "등록된 원단이 없습니다" : "No hay telas registradas"}
                        </div>
                    ) : (
                        <div className={styles.fabricList}>
                            {fabrics.map(f => {
                                const isActive = fabricAction?.id === f.id;
                                return (
                                    <div key={f.id} className={`${styles.fabricCard} ${isActive ? styles.fabricCardActive : ""}`}>
                                        {/* 이름 + 현재 재고 */}
                                        <div className={styles.fabricCardTop}>
                                            <span className={styles.fabricName}>{f.name}</span>
                                            <span className={styles.fabricQtyDisplay}>{f.quantity}<span className={styles.fabricUnit}>{f.unit}</span></span>
                                            {isAdmin && (
                                                <button className={styles.fabricDelBtn} onClick={() => deleteFabric(f.id)}>🗑</button>
                                            )}
                                        </div>

                                        {/* 입고/출고 버튼 or 인라인 입력 */}
                                        {!isActive ? (
                                            <div className={styles.fabricBtns}>
                                                <button
                                                    className={styles.fabricInBtn}
                                                    onClick={() => setFabricAction({ id: f.id, type: "in", val: "" })}
                                                >
                                                    ＋ {lang === "ko" ? "입고" : "Entrada"}
                                                </button>
                                                <button
                                                    className={styles.fabricOutBtn}
                                                    onClick={() => setFabricAction({ id: f.id, type: "out", val: "" })}
                                                >
                                                    － {lang === "ko" ? "출고" : "Salida"}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className={styles.fabricActionRow}>
                                                <span className={fabricAction.type === "in" ? styles.fabricInLabel : styles.fabricOutLabel}>
                                                    {fabricAction.type === "in"
                                                        ? (lang === "ko" ? "입고 수량" : "Entrada")
                                                        : (lang === "ko" ? "출고 수량" : "Salida")}
                                                </span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    autoFocus
                                                    className={styles.fabricActionInput}
                                                    placeholder="0"
                                                    value={fabricAction.val}
                                                    onChange={e => setFabricAction(prev => prev ? { ...prev, val: e.target.value } : null)}
                                                    onKeyDown={e => { if (e.key === "Enter") confirmFabricAction(); if (e.key === "Escape") setFabricAction(null); }}
                                                />
                                                <span className={styles.fabricUnit}>{f.unit}</span>
                                                <button className={styles.fabricConfirmBtn} onClick={confirmFabricAction}>✓</button>
                                                <button className={styles.fabricCancelBtn} onClick={() => setFabricAction(null)}>✕</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
