import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

// service_role 키를 사용하는 어드민 클라이언트 (RLS 우회)
function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function GET() {
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

    // 3. 판매 장부 조회 (service_role으로 RLS 우회 - recursion 없음)
    const { data, error } = await adminSupabase
        .from("sales_history")
        .select(`
            id,
            quantity,
            created_at,
            inventory ( name, main_category, sub_category, color, size ),
            profiles ( username, role )
        `)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
