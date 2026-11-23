const PHARMACIST_API_BASE = "http://127.0.0.1:8000/api/pharmacist";

let cachedPharmacistData = null;
let currentSelectedPrescription = null;
let pharmacistQueueFilter = "ALL";
let pharmModalCloseCallback = null;
let pendingStockMed = null;

function getCurrentUser() {
    try {
        const raw = localStorage.getItem("current_user");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function getInitials(name) {
    if (!name) return "DS";
    const clean = name.replace(/^(DS\.|CN\.|BS\.|ThS\.|ĐD\.|KT\.)\s*/i, "").trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
}

function extractPrescriptionDateYmd(p) {
    const raw = p.thoi_gian_ke_don || p.thoi_gian_cap_thuoc || p.thoi_gian_tiep_nhan || "";
    return String(raw).substring(0, 10);
}

document.addEventListener("DOMContentLoaded", () => {
    // Tự động gỡ bỏ banner gọi loa và nút gọi loa nếu còn trong HTML
    document.getElementById("pharm-calling-banner")?.remove();
    document.getElementById("btn-call-patient-pharm")?.remove();

    const user = getCurrentUser();
    if (user) {
        const nameEl = document.getElementById("pharm-sidebar-name");
        const dropNameEl = document.getElementById("pharm-dropdown-name");
        const emailEl = document.getElementById("pharm-sidebar-email");
        const initialsEl = document.getElementById("pharm-sidebar-initials");
        const subEl = document.getElementById("pharm-header-sub");
        const deptEl = document.getElementById("pharm-dropdown-dept");

        const maNv = user.ma_nhan_vien || user.ma_nguoi_dung || "NV26112005";
        const tenKhoa = user.ten_khoa || "Khoa Dược - Vật Tư Y Tế";

        if (nameEl && user.ho_ten) nameEl.textContent = user.ho_ten;
        if (dropNameEl && user.ho_ten) dropNameEl.textContent = user.ho_ten;
        if (emailEl && user.email) emailEl.textContent = user.email;
        if (initialsEl && user.ho_ten) initialsEl.textContent = getInitials(user.ho_ten);
        if (subEl) subEl.textContent = `Mã DS: #${maNv} • Quầy P105`;
        if (deptEl) deptEl.textContent = `Mã DS: #${maNv} • ${tenKhoa}`;
    }

    const selectEl = document.getElementById("pharm-queue-status-select");
    if (selectEl) selectEl.value = "ALL";

    ensurePharmacistConfirmModalDOM();
    ensureQuickStockModalDOM();
    loadPharmacistDashboard();
});

function logoutPharmacist() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

function openPharmacistMenu(menuKey) {
    const dispenseSection = document.getElementById("pharm-view-dispense");
    const inventorySection = document.getElementById("pharm-view-inventory");
    const historySection = document.getElementById("pharm-view-history");

    const queueSubview = document.getElementById("pharm-subview-queue");
    const formSubview = document.getElementById("pharm-subview-form");

    const titleEl = document.getElementById("current-pharm-workspace-title");

    if (dispenseSection) dispenseSection.classList.add("hidden");
    if (inventorySection) inventorySection.classList.add("hidden");
    if (historySection) historySection.classList.add("hidden");

    let activeTopNav = "dispense";

    if (menuKey === "dispense" || menuKey === "dispense-queue") {
        activeTopNav = "dispense";
        if (dispenseSection) dispenseSection.classList.remove("hidden");
        if (queueSubview) queueSubview.classList.remove("hidden");
        if (formSubview) formSubview.classList.add("hidden");
        if (titleEl) titleEl.textContent = "DANH SÁCH ĐƠN THUỐC CHỜ CẤP PHÁT";
    } else if (menuKey === "dispense-form") {
        activeTopNav = "dispense";
        if (dispenseSection) dispenseSection.classList.remove("hidden");
        if (queueSubview) queueSubview.classList.add("hidden");
        if (formSubview) formSubview.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "TRANG KIỂM ĐƠN & CẤP PHÁT THUỐC CHO BỆNH NHÂN";

        if (!currentSelectedPrescription && cachedPharmacistData) {
            const allPres = cachedPharmacistData.prescriptions || [];
            const firstReady = allPres.find(
                p => p.trang_thai_cap_thuoc === "ChoCapThuoc" && p.trang_thai_thanh_toan === "DaThu"
            ) || allPres[0];
            if (firstReady) {
                populatePrescriptionDispenseForm(firstReady);
            }
        }
    } else if (menuKey === "inventory") {
        activeTopNav = "inventory";
        if (inventorySection) inventorySection.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "QUẢN LÝ KHO THUỐC BHYT & NHẬP TỒN KHO";
    } else if (menuKey === "history") {
        activeTopNav = "history";
        if (historySection) historySection.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "SỔ NHẬT KÝ LỊCH SỬ CẤP PHÁT ĐƠN THUỐC";
    }

    const navConfigs = [
        { key: "dispense", id: "pharm-nav-dispense", badgeId: "badge-pharm-waiting", idleBadge: "bg-amber-500 text-white" },
        { key: "inventory", id: "pharm-nav-inventory", badgeId: "badge-pharm-meds", idleBadge: "bg-indigo-600 text-white" },
        { key: "history", id: "pharm-nav-history", badgeId: "badge-pharm-done", idleBadge: "bg-emerald-600 text-white" }
    ];

    navConfigs.forEach(item => {
        const btn = document.getElementById(item.id);
        const badge = document.getElementById(item.badgeId);
        if (!btn) return;
        if (item.key === activeTopNav) {
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-white bg-teal-600 shadow-xs flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = "px-1.5 py-0.2 rounded-full bg-white/25 text-white text-[10px] font-extrabold";
        } else {
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = `px-1.5 py-0.2 rounded-full ${item.idleBadge} text-[10px] font-extrabold`;
        }
    });
}

function switchPharmacistView(viewName) {
    if (viewName === "dispense") openPharmacistMenu("dispense-queue");
    else openPharmacistMenu(viewName);
}

function ensurePharmacistConfirmModalDOM() {
    if (document.getElementById("pharmacist-confirm-modal")) return;
    const modal = document.createElement("div");
    modal.id = "pharmacist-confirm-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4";
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-teal-200 animate-[fadeIn_0.18s_ease-out]">
            <div id="pcm-header" class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative">
                <button type="button" onclick="closePharmacistConfirmModal()"
                        class="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
                <div class="w-14 h-14 rounded-full bg-white text-teal-600 flex items-center justify-center mx-auto mb-2 shadow-md">
                    <span id="pcm-icon" class="material-symbols-outlined text-3xl">verified</span>
                </div>
                <h3 id="pcm-title" class="font-heading font-extrabold text-lg">Đã Xác Nhận Thành Công</h3>
                <p id="pcm-subtitle" class="text-xs text-teal-50 mt-0.5">Dữ liệu đã được đồng bộ vào hệ thống MySQL</p>
            </div>
            <div class="p-6 space-y-4 text-xs sm:text-sm">
                <div id="pcm-body"></div>
                <button type="button" onclick="closePharmacistConfirmModal()"
                        class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-md transition flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined text-base">check</span>
                    <span>Đóng</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function showPharmacistNoticeModal(title, messageHtml, isError = false, onClose = null) {
    ensurePharmacistConfirmModalDOM();
    pharmModalCloseCallback = onClose;

    document.getElementById("pcm-header").className = isError
        ? "bg-gradient-to-r from-rose-600 to-amber-600 text-white px-6 py-5 text-center relative"
        : "bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative";
    document.getElementById("pcm-icon").textContent = isError ? "warning" : "verified";
    document.getElementById("pcm-title").textContent = title;
    document.getElementById("pcm-subtitle").textContent = isError
        ? "Vui lòng kiểm tra lại thông tin"
        : "Quầy Cấp Phát Thuốc BHYT P105 • TTYT Phường Hải Châu";

    document.getElementById("pcm-body").innerHTML = `
        <div class="p-4 rounded-xl ${isError ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-teal-50/70 border-teal-200 text-slate-800'} border font-semibold text-center leading-relaxed">
            ${messageHtml}
        </div>
    `;

    const modal = document.getElementById("pharmacist-confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closePharmacistConfirmModal() {
    const modal = document.getElementById("pharmacist-confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    if (typeof pharmModalCloseCallback === "function") {
        const cb = pharmModalCloseCallback;
        pharmModalCloseCallback = null;
        cb();
    }
}

function ensureQuickStockModalDOM() {
    if (document.getElementById("quick-stock-modal")) return;
    const modal = document.createElement("div");
    modal.id = "quick-stock-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4";
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-teal-200 space-y-4 text-xs">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 class="font-heading font-bold text-base text-teal-950">Nhập Bổ Sung Tồn Kho Thuốc</h3>
                <button type="button" onclick="closeQuickStockModal()" class="text-slate-400 hover:text-slate-700">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div>
                <p id="qsm-med-label" class="font-bold text-sm text-indigo-800 mb-2"></p>
                <label class="font-bold text-slate-700 block mb-1">Số lượng nhập thêm vào kho *</label>
                <input id="qsm-qty-input" type="number" min="1" value="100"
                       class="w-full h-10 px-3 rounded-xl border-slate-300 font-extrabold text-teal-800 text-sm"/>
            </div>
            <div class="flex justify-end gap-2 pt-2">
                <button type="button" onclick="closeQuickStockModal()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-700">
                    Hủy
                </button>
                <button type="button" onclick="confirmQuickStockSubmit()" class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow">
                    Xác nhận nhập kho
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeQuickStockModal() {
    const modal = document.getElementById("quick-stock-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    pendingStockMed = null;
}

async function loadPharmacistDashboard() {
    try {
        const res = await fetch(`${PHARMACIST_API_BASE}/dashboard-data`, {
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        if (!res.ok || data.status !== "success") return;

        cachedPharmacistData = data;

        const allPres = data.prescriptions || [];
        const meds = data.medicines || [];

        const readyList = allPres.filter(p => p.trang_thai_cap_thuoc === "ChoCapThuoc" && p.trang_thai_thanh_toan === "DaThu");
        const unpaidList = allPres.filter(p => p.trang_thai_cap_thuoc === "ChoCapThuoc" && p.trang_thai_thanh_toan !== "DaThu");
        const doneList = allPres.filter(p => p.trang_thai_cap_thuoc === "DaCapThuoc");
        const lowStockCount = meds.filter(m => Number(m.so_luong_ton_kho) < 50).length;

        document.getElementById("pharm-stat-ready").textContent = `${readyList.length} đơn`;
        document.getElementById("pharm-stat-unpaid").textContent = `${unpaidList.length} đơn`;
        document.getElementById("pharm-stat-dispensed").textContent = `${doneList.length} đơn`;
        document.getElementById("pharm-stat-stock-items").textContent = `${meds.length} loại`;
        document.getElementById("pharm-stat-low-stock").textContent =
            lowStockCount > 0 ? `Có ${lowStockCount} thuốc sắp hết tồn kho` : "Đủ cơ số tồn kho BHYT";

        document.getElementById("badge-pharm-waiting").textContent = readyList.length;
        document.getElementById("badge-pharm-meds").textContent = meds.length;
        document.getElementById("badge-pharm-done").textContent = doneList.length;

        renderPharmacistQueueList();
        renderPharmacistInventoryTable();
        renderPharmacistHistoryTable();

        if (currentSelectedPrescription) {
            const updated = allPres.find(p => String(p.ma_don_thuoc) === String(currentSelectedPrescription.ma_don_thuoc));
            if (updated) populatePrescriptionDispenseForm(updated);
        }
    } catch (error) {
        console.error("Lỗi tải dữ liệu Dược sĩ:", error);
    }
}

function setPharmacistQueueFilter(mode) {
    pharmacistQueueFilter = mode;
    const selectEl = document.getElementById("pharm-queue-status-select");
    if (selectEl && selectEl.value !== mode) {
        selectEl.value = mode;
    }
    renderPharmacistQueueList();
}

function clearPharmacistQueueFilters() {
    const kwEl = document.getElementById("pharm-queue-search");
    const dtEl = document.getElementById("pharm-queue-date");
    const sortEl = document.getElementById("pharm-queue-sort");

    if (kwEl) kwEl.value = "";
    if (dtEl) dtEl.value = "";
    if (sortEl) sortEl.value = "ASC";
    setPharmacistQueueFilter("ALL");
}

function renderPharmacistQueueList() {
    if (!cachedPharmacistData) return;
    const tbody = document.getElementById("pharm-queue-tbody");
    if (!tbody) return;

    const keyword = (document.getElementById("pharm-queue-search")?.value || "").toLowerCase().trim();
    const dateFilter = document.getElementById("pharm-queue-date")?.value || "";
    const sortOrder = document.getElementById("pharm-queue-sort")?.value || "ASC";

    const allPres = cachedPharmacistData.prescriptions || [];
    const filtered = allPres.filter(p => {
        if (pharmacistQueueFilter === "READY" && !(p.trang_thai_cap_thuoc === "ChoCapThuoc" && p.trang_thai_thanh_toan === "DaThu")) return false;
        if (pharmacistQueueFilter === "UNPAID" && !(p.trang_thai_cap_thuoc === "ChoCapThuoc" && p.trang_thai_thanh_toan !== "DaThu")) return false;
        if (pharmacistQueueFilter === "DONE" && p.trang_thai_cap_thuoc !== "DaCapThuoc") return false;

        if (dateFilter) {
            const pDate = extractPrescriptionDateYmd(p);
            if (pDate !== dateFilter) return false;
        }

        if (keyword) {
            const matchName = (p.ten_benh_nhan || "").toLowerCase().includes(keyword);
            const matchDt = String(p.ma_don_thuoc || "").toLowerCase().includes(keyword);
            const matchHs = String(p.ma_ho_so_kham || "").toLowerCase().includes(keyword);
            const matchBn = String(p.ma_benh_nhan || "").toLowerCase().includes(keyword);
            const matchVneid = (p.vneid || "").toLowerCase().includes(keyword);
            if (!matchName && !matchDt && !matchHs && !matchBn && !matchVneid) return false;
        }
        return true;
    });

    filtered.sort((a, b) => {
        const dA = extractPrescriptionDateYmd(a);
        const dB = extractPrescriptionDateYmd(b);
        if (dA !== dB) {
            return sortOrder === "ASC" ? dA.localeCompare(dB) : dB.localeCompare(dA);
        }
        return sortOrder === "ASC"
            ? String(a.ma_don_thuoc || "").localeCompare(String(b.ma_don_thuoc || ""))
            : String(b.ma_don_thuoc || "").localeCompare(String(a.ma_don_thuoc || ""));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="p-8 text-center text-slate-400">
                    Không tìm thấy đơn thuốc nào khớp với bộ lọc hiện tại.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const isDispensed = p.trang_thai_cap_thuoc === "DaCapThuoc";
        const isPaid = p.trang_thai_thanh_toan === "DaThu";
        const medCount = p.items ? p.items.length : 0;
        const pDate = extractPrescriptionDateYmd(p) || "-";

        let statusBadge = `<span class="px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold inline-block whitespace-nowrap">Đã nộp phí • Chờ cấp</span>`;
        if (isDispensed) {
            statusBadge = `<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold inline-block whitespace-nowrap">Đã cấp thuốc</span>`;
        } else if (!isPaid) {
            statusBadge = `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold inline-block whitespace-nowrap">Chờ thu phí P104</span>`;
        }

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3">
                    <span class="inline-block px-2 py-0.5 rounded bg-indigo-600 text-white font-extrabold text-[11px]">
                        Đơn #${p.ma_don_thuoc}
                    </span>
                    <div class="font-bold text-teal-800 mt-1">Hồ sơ: #${p.ma_ho_so_kham}</div>
                </td>
                <td class="p-3 font-bold text-teal-700">
                    Mã BN: #${p.ma_benh_nhan || "-"}<br/>
                    <span class="text-[10px] font-mono text-indigo-700">VNeID: ${p.vneid || "-"}</span>
                </td>
                <td class="p-3 font-bold text-slate-900 uppercase">
                    ${p.ten_benh_nhan || "-"}<br/>
                    <span class="text-[11px] font-normal text-slate-500 normal-case">SĐT: ${p.so_dien_thoai || "-"}</span>
                </td>
                <td class="p-3 font-semibold text-emerald-700">
                    ${p.so_the_bhyt || "<span class='text-slate-400 font-normal'>Không BHYT</span>"}
                </td>
                <td class="p-3 max-w-[220px]">
                    <div class="font-bold text-sky-800">${p.ten_bac_si || "-"} (P.${p.so_phong || "102"})</div>
                    <div class="text-slate-700 truncate mt-0.5" title="${p.ket_luan_chan_doan || ''}">${p.ket_luan_chan_doan || "-"}</div>
                </td>
                <td class="p-3">
                    <span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-extrabold text-xs">
                        ${medCount} loại thuốc
                    </span>
                </td>
                <td class="p-3 font-semibold text-slate-800">${pDate}</td>
                <td class="p-3">${statusBadge}</td>
                <td class="p-3 text-right">
                    <button type="button" onclick="selectPrescriptionForDispense('${p.ma_don_thuoc}')"
                            class="px-3 py-1.5 rounded-lg ${
                                isPaid && !isDispensed
                                    ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-300'
                            } font-bold text-xs inline-flex items-center gap-1 transition whitespace-nowrap">
                        <span class="material-symbols-outlined text-sm">${isPaid && !isDispensed ? 'medication' : 'visibility'}</span>
                        <span>${isPaid && !isDispensed ? 'Kiểm đơn & Cấp thuốc' : 'Xem đơn thuốc'}</span>
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function selectPrescriptionForDispense(maDonThuoc) {
    if (!cachedPharmacistData) return;
    const pres = (cachedPharmacistData.prescriptions || []).find(
        p => String(p.ma_don_thuoc) === String(maDonThuoc)
    );
    if (!pres) return;

    currentSelectedPrescription = pres;
    openPharmacistMenu("dispense-form");
    populatePrescriptionDispenseForm(pres);
}

function populatePrescriptionDispenseForm(pres) {
    currentSelectedPrescription = pres;

    const isPaid = pres.trang_thai_thanh_toan === "DaThu";
    const isDispensed = pres.trang_thai_cap_thuoc === "DaCapThuoc";

    document.getElementById("disp-badge-code").textContent = `Đơn thuốc #${pres.ma_don_thuoc} • Hồ sơ khám #${pres.ma_ho_so_kham}`;
    const payBadge = document.getElementById("disp-badge-payment");
    payBadge.className = `px-2.5 py-0.5 rounded font-bold text-xs ${
        isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
    }`;
    payBadge.textContent = isPaid ? "Kế toán P104: Đã thu viện phí" : "Chưa đóng viện phí tại P104";

    document.getElementById("disp-patient-name").textContent = `${pres.ten_benh_nhan || "Bệnh nhân"} (Mã BN: #${pres.ma_benh_nhan})`;
    document.getElementById("disp-patient-meta").innerHTML = `
        VNeID: <b class="text-indigo-700">${pres.vneid || "-"}</b>
        • Ngày sinh: <b>${pres.ngay_sinh ? String(pres.ngay_sinh).substring(0, 10) : "-"}</b> (${pres.gioi_tinh || "Nam"})
        • SĐT: <b>${pres.so_dien_thoai || "-"}</b>
        • Thẻ BHYT: <b class="text-teal-700">${pres.so_the_bhyt || "Không có"}</b>
    `;

    document.getElementById("disp-diagnosis-text").textContent = pres.ket_luan_chan_doan || "Điều trị ngoại trú";
    document.getElementById("disp-doctor-name").textContent =
        `Bác sĩ kê đơn: ${pres.ten_bac_si || "-"} • Phòng ${pres.so_phong || "P102"} (${pres.ten_khoa || ""})`;

    document.getElementById("disp-allergy-text").textContent =
        pres.tien_su_di_ung_benh_nen || "Không ghi nhận tiền sử dị ứng thuốc";
    document.getElementById("disp-advice-text").textContent =
        pres.loi_dan_bac_si || pres.ghi_chu_don_thuoc || "Uống thuốc đúng liều sau ăn no.";

    const tbody = document.getElementById("disp-items-tbody");
    const items = pres.items || [];
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Đơn thuốc này chưa có chi tiết thuốc.</td></tr>`;
    } else {
        tbody.innerHTML = items.map((it, idx) => `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-bold text-slate-500">${idx + 1}</td>
                <td class="p-3">
                    <b class="text-slate-900 text-sm">${it.ten_thuoc || "-"}</b><br/>
                    <span class="text-[11px] text-slate-500">Mã thuốc: #${it.ma_thuoc} • Hoạt chất: ${it.hoat_chat || "-"}</span>
                </td>
                <td class="p-3 text-center">
                    <span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-extrabold text-sm">
                        ${it.so_luong} ${it.don_vi_tinh || "Viên"}
                    </span>
                </td>
                <td class="p-3 font-semibold text-teal-900">${it.lieu_dung_huong_dan || "-"}</td>
                <td class="p-3 text-right font-bold ${Number(it.so_luong_ton_kho) < 50 ? 'text-rose-600' : 'text-emerald-700'}">
                    ${it.so_luong_ton_kho ?? "-"} ${it.don_vi_tinh || ""}
                </td>
            </tr>
        `).join("");
    }

    const btnConfirm = document.getElementById("btn-confirm-dispense");
    if (isDispensed) {
        btnConfirm.disabled = true;
        btnConfirm.className = "w-full py-3.5 rounded-xl bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-default";
        btnConfirm.innerHTML = `<span class="material-symbols-outlined text-xl">verified</span><span>ĐƠN THUỐC NÀY ĐÃ ĐƯỢC CẤP PHÁT (${pres.thoi_gian_cap_thuoc || ""})</span>`;
    } else if (!isPaid) {
        btnConfirm.disabled = true;
        btnConfirm.className = "w-full py-3.5 rounded-xl bg-amber-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-not-allowed";
        btnConfirm.innerHTML = `<span class="material-symbols-outlined text-xl">lock</span><span>CHỜ BỆNH NHÂN ĐÓNG VIỆN PHÍ TẠI QUẦY KẾ TOÁN (P104)</span>`;
    } else {
        btnConfirm.disabled = false;
        btnConfirm.className = "w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition";
        btnConfirm.innerHTML = `<span class="material-symbols-outlined text-xl">check_circle</span><span>XÁC NHẬN ĐÃ KIỂM ĐƠN & CẤP PHÁT THUỐC CHO BỆNH NHÂN</span>`;
    }
}

async function submitConfirmDispense() {
    if (!currentSelectedPrescription) return;
    const user = getCurrentUser();

    try {
        const res = await fetch(`${PHARMACIST_API_BASE}/dispense`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ma_don_thuoc: currentSelectedPrescription.ma_don_thuoc,
                ma_duoc_si: user ? (user.ma_nhan_vien || user.ma_nguoi_dung) : "NV26112005"
            })
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showPharmacistNoticeModal("Không Thể Cấp Phát Thuốc", data.message || "Lỗi khi xác nhận cấp thuốc!", true);
            return;
        }

        await loadPharmacistDashboard();

        showPharmacistNoticeModal(
            "Đã Xác Nhận Cấp Phát Thuốc",
            data.message,
            false,
            () => {
                openPharmacistMenu("dispense-queue");
            }
        );
    } catch (e) {
        showPharmacistNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel (Cổng 8000)!", true);
    }
}

function printCurrentPrescriptionSlip() {
    if (!currentSelectedPrescription) {
        showPharmacistNoticeModal("Chưa Chọn Đơn Thuốc", "Vui lòng chọn một đơn thuốc để in phiếu hướng dẫn!", true);
        return;
    }
    window.print();
}

function renderPharmacistInventoryTable() {
    if (!cachedPharmacistData) return;
    const tbody = document.getElementById("pharm-inventory-tbody");
    if (!tbody) return;

    const keyword = (document.getElementById("pharm-stock-search")?.value || "").toLowerCase().trim();

    const list = (cachedPharmacistData.medicines || []).filter(m => {
        if (!keyword) return true;
        return (m.ten_thuoc || "").toLowerCase().includes(keyword) ||
               String(m.ma_thuoc || "").toLowerCase().includes(keyword) ||
               (m.hoat_chat || "").toLowerCase().includes(keyword);
    });

    tbody.innerHTML = list.map(m => {
        const isLow = Number(m.so_luong_ton_kho) < 50;
        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-bold text-teal-700">#${m.ma_thuoc}</td>
                <td class="p-3">
                    <b class="text-slate-900">${m.ten_thuoc}</b><br/>
                    <span class="text-[11px] text-slate-500">Hoạt chất: ${m.hoat_chat || "-"}</span>
                </td>
                <td class="p-3 font-semibold">${m.don_vi_tinh}</td>
                <td class="p-3 font-bold text-emerald-700">${Number(m.don_gia_thuoc || 0).toLocaleString("vi-VN")}đ</td>
                <td class="p-3">
                    <span class="px-2.5 py-1 rounded-full font-extrabold text-xs ${isLow ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-800'}">
                        ${m.so_luong_ton_kho} ${m.don_vi_tinh}
                    </span>
                </td>
                <td class="p-3 text-right space-x-1 whitespace-nowrap">
                    <button type="button" onclick="quickAddMedicineStock('${m.ma_thuoc}', '${(m.ten_thuoc || '').replace(/'/g, "\\'")}')"
                            class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition">
                        + Nhập kho
                    </button>
                    <button type="button" onclick="editPharmacistMedById('${m.ma_thuoc}')"
                            class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition">
                        Sửa
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function editPharmacistMedById(maThuoc) {
    const m = (cachedPharmacistData?.medicines || []).find(item => String(item.ma_thuoc) === String(maThuoc));
    if (m) fillPharmacistMedForm(m);
}

function fillPharmacistMedForm(m) {
    document.getElementById("pmed-id").value = m.ma_thuoc;
    const codeEl = document.getElementById("pmed-code");
    if (codeEl) codeEl.value = m.ma_thuoc;
    document.getElementById("pmed-name").value = m.ten_thuoc || "";
    document.getElementById("pmed-active").value = m.hoat_chat || "";
    document.getElementById("pmed-unit").value = m.don_vi_tinh || "Viên";
    document.getElementById("pmed-price").value = m.don_gia_thuoc || 0;
    document.getElementById("pmed-stock").value = m.so_luong_ton_kho || 0;
}

function resetPharmacistMedForm() {
    document.getElementById("pharm-med-form").reset();
    document.getElementById("pmed-id").value = "";
}

async function submitSavePharmacistMedicine(event) {
    event.preventDefault();
    const codeVal = document.getElementById("pmed-code")?.value.trim() || "";
    const hiddenId = document.getElementById("pmed-id")?.value.trim() || "";

    const payload = {
        ma_thuoc: hiddenId || codeVal || null,
        ten_thuoc: document.getElementById("pmed-name").value.trim(),
        hoat_chat: document.getElementById("pmed-active").value.trim(),
        don_vi_tinh: document.getElementById("pmed-unit").value.trim(),
        don_gia_thuoc: document.getElementById("pmed-price").value,
        so_luong_ton_kho: document.getElementById("pmed-stock").value
    };

    try {
        const res = await fetch(`${PHARMACIST_API_BASE}/save-medicine`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showPharmacistNoticeModal("Lỗi Lưu Kho Thuốc", data.message || "Không thể lưu thông tin thuốc!", true);
            return;
        }
        resetPharmacistMedForm();
        await loadPharmacistDashboard();
        showPharmacistNoticeModal("Đã Cập Nhật Kho Thuốc", data.message);
    } catch (e) {
        showPharmacistNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel!", true);
    }
}

function quickAddMedicineStock(maThuoc, tenThuoc) {
    ensureQuickStockModalDOM();
    pendingStockMed = { ma_thuoc: maThuoc, ten_thuoc: tenThuoc };
    document.getElementById("qsm-med-label").textContent = `Thuốc: ${tenThuoc} (#${maThuoc})`;
    document.getElementById("qsm-qty-input").value = "100";

    const modal = document.getElementById("quick-stock-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

async function confirmQuickStockSubmit() {
    if (!pendingStockMed) return;
    const qty = parseInt(document.getElementById("qsm-qty-input").value || "0", 10);
    if (isNaN(qty) || qty <= 0) {
        showPharmacistNoticeModal("Số Lượng Không Hợp Lệ", "Số lượng nhập kho phải lớn hơn 0!", true);
        return;
    }

    const targetMed = pendingStockMed;
    closeQuickStockModal();

    try {
        const res = await fetch(`${PHARMACIST_API_BASE}/save-medicine`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                action: "add_stock",
                ma_thuoc: targetMed.ma_thuoc,
                so_luong_nhap: qty
            })
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showPharmacistNoticeModal("Lỗi Nhập Kho", data.message || "Không thể nhập thêm tồn kho!", true);
            return;
        }
        await loadPharmacistDashboard();
        showPharmacistNoticeModal("Đã Nhập Bổ Sung Tồn Kho", data.message);
    } catch (e) {
        showPharmacistNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel!", true);
    }
}

function renderPharmacistHistoryTable() {
    if (!cachedPharmacistData) return;
    const tbody = document.getElementById("pharm-history-tbody");
    if (!tbody) return;

    const keyword = (document.getElementById("pharm-history-search")?.value || "").toLowerCase().trim();
    const list = (cachedPharmacistData.prescriptions || []).filter(p => {
        if (!keyword) return true;
        return (p.ten_benh_nhan || "").toLowerCase().includes(keyword) ||
               String(p.ma_don_thuoc || "").toLowerCase().includes(keyword) ||
               String(p.ma_ho_so_kham || "").toLowerCase().includes(keyword) ||
               (p.ket_luan_chan_doan || "").toLowerCase().includes(keyword);
    });

    tbody.innerHTML = list.map(p => {
        const isDispensed = p.trang_thai_cap_thuoc === "DaCapThuoc";
        const itemsSummary = (p.items || []).map(i => `${i.ten_thuoc} (${i.so_luong} ${i.don_vi_tinh})`).join(", ");

        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3.5 font-bold text-teal-700">
                    Đơn #${p.ma_don_thuoc}<br/>
                    <span class="text-[11px] text-slate-500 font-normal">Hồ sơ #${p.ma_ho_so_kham}</span>
                </td>
                <td class="p-3.5 font-bold text-slate-900">
                    ${p.ten_benh_nhan || "-"} (Mã BN: #${p.ma_benh_nhan})<br/>
                    <span class="text-[11px] text-emerald-700 font-semibold">VNeID: ${p.vneid || "-"} • BHYT: ${p.so_the_bhyt || "Không có"}</span>
                </td>
                <td class="p-3.5 max-w-xs">${p.ket_luan_chan_doan || "-"}</td>
                <td class="p-3.5 font-semibold">${p.ten_bac_si || "-"}</td>
                <td class="p-3.5 max-w-xs text-slate-700">${itemsSummary || "-"}</td>
                <td class="p-3.5 text-slate-500">${p.thoi_gian_cap_thuoc || p.thoi_gian_ke_don || "-"}</td>
                <td class="p-3.5">
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-block whitespace-nowrap ${isDispensed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${isDispensed ? 'Đã cấp thuốc' : 'Chờ cấp'}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}

function exportPrescriptionsCsv() {
    if (!cachedPharmacistData || !cachedPharmacistData.prescriptions) return;
    const rows = [
        ["Mã Đơn Thuốc", "Mã Hồ Sơ Khám", "Mã Bệnh Nhân", "Bệnh Nhân", "VNeID", "Thẻ BHYT", "Chẩn Đoán", "Bác Sĩ Kê", "Trạng Thái Thanh Toán", "Trạng Thái Cấp Thuốc", "Thời Gian Cấp"]
    ];
    cachedPharmacistData.prescriptions.forEach(p => {
        rows.push([
            p.ma_don_thuoc,
            p.ma_ho_so_kham || "",
            p.ma_benh_nhan || "",
            p.ten_benh_nhan || "",
            p.vneid || "",
            p.so_the_bhyt || "",
            `"${(p.ket_luan_chan_doan || "").replace(/"/g, '""')}"`,
            p.ten_bac_si || "",
            p.trang_thai_thanh_toan,
            p.trang_thai_cap_thuoc,
            p.thoi_gian_cap_thuoc || ""
        ]);
    });
    const csvContent = "\uFEFF" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "So_Cap_Phat_Thuoc_BHYT_TTYT_Hai_Chau.csv";
    link.click();
}