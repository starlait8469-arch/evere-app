import { createClient } from "@/lib/supabase/server";
import DashboardHome from "./DashboardHome";

export default async function DashboardPage() {
    const supabase = await createClient();

    // 생산라인 집계
    const { data: productionStats } = await supabase
        .from("production_lines")
        .select("status");

    // 재고 집계
    const { data: inventoryStats } = await supabase
        .from("inventory")
        .select("quantity");

    const inProgress = productionStats?.filter(
        (p) => !["completed"].includes(p.status)
    ).length ?? 0;

    const completed = productionStats?.filter(
        (p) => p.status === "completed"
    ).length ?? 0;

    const totalInventory = inventoryStats?.reduce(
        (sum, i) => sum + (i.quantity ?? 0), 0
    ) ?? 0;

    return (
        <DashboardHome
            inProgress={inProgress}
            completed={completed}
            totalInventory={totalInventory}
        />
    );
}
