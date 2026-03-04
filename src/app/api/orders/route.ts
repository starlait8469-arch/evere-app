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

    const { items, note, customer_name } = await req.json();
    if (!items || items.length === 0)
        return NextResponse.json({ error: "No items" }, { status: 400 });

    const totalQty = items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0);

    const supabase = service();
    const { data: order, error: orderErr } = await supabase
        .from("store_orders")
        .insert([{
            created_by: user.id,
            note: note || null,
            customer_name: customer_name || null,
            total_qty: totalQty,
            status: "pending",
        }])
        .select()
        .single();

    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

    const orderItems = items.map((item: {
        main_category: string; sub_category: string;
        color: string; size: string; quantity: number;
    }) => ({ ...item, order_id: order.id, delivered_qty: 0 }));

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
        .limit(200);

    return NextResponse.json(data || []);
}

// PATCH: 상태 변경 + 부분납품 처리
export async function PATCH(req: NextRequest) {
    const user = await checkAdmin(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await req.json();
    const supabase = service();

    // ── 부분납품 액션 ──
    // body: { action: "deliver", orderId, deliveries: [{ itemId, qty }] }
    if (body.action === "deliver") {
        const { orderId, deliveries } = body as {
            orderId: string;
            deliveries: { itemId: string; qty: number }[];
        };

        if (!orderId || !deliveries?.length)
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        // 현재 아이템 조회
        const { data: items } = await supabase
            .from("store_order_items")
            .select("*")
            .eq("order_id", orderId);

        if (!items) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        // 각 delivery 처리: delivered_qty 업데이트 + 재고 차감
        for (const { itemId, qty } of deliveries) {
            if (qty <= 0) continue;

            const item = items.find(i => i.id === itemId);
            if (!item) continue;

            const newDeliveredQty = (item.delivered_qty ?? 0) + qty;

            // delivered_qty 업데이트
            await supabase
                .from("store_order_items")
                .update({ delivered_qty: newDeliveredQty })
                .eq("id", itemId);

            // 재고 차감
            const { data: inv } = await supabase
                .from("inventory")
                .select("id, quantity")
                .eq("main_category", item.main_category)
                .eq("sub_category", item.sub_category || "")
                .eq("color", item.color || "")
                .eq("size", item.size || "")
                .maybeSingle();

            if (inv) {
                const newQty = Math.max(0, inv.quantity - qty);
                await supabase.from("inventory").update({ quantity: newQty }).eq("id", inv.id);
            }
        }

        // 최신 아이템 조회 후 완료 여부 판단
        const { data: updatedItems } = await supabase
            .from("store_order_items")
            .select("quantity, delivered_qty")
            .eq("order_id", orderId);

        const allDelivered = (updatedItems ?? []).every(
            i => (i.delivered_qty ?? 0) >= i.quantity
        );
        const newStatus = allDelivered ? "delivered" : "partial";

        await supabase.from("store_orders").update({ status: newStatus }).eq("id", orderId);

        return NextResponse.json({ ok: true, status: newStatus });
    }

    // ── 일반 상태 변경 ──
    const { orderId, status } = body;
    if (!orderId || !status) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const { error } = await supabase
        .from("store_orders")
        .update({ status })
        .eq("id", orderId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
