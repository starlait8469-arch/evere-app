import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const service = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

async function checkAdmin(req: NextRequest) {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const { data: { user } } = await service().auth.getUser(token);
    if (user?.user_metadata?.role !== "admin") return null;
    return user;
}

// GET: 특성 store_order_id 에 대한 custom_invoice 조회
export async function GET(req: NextRequest) {
    const user = await checkAdmin(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const { data } = await service()
        .from("custom_invoices")
        .select("*")
        .eq("store_order_id", orderId)
        .maybeSingle();

    return NextResponse.json(data || null);
}

// POST: custom_invoice 저장 (Upsert 방식)
export async function POST(req: NextRequest) {
    const user = await checkAdmin(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await req.json();
    const { store_order_id, customer_name, items } = body;

    if (!store_order_id || !items) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const payload = {
        store_order_id,
        customer_name,
        items,
    };

    // store_order_id가 unique 제약이 있다고 가정하고 upsert 처리
    const { data, error } = await service()
        .from("custom_invoices")
        .upsert(payload, { onConflict: "store_order_id" })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, invoice: data });
}
