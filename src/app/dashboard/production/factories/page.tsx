"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./factories.module.css";

type Factory = {
    id: string;
    name: string;
    notes: string | null;
    created_at: string;
};

export default function FactoriesPage() {
    const { lang } = useLanguage();
    const router = useRouter();
    const supabase = createClient();

    const [factories, setFactories] = useState<Factory[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState("");
    const [newNotes, setNewNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        const checkAndLoad = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.replace("/auth/login"); return; }
            const role = session.user.user_metadata?.role;
            if (role !== "admin") { router.replace("/dashboard"); return; }
            fetchFactories();
        };
        checkAndLoad();
    }, []);

    const fetchFactories = async () => {
        setLoading(true);
        const res = await fetch("/api/factories");
        if (res.ok) {
            const data = await res.json();
            setFactories(data);
        }
        setLoading(false);
    };

    const addFactory = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        const res = await fetch("/api/factories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null }),
        });
        if (res.ok) {
            setNewName("");
            setNewNotes("");
            fetchFactories();
        }
        setSaving(false);
    };

    const doDelete = async () => {
        if (!confirmId) return;
        setDeleteError(null);
        const res = await fetch("/api/factories", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: confirmId }),
        });
        if (res.ok) {
            setConfirmId(null);
            fetchFactories();
        } else {
            const err = await res.json().catch(() => ({}));
            setDeleteError(err.error || "삭제 실패");
            setConfirmId(null);
        }
    };

    const confirmingFactory = factories.find(f => f.id === confirmId);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>{lang === "ko" ? "봉제공장 관리" : "Gestión de Talleres"}</h1>
                <p className={styles.subtitle}>{lang === "ko" ? "봉제 공장 목록을 관리합니다 (관리자 전용)" : "Administra los talleres de costura (Solo Admin)"}</p>
            </div>

            {deleteError && (
                <div className={styles.errorMsg}>⚠️ {deleteError}</div>
            )}

            {/* 추가 폼 */}
            <div className={styles.addCard}>
                <h2 className={styles.addTitle}>{lang === "ko" ? "새 공장 추가" : "Agregar Taller"}</h2>
                <div className={styles.addRow}>
                    <input
                        className={styles.input}
                        placeholder={lang === "ko" ? "공장 이름" : "Nombre del taller"}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addFactory()}
                    />
                    <input
                        className={styles.input}
                        placeholder={lang === "ko" ? "메모 (선택)" : "Notas (opcional)"}
                        value={newNotes}
                        onChange={e => setNewNotes(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addFactory()}
                    />
                    <button className={styles.addBtn} onClick={addFactory} disabled={saving || !newName.trim()}>
                        {saving ? "..." : (lang === "ko" ? "추가" : "Agregar")}
                    </button>
                </div>
            </div>

            {/* 삭제 확인 모달 */}
            {confirmingFactory && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <h3>🗑️ {lang === "ko" ? "공장 삭제" : "Eliminar taller"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? `"${confirmingFactory.name}"을(를) 삭제하시겠습니까?`
                                : `¿Eliminar "${confirmingFactory.name}"?`}
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setConfirmId(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnDelete} onClick={doDelete}>
                                {lang === "ko" ? "삭제" : "Eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 공장 목록 */}
            {loading ? (
                <div className={styles.empty}>Loading...</div>
            ) : factories.length === 0 ? (
                <div className={styles.empty}>
                    {lang === "ko" ? "등록된 공장이 없습니다." : "No hay talleres registrados."}
                </div>
            ) : (
                <div className={styles.list}>
                    {factories.map(f => (
                        <div key={f.id} className={styles.factoryRow}>
                            <div className={styles.factoryInfo}>
                                <div className={styles.factoryName}>🏭 {f.name}</div>
                                {f.notes && <div className={styles.factoryNotes}>{f.notes}</div>}
                            </div>
                            <button className={styles.deleteBtn} onClick={() => setConfirmId(f.id)}>
                                {lang === "ko" ? "삭제" : "Eliminar"}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
