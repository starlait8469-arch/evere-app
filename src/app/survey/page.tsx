"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SurveyPage() {
    const [name, setName] = useState("");
    const [birthdate, setBirthdate] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !birthdate) {
            alert("이름과 생년월일을 모두 입력해주세요.");
            return;
        }

        setLoading(true);
        const supabase = createClient();
        const { error } = await supabase.from("church_survey").insert([
            { name, birthdate }
        ]);

        setLoading(false);
        if (error) {
            console.error(error);
            alert("오류가 발생했습니다. 다시 시도해 주세요.");
        } else {
            setSubmitted(true);
        }
    };

    if (submitted) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: 20 }}>
                <div style={{ background: "#fff", padding: "40px 30px", borderRadius: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: 400, width: "100%" }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
                    <h1 style={{ fontSize: 24, fontWeight: "bold", color: "#10b981", marginBottom: 12 }}>제출 완료!</h1>
                    <p style={{ color: "#4b5563" }}>설문에 응해 주셔서 감사합니다.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: 20, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
            <div style={{ background: "#fff", padding: "40px 30px", borderRadius: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.1)", maxWidth: 400, width: "100%" }}>
                <h1 style={{ fontSize: 22, fontWeight: "bold", color: "#1f2937", marginBottom: 8, textAlign: "center" }}>교회 전도회 생일록 📝</h1>
                <p style={{ color: "#6b7280", fontSize: 14, textAlign: "center", marginBottom: 28 }}>생일을 맞춰서 기록하기 위해<br/>간단한 정보를 입력해 주세요!</p>
                
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div>
                        <label style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>이름 (성함)</label>
                        <input 
                            type="text" 
                            required 
                            placeholder="홍길동"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{ width: "100%", padding: "12px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, background: "#f9fafb", color: "#111" }}
                        />
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>생년월일</label>
                        <input 
                            type="date" 
                            required 
                            value={birthdate}
                            onChange={(e) => setBirthdate(e.target.value)}
                            style={{ width: "100%", padding: "12px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, background: "#f9fafb", color: "#111", cursor: "pointer" }}
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        disabled={loading}
                        style={{ marginTop: 12, width: "100%", background: "#4f46e5", color: "#fff", padding: "14px", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: "background 0.2s" }}
                    >
                        {loading ? "제출 중..." : "제출하기"}
                    </button>
                </form>
            </div>
        </div>
    );
}
