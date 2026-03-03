import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardLayout from "@/components/DashboardLayout";

export default async function DashboardRootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    // profiles 쿼리 시도, 실패 시 user_metadata fallback (RLS 재귀 이슈 방지)
    const { data: profile } = await supabase
        .from("profiles")
        .select("username, role")
        .eq("id", user.id)
        .maybeSingle();

    const username = profile?.username ?? user.user_metadata?.username ?? user.email ?? "";
    const role = profile?.role ?? user.user_metadata?.role ?? "employee";

    return (
        <DashboardLayout
            username={username}
            role={role}
        >
            {children}
        </DashboardLayout>
    );
}
