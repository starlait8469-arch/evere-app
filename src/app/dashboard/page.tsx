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

    return (
        <DashboardHome
            inProgress={inProgress}
            needsCut={needsCut}
            sewingCount={sewingCount}
        />
    );
}
