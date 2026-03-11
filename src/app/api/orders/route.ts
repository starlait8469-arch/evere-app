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

    // ─── Generate Sequential Order Number (A00001 to Z99999) ───
    const { data: lastOrder } = await supabase
        .from("store_orders")
        .select("order_number")
        .not("order_number", "is", null)
        .order("order_number", { ascending: false })
        .limit(1)
        .maybeSingle();

    let nextOrderNumber = "A00001";

    if (lastOrder && lastOrder.order_number) {
        const lastNum = lastOrder.order_number; // e.g., "A00002"
        const prefix = lastNum.charAt(0); // "A"
        const numPart = parseInt(lastNum.substring(1), 10); // 2

        if (numPart >= 99999) {
            const nextPrefix = String.fromCharCode(prefix.charCodeAt(0) + 1);
            if (nextPrefix > "Z") {
                // Return an error or handle overflow, though Z99999 is highly unlikely to be reached soon.
                return NextResponse.json({ error: "Order number limit reached (Z99999)" }, { status: 500 });
            }
            nextOrderNumber = `${nextPrefix}00001`;
        } else {
            const nextNum = numPart + 1;
            nextOrderNumber = `${prefix}${nextNum.toString().padStart(5, "0")}`;
        }
    }

    const { data: order, error: orderErr } = await supabase
        .from("store_orders")
        .insert([{
            created_by: user.id,
            note: note || null,
            customer_name: customer_name || null,
            total_qty: totalQty,
            status: "pending",
            order_number: nextOrderNumber
        }])
        .select()
        .single();


    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

    // 모든 카테고리 단가 조회
    const { data: catData } = await supabase.from("categories").select("name, price");
    const prices: Record<string, number> = {};
    if (catData) {
        catData.forEach(c => prices[(c.name || "").toUpperCase()] = c.price || 0);
    }

    const orderItems = items.map((item: {
        main_category: string; sub_category: string;
        color: string; size: string; quantity: number;
    }) => ({
        ...item,
        order_id: order.id,
        delivered_qty: 0,
        unit_price: prices[(item.sub_category || item.main_category || "").toUpperCase()] || 0
    }));

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

        // 인벤토리 전체를 가져와서 대소문자/공백 무시 매칭을 수행 (부분 납품 및 재고 차감 누락 방지)
        const { data: allInv } = await supabase.from("inventory").select("id, quantity, main_category, sub_category, color, size");
        const inventory = allInv || [];

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

            // 납품 히스토리 추가
            await supabase.from("store_deliveries_history").insert([{
                store_order_id: orderId,
                store_order_item_id: itemId,
                quantity: qty,
                unit_price: item.unit_price || 0,
                delivered_by: user.id
            }]);

            // 재고 차감 (대소문자, 공백 무시)
            const itemMainLower = (item.main_category || "").trim().toLowerCase();
            const itemSubLower = (item.sub_category || "").trim().toLowerCase();
            const itemColorLower = (item.color || "").trim().toLowerCase();
            const itemSizeLower = (item.size || "").trim().toLowerCase();

            const inv = inventory.find(i =>
                (i.main_category || "").trim().toLowerCase() === itemMainLower &&
                (i.sub_category || "").trim().toLowerCase() === itemSubLower &&
                (i.color || "").trim().toLowerCase() === itemColorLower &&
                (i.size || "").trim().toLowerCase() === itemSizeLower
            );

            if (inv) {
                const newQty = Math.max(0, inv.quantity - qty);
                await supabase.from("inventory").update({ quantity: newQty }).eq("id", inv.id);
                // 메모리 내 인벤토리 업데이트 (루프 내 중복 차감 반영용)
                inv.quantity = newQty;
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

    // ── 주문 수정 액션 ──
    // body: { action: "edit", orderId, customer_name, note, items: [{ id?, main_category, sub_category, color, size, quantity }] }
    if (body.action === "edit") {
        const { orderId, customer_name, note, items: newItems } = body as {
            orderId: string;
            customer_name: string;
            note: string;
            items: { id?: string; main_category: string; sub_category: string; color: string; size: string; quantity: number }[];
        };

        if (!orderId || !newItems?.length)
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        // 기존 아이템 조회
        const { data: existingItems } = await supabase
            .from("store_order_items")
            .select("*")
            .eq("order_id", orderId);

        if (!existingItems) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        // 1. 기존 아이템 중 newItems에 없는 것 → 납품 기록 없으면 삭제
        const newItemIds = newItems.filter(i => i.id).map(i => i.id);
        for (const existing of existingItems) {
            if (!newItemIds.includes(existing.id)) {
                // 아직 납품된 수량이 0인 경우에만 삭제 허용
                if ((existing.delivered_qty ?? 0) === 0) {
                    await supabase.from("store_order_items").delete().eq("id", existing.id);
                }
            }
        }

        // 2. 기존 아이템 수량 업데이트 or 신규 아이템 추가
        for (const item of newItems) {
            if (item.id) {
                // 기존 아이템 – 수량은 기납품 수량 이상으로만 설정 가능
                const existing = existingItems.find(e => e.id === item.id);
                const minQty = existing ? (existing.delivered_qty ?? 0) : 0;
                const safeQty = Math.max(minQty, item.quantity);
                await supabase
                    .from("store_order_items")
                    .update({
                        quantity: safeQty,
                        main_category: item.main_category,
                        sub_category: item.sub_category || "",
                        color: item.color || "",
                        size: item.size || "",
                    })
                    .eq("id", item.id);
            } else {
                // 신규 아이템 추가
                await supabase.from("store_order_items").insert([{
                    order_id: orderId,
                    main_category: item.main_category,
                    sub_category: item.sub_category || "",
                    color: item.color || "",
                    size: item.size || "",
                    quantity: item.quantity,
                    delivered_qty: 0,
                    unit_price: 0,
                }]);
            }
        }

        // 3. total_qty 재계산
        const { data: finalItems } = await supabase
            .from("store_order_items")
            .select("quantity")
            .eq("order_id", orderId);

        const newTotalQty = (finalItems ?? []).reduce((s, i) => s + i.quantity, 0);

        // 4. 주문 메타 업데이트
        await supabase.from("store_orders").update({
            customer_name: customer_name || null,
            note: note || null,
            total_qty: newTotalQty,
        }).eq("id", orderId);

        return NextResponse.json({ ok: true });
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
