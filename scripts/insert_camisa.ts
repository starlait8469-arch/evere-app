import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseRoleKey);

async function main() {
    const sizes = ["36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58"];
    const items = sizes.map((size) => ({
        name: "Test Shirt", // 사용자 지정 품목명이나 기존 항목 이름을 넣어야 하나요? 일단 이름을 Test Shirt로 임시 지정
        main_category: "hombre",
        sub_category: "Camisa ML (SH-01)",
        color: "blanco",
        size: size,
        quantity: 0
    }));

    const { data, error } = await supabase.from('inventory').insert(items);
    if (error) {
        console.error("Error inserting items:", error);
    } else {
        console.log("Success! Items inserted.");
    }
}
main();
