import { createClient } from "@/lib/supabase/server";
import DashboardHome from "./DashboardHome";

const LOW_STOCK_THRESHOLD = 10;

export default async function DashboardPage() {
    const supabase = await createClient();

    // 생산라인 집계 (production_orders 기준)
    const { data: productionOrders } = await supabase
        .from("production_orders")
        .select("stage")
        .neq("stage", "done");

    const inProgress = productionOrders?.length ?? 0;

    // (inventory) 현재 재고 조회
    const { data: inventoryData } = await supabase
        .from("inventory")
        .select("main_category, sub_category, color, size, quantity");
    const inventory = inventoryData || [];

    const { data: cuttingOrders } = await supabase
        .from("production_orders")
        .select("main_category, sub_category, color, size")
        .eq("stage", "cutting");

    // 재단하기: 재고 낮고(< threshold) + cutting 단계 주문 없는 품목 (중복 레코드 합산 후 판단)
    const groupedMap = new Map<string, any>();
    inventory.forEach(inv => {
        const m = (inv.main_category || "").trim().toLowerCase();
        const s = (inv.sub_category || "").trim().toLowerCase();
        const c = (inv.color || "").trim().toLowerCase();
        const sz = (inv.size || "").trim().toLowerCase();
        const key = `${m}|${s}|${c}|${sz}`;

        if (groupedMap.has(key)) {
            groupedMap.get(key)!.quantity += (inv.quantity || 0);
        } else {
            groupedMap.set(key, { ...inv });
        }
    });

    const needCutItems = Array.from(groupedMap.values()).filter(inv => {
        if (inv.quantity >= LOW_STOCK_THRESHOLD) return false; // 합치고 나서도 재고가 충분히 있으면 노출 안 함

        const invMainLower = (inv.main_category || "").trim().toLowerCase();
        const invSubLower = (inv.sub_category || "").trim().toLowerCase();
        const invColorLower = (inv.color || "").trim().toLowerCase();
        const invSizeLower = (inv.size || "").trim().toLowerCase();

        const hasCutting = (cuttingOrders || []).some(c =>
            (c.main_category || "").trim().toLowerCase() === invMainLower &&
            (c.sub_category || "").trim().toLowerCase() === invSubLower &&
            (c.color || "").trim().toLowerCase() === invColorLower &&
            (c.size || "").trim().toLowerCase() === invSizeLower
        );
        return !hasCutting;
    });
    const needsCut = needCutItems.length;

    // 봉제 현황: sewing + returned 단계 주문 건수
    const sewingCount = productionOrders?.filter(o => o.stage === "sewing" || o.stage === "returned").length ?? 0;

    // Plancha 추천: returned 단계 주문들 (봉제입고 완료, 가게로 들어온 상태)
    const { data: sewingOrdersData } = await supabase
        .from("production_orders")
        .select("id, main_category, sub_category, color, size, quantity")
        .eq("stage", "returned");

    const sewingOrders = sewingOrdersData || [];

    // 현재 Plancha(finishing) 단계에 있는 주문들 조회
    const { data: finishingOrdersData } = await supabase
        .from("production_orders")
        .select("main_category, sub_category, color, size, quantity")
        .eq("stage", "finishing");

    const finishingOrders = finishingOrdersData || [];

    // sewing 품목 각각에 대해 잔여 재고 및 진행 중인 수량 파악 (대소문자, 공백 무시)
    const needsPlanchaItems = sewingOrders.map(order => {
        const orderMainLower = (order.main_category || "").trim().toLowerCase();
        const orderSubLower = (order.sub_category || "").trim().toLowerCase();
        const orderColorLower = (order.color || "").trim().toLowerCase();
        const orderSizeLower = (order.size || "").trim().toLowerCase();

        const stockItem = inventory.find(inv =>
            (inv.main_category || "").trim().toLowerCase() === orderMainLower &&
            (inv.sub_category || "").trim().toLowerCase() === orderSubLower &&
            (inv.color || "").trim().toLowerCase() === orderColorLower &&
            (inv.size || "").trim().toLowerCase() === orderSizeLower
        );

        const finishingQty = finishingOrders
            .filter(f =>
                (f.main_category || "").trim().toLowerCase() === orderMainLower &&
                (f.sub_category || "").trim().toLowerCase() === orderSubLower &&
                (f.color || "").trim().toLowerCase() === orderColorLower &&
                (f.size || "").trim().toLowerCase() === orderSizeLower
            )
            .reduce((sum, f) => sum + (f.quantity || 0), 0);

        const currentStock = stockItem ? stockItem.quantity : 0;

        return {
            ...order,
            stock_quantity: currentStock,
            projected_stock: currentStock + finishingQty
        };
    })
        .filter(item => item.projected_stock < LOW_STOCK_THRESHOLD)
        .sort((a, b) => {
            // 재고 오름차순 정렬 (적은 것 우선)
            if (a.stock_quantity !== b.stock_quantity) {
                return a.stock_quantity - b.stock_quantity;
            }
            // 재고가 같으면 color -> size 순
            const colorCmp = (a.color || "").localeCompare(b.color || "");
            if (colorCmp !== 0) return colorCmp;
            const na = parseFloat(a.size), nb = parseFloat(b.size);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return (a.size || "").localeCompare(b.size || "");
        });

    const needsPlanchaCount = needsPlanchaItems.length;

    // 오늘 원단 입고 여부
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const { data: newFabricData } = await supabase
        .from("fabric_inventory")
        .select("id")
        .gte("last_restocked_at", todayMidnight.toISOString())
        .limit(1);

    const hasNewFabricToday = (newFabricData && newFabricData.length > 0) ? true : false;

    // ─── 납품 가능한 가게 주문 알림 ───
    // pending/partial 상태 주문 중, 모든 잔여 품목이 재고로 커버되는 주문 목록
    const { data: pendingOrdersData } = await supabase
        .from("store_orders")
        .select("id, order_number, customer_name, store_order_items(main_category, sub_category, color, size, quantity, delivered_qty)")
        .in("status", ["pending", "partial"]);

    const readyToDeliverOrders = (pendingOrdersData || []).filter(order => {
        const items = (order.store_order_items as any[]) || [];
        if (items.length === 0) return false;
        // 모든 품목의 잔여 수량이 재고로 커버되는지 확인
        return items.every(item => {
            const remaining = item.quantity - (item.delivered_qty ?? 0);
            if (remaining <= 0) return true; // 이미 납품 완료된 품목은 pass
            // 재고 조회
            const inv = inventory.find(i =>
                (i.main_category || "").toLowerCase() === (item.main_category || "").toLowerCase() &&
                (i.sub_category || "").toLowerCase() === (item.sub_category || "").toLowerCase() &&
                (i.color || "").toLowerCase() === (item.color || "").toLowerCase() &&
                (i.size || "").toLowerCase() === (item.size || "").toLowerCase()
            );
            return (inv?.quantity ?? 0) >= remaining;
        });
    }).map(o => ({
        id: o.id,
        order_number: o.order_number,
        customer_name: o.customer_name,
    }));

    const readyToDeliverCount = readyToDeliverOrders.length;

    return (
        <DashboardHome
            inProgress={inProgress}
            needsCut={needsCut}
            sewingCount={sewingCount}
            needsPlanchaCount={needsPlanchaCount}
            needsPlanchaItems={needsPlanchaItems.slice(0, 50)} // 상위 50개 제한
            hasNewFabricToday={hasNewFabricToday}
            readyToDeliverCount={readyToDeliverCount}
            readyToDeliverOrders={readyToDeliverOrders}
        />
    );
}

