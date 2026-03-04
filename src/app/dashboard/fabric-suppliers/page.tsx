"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

// --- Types ---
interface Supplier {
    id: string;
    name: string;
    contact_info: string | null;
    created_at: string;
}

interface Delivery {
    id: string;
    supplier_id: string;
    fabric_name: string;
    quantity: number;
    unit: string | null;
    cost: number | null;
    delivery_date: string;
    created_at: string;
}

interface Payment {
    id: string;
    supplier_id: string;
    amount: number;
    payment_date: string;
    memo: string | null;
    created_at: string;
}

export default function FabricSuppliersPage() {
    const { lang } = useLanguage();
    const router = useRouter();
    const supabase = createClient();

    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    // Suppliers
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [suppliersLoading, setSuppliersLoading] = useState(true);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

    // New Supplier form
    const [newSupplierName, setNewSupplierName] = useState("");
    const [newSupplierContact, setNewSupplierContact] = useState("");
    const [addingSupplier, setAddingSupplier] = useState(false);

    // Deliveries & Payments
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [deliveriesLoading, setDeliveriesLoading] = useState(false);

    const [payments, setPayments] = useState<Payment[]>([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);

    // Active Tab in Right Panel (deliveries | payments)
    const [activeTab, setActiveTab] = useState<"deliveries" | "payments">("deliveries");

    // New Payment form
    const [payDate, setPayDate] = useState("");
    const [payAmount, setPayAmount] = useState("");
    const [payMemo, setPayMemo] = useState("");
    const [addingPayment, setAddingPayment] = useState(false);

    // New Delivery form
    const [delDate, setDelDate] = useState("");
    const [delFabric, setDelFabric] = useState("");
    const [delQty, setDelQty] = useState("");
    const [delUnit, setDelUnit] = useState("m");
    const [delCost, setDelCost] = useState("");
    const [addingDelivery, setAddingDelivery] = useState(false);

    // Auth & Check Role
    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push("/auth/login");
                return;
            }
            if (session.user.user_metadata?.role !== "admin") {
                router.push("/dashboard");
                return;
            }
            setIsAdmin(true);

            // Set default date for delivery form to today
            setDelDate(new Date().toISOString().split("T")[0]);
        };
        init();
    }, [router, supabase.auth]);

    // Fetch Suppliers
    const fetchSuppliers = useCallback(async () => {
        if (!isAdmin) return;
        setSuppliersLoading(true);
        const { data, error } = await supabase
            .from("fabric_suppliers")
            .select("*")
            .order("name");

        if (!error && data) {
            setSuppliers(data);
        }
        setSuppliersLoading(false);
    }, [isAdmin, supabase]);

    useEffect(() => {
        if (isAdmin) fetchSuppliers();
    }, [isAdmin, fetchSuppliers]);

    // Fetch Deliveries when supplier selected
    const fetchDeliveries = useCallback(async (supId: string) => {
        setDeliveriesLoading(true);
        const { data, error } = await supabase
            .from("fabric_deliveries")
            .select("*")
            .eq("supplier_id", supId)
            .order("delivery_date", { ascending: false })
            .order("created_at", { ascending: false });

        if (!error && data) {
            setDeliveries(data);
        }
        setDeliveriesLoading(false);
    }, [supabase]);

    // Fetch Payments
    const fetchPayments = useCallback(async (supId: string) => {
        setPaymentsLoading(true);
        const { data, error } = await supabase
            .from("fabric_payments")
            .select("*")
            .eq("supplier_id", supId)
            .order("payment_date", { ascending: false })
            .order("created_at", { ascending: false });

        if (!error && data) {
            setPayments(data);
        }
        setPaymentsLoading(false);
    }, [supabase]);

    useEffect(() => {
        if (selectedSupplierId) {
            fetchDeliveries(selectedSupplierId);
            fetchPayments(selectedSupplierId);
        } else {
            setDeliveries([]);
            setPayments([]);
        }
    }, [selectedSupplierId, fetchDeliveries, fetchPayments]);

    // Calculate Balances
    const totalCost = deliveries.reduce((sum, d) => sum + (d.cost || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const balance = totalCost - totalPaid;

    // Add Supplier
    const handleAddSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSupplierName.trim()) return;

        setAddingSupplier(true);
        const { error } = await supabase
            .from("fabric_suppliers")
            .insert([{ name: newSupplierName.trim(), contact_info: newSupplierContact.trim() || null }]);

        if (!error) {
            setNewSupplierName("");
            setNewSupplierContact("");
            fetchSuppliers();
        } else {
            alert(error.message);
        }
        setAddingSupplier(false);
    };
    const [deleteSupplierModal, setDeleteSupplierModal] = useState<{ id: string, name: string } | null>(null);

    // Delete Supplier
    const handleDeleteSupplier = async (id: string, name: string) => {
        setDeleteSupplierModal({ id, name });
    };

    const doDeleteSupplier = async () => {
        if (!deleteSupplierModal) return;
        const { id } = deleteSupplierModal;
        const { error } = await supabase.from("fabric_suppliers").delete().eq("id", id);
        if (error) {
            alert(lang === "ko" ? "삭제 실패: " + error.message : "Error al eliminar: " + error.message);
        } else {
            if (selectedSupplierId === id) setSelectedSupplierId(null);
            fetchSuppliers();
        }
        setDeleteSupplierModal(null);
    };

    // Add Delivery
    const handleAddDelivery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSupplierId || !delDate || !delFabric.trim() || !delQty) return;

        setAddingDelivery(true);
        const payload = {
            supplier_id: selectedSupplierId,
            delivery_date: delDate,
            fabric_name: delFabric.trim(),
            quantity: parseFloat(delQty),
            unit: delUnit || "m",
            cost: delCost ? parseFloat(delCost) : null
        };

        const { error } = await supabase.from("fabric_deliveries").insert([payload]);
        if (!error) {
            // Reset form partly
            setDelFabric("");
            setDelQty("");
            setDelCost("");
            fetchDeliveries(selectedSupplierId);
        } else {
            alert(error.message);
        }
        setAddingDelivery(false);
    };

    const [deleteDeliveryModal, setDeleteDeliveryModal] = useState<string | null>(null);

    // Delete Delivery
    const handleDeleteDelivery = (id: string) => {
        setDeleteDeliveryModal(id);
    };

    const doDeleteDelivery = async () => {
        if (!deleteDeliveryModal) return;
        const { error } = await supabase.from("fabric_deliveries").delete().eq("id", deleteDeliveryModal);
        if (error) {
            alert(lang === "ko" ? "삭제 실패: " + error.message : "Error al eliminar: " + error.message);
        } else {
            if (selectedSupplierId) fetchDeliveries(selectedSupplierId);
        }
        setDeleteDeliveryModal(null);
    };

    // Add Payment
    const handleAddPayment = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedSupplierId) {
            alert("공급업체가 선택되지 않았습니다.");
            return;
        }
        if (!payDate) {
            alert("결제 일자를 입력해주세요.");
            return;
        }
        if (!payAmount) {
            alert("결제 금액을 입력해주세요.");
            return;
        }

        setAddingPayment(true);
        const payload = {
            supplier_id: selectedSupplierId,
            payment_date: payDate,
            amount: parseFloat(payAmount),
            memo: payMemo.trim() || null
        };

        const { error } = await supabase.from("fabric_payments").insert([payload]);
        if (!error) {
            setPayAmount("");
            setPayMemo("");
            fetchPayments(selectedSupplierId);
        } else {
            console.error("Payment insert error:", error);
            alert("저장 실패: " + (error.message || JSON.stringify(error)));
        }
        setAddingPayment(false);
    };

    const [deletePaymentModal, setDeletePaymentModal] = useState<string | null>(null);

    // Delete Payment
    const handleDeletePayment = (id: string) => {
        setDeletePaymentModal(id);
    };

    const doDeletePayment = async () => {
        if (!deletePaymentModal) return;
        const { error } = await supabase.from("fabric_payments").delete().eq("id", deletePaymentModal);
        if (error) {
            alert(lang === "ko" ? "삭제 실패: " + error.message : "Error al eliminar: " + error.message);
        } else {
            if (selectedSupplierId) fetchPayments(selectedSupplierId);
        }
        setDeletePaymentModal(null);
    };

    // Load state
    if (isAdmin === null) return null; // loading role

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>
                    🏭 {lang === "ko" ? "원단 업체 관리" : "Proveedores de Tela"}
                </h1>
                <p className={styles.subtitle}>
                    {lang === "ko"
                        ? "원단 공급업체를 등록하고 입고 내역과 금액을 관리합니다."
                        : "Gestiona los proveedores de tela y los registros de entrada."}
                </p>
            </div>

            <div className={styles.container}>
                {/* 왼쪽: 공급업체 추가 & 목록 */}
                <div className={styles.leftPanel}>
                    <form className={styles.addForm} onSubmit={handleAddSupplier}>
                        <h3>{lang === "ko" ? "➕ 새 업체 추가" : "➕ Nuevo Proveedor"}</h3>
                        <div className={styles.formGroup}>
                            <input
                                className={styles.inputField}
                                placeholder={lang === "ko" ? "업체명 *" : "Nombre *"}
                                value={newSupplierName}
                                onChange={e => setNewSupplierName(e.target.value)}
                                required
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <input
                                className={styles.inputField}
                                placeholder={lang === "ko" ? "연락처 / 메모" : "Contacto / Nota"}
                                value={newSupplierContact}
                                onChange={e => setNewSupplierContact(e.target.value)}
                            />
                        </div>
                        <button type="submit" className={styles.submitBtn} disabled={addingSupplier || !newSupplierName.trim()}>
                            {addingSupplier ? "..." : (lang === "ko" ? "추가하기" : "Añadir")}
                        </button>
                    </form>

                    <div className={styles.supplierList}>
                        {suppliersLoading ? (
                            <div className={styles.empty}>Loading...</div>
                        ) : suppliers.length === 0 ? (
                            <div className={styles.empty}>
                                {lang === "ko" ? "등록된 업체가 없습니다." : "No hay proveedores."}
                            </div>
                        ) : (
                            suppliers.map(sup => (
                                <div
                                    key={sup.id}
                                    className={`${styles.supplierCard} ${selectedSupplierId === sup.id ? styles.supplierCardActive : ""}`}
                                    onClick={() => setSelectedSupplierId(sup.id)}
                                >
                                    <div className={styles.supInfo}>
                                        <div className={styles.supName}>{sup.name}</div>
                                        {sup.contact_info && (
                                            <div className={styles.supContact}>{sup.contact_info}</div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.delBtn}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleDeleteSupplier(sup.id, sup.name);
                                        }}
                                    >
                                        🗑
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 오른쪽: 선택된 업체의 주문내역 */}
                <div className={styles.rightPanel}>
                    {!selectedSupplierId ? (
                        <div className={styles.empty} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {lang === "ko" ? "👈 왼쪽에서 업체를 선택하세요" : "👈 Selecciona un proveedor"}
                        </div>
                    ) : (
                        <>
                            <div className={styles.header}>
                                <div className={styles.sectionTitle}>
                                    📦 {suppliers.find(s => s.id === selectedSupplierId)?.name}
                                </div>
                            </div>

                            {/* Balance Card */}
                            <div className={styles.balanceCard}>
                                <div className={styles.balanceItem}>
                                    <span className={styles.balanceLabel}>{lang === "ko" ? "총 청구액" : "Costo Total"}</span>
                                    <span className={styles.balanceValue}>${totalCost.toLocaleString()}</span>
                                </div>
                                <div className={styles.balanceItem}>
                                    <span className={styles.balanceLabel}>{lang === "ko" ? "총 지불액" : "Total Pagado"}</span>
                                    <span className={`${styles.balanceValue} ${styles.green}`}>${totalPaid.toLocaleString()}</span>
                                </div>
                                <div className={styles.balanceItem}>
                                    <span className={styles.balanceLabel}>{lang === "ko" ? "미납 잔액" : "Saldo Pendiente"}</span>
                                    <span className={`${styles.balanceValue} ${balance > 0 ? styles.red : ""}`}>
                                        ${balance.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className={styles.tabs}>
                                <button
                                    className={`${styles.tabBtn} ${activeTab === "deliveries" ? styles.tabBtnActive : ""}`}
                                    onClick={() => setActiveTab("deliveries")}
                                >
                                    {lang === "ko" ? "입고 내역" : "Entradas"}
                                </button>
                                <button
                                    className={`${styles.tabBtn} ${activeTab === "payments" ? styles.tabBtnActive : ""}`}
                                    onClick={() => setActiveTab("payments")}
                                >
                                    {lang === "ko" ? "지불 내역" : "Pagos (Abonos)"}
                                </button>
                            </div>

                            {activeTab === "deliveries" && (
                                <>
                                    <div className={styles.sectionSub} style={{ marginTop: 8 }}>
                                        {lang === "ko" ? "해당 업체로부터 들어온 원단 내역을 기록합니다." : "Registra las telas recibidas de este proveedor."}
                                    </div>

                                    {/* 입고 추가 폼 */}
                                    <form className={styles.deliveryForm} onSubmit={handleAddDelivery}>
                                        <div className={styles.formGroup}>
                                            <label>{lang === "ko" ? "입고 일자 *" : "Fecha *"}</label>
                                            <input
                                                type="date"
                                                className={styles.inputField}
                                                value={delDate}
                                                onChange={e => setDelDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>{lang === "ko" ? "원단 종류 (이름) *" : "Tela *"}</label>
                                            <input
                                                type="text"
                                                className={styles.inputField}
                                                placeholder={lang === "ko" ? "예: 면 30수 화이트" : "Ej: Algodón 30s"}
                                                value={delFabric}
                                                onChange={e => setDelFabric(e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label>{lang === "ko" ? "입고 수량 *" : "Cantidad *"}</label>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className={styles.inputField}
                                                    placeholder="0"
                                                    value={delQty}
                                                    onChange={e => setDelQty(e.target.value)}
                                                    required
                                                    style={{ flex: 1 }}
                                                />
                                                <select
                                                    className={styles.inputField}
                                                    value={delUnit}
                                                    onChange={e => setDelUnit(e.target.value)}
                                                    style={{ width: '80px', padding: '10px 8px' }}
                                                >
                                                    <option value="m">m</option>
                                                    <option value="kg">kg</option>
                                                    <option value="yd">yd</option>
                                                    <option value="롤">롤</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label>{lang === "ko" ? "금액 (선택)" : "Costo (opcional)"}</label>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 14, top: 10, color: "#666" }}>$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className={styles.inputField}
                                                    placeholder="0"
                                                    value={delCost}
                                                    onChange={e => setDelCost(e.target.value)}
                                                    style={{ paddingLeft: 28 }}
                                                />
                                            </div>
                                        </div>

                                        <div className={styles.actionGroup}>
                                            <button type="submit" className={styles.submitBtn} disabled={addingDelivery || !delFabric || !delQty} style={{ minWidth: 120 }}>
                                                {addingDelivery ? "..." : (lang === "ko" ? "내역 저장" : "Guardar")}
                                            </button>
                                        </div>
                                    </form>

                                    {/* 입고 리스트 */}
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th>{lang === "ko" ? "일자" : "Fecha"}</th>
                                                    <th>{lang === "ko" ? "원단" : "Tela"}</th>
                                                    <th style={{ textAlign: "right" }}>{lang === "ko" ? "수량" : "Cantidad"}</th>
                                                    <th style={{ textAlign: "right" }}>{lang === "ko" ? "금액" : "Costo"}</th>
                                                    <th style={{ width: 40 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {deliveriesLoading ? (
                                                    <tr><td colSpan={5} className={styles.empty}>Loading...</td></tr>
                                                ) : deliveries.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className={styles.empty}>
                                                            {lang === "ko" ? "입고 내역이 없습니다." : "No hay registros."}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    deliveries.map(del => (
                                                        <tr key={del.id}>
                                                            <td>{new Date(del.delivery_date).toLocaleDateString()}</td>
                                                            <td style={{ fontWeight: 600 }}>{del.fabric_name}</td>
                                                            <td style={{ textAlign: "right" }}>
                                                                {del.quantity} <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{del.unit}</span>
                                                            </td>
                                                            <td style={{ textAlign: "right" }}>
                                                                {del.cost != null ? `$${del.cost.toLocaleString()}` : "-"}
                                                            </td>
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    className={styles.delBtn}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleDeleteDelivery(del.id);
                                                                    }}
                                                                    style={{ padding: 4 }}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {activeTab === "payments" && (
                                <>
                                    <div className={styles.sectionSub} style={{ marginTop: 8 }}>
                                        {lang === "ko" ? "해당 업체에 지불(결제)한 금액 내역을 기록합니다." : "Registra los pagos realizados a este proveedor."}
                                    </div>

                                    {/* 지불 추가 폼 */}
                                    <form className={styles.deliveryForm} onSubmit={handleAddPayment}>
                                        <div className={styles.formGroup}>
                                            <label>{lang === "ko" ? "지불 일자 *" : "Fecha de Pago *"}</label>
                                            <input
                                                type="date"
                                                className={styles.inputField}
                                                value={payDate}
                                                onChange={e => setPayDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>{lang === "ko" ? "지불 금액 *" : "Monto a Pagar *"}</label>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 14, top: 10, color: "#666" }}>$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className={styles.inputField}
                                                    placeholder="0"
                                                    value={payAmount}
                                                    onChange={e => setPayAmount(e.target.value)}
                                                    style={{ paddingLeft: 28 }}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
                                            <label>{lang === "ko" ? "메모 (선택)" : "Nota (opcional)"}</label>
                                            <input
                                                type="text"
                                                className={styles.inputField}
                                                placeholder={lang === "ko" ? "예: 은행 이체 11/02" : "Ej: Transferencia bancaria"}
                                                value={payMemo}
                                                onChange={e => setPayMemo(e.target.value)}
                                            />
                                        </div>
                                        <div className={styles.actionGroup}>
                                            <button type="submit" className={styles.submitBtn} disabled={addingPayment || !payAmount} style={{ minWidth: 120 }}>
                                                {addingPayment ? "..." : (lang === "ko" ? "결제 저장" : "Guardar Pago")}
                                            </button>
                                        </div>
                                    </form>

                                    {/* 지불 리스트 */}
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th>{lang === "ko" ? "일자" : "Fecha"}</th>
                                                    <th>{lang === "ko" ? "금액" : "Monto"}</th>
                                                    <th>{lang === "ko" ? "메모" : "Nota"}</th>
                                                    <th style={{ width: 40 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paymentsLoading ? (
                                                    <tr><td colSpan={4} className={styles.empty}>Loading...</td></tr>
                                                ) : payments.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className={styles.empty}>
                                                            {lang === "ko" ? "지불 내역이 없습니다." : "No hay pagos."}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    payments.map(pay => (
                                                        <tr key={pay.id}>
                                                            <td>{new Date(pay.payment_date).toLocaleDateString()}</td>
                                                            <td style={{ fontWeight: 600, color: "#10b981" }}>${pay.amount.toLocaleString()}</td>
                                                            <td style={{ color: "#555" }}>{pay.memo || "-"}</td>
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    className={styles.delBtn}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleDeletePayment(pay.id);
                                                                    }}
                                                                    style={{ padding: 4 }}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteSupplierModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <h3>⚠️ {lang === "ko" ? "업체 삭제 확인" : "Confirmar eliminación"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? `정말 "${deleteSupplierModal.name}" 업체를 삭제하시겠습니까? 관련 입고 데이터가 모두 함께 삭제됩니다.`
                                : `¿Estás seguro de que deseas eliminar "${deleteSupplierModal.name}"? Se eliminarán todos sus registros.`}
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setDeleteSupplierModal(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnConfirm} onClick={doDeleteSupplier}>
                                {lang === "ko" ? "삭제하기" : "Eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Delivery Confirmation Modal */}
            {deleteDeliveryModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <h3>⚠️ {lang === "ko" ? "내역 삭제 확인" : "Confirmar eliminación"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? "정말 이 입고 내역을 삭제하시겠습니까?"
                                : "¿Estás seguro de que deseas eliminar este registro?"}
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setDeleteDeliveryModal(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnConfirm} onClick={doDeleteDelivery}>
                                {lang === "ko" ? "삭제하기" : "Eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Payment Confirmation Modal */}
            {deletePaymentModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox}>
                        <h3>⚠️ {lang === "ko" ? "지불 내역 삭제 확인" : "Confirmar eliminación"}</h3>
                        <p className={styles.modalSub}>
                            {lang === "ko"
                                ? "정말 이 지불 내역을 삭제하시겠습니까?"
                                : "¿Estás seguro de que deseas eliminar este pago?"}
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.btnCancel} onClick={() => setDeletePaymentModal(null)}>
                                {lang === "ko" ? "취소" : "Cancelar"}
                            </button>
                            <button className={styles.btnConfirm} onClick={doDeletePayment}>
                                {lang === "ko" ? "삭제하기" : "Eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
