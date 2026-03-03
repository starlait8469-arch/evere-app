"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./users.module.css";

interface Employee {
    id: string;
    username: string;
    role: string;
    created_at: string;
}

export default function UsersPage() {
    const { lang } = useLanguage();
    const t = (ko: string, es: string) => lang === "ko" ? ko : es;

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [formError, setFormError] = useState("");
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const fetchEmployees = useCallback(async () => {
        setLoading(true);
        const res = await fetch("/api/users");
        const data = await res.json();
        if (data.users) setEmployees(data.users);
        setLoading(false);
    }, []);

    useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");
        if (!username.trim()) { setFormError(t("사용자 이름을 입력하세요.", "Ingresa el nombre de usuario.")); return; }
        if (password.length < 6) { setFormError(t("비밀번호는 6자 이상이어야 합니다.", "La contraseña debe tener al menos 6 caracteres.")); return; }

        setFormLoading(true);
        const res = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username.trim(), password }),
        });
        const data = await res.json();
        if (!res.ok) {
            setFormError(data.error ?? t("오류가 발생했습니다.", "Ocurrió un error."));
            setFormLoading(false);
            return;
        }
        setUsername("");
        setPassword("");
        setShowForm(false);
        setFormLoading(false);
        fetchEmployees();
    };

    const handleDelete = async (userId: string) => {
        const res = await fetch("/api/users", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
        });
        if (res.ok) {
            setDeleteConfirm(null);
            fetchEmployees();
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>{t("직원 관리", "Gestión de empleados")}</h1>
                    <p className={styles.subtitle}>{t("직원 계정을 생성하고 관리하세요.", "Crea y gestiona las cuentas de empleados.")}</p>
                </div>
                <button className={styles.addBtn} onClick={() => { setShowForm(!showForm); setFormError(""); }}>
                    {showForm ? t("취소", "Cancelar") : `+ ${t("계정 추가", "Añadir cuenta")}`}
                </button>
            </div>

            {/* Create Form */}
            {showForm && (
                <div className={styles.formCard}>
                    <h2 className={styles.formTitle}>{t("새 직원 계정", "Nueva cuenta de empleado")}</h2>
                    <form onSubmit={handleCreate} className={styles.form}>
                        <div className={styles.formRow}>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("사용자 이름", "Nombre de usuario")}</label>
                                <input
                                    className={styles.input}
                                    type="text"
                                    placeholder={t("sujin", "nombre123")}
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("비밀번호", "Contraseña")}</label>
                                <input
                                    className={styles.input}
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <button className={styles.submitBtn} type="submit" disabled={formLoading}>
                                {formLoading ? t("생성 중...", "Creando...") : t("생성", "Crear")}
                            </button>
                        </div>
                        {formError && <div className={styles.error}>{formError}</div>}
                    </form>
                </div>
            )}

            {/* Employee List */}
            <div className={styles.listCard}>
                {loading ? (
                    <div className={styles.empty}>{t("불러오는 중...", "Cargando...")}</div>
                ) : employees.length === 0 ? (
                    <div className={styles.empty}>{t("등록된 직원이 없습니다.", "No hay empleados registrados.")}</div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{t("사용자 이름", "Usuario")}</th>
                                <th>{t("역할", "Rol")}</th>
                                <th>{t("생성일", "Creado")}</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map((emp) => (
                                <tr key={emp.id}>
                                    <td>
                                        <div className={styles.userCell}>
                                            <div className={styles.avatar}>{emp.username.charAt(0).toUpperCase()}</div>
                                            {emp.username}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`${styles.roleBadge} ${emp.role === "admin" ? styles.roleAdmin : styles.roleEmployee}`}>
                                            {emp.role === "admin"
                                                ? t("관리자", "Admin")
                                                : t("직원", "Empleado")}
                                        </span>
                                    </td>
                                    <td className={styles.dateCell}>
                                        {new Date(emp.created_at).toLocaleDateString(lang === "ko" ? "ko-KR" : "es-ES")}
                                    </td>
                                    <td>
                                        {emp.role !== "admin" && (
                                            deleteConfirm === emp.id ? (
                                                <div className={styles.confirmRow}>
                                                    <span className={styles.confirmText}>{t("삭제할까요?", "¿Eliminar?")}</span>
                                                    <button className={styles.confirmYes} onClick={() => handleDelete(emp.id)}>{t("삭제", "Sí")}</button>
                                                    <button className={styles.confirmNo} onClick={() => setDeleteConfirm(null)}>{t("취소", "No")}</button>
                                                </div>
                                            ) : (
                                                <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(emp.id)}>
                                                    {t("삭제", "Eliminar")}
                                                </button>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
