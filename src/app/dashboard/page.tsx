import { createClient } from "@/lib/supabase/server";
import DashboardHome from "./DashboardHome";



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

    // ── 재단 추천: 지난 1년 최고 월 판매량 기반 (sub_category × color × size 단위) ──
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const { data: salesRaw } = await supabase
        .from("sales_history")
        .select("quantity, created_at, inventory:inventory_id(main_category, sub_category, color, size)")
        .gte("created_at", twelveMonthsAgo.toISOString());

    // cutting + sewing + returned(봉제입고) + finishing(Plancha) 전체 파이프라인 조회
    const { data: allPipelineOrders } = await supabase
        .from("production_orders")
        .select("main_category, sub_category, color, size, quantity, stage")
        .in("stage", ["cutting", "sewing", "returned", "finishing"]);

    // sub_category × color × size 단위로 판매 집계 (월별 그룹핑)
    const salesMap = new Map<string, {
        main_category: string; sub_category: string; color: string; size: string;
        sold12m: number;
        monthlySales: { [yyyymm: string]: number }; // YYYY-MM → 해당월 판매 합계
    }>();

    (salesRaw ?? []).forEach(row => {
        const inv = (row.inventory as unknown) as { main_category: string; sub_category: string; color: string; size: string } | null;
        if (!inv) return;
        const m = (inv.main_category || "").trim().toLowerCase();
        const s = (inv.sub_category || "").trim().toLowerCase();
        const c = (inv.color || "").trim().toLowerCase();
        const sz = (inv.size || "").trim().toLowerCase();
        const key = `${m}|${s}|${c}|${sz}`;
        const yyyymm = (row.created_at as string).slice(0, 7); // "2025-06"
        const qty = row.quantity || 0;
        if (salesMap.has(key)) {
            const entry = salesMap.get(key)!;
            entry.sold12m += qty;
            entry.monthlySales[yyyymm] = (entry.monthlySales[yyyymm] || 0) + qty;
        } else {
            salesMap.set(key, {
                main_category: inv.main_category,
                sub_category: inv.sub_category,
                color: inv.color,
                size: inv.size,
                sold12m: qty,
                monthlySales: { [yyyymm]: qty },
            });
        }
    });

    const cutRecommendations = Array.from(salesMap.values()).map(item => {
        const mL = (item.main_category || "").trim().toLowerCase();
        const sL = (item.sub_category || "").trim().toLowerCase();
        const cL = (item.color || "").trim().toLowerCase();
        const szL = (item.size || "").trim().toLowerCase();

        const currentStock = inventory
            .filter(inv =>
                (inv.main_category || "").trim().toLowerCase() === mL &&
                (inv.sub_category || "").trim().toLowerCase() === sL &&
                (inv.color || "").trim().toLowerCase() === cL &&
                (inv.size || "").trim().toLowerCase() === szL
            )
            .reduce((sum, inv) => sum + (inv.quantity || 0), 0);

        // 해당 품목의 파이프라인 주문 전체 (cutting + sewing + returned + finishing)
        const matchingPipeline = (allPipelineOrders ?? []).filter(o =>
            (o.main_category || "").trim().toLowerCase() === mL &&
            (o.sub_category || "").trim().toLowerCase() === sL &&
            (o.color || "").trim().toLowerCase() === cL &&
            (o.size || "").trim().toLowerCase() === szL
        );

        const cuttingQty = matchingPipeline
            .filter(o => o.stage === "cutting")
            .reduce((sum, o) => sum + (o.quantity || 0), 0);

        // 재단 이후 전 단계 합산 (sewing + returned + finishing)
        const pipelineQty = matchingPipeline
            .reduce((sum, o) => sum + (o.quantity || 0), 0);

        // 실질 유효재고 = 실제재고 + 생산파이프라인 전체
        const effectiveStock = currentStock + pipelineQty;
        // 지난 1년 중 가장 많이 판매된 달의 수량 (최소 유지 목표량)
        const peakMonth = Object.values(item.monthlySales).length > 0
            ? Math.max(...Object.values(item.monthlySales))
            : 0;

        return {
            main_category: item.main_category,
            sub_category: item.sub_category,
            color: item.color,
            size: item.size,
            sold12m: item.sold12m,
            peakMonth,
            currentStock,
            cuttingQty,
            pipelineQty,
            effectiveStock,
        };
    }).sort((a, b) => b.sold12m - a.sold12m); // 가장 많이 팔린 품목 순

    // 카드 숫자: 유효재고가 연간 최고 월판매량보다 적은 품목 수
    const needsCut = cutRecommendations.filter(r => r.effectiveStock < r.peakMonth).length;

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
        .filter(item => item.projected_stock < 10)
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
            needsPlanchaItems={needsPlanchaItems.slice(0, 50)}
            hasNewFabricToday={hasNewFabricToday}
            readyToDeliverCount={readyToDeliverCount}
            readyToDeliverOrders={readyToDeliverOrders}
            cutRecommendations={cutRecommendations}
        />
    );
}

