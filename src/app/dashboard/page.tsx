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

    // 재단하기: 재고 낮고(< threshold) + cutting 단계 주문 없는 품목
    const { data: lowStockItems } = await supabase
        .from("inventory")
        .select("main_category, sub_category, color, size, quantity")
        .lt("quantity", LOW_STOCK_THRESHOLD);

    const { data: cuttingOrders } = await supabase
        .from("production_orders")
        .select("main_category, sub_category, color, size")
        .eq("stage", "cutting");

    const needsCut = (lowStockItems || []).filter(inv => {
        const hasCutting = (cuttingOrders || []).some(c =>
            c.main_category === inv.main_category &&
            c.sub_category === inv.sub_category &&
            c.color === inv.color &&
            c.size === inv.size
        );
        return !hasCutting;
    }).length;

    // 봉제 현황: sewing 단계 주문 건수
    const sewingCount = productionOrders?.filter(o => o.stage === "sewing").length ?? 0;

    // Plancha 추천: sewing 단계 주문들의 재고 조회 및 정렬
    const { data: sewingOrdersData } = await supabase
        .from("production_orders")
        .select("id, main_category, sub_category, color, size, quantity")
        .eq("stage", "sewing");

    const sewingOrders = sewingOrdersData || [];

    // (inventory) 현재 재고 조회
    const { data: inventoryData } = await supabase
        .from("inventory")
        .select("main_category, sub_category, color, size, quantity");

    const inventory = inventoryData || [];

    // sewing 품목 각각에 대해 잔여 재고 매핑
    const needsPlanchaItems = sewingOrders.map(order => {
        const stockItem = inventory.find(inv =>
            inv.main_category === order.main_category &&
            (inv.sub_category || "") === (order.sub_category || "") &&
            (inv.color || "") === (order.color || "") &&
            (inv.size || "") === (order.size || "")
        );
        return {
            ...order,
            stock_quantity: stockItem ? stockItem.quantity : 0
        };
    }).sort((a, b) => {
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

    return (
        <DashboardHome
            inProgress={inProgress}
            needsCut={needsCut}
            sewingCount={sewingCount}
            needsPlanchaCount={needsPlanchaCount}
            needsPlanchaItems={needsPlanchaItems.slice(0, 50)} // 상위 50개 제한
        />
    );
}
