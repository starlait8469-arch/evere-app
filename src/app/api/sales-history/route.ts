import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

// service_role 키를 사용하는 어드민 클라이언트 (RLS 우회)
function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function GET(req: NextRequest) {
    // 1. 요청한 유저의 세션 + 권한 확인 (서버 측에서)
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. profiles 테이블에서 role 확인 (service_role으로 RLS 우회)
    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    const role = profile?.role ?? user.user_metadata?.role;
    if (role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");

    let startOfDay, endOfDay;
    if (dateParam) {
        startOfDay = new Date(`${dateParam}T00:00:00-03:00`).toISOString();
        endOfDay = new Date(`${dateParam}T23:59:59.999-03:00`).toISOString();
    } else {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        startOfDay = new Date(`${todayStr}T00:00:00-03:00`).toISOString();
        endOfDay = new Date(`${todayStr}T23:59:59.999-03:00`).toISOString();
    }

    // 3. 판매 장부 조회 (선택된 날짜 기준)
    const { data: salesData, error: salesError } = await adminSupabase
        .from("sales_history")
        .select(`
            id,
            quantity,
            unit_price,
            created_at,
            inventory ( name, main_category, sub_category, color, size ),
            profiles ( username, role )
        `)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false });

    if (salesError) {
        return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    // 4. 가게 납품 내역 조회 (선택된 날짜 기준)
    const { data: deliveriesData, error: deliveriesError } = await adminSupabase
        .from("store_deliveries_history")
        .select(`
            id,
            quantity,
            unit_price,
            created_at,
            store_order_items ( main_category, sub_category, color, size ),
            profiles:delivered_by ( username, role )
        `)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false });

    if (deliveriesError) {
        return NextResponse.json({ error: deliveriesError.message }, { status: 500 });
    }

    return NextResponse.json({
        sales: salesData || [],
        deliveries: deliveriesData || []
    });
}
