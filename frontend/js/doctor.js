const DOCTOR_API_BASE = "http://127.0.0.1:8000/api/doctor";
const AI_DOCTOR_CONSULT_URL = "http://127.0.0.1:8001/api/ai/doctor-consult";

let cachedDoctorData = null;
let currentSelectedRecord = null;
let doctorQueueFilter = "WAITING"; // 'WAITING', 'PROCESSING', 'DONE', 'ALL'
let doctorModalCloseCallback = null;

function getCurrentUser() {
    try {
        const raw = localStorage.getItem("current_user");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function normalizeDoctorPureName(rawName) {
    if (!rawName) return "";
    return String(rawName)
        .replace(/\(.*?\)/g, "")
        .replace(/^(BS\.CKI|BS\.CKII|ThS\.BS|TS\.BS|BS\.|ĐD\.|KTV\.|DS\.|KT\.)\s*/i, "")
        .trim()
        .toLowerCase();
}

function getInitials(name) {
    const clean = normalizeDoctorPureName(name);
    if (!clean) return "BS";
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
}

function isRecordBelongToLoggedDoctor(rec, user) {
    if (!user) return true;

    if (user.ma_nhan_vien && rec.ma_nhan_vien && String(user.ma_nhan_vien) === String(rec.ma_nhan_vien)) {
        return true;
    }
    if (user.ma_nguoi_dung && rec.ma_nguoi_dung_bs && String(user.ma_nguoi_dung) === String(rec.ma_nguoi_dung_bs)) {
        return true;
    }
    const userPureName = normalizeDoctorPureName(user.ho_ten);
    const recDocPureName = normalizeDoctorPureName(rec.ten_bac_si);
    if (userPureName && recDocPureName && (userPureName === recDocPureName || recDocPureName.includes(userPureName) || userPureName.includes(recDocPureName))) {
        return true;
    }

    return false;
}

function extractRecordDateYmd(rec) {
    const raw = rec.thoi_gian_tiep_nhan || rec.thoi_gian_do || rec.thoi_gian_hoan_tat || "";
    return String(raw).substring(0, 10);
}

/**
 * Đếm số lượng dịch vụ CLS chưa có kết quả của 1 hồ sơ khám
 */
function getPendingClsOrders(rec) {
    if (!rec || !Array.isArray(rec.cls_orders)) return [];
    return rec.cls_orders.filter(
        c => c.trang_thai_thuc_hien !== "DaCoKetQua" || !c.ket_qua_cls || String(c.ket_qua_cls).trim() === ""
    );
}

/**
 * Tự động gỡ bỏ ô Mã bệnh ICD-10 khỏi giao diện Bác sĩ và căn chỉnh lại bố cục
 */
function removeIcd10FieldFromDOM() {
    const icdInput = document.getElementById("exam-icd10");
    if (icdInput) {
        const icdCol = icdInput.parentElement;
        const rowGrid = icdCol ? icdCol.parentElement : null;
        if (icdCol) {
            icdCol.remove();
        }
        const symptomInput = document.getElementById("exam-clinical-symptoms");
        if (symptomInput && symptomInput.parentElement && rowGrid) {
            symptomInput.parentElement.className = "sm:col-span-12";
        }
    }

    // Xóa cụm "(ICD-10)" khỏi tiêu đề nếu có
    document.querySelectorAll("h3, p").forEach(el => {
        if (el.textContent && el.textContent.includes("(ICD-10)")) {
            el.textContent = el.textContent.replace(/\s*\(ICD-10\)/g, "");
        }
        if (el.textContent && el.textContent.includes("và chẩn đoán ICD-10")) {
            el.textContent = el.textContent.replace("và chẩn đoán ICD-10", "và kết luận chẩn đoán");
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Xóa thanh gọi loa màu xanh và xóa ô Mã bệnh ICD-10 trên giao diện Bác sĩ
    document.getElementById("doc-calling-banner")?.remove();
    document.querySelectorAll('button[onclick*="reCallCurrentDoctorPatient"]').forEach(btn => btn.remove());
    removeIcd10FieldFromDOM();

    const user = getCurrentUser();
    if (user) {
        const nameEl = document.getElementById("doc-sidebar-name");
        const dropNameEl = document.getElementById("doc-dropdown-name");
        const emailEl = document.getElementById("doc-sidebar-email");
        const initialsEl = document.getElementById("doc-sidebar-initials");
        const subEl = document.getElementById("doc-header-sub");
        const deptEl = document.getElementById("doc-dropdown-dept");
        const activeFilterBadge = document.getElementById("doc-active-filter-badge");

        const maNv = user.ma_nhan_vien || user.ma_nguoi_dung || "NV26112003";
        const tenKhoa = user.ten_khoa || "Khoa Khám Bệnh";

        if (nameEl && user.ho_ten) nameEl.textContent = user.ho_ten;
        if (dropNameEl && user.ho_ten) dropNameEl.textContent = user.ho_ten;
        if (emailEl && user.email) emailEl.textContent = user.email;
        if (initialsEl && user.ho_ten) initialsEl.textContent = getInitials(user.ho_ten);
        if (subEl) subEl.textContent = `Mã BS: #${maNv} • ${tenKhoa}`;
        if (deptEl) deptEl.textContent = `Mã BS: #${maNv} • ${tenKhoa}`;
        if (activeFilterBadge && user.ho_ten) {
            activeFilterBadge.textContent = `Bác sĩ phụ trách: ${user.ho_ten}`;
        }
    }

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const followUpInput = document.getElementById("exam-followup-date");
    if (followUpInput) {
        followUpInput.value = nextWeek.toISOString().substring(0, 10);
    }

    ensureDoctorTableQueueLayout();
    ensureDoctorConfirmModalDOM();
    loadDoctorDashboard();
});

function ensureDoctorTableQueueLayout() {
    const oldWaitingBtn = document.getElementById("qtab-waiting");
    if (oldWaitingBtn && oldWaitingBtn.parentElement) {
        oldWaitingBtn.parentElement.remove();
    }

    const queueSubview = document.getElementById("doc-subview-queue");
    if (!queueSubview || document.getElementById("doc-queue-tbody")) return;

    queueSubview.className = "hospital-card rounded-2xl p-6 space-y-4";
    queueSubview.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
                <h3 class="font-heading font-bold text-base text-teal-950">Bảng Danh Sách Bệnh Nhân Khám Bệnh</h3>
                <p class="text-xs text-slate-500">Tra cứu theo tên, mã hồ sơ, lọc theo trạng thái khám, lọc theo ngày tiếp nhận và sắp xếp thứ tự ngày</p>
            </div>
            <button type="button" onclick="clearDoctorQueueFilters()"
                    class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition">
                <span class="material-symbols-outlined text-sm">filter_alt_off</span>
                <span>Đặt lại bộ lọc</span>
            </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 p-3.5 rounded-xl bg-sky-50/60 border border-sky-200/80 text-xs">
            <div class="lg:col-span-4">
                <label class="font-bold text-slate-700 block mb-1">Tìm kiếm bệnh nhân</label>
                <input id="doc-queue-search" type="text" oninput="renderDoctorQueueList()"
                       placeholder="Nhập tên BN, Mã HS, Mã BN, VNeID, SĐT, BHYT..."
                       class="w-full h-9 px-3 rounded-lg border-slate-300 bg-white text-xs"/>
            </div>

            <div class="lg:col-span-3">
                <label class="font-bold text-slate-700 block mb-1">Lọc theo Trạng thái</label>
                <select id="doc-queue-status-select" onchange="setDoctorQueueFilter(this.value)"
                        class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-semibold text-slate-700">
                    <option value="WAITING">Chờ Bác sĩ khám / Đọc KQ CLS</option>
                    <option value="PROCESSING">Đang chờ đo SH / Làm CLS</option>
                    <option value="DONE">Đã hoàn tất khám</option>
                    <option value="ALL">-- Tất cả hồ sơ của tôi --</option>
                </select>
            </div>

            <div class="lg:col-span-3">
                <label class="font-bold text-slate-700 block mb-1">Lọc theo Ngày khám</label>
                <input id="doc-queue-date" type="date" onchange="renderDoctorQueueList()"
                       class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs"/>
            </div>

            <div class="lg:col-span-2">
                <label class="font-bold text-slate-700 block mb-1">Sắp xếp theo Ngày</label>
                <select id="doc-queue-sort" onchange="renderDoctorQueueList()"
                        class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-bold text-teal-700">
                    <option value="ASC">Từ đầu tới cuối (Cũ → Mới)</option>
                    <option value="DESC">Từ cuối về đầu (Mới → Cũ)</option>
                </select>
            </div>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                        <th class="p-3">STT / Mã HS</th>
                        <th class="p-3">Mã BN / VNeID</th>
                        <th class="p-3">Họ và tên</th>
                        <th class="p-3">Ngày sinh</th>
                        <th class="p-3">SĐT / Thẻ BHYT</th>
                        <th class="p-3">Chỉ số sinh hiệu</th>
                        <th class="p-3">Ngày tiếp nhận</th>
                        <th class="p-3">Triệu chứng / Chẩn đoán</th>
                        <th class="p-3">Trạng thái</th>
                        <th class="p-3 text-right">Thao tác</th>
                    </tr>
                </thead>
                <tbody id="doc-queue-tbody" class="divide-y divide-slate-200"></tbody>
            </table>
        </div>
    `;
}

function logoutDoctor() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

function openDoctorMenu(menuKey) {
    ensureDoctorTableQueueLayout();
    removeIcd10FieldFromDOM();

    const examSection = document.getElementById("doc-view-exam");
    const aiSection = document.getElementById("doc-view-ai");
    const recordsSection = document.getElementById("doc-view-records");

    const queueSubview = document.getElementById("doc-subview-queue");
    const formSubview = document.getElementById("doc-subview-form");

    const titleEl = document.getElementById("current-doc-workspace-title");

    if (examSection) examSection.classList.add("hidden");
    if (aiSection) aiSection.classList.add("hidden");
    if (recordsSection) recordsSection.classList.add("hidden");

    let activeTopNav = "exam";

    if (menuKey === "exam" || menuKey === "exam-queue") {
        activeTopNav = "exam";
        if (examSection) examSection.classList.remove("hidden");
        if (queueSubview) queueSubview.classList.remove("hidden");
        if (formSubview) formSubview.classList.add("hidden");
        if (titleEl) titleEl.textContent = "DANH SÁCH BỆNH NHÂN CHỜ KHÁM";
    } else if (menuKey === "exam-form") {
        activeTopNav = "exam";
        if (examSection) examSection.classList.remove("hidden");
        if (queueSubview) queueSubview.classList.add("hidden");
        if (formSubview) formSubview.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "TRANG KHÁM BỆNH & KÊ ĐƠN THUỐC ĐIỆN TỬ";

        if (!currentSelectedRecord && cachedDoctorData) {
            const records = cachedDoctorData.queue_records || [];
            const firstWaiting = records.find(r => isWaitingForDoctorStatus(r.trang_thai_hang_doi, r)) || records[0];
            if (firstWaiting) {
                populateDoctorExamForm(firstWaiting);
            }
        }
    } else if (menuKey === "ai") {
        activeTopNav = "ai";
        if (aiSection) aiSection.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "TRỢ LÝ AI HỘI CHẨN CẬN LÂM SÀNG & PHÁC ĐỒ";
    } else if (menuKey === "records") {
        activeTopNav = "records";
        if (recordsSection) recordsSection.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "TRA CỨU HỒ SƠ BỆNH ÁN CỦA TÔI";
    }

    const topNavMap = [
        { key: "exam", id: "top-nav-exam", badgeId: "badge-doc-waiting", badgeIdle: "bg-teal-600 text-white" },
        { key: "ai", id: "top-nav-ai", badgeId: null, badgeIdle: "" },
        { key: "records", id: "top-nav-records", badgeId: "badge-doc-total-records", badgeIdle: "bg-sky-600 text-white" }
    ];

    topNavMap.forEach(item => {
        const btn = document.getElementById(item.id);
        const badge = item.badgeId ? document.getElementById(item.badgeId) : null;
        if (!btn) return;
        if (item.key === activeTopNav) {
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-white bg-teal-600 shadow-xs flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = "px-1.5 py-0.2 rounded-full bg-white/25 text-white text-[10px] font-extrabold";
        } else {
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = `px-1.5 py-0.2 rounded-full ${item.badgeIdle} text-[10px] font-extrabold`;
        }
    });
}

function switchDoctorView(viewName) {
    if (viewName === "exam") openDoctorMenu("exam-queue");
    else openDoctorMenu(viewName);
}

function ensureDoctorConfirmModalDOM() {
    if (document.getElementById("doctor-confirm-modal")) return;
    const modal = document.createElement("div");
    modal.id = "doctor-confirm-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4";
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-teal-200 animate-[fadeIn_0.18s_ease-out]">
            <div id="dcm-header" class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative">
                <button type="button" onclick="closeDoctorConfirmModal()"
                        class="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
                <div class="w-14 h-14 rounded-full bg-white text-teal-600 flex items-center justify-center mx-auto mb-2 shadow-md">
                    <span id="dcm-icon" class="material-symbols-outlined text-3xl">verified</span>
                </div>
                <h3 id="dcm-title" class="font-heading font-extrabold text-lg">Đã Xác Nhận Thành Công</h3>
                <p id="dcm-subtitle" class="text-xs text-teal-50 mt-0.5">Dữ liệu đã được đồng bộ vào hệ thống MySQL</p>
            </div>
            <div class="p-6 space-y-4 text-xs sm:text-sm">
                <div id="dcm-body"></div>
                <button type="button" onclick="closeDoctorConfirmModal()"
                        class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-md transition flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined text-base">check</span>
                    <span>Đóng</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function showDoctorNoticeModal(title, message, isError = false, onClose = null) {
    ensureDoctorConfirmModalDOM();
    doctorModalCloseCallback = onClose;

    document.getElementById("dcm-header").className = isError
        ? "bg-gradient-to-r from-rose-600 to-amber-600 text-white px-6 py-5 text-center relative"
        : "bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative";
    document.getElementById("dcm-icon").textContent = isError ? "warning" : "verified";
    document.getElementById("dcm-title").textContent = title;
    document.getElementById("dcm-subtitle").textContent = isError
        ? "Vui lòng kiểm tra lại thông tin"
        : "Hệ thống Quản lý Khám chữa bệnh (HIS)";

    document.getElementById("dcm-body").innerHTML = `
        <div class="p-4 rounded-xl ${isError ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-teal-50/70 border-teal-200 text-slate-800'} border font-semibold text-center leading-relaxed">
            ${message}
        </div>
    `;

    const modal = document.getElementById("doctor-confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeDoctorConfirmModal() {
    const modal = document.getElementById("doctor-confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    if (typeof doctorModalCloseCallback === "function") {
        const cb = doctorModalCloseCallback;
        doctorModalCloseCallback = null;
        cb();
    }
}

function isWaitingForDoctorStatus(status, rec = null) {
    if (rec && getPendingClsOrders(rec).length > 0) {
        return false;
    }
    return ["ChoBSKham", "ChoKhamBS", "ChoBSDocCLS"].includes(status);
}

// =========================================================================
// 1. TẢI DỮ LIỆU PHÒNG KHÁM BÁC SĨ TỪ MYSQL
// =========================================================================
async function loadDoctorDashboard() {
    const user = getCurrentUser();
    const maBacSi = user ? (user.ma_nhan_vien || user.ma_nguoi_dung || "") : "";

    try {
        const res = await fetch(`${DOCTOR_API_BASE}/dashboard-data?ma_bac_si=${encodeURIComponent(maBacSi)}`, {
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        if (!res.ok || data.status !== "success") return;

        ensureDoctorTableQueueLayout();
        removeIcd10FieldFromDOM();

        const rawRecords = data.queue_records || [];
        const myRecords = (user
            ? rawRecords.filter(r => isRecordBelongToLoggedDoctor(r, user))
            : rawRecords
        ).map(r => {
            const pendingCls = getPendingClsOrders(r);
            if (pendingCls.length > 0 && r.trang_thai_hang_doi !== "HoanTat") {
                const hasUnpaid = pendingCls.some(c => c.trang_thai_nop_tien !== "DaNop");
                r.trang_thai_hang_doi = hasUnpaid ? "ChoThuTienCLS" : "ChoLamCLS";
            }
            return r;
        });

        data.queue_records = myRecords;
        cachedDoctorData = data;

        const waitingList = myRecords.filter(r => isWaitingForDoctorStatus(r.trang_thai_hang_doi, r));
        const processingList = myRecords.filter(r => ["ChoSinhHieu", "ChoThuTienCLS", "ChoLamCLS"].includes(r.trang_thai_hang_doi));
        const doneList = myRecords.filter(r => r.trang_thai_hang_doi === "HoanTat");

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setTxt("badge-doc-waiting", waitingList.length);
        setTxt("badge-doc-total-records", myRecords.length);

        setTxt("qcount-waiting", waitingList.length);
        setTxt("qcount-processing", processingList.length);
        setTxt("qcount-done", doneList.length);
        setTxt("qcount-all", myRecords.length);

        renderClsCatalogCheckboxes(data.cls_catalog || []);
        populateAiStockMedicinesText(data.medicine_catalog || []);
        renderDoctorQueueList();
        renderDoctorAllRecordsTable();

        if (currentSelectedRecord) {
            const updatedRec = myRecords.find(r => String(r.ma_ho_so_kham) === String(currentSelectedRecord.ma_ho_so_kham));
            if (updatedRec) {
                populateDoctorExamForm(updatedRec);
            } else {
                currentSelectedRecord = null;
            }
        }
    } catch (error) {
        console.error("Lỗi tải dữ liệu Bác sĩ:", error);
    }
}

function setDoctorQueueFilter(mode) {
    doctorQueueFilter = mode;
    const statusSelect = document.getElementById("doc-queue-status-select");
    if (statusSelect && statusSelect.value !== mode) {
        statusSelect.value = mode;
    }
    renderDoctorQueueList();
}

function clearDoctorQueueFilters() {
    const searchEl = document.getElementById("doc-queue-search");
    const dateEl = document.getElementById("doc-queue-date");
    const sortEl = document.getElementById("doc-queue-sort");
    if (searchEl) searchEl.value = "";
    if (dateEl) dateEl.value = "";
    if (sortEl) sortEl.value = "ASC";
    setDoctorQueueFilter("WAITING");
}

function renderDoctorQueueList() {
    if (!cachedDoctorData) return;
    ensureDoctorTableQueueLayout();

    const tbody = document.getElementById("doc-queue-tbody");
    if (!tbody) return;

    const keyword = (document.getElementById("doc-queue-search")?.value || "").toLowerCase().trim();
    const dateFilter = document.getElementById("doc-queue-date")?.value || "";
    const sortOrder = document.getElementById("doc-queue-sort")?.value || "ASC";

    const allRecords = cachedDoctorData.queue_records || [];

    const filtered = allRecords.filter(r => {
        if (doctorQueueFilter === "WAITING" && !isWaitingForDoctorStatus(r.trang_thai_hang_doi, r)) return false;
        if (doctorQueueFilter === "PROCESSING" && !["ChoSinhHieu", "ChoThuTienCLS", "ChoLamCLS"].includes(r.trang_thai_hang_doi)) return false;
        if (doctorQueueFilter === "DONE" && r.trang_thai_hang_doi !== "HoanTat") return false;

        if (dateFilter) {
            const recDate = extractRecordDateYmd(r);
            if (recDate !== dateFilter) return false;
        }

        if (keyword) {
            const matchName = (r.ten_benh_nhan || "").toLowerCase().includes(keyword);
            const matchHs = String(r.ma_ho_so_kham || "").toLowerCase().includes(keyword);
            const matchBn = String(r.ma_benh_nhan || "").toLowerCase().includes(keyword);
            const matchVneid = (r.vneid || "").toLowerCase().includes(keyword);
            const matchPhone = (r.so_dien_thoai || "").toLowerCase().includes(keyword);
            const matchBhyt = (r.so_the_bhyt || "").toLowerCase().includes(keyword);
            if (!matchName && !matchHs && !matchBn && !matchVneid && !matchPhone && !matchBhyt) return false;
        }
        return true;
    });

    filtered.sort((a, b) => {
        const dateA = extractRecordDateYmd(a);
        const dateB = extractRecordDateYmd(b);
        if (dateA !== dateB) {
            return sortOrder === "ASC" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        }
        const sttA = Number(a.so_thu_tu_kham || 0);
        const sttB = Number(b.so_thu_tu_kham || 0);
        return sortOrder === "ASC" ? sttA - sttB : sttB - sttA;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="p-8 text-center text-slate-500">
                    Không tìm thấy hồ sơ bệnh nhân nào phù hợp với bộ lọc hiện tại.
                </td>
            </tr>
        `;
        return;
    }

    const statusBadgeMap = {
        ChoBSDocCLS: { text: "Đã đủ KQ CLS • Chờ đọc", cls: "bg-purple-100 text-purple-800" },
        ChoBSKham: { text: "Đã đo SH • Chờ BS khám", cls: "bg-teal-100 text-teal-800" },
        ChoKhamBS: { text: "Đã đo SH • Chờ BS khám", cls: "bg-teal-100 text-teal-800" },
        ChoThuTienCLS: { text: "Chờ thu phí CLS", cls: "bg-amber-100 text-amber-800" },
        ChoLamCLS: { text: "Đang làm CLS", cls: "bg-indigo-100 text-indigo-800" },
        ChoSinhHieu: { text: "Chờ đo sinh hiệu", cls: "bg-slate-100 text-slate-700" },
        HoanTat: { text: "Đã hoàn tất khám", cls: "bg-emerald-100 text-emerald-800" }
    };

    tbody.innerHTML = filtered.map(r => {
        const pendingCls = getPendingClsOrders(r);
        let st = statusBadgeMap[r.trang_thai_hang_doi] || { text: r.trang_thai_hang_doi, cls: "bg-slate-100 text-slate-700" };
        if (pendingCls.length > 0 && r.trang_thai_hang_doi !== "HoanTat") {
            st = {
                text: `Đang chờ ${pendingCls.length}/${(r.cls_orders || []).length} KQ CLS`,
                cls: "bg-amber-100 text-amber-800"
            };
        }

        const isDone = r.trang_thai_hang_doi === "HoanTat";
        const recDate = extractRecordDateYmd(r) || "-";
        const recTime = r.thoi_gian_tiep_nhan && String(r.thoi_gian_tiep_nhan).length > 10
            ? String(r.thoi_gian_tiep_nhan).substring(11, 16)
            : "";

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3">
                    <span class="inline-block px-2 py-0.5 rounded bg-teal-600 text-white font-extrabold text-[11px]">
                        STT #${r.so_thu_tu_kham || 1}
                    </span>
                    <div class="font-bold text-teal-800 mt-1">Hồ sơ: #${r.ma_ho_so_kham}</div>
                </td>
                <td class="p-3 font-bold text-teal-700">
                    Mã BN: #${r.ma_benh_nhan}<br/>
                    <span class="text-[10px] font-mono text-indigo-700">VNeID: ${r.vneid || "-"}</span>
                </td>
                <td class="p-3 font-bold text-slate-900 uppercase">
                    ${r.ten_benh_nhan || "-"}<br/>
                    <span class="text-[11px] font-semibold text-emerald-700 normal-case">Phòng ${r.so_phong || "P102"} (${r.ten_khoa || ""})</span>
                </td>
                <td class="p-3">
                    ${r.ngay_sinh ? String(r.ngay_sinh).substring(0, 10) : "-"}<br/>
                    <span class="text-[11px] text-slate-500">(${r.gioi_tinh || "Nam"})</span>
                </td>
                <td class="p-3">
                    <div class="font-semibold text-slate-800">${r.so_dien_thoai || "-"}</div>
                    <div class="text-[11px] font-bold text-teal-700">${r.so_the_bhyt || "<span class='text-slate-400 font-normal'>Không BHYT</span>"}</div>
                </td>
                <td class="p-3 text-[11px] leading-relaxed">
                    Mạch: <b class="text-teal-700">${r.mach || "--"} l/p</b> • T: <b class="text-rose-600">${r.nhiet_do || "--"}°C</b><br/>
                    HA: <b class="text-sky-700">${r.huyet_ap || "--"}</b> • CN: <b>${r.can_nang || "--"}kg</b>
                </td>
                <td class="p-3">
                    <b class="text-slate-900">${recDate}</b><br/>
                    <span class="text-[11px] text-slate-500">${recTime ? "Giờ: " + recTime : "Trong ngày"}</span>
                </td>
                <td class="p-3 max-w-[220px]">
                    <div class="text-slate-800 truncate" title="${r.trieu_chung_lam_sang || ''}">
                        ${r.trieu_chung_lam_sang || "-"}
                    </div>
                    ${r.ket_luan_chan_doan ? `<div class="text-[11px] font-bold text-emerald-700 truncate mt-0.5" title="${r.ket_luan_chan_doan}">${r.ket_luan_chan_doan}</div>` : ""}
                </td>
                <td class="p-3">
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-bold inline-block whitespace-nowrap ${st.cls}">
                        ${st.text}
                    </span>
                </td>
                <td class="p-3 text-right">
                    <button type="button" onclick="selectPatientRecordForExam('${r.ma_ho_so_kham}')"
                            class="px-3 py-1.5 rounded-lg ${isDone ? 'bg-slate-100 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-300' : 'bg-teal-600 hover:bg-teal-700 text-white'} font-bold text-xs inline-flex items-center gap-1 transition whitespace-nowrap">
                        <span class="material-symbols-outlined text-sm">${isDone ? 'edit_note' : 'stethoscope'}</span>
                        <span>${isDone ? 'Xem / Sửa' : 'Khám bệnh'}</span>
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

// =========================================================================
// 2. CHUYỂN SANG TRANG KHÁM BỆNH & KIỂM TRA CHẶN HOÀN TẤT NẾU THIẾU KQ CLS
// =========================================================================
function selectPatientRecordForExam(maHoSoKham) {
    if (!cachedDoctorData) return;
    const rec = (cachedDoctorData.queue_records || []).find(r => String(r.ma_ho_so_kham) === String(maHoSoKham));
    if (!rec) return;

    currentSelectedRecord = rec;
    openDoctorMenu("exam-form");
    populateDoctorExamForm(rec);
}

function populateDoctorExamForm(rec) {
    currentSelectedRecord = rec;
    removeIcd10FieldFromDOM();

    document.getElementById("exam-badge-ba").textContent = `Hồ sơ khám #${rec.ma_ho_so_kham} • STT #${rec.so_thu_tu_kham}`;
    document.getElementById("exam-badge-room").textContent = `Phòng ${rec.so_phong || "P102"} - ${rec.ten_khoa || ""}`;
    document.getElementById("exam-patient-name").textContent = `${rec.ten_benh_nhan} (Mã BN: #${rec.ma_benh_nhan})`;
    document.getElementById("exam-patient-meta").innerHTML = `
        VNeID: <b class="text-indigo-700">${rec.vneid || "-"}</b>
        • Ngày sinh: <b>${rec.ngay_sinh ? String(rec.ngay_sinh).substring(0, 10) : "-"}</b> (${rec.gioi_tinh || "Nam"})
        • SĐT: <b>${rec.so_dien_thoai || "-"}</b>
        • Thẻ BHYT: <b class="text-teal-700">${rec.so_the_bhyt || "Không có BHYT"}</b> (${rec.noi_dang_ky_bhyt || "TTYT Phường Hải Châu"})
    `;

    document.getElementById("exam-vital-pulse").textContent = rec.mach || "--";
    document.getElementById("exam-vital-temp").textContent = rec.nhiet_do || "--";
    document.getElementById("exam-vital-bp").textContent = rec.huyet_ap || "--";
    document.getElementById("exam-vital-resp").textContent = rec.nhip_tho || "--";
    document.getElementById("exam-vital-weight").textContent = rec.can_nang || "--";
    document.getElementById("exam-vital-height").textContent = rec.chieu_cao || "--";

    const allergyStr = rec.tien_su_di_ung_benh_nen || "Không dị ứng thuốc";
    document.getElementById("exam-allergy-text").textContent = allergyStr;
    document.getElementById("exam-ai-summary-text").textContent =
        rec.tom_tat_benh_su_ai || `Triệu chứng ban đầu: ${rec.trieu_chung_lam_sang || "Khám lâm sàng"}`;

    document.getElementById("exam-clinical-symptoms").value = rec.trieu_chung_lam_sang || "";
    const cleanDiag = String(rec.ket_luan_chan_doan || "").replace(/^\[[A-Za-z0-9.]+\]\s*/, "");
    document.getElementById("exam-final-diagnosis").value = cleanDiag;

    document.getElementById("exam-doctor-advice").value =
        rec.loi_dan_bac_si || "Uống thuốc đúng liều sau ăn no, uống nhiều nước ấm, tái khám nếu triệu chứng không giảm.";

    renderExistingClsResultsForRecord(rec.cls_orders || []);

    // Khóa nút Hoàn tất khám nếu còn dịch vụ CLS chưa cập nhật kết quả
    const pendingClsList = getPendingClsOrders(rec);
    const submitBtn = document.querySelector('#doc-complete-exam-form button[type="submit"]');
    if (submitBtn) {
        if (pendingClsList.length > 0) {
            submitBtn.disabled = true;
            submitBtn.className = "w-full py-3.5 rounded-xl bg-amber-500 text-white font-extrabold text-sm shadow flex items-center justify-center gap-2 cursor-not-allowed";
            submitBtn.innerHTML = `<span class="material-symbols-outlined text-xl">hourglass_top</span><span>CHƯA THỂ HOÀN TẤT KHÁM • CÒN ${pendingClsList.length} DỊCH VỤ CLS CHƯA CẬP NHẬT KẾT QUẢ TỪ PHÒNG CLS</span>`;
        } else {
            submitBtn.disabled = false;
            submitBtn.className = "w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition";
            submitBtn.innerHTML = `<span class="material-symbols-outlined text-xl">verified</span><span>HOÀN TẤT KHÁM BỆNH • LƯU BỆNH ÁN & CHUYỂN ĐƠN THUỐC SANG KẾ TOÁN / DƯỢC</span>`;
        }
    }

    const presContainer = document.getElementById("prescription-rows-container");
    presContainer.innerHTML = "";
    if (rec.prescription_items && rec.prescription_items.length > 0) {
        rec.prescription_items.forEach(item => {
            addPrescriptionRow(item.ma_thuoc, item.so_luong, item.lieu_dung_huong_dan);
        });
    } else {
        addPrescriptionRow();
    }

    document.getElementById("ai-consult-allergy").value = allergyStr;
    const clsSummaryText = (rec.cls_orders || [])
        .map(c => `${c.ten_dich_vu_cls}: ${c.ket_qua_cls || "Đang chờ kết quả"}`)
        .join("; ");
    document.getElementById("ai-consult-question").value =
        `Bệnh nhân ${rec.ten_benh_nhan} (${rec.gioi_tinh}), triệu chứng: ${rec.trieu_chung_lam_sang || ""}. ` +
        `Sinh hiệu: Mạch ${rec.mach || 80} l/p, Nhiệt độ ${rec.nhiet_do || 37}°C, HA ${rec.huyet_ap || "120/80"} mmHg. ` +
        (clsSummaryText ? `Kết quả Cận lâm sàng: ${clsSummaryText}. ` : "") +
        `Hãy gợi ý chẩn đoán xác định, phác đồ xử trí và đề xuất đơn thuốc phù hợp trong kho.`;
}

function reCallCurrentDoctorPatient() {
    // Đã tắt thanh thông báo gọi loa theo yêu cầu
}

// =========================================================================
// 3. CHỈ ĐỊNH CẬN LÂM SÀNG & XEM ĐA ẢNH KẾT QUẢ CLS
// =========================================================================
function renderClsCatalogCheckboxes(catalog) {
    const box = document.getElementById("doc-cls-catalog-checkboxes");
    if (!box) return;
    box.innerHTML = catalog.map(c => `
        <label class="p-2.5 rounded-xl bg-white border border-indigo-200 hover:border-indigo-500 flex items-start gap-2 cursor-pointer transition">
            <input type="checkbox" name="doc_cls_check" value="${c.ma_dich_vu_cls}" class="mt-0.5 rounded text-indigo-600 focus:ring-0"/>
            <div>
                <span class="font-bold text-slate-900 block">${c.ten_dich_vu_cls}</span>
                <span class="text-[11px] text-indigo-700 font-bold">${Number(c.don_gia_cls).toLocaleString("vi-VN")}đ • Phòng ${c.so_phong || "P201"}</span>
            </div>
        </label>
    `).join("");
}

function renderExistingClsResultsForRecord(clsOrders) {
    const container = document.getElementById("doc-existing-cls-results");
    if (!clsOrders || clsOrders.length === 0) {
        container.innerHTML = `
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-400 italic">
                Hồ sơ này hiện chưa có chỉ định Cận lâm sàng nào.
            </div>
        `;
        return;
    }

    container.innerHTML = clsOrders.map(c => {
        const isDone = c.trang_thai_thuc_hien === "DaCoKetQua" && c.ket_qua_cls && String(c.ket_qua_cls).trim() !== "";
        const isPaid = c.trang_thai_nop_tien === "DaNop";
        const phongCls = c.phong_cls || "P201";

        const imgsHtml = (c.images && c.images.length > 0)
            ? `<div class="flex flex-wrap gap-2.5 mt-2.5">` +
                c.images.map(img => `
                    <a href="${img.duong_dan_anh_cls}" target="_blank" class="group relative block">
                        <img src="${img.duong_dan_anh_cls}" class="w-24 h-24 object-cover rounded-xl border-2 border-indigo-300 shadow-sm group-hover:scale-105 transition"/>
                        <span class="block text-[10px] text-slate-600 mt-1 max-w-[96px] truncate">${img.ghi_chu_anh || "Ảnh CLS"}</span>
                    </a>
                `).join("") +
              `</div>`
            : "";

        return `
            <div class="p-3.5 rounded-xl border ${isDone ? 'bg-emerald-50/50 border-emerald-200' : 'bg-amber-50/50 border-amber-200'} text-xs space-y-1.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="font-bold text-indigo-950 text-sm">${c.ten_dich_vu_cls} (#${c.ma_chi_dinh_cls})</span>
                    <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-900'}">
                            ${isPaid ? 'Đã nộp phí' : 'Chờ Kế toán thu phí'}
                        </span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isDone ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}">
                            ${isDone ? 'Đã có kết quả' : `Chờ Phòng ${phongCls} thực hiện`}
                        </span>
                    </div>
                </div>
                <p class="text-slate-800"><b>Kết quả mô tả:</b> ${c.ket_qua_cls || `<i>Đang chờ Kỹ thuật viên ${phongCls} cập nhật...</i>`}</p>
                ${c.ai_phan_tich_cls ? `<p class="text-indigo-800"><b>Ghi chú CLS:</b> ${c.ai_phan_tich_cls}</p>` : ""}
                ${imgsHtml}
            </div>
        `;
    }).join("");
}

async function submitDoctorOrderCls() {
    if (!currentSelectedRecord) {
        showDoctorNoticeModal("Chưa Chọn Bệnh Nhân", "Vui lòng chọn một bệnh nhân từ Danh sách chờ khám trước!", true);
        return;
    }

    const checkedBoxes = Array.from(document.querySelectorAll('input[name="doc_cls_check"]:checked'));
    if (checkedBoxes.length === 0) {
        showDoctorNoticeModal("Chưa Chọn Dịch Vụ CLS", "Vui lòng tích chọn ít nhất 1 dịch vụ Cận lâm sàng!", true);
        return;
    }

    const clsIds = checkedBoxes.map(cb => cb.value.trim());
    const user = getCurrentUser();

    try {
        const res = await fetch(`${DOCTOR_API_BASE}/order-cls`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ma_ho_so_kham: currentSelectedRecord.ma_ho_so_kham,
                ma_bac_si: user ? (user.ma_nhan_vien || user.ma_nguoi_dung) : "NV26112003",
                cls_service_ids: clsIds,
                trieu_chung_lam_sang: document.getElementById("exam-clinical-symptoms").value.trim()
            })
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showDoctorNoticeModal("Lỗi Chỉ Định CLS", data.message || "Không thể lập chỉ định CLS!", true);
            return;
        }

        checkedBoxes.forEach(cb => (cb.checked = false));
        await loadDoctorDashboard();
        showDoctorNoticeModal(
            "Đã Lập Chỉ Định Cận Lâm Sàng",
            data.message,
            false,
            () => {
                openDoctorMenu("exam-queue");
            }
        );
    } catch (e) {
        showDoctorNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel!", true);
    }
}

// =========================================================================
// 4. KÊ ĐƠN THUỐC ĐIỆN TỬ & HOÀN TẤT BỆNH ÁN (KHÔNG DÙNG MÃ ICD-10)
// =========================================================================
function addPrescriptionRow(selectedMedId = null, quantity = 10, dosage = "Ngày uống 2 lần, mỗi lần 1 viên (Sáng - Tối sau ăn)") {
    if (!cachedDoctorData) return;
    const container = document.getElementById("prescription-rows-container");
    const meds = cachedDoctorData.medicine_catalog || [];

    const row = document.createElement("div");
    row.className = "prescription-item-row grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-teal-200";

    const optionsHtml = meds.map(m => `
        <option value="${m.ma_thuoc}" ${String(selectedMedId) === String(m.ma_thuoc) ? 'selected' : ''}>
            ${m.ten_thuoc} (${m.don_vi_tinh} • ${Number(m.don_gia_thuoc).toLocaleString("vi-VN")}đ • Tồn: ${m.so_luong_ton_kho})
        </option>
    `).join("");

    row.innerHTML = `
        <div class="sm:col-span-5">
            <select class="pres-med-id w-full h-9 px-2.5 rounded-lg border-slate-300 text-xs font-bold text-slate-800">
                ${optionsHtml}
            </select>
        </div>
        <div class="sm:col-span-2">
            <input type="number" min="1" value="${quantity}" placeholder="Số lượng"
                   class="pres-med-qty w-full h-9 px-2.5 rounded-lg border-slate-300 text-xs font-bold text-center text-teal-700"/>
        </div>
        <div class="sm:col-span-4">
            <input type="text" value="${dosage}" placeholder="Liều dùng & cách uống..."
                   class="pres-med-dosage w-full h-9 px-2.5 rounded-lg border-slate-300 text-xs"/>
        </div>
        <div class="sm:col-span-1 text-right">
            <button type="button" onclick="this.closest('.prescription-item-row').remove()"
                    class="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-bold text-sm transition">
                ×
            </button>
        </div>
    `;
    container.appendChild(row);
}

async function submitCompleteExamination(event) {
    event.preventDefault();
    if (!currentSelectedRecord) {
        showDoctorNoticeModal("Chưa Chọn Bệnh Nhân", "Vui lòng chọn một bệnh nhân từ Danh sách chờ khám trước!", true);
        return;
    }

    const pendingCls = getPendingClsOrders(currentSelectedRecord);
    if (pendingCls.length > 0) {
        showDoctorNoticeModal(
            "Chưa Đủ Kết Quả Cận Lâm Sàng",
            `Hồ sơ #${currentSelectedRecord.ma_ho_so_kham} vẫn còn ${pendingCls.length} dịch vụ Cận lâm sàng chưa cập nhật kết quả (${pendingCls.map(c => c.ten_dich_vu_cls).join(", ")}). Vui lòng đợi Phòng Cận lâm sàng cập nhật đủ kết quả trước khi hoàn tất khám!`,
            true
        );
        return;
    }

    const medRows = Array.from(document.querySelectorAll(".prescription-item-row"));
    const medicines = medRows.map(r => ({
        ma_thuoc: r.querySelector(".pres-med-id").value.trim(),
        so_luong: parseInt(r.querySelector(".pres-med-qty").value || "1", 10),
        lieu_dung_huong_dan: r.querySelector(".pres-med-dosage").value.trim()
    })).filter(m => m.ma_thuoc !== "");

    const user = getCurrentUser();
    const finalDiag = document.getElementById("exam-final-diagnosis").value.trim();

    const payload = {
        ma_ho_so_kham: currentSelectedRecord.ma_ho_so_kham,
        ma_bac_si: user ? (user.ma_nhan_vien || user.ma_nguoi_dung) : "NV26112003",
        trieu_chung_lam_sang: document.getElementById("exam-clinical-symptoms").value.trim(),
        ket_luan_chan_doan: finalDiag,
        loi_dan_bac_si: document.getElementById("exam-doctor-advice").value.trim(),
        ngay_hen_tai_kham: document.getElementById("exam-followup-date").value || null,
        medicines: medicines
    };

    try {
        const res = await fetch(`${DOCTOR_API_BASE}/complete-exam`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showDoctorNoticeModal("Lỗi Hoàn Tất Khám", data.message || "Lỗi khi hoàn tất khám bệnh!", true);
            return;
        }

        await loadDoctorDashboard();

        showDoctorNoticeModal(
            "Đã Hoàn Tất Khám & Kê Đơn",
            data.message,
            false,
            () => {
                openDoctorMenu("exam-queue");
            }
        );
    } catch (e) {
        showDoctorNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel!", true);
    }
}

// =========================================================================
// 5. TRỢ LÝ AI HỘI CHẨN CẬN LÂM SÀNG & PHÁC ĐỒ (FASTAPI CỔNG 8001)
// =========================================================================
function populateAiStockMedicinesText(meds) {
    const el = document.getElementById("ai-consult-stock-meds");
    if (!el) return;
    el.value = meds.map(m => `${m.ten_thuoc} (${m.hoat_chat || m.don_vi_tinh}, tồn: ${m.so_luong_ton_kho})`).join("; ");
}

async function submitDoctorAiConsult() {
    const question = document.getElementById("ai-consult-question").value.trim();
    if (!question) {
        showDoctorNoticeModal("Thiếu Câu Hỏi Hội Chẩn", "Vui lòng nhập câu hỏi hoặc thông tin lâm sàng cần hội chẩn!", true);
        return;
    }

    const btn = document.getElementById("btn-run-ai-consult");
    const resultBox = document.getElementById("ai-consult-result-box");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Bác sĩ AI đang phân tích hình ảnh CLS & phác đồ...</span>`;
    resultBox.textContent = "⏳ Đang gửi dữ liệu lâm sàng và hình ảnh CLS sang Server AI (Cổng 8001)...";

    const formData = new FormData();
    formData.append("question", question);
    formData.append("tien_su_di_ung", document.getElementById("ai-consult-allergy").value.trim() || "Không có");
    formData.append("danh_muc_thuoc_kho", document.getElementById("ai-consult-stock-meds").value);

    const fileInput = document.getElementById("ai-consult-files");
    if (fileInput && fileInput.files.length > 0) {
        Array.from(fileInput.files).forEach(f => {
            formData.append("cls_images", f);
        });
    }

    try {
        const res = await fetch(AI_DOCTOR_CONSULT_URL, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        resultBox.textContent = data.ai_consultation || "Đã hoàn tất phân tích hội chẩn.";
    } catch (error) {
        resultBox.textContent = "⚠️ Không kết nối được tới Server AI (Cổng 8001). Hãy kiểm tra cửa sổ chạy lệnh uvicorn!";
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-lg">psychology</span><span>GỬI AI PHÂN TÍCH CẬN LÂM SÀNG & ĐỀ XUẤT PHÁC ĐỒ</span>`;
    }
}

function applyAiSuggestionToExamForm() {
    const aiText = document.getElementById("ai-consult-result-box").textContent.trim();
    if (!aiText || aiText.startsWith("Hãy chọn")) return;

    document.getElementById("exam-doctor-advice").value = aiText.substring(0, 450);
    openDoctorMenu("exam-form");
    showDoctorNoticeModal("Đã Chép Lời Dặn AI", "Đã chép tóm tắt hội chẩn AI sang mục Lời dặn của Bác sĩ!");
}

// =========================================================================
// 6. TRA CỨU HỒ SƠ BỆNH ÁN & XEM LỊCH SỬ KHÁM CŨ
// =========================================================================
function clearDoctorAllRecordsFilters() {
    const kwEl = document.getElementById("doc-all-records-search");
    const dateEl = document.getElementById("doc-all-records-date");
    if (kwEl) kwEl.value = "";
    if (dateEl) dateEl.value = "";
    renderDoctorAllRecordsTable();
}

function renderDoctorAllRecordsTable() {
    if (!cachedDoctorData) return;
    const tbody = document.getElementById("doc-all-records-tbody");
    if (!tbody) return;

    const keyword = (document.getElementById("doc-all-records-search")?.value || "").toLowerCase().trim();
    const dateFilter = document.getElementById("doc-all-records-date")?.value || "";

    const list = (cachedDoctorData.queue_records || []).filter(r => {
        if (dateFilter && extractRecordDateYmd(r) !== dateFilter) return false;
        if (!keyword) return true;
        return (r.ten_benh_nhan || "").toLowerCase().includes(keyword) ||
               String(r.ma_ho_so_kham || "").toLowerCase().includes(keyword) ||
               String(r.ma_benh_nhan || "").toLowerCase().includes(keyword) ||
               (r.vneid || "").toLowerCase().includes(keyword) ||
               (r.so_the_bhyt || "").toLowerCase().includes(keyword) ||
               (r.ket_luan_chan_doan || "").toLowerCase().includes(keyword);
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">Không tìm thấy hồ sơ bệnh án nào khớp với bộ lọc.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(r => `
        <tr class="hover:bg-slate-50">
            <td class="p-3.5 font-bold text-teal-700">Hồ sơ #${r.ma_ho_so_kham}<br/><span class="text-[10px] text-slate-400">STT #${r.so_thu_tu_kham}</span></td>
            <td class="p-3.5 font-bold text-slate-900">${r.ten_benh_nhan || "-"} (Mã BN: #${r.ma_benh_nhan})<br/><span class="text-[11px] text-indigo-700 font-normal">VNeID: ${r.vneid || "-"}</span></td>
            <td class="p-3.5 font-semibold text-emerald-700">${r.so_the_bhyt || "<span class='text-slate-400'>Không có</span>"}</td>
            <td class="p-3.5">Phòng ${r.so_phong || "-"}<br/><span class="text-[11px] text-slate-500">${r.ten_khoa || ""}</span></td>
            <td class="p-3.5 text-[11px]">M: <b>${r.mach || "-"}</b> • T: <b>${r.nhiet_do || "-"}°C</b><br/>HA: <b>${r.huyet_ap || "-"}</b></td>
            <td class="p-3.5 font-semibold text-slate-800">${extractRecordDateYmd(r) || "-"}</td>
            <td class="p-3.5 max-w-xs">${r.ket_luan_chan_doan || r.trieu_chung_lam_sang || "-"}</td>
            <td class="p-3.5"><span class="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 font-bold text-[11px]">${r.trang_thai_hang_doi}</span></td>
            <td class="p-3.5 text-right">
                <button type="button" onclick="openRecordFromLookup('${r.ma_ho_so_kham}')"
                        class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition">
                    Mở khám
                </button>
            </td>
        </tr>
    `).join("");
}

function openRecordFromLookup(maHoSoKham) {
    selectPatientRecordForExam(maHoSoKham);
}

async function openPatientHistoryModal() {
    if (!currentSelectedRecord) {
        showDoctorNoticeModal("Chưa Chọn Bệnh Nhân", "Vui lòng chọn một bệnh nhân từ Danh sách chờ khám để xem lịch sử khám cũ!", true);
        return;
    }

    const modal = document.getElementById("patient-history-modal");
    const listBox = document.getElementById("patient-history-list");
    const titleEl = document.getElementById("history-modal-title");

    if (titleEl) {
        titleEl.textContent = `Lịch Sử Khám: ${currentSelectedRecord.ten_benh_nhan} (Mã BN: #${currentSelectedRecord.ma_benh_nhan})`;
    }
    if (listBox) {
        listBox.innerHTML = `<div class="p-4 text-center text-slate-400">Đang tải lịch sử khám từ MySQL...</div>`;
    }
    if (modal) modal.classList.remove("hidden");

    try {
        const res = await fetch(`${DOCTOR_API_BASE}/patient-history/${encodeURIComponent(currentSelectedRecord.ma_benh_nhan)}`, {
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        const history = data.history || [];

        if (history.length === 0) {
            listBox.innerHTML = `<div class="p-4 text-center text-slate-500">Bệnh nhân chưa có lịch sử khám cũ.</div>`;
            return;
        }

        listBox.innerHTML = history.map(h => `
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-teal-700">Hồ sơ #${h.ma_ho_so_kham} • Phòng ${h.so_phong || "P102"} (${h.ten_khoa || ""})</span>
                    <span class="text-[11px] text-slate-500">${h.thoi_gian_tiep_nhan || ""}</span>
                </div>
                <p><b>Triệu chứng:</b> ${h.trieu_chung_lam_sang || "-"}</p>
                <p><b>Chẩn đoán:</b> <span class="text-emerald-700 font-bold">${h.ket_luan_chan_doan || "Đang khám"}</span></p>
                <p><b>Lời dặn BS:</b> ${h.loi_dan_bac_si || "-"}</p>
            </div>
        `).join("");
    } catch (e) {
        listBox.innerHTML = `<div class="p-4 text-center text-rose-600">Không thể tải lịch sử khám của bệnh nhân.</div>`;
    }
}

function closePatientHistoryModal() {
    const modal = document.getElementById("patient-history-modal");
    if (modal) modal.classList.add("hidden");
}