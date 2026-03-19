import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

async function checkAdmin() {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return null;

    // JWT user_metadata 먼저 확인 (빠름), 없으면 profiles 테이블에서 직접 확인 (보안 강화 후 fallback)
    if (user.user_metadata?.role === "admin") return user;

    const { data: profile } = await adminClient()
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profile?.role === "admin") return user;
    return null;
}

// GET: 전표 목록 조회
// ?type=sewing|plancha  (없으면 전체)
export async function GET(req: NextRequest) {
    const user = await checkAdmin();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const type = req.nextUrl.searchParams.get("type");
    let query = adminClient()
        .from("production_slips")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

    if (type) query = query.eq("slip_type", type);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// POST: 전표 저장
export async function POST(req: NextRequest) {
    const user = await checkAdmin();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { slip_type, factory_name, slip_date, orders } = await req.json();
    if (!slip_type || !slip_date || !orders?.length)
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const { data, error } = await adminClient()
        .from("production_slips")
        .insert([{ slip_type, factory_name: factory_name || null, slip_date, orders }])
        .select("id")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
}
