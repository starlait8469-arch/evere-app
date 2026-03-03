import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth";

// service_role 클라이언트 (직원 계정 생성/삭제용)
function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

// POST /api/users - 직원 계정 생성
export async function POST(request: NextRequest) {
    // 요청자가 관리자인지 확인
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const callerRole = user.user_metadata?.role;
    if (callerRole !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { username, password } = await request.json();
    if (!username || !password) {
        return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const email = usernameToEmail(username);

    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, role: "employee" },
    });

    if (error) {
        if (error.message.includes("already been registered")) {
            return NextResponse.json({ error: "이미 사용 중인 사용자 이름입니다." }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ user: data.user });
}

// GET /api/users - 직원 목록 조회
export async function GET() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const callerRole = user.user_metadata?.role;
    if (callerRole !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const users = data.users.map((u) => ({
        id: u.id,
        username: u.user_metadata?.username ?? u.email?.replace("@evere.app", "") ?? "",
        role: u.user_metadata?.role ?? "employee",
        created_at: u.created_at,
    }));

    return NextResponse.json({ users });
}

// DELETE /api/users - 직원 계정 삭제
export async function DELETE(request: NextRequest) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const callerRole = user.user_metadata?.role;
    if (callerRole !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await request.json();

    // 자기 자신 삭제 방지
    if (userId === user.id) {
        return NextResponse.json({ error: "자기 자신의 계정은 삭제할 수 없습니다." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
