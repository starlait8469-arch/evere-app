"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SurveyEntry = {
    id: string;
    name: string;
    birthdate: string; // YYYY-MM-DD
    created_at: string;
};

export default function DashboardSurveyPage() {
    const [entries, setEntries] = useState<SurveyEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
            .from("church_survey")
            .select("*");
            
        if (error) {
            console.error("Error fetching survey data:", error);
            alert("데이터를 불러오는데 실패했습니다.");
        } else if (data) {
            // Sort by month and day (ignoring year)
            const sorted = data.sort((a, b) => {
                if (!a.birthdate || !b.birthdate) return 0;
                const partsA = a.birthdate.split('-');
                const partsB = b.birthdate.split('-');
                if (partsA.length < 3 || partsB.length < 3) return 0;
                
                const monthA = parseInt(partsA[1], 10);
                const dayA = parseInt(partsA[2], 10);
                const monthB = parseInt(partsB[1], 10);
                const dayB = parseInt(partsB[2], 10);
                
                if (monthA !== monthB) {
                    return monthA - monthB;
                }
                return dayA - dayB;
            });
            setEntries(sorted);
        }
        setLoading(false);
    };

    // Group by month for better display UI (1-12)
    const groupedByMonth = entries.reduce((acc, entry) => {
        if (!entry.birthdate) return acc;
        const parts = entry.birthdate.split('-');
        if (parts.length < 3) return acc;

        const month = parseInt(parts[1], 10);
        if (!acc[month]) acc[month] = [];
        acc[month].push(entry);
        return acc;
    }, {} as Record<number, SurveyEntry[]>);

    return (
        <div style={{ padding: "32px", maxWidth: "800px", margin: "0 auto", color: "#111" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: "2px solid #e5e7eb" }}>
                <h1 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>
                    📋 교회 전도회 생일 목록
                </h1>
                <button 
                    onClick={fetchData} 
                    style={{ background: "#f3f4f6", border: "1px solid #d1d5db", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                    새로고침
                </button>
            </div>
            
            {loading ? (
                <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>데이터를 불러오는 중입니다...</div>
            ) : entries.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", background: "#f9fafb", borderRadius: 8, border: "1px dashed #d1d5db", color: "#6b7280" }}>
                    아직 제출된 설문 내역이 없습니다.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => {
                        const monthEntries = groupedByMonth[month];
                        if (!monthEntries || monthEntries.length === 0) return null;
                        
                        return (
                            <div key={month} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                                <div style={{ background: "#f9fafb", padding: "12px 20px", borderBottom: "1px solid #e5e7eb", borderLeft: "4px solid #4f46e5" }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 700, color: "#374151", margin: 0 }}>{month}월 생일자</h2>
                                </div>
                                <div style={{ padding: "0 20px" }}>
                                    {monthEntries.map((entry, idx) => {
                                        const parts = entry.birthdate.split('-');
                                        const dateStr = `${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일`;
                                        const ageStr = `${parts[0]}년생`;
                                        
                                        return (
                                            <div key={entry.id} style={{ padding: "16px 0", borderBottom: idx !== monthEntries.length - 1 ? "1px solid #f3f4f6" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                                                    <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{entry.name}</span>
                                                    <span style={{ fontSize: 13, color: "#6b7280" }}>{ageStr}</span>
                                                </div>
                                                <div style={{ fontSize: 15, fontWeight: 600, color: "#4f46e5", display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span style={{ fontSize: 18 }}>🎂</span> {dateStr}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
