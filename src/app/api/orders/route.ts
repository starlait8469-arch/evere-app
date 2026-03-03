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

// POST: 주문 생성
export async function POST(req: NextRequest) {
    const user = await checkAdmin(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { items, note } = await req.json();
    if (!items || items.length === 0)
        return NextResponse.json({ error: "No items" }, { status: 400 });

    const totalQty = items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0);

    const supabase = service();
    const { data: order, error: orderErr } = await supabase
        .from("store_orders")
        .insert([{ created_by: user.id, note: note || null, total_qty: totalQty }])
        .select()
        .single();

    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

    const orderItems = items.map((item: {
        main_category: string; sub_category: string;
        color: string; size: string; quantity: number;
    }) => ({ ...item, order_id: order.id }));

    const { error: itemErr } = await supabase.from("store_order_items").insert(orderItems);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

    return NextResponse.json({ orderId: order.id });
}

// GET: 주문 목록
export async function GET(req: NextRequest) {
    const user = await checkAdmin(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { data } = await service()
        .from("store_orders")
        .select("*, store_order_items(*)")
        .order("created_at", { ascending: false })
        .limit(100);

    return NextResponse.json(data || []);
}
