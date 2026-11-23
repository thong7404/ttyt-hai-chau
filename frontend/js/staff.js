const STAFF_API_BASE = "http://127.0.0.1:8000/api/staff";
const AI_OCR_BHYT_URL = "http://127.0.0.1:8001/api/ai/ocr-bhyt";
const AI_SUMMARIZE_URL = "http://127.0.0.1:8001/api/ai/summarize-visit";

let bhytFrontFile = null;
let bhytBackFile = null;
let selectedClsImages = [];
let cachedDashboardData = null;

let vitalsStatusFilter = "ChoDo";
let currentVitalsPatient = null;

let clsStatusFilter = "ChoLam";
let currentClsOrder = null;

let staffModalCloseCallback = null;

function getCurrentUser() {
    try {
        const raw = localStorage.getItem("current_user");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function getInitials(name) {
    if (!name) return "NV";
    const clean = name.replace(/^(BS\.CKI|BS\.CKII|BS\.|ThS\.BS|ĐD\.|KTV\.|DS\.|KT\.)\s*/i, "").trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
}

/**
 * Lấy ngày hiện tại chuẩn YYYY-MM-DD
 */
function getTodayYmdStaff() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Tính số ngày còn lại tính đến ngày hẹn
 */
function calcDaysUntilAppointment(ngayHenYmd) {
    const todayYmd = getTodayYmdStaff();
    const d1 = new Date(todayYmd + "T00:00:00");
    const d2 = new Date(ngayHenYmd + "T00:00:00");
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function extractVitalsDateYmd(hs) {
    const raw = hs.thoi_gian_tiep_nhan || hs.thoi_gian_do || "";
    return String(raw).substring(0, 10);
}

function extractClsDateYmd(cd) {
    if (cd.thoi_gian_co_ket_qua) return String(cd.thoi_gian_co_ket_qua).substring(0, 10);
    if (cd.thoi_gian_tiep_nhan) return String(cd.thoi_gian_tiep_nhan).substring(0, 10);
    if (cachedDashboardData && Array.isArray(cachedDashboardData.danh_sach_sinh_hieu)) {
        const hs = cachedDashboardData.danh_sach_sinh_hieu.find(
            r => String(r.ma_ho_so_kham) === String(cd.ma_ho_so_kham)
        );
        if (hs && hs.thoi_gian_tiep_nhan) {
            return String(hs.thoi_gian_tiep_nhan).substring(0, 10);
        }
    }
    return "";
}

document.addEventListener("DOMContentLoaded", () => {
    const user = getCurrentUser();
    if (user) {
        const nameEl = document.getElementById("staff-header-name");
        const subEl = document.getElementById("staff-header-sub");
        const initialsEl = document.getElementById("staff-avatar-initials");
        const dropNameEl = document.getElementById("staff-dropdown-name");
        const dropEmailEl = document.getElementById("staff-dropdown-email");
        const dropDeptEl = document.getElementById("staff-dropdown-dept");

        const maNv = user.ma_nhan_vien || user.ma_nguoi_dung || "NV26112002";
        const tenKhoa = user.ten_khoa || "Phòng P101";

        if (nameEl && user.ho_ten) nameEl.textContent = user.ho_ten;
        if (subEl) subEl.textContent = `Mã NV: #${maNv} • ${tenKhoa}`;
        if (initialsEl && user.ho_ten) initialsEl.textContent = getInitials(user.ho_ten);
        if (dropNameEl && user.ho_ten) dropNameEl.textContent = user.ho_ten;
        if (dropEmailEl && user.email) dropEmailEl.textContent = user.email;
        if (dropDeptEl) dropDeptEl.textContent = `Mã NV: #${maNv} • ${tenKhoa}`;
    }

    document.getElementById("vitals-calling-banner")?.remove();
    document.getElementById("cls-calling-banner")?.remove();
    document.querySelectorAll('button[onclick*="reAnnounceCurrent"]').forEach(btn => btn.remove());

    ensureUnifiedVitalsLayout();
    ensureUnifiedClsLayout();
    ensureStaffConfirmModalDOM();
    loadStaffDashboard();
});

// =========================================================================
// HỆ THỐNG BẢNG THÔNG BÁO XÁC NHẬN (MODAL) CHO CẢ 3 NGHIỆP VỤ
// =========================================================================
function ensureStaffConfirmModalDOM() {
    if (document.getElementById("staff-confirm-modal")) return;

    const modal = document.createElement("div");
    modal.id = "staff-confirm-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4";
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-teal-200 animate-[fadeIn_0.18s_ease-out]">
            <div id="scm-header" class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative">
                <button type="button" onclick="closeStaffConfirmModal()"
                        class="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
                <div id="scm-icon-wrap" class="w-14 h-14 rounded-full bg-white text-emerald-600 flex items-center justify-center mx-auto mb-2.5 shadow-md">
                    <span id="scm-icon" class="material-symbols-outlined text-4xl">check_circle</span>
                </div>
                <h3 id="scm-title" class="font-heading font-extrabold text-lg">Đã Xác Nhận Thành Công</h3>
                <p id="scm-subtitle" class="text-xs text-teal-50 mt-0.5">Dữ liệu đã được đồng bộ vào hệ thống MySQL</p>
            </div>

            <div class="p-6 space-y-4 text-xs sm:text-sm">
                <div id="scm-body"></div>

                <div class="pt-1 flex justify-end">
                    <button type="button" onclick="closeStaffConfirmModal()"
                            class="w-full py-3 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-md transition flex items-center justify-center gap-1.5">
                        <span class="material-symbols-outlined text-base">check</span>
                        <span>Đóng</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeStaffConfirmModal() {
    const modal = document.getElementById("staff-confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    if (typeof staffModalCloseCallback === "function") {
        const cb = staffModalCloseCallback;
        staffModalCloseCallback = null;
        cb();
    }
}

function showReceptionSuccessModal(info, onClose = null) {
    ensureStaffConfirmModalDOM();
    staffModalCloseCallback = onClose;

    document.getElementById("scm-header").className = "bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative";
    document.getElementById("scm-icon-wrap").className = "w-14 h-14 rounded-full bg-white text-emerald-600 flex items-center justify-center mx-auto mb-2.5 shadow-md";
    document.getElementById("scm-icon").textContent = "how_to_reg";
    document.getElementById("scm-title").textContent = "Đã Xác Nhận Tiếp Nhận & Cấp Số";
    document.getElementById("scm-subtitle").textContent = "Bệnh nhân đã được chuyển sang Danh sách Chờ đo sinh hiệu";

    document.getElementById("scm-body").innerHTML = `
        <div class="overflow-hidden rounded-xl border border-slate-200">
            <table class="w-full text-left border-collapse text-xs sm:text-sm">
                <tbody class="divide-y divide-slate-200">
                    <tr class="bg-teal-50/70">
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600 w-2/5">Số thứ tự khám</th>
                        <td class="py-2.5 px-3.5">
                            <span class="inline-block px-3 py-0.5 rounded-lg bg-teal-600 text-white font-extrabold text-sm">
                                STT #${info.so_thu_tu_kham}
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Mã hồ sơ khám</th>
                        <td class="py-2.5 px-3.5 font-extrabold text-teal-800">
                            #${info.ma_ho_so_kham} <span class="text-xs font-semibold text-slate-500">(Mã BN: #${info.ma_benh_nhan})</span>
                        </td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Họ và tên bệnh nhân</th>
                        <td class="py-2.5 px-3.5 font-bold text-slate-900 uppercase">${info.ho_ten || "-"}</td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Số điện thoại / BHYT</th>
                        <td class="py-2.5 px-3.5 font-semibold text-slate-700">
                            ${info.so_dien_thoai || "-"} • <span class="text-teal-700">${info.so_the_bhyt || "Không BHYT"}</span>
                        </td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Phòng khám đăng ký</th>
                        <td class="py-2.5 px-3.5 font-bold text-emerald-700">${info.ten_phong_kham || "-"}</td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Bác sĩ phụ trách</th>
                        <td class="py-2.5 px-3.5 font-bold text-sky-800">${info.ten_bac_si || "Bác sĩ chuyên khoa"}</td>
                    </tr>
                    <tr class="bg-amber-50/70">
                        <th class="py-2.5 px-3.5 font-semibold text-amber-900">Trạng thái tiếp theo</th>
                        <td class="py-2.5 px-3.5 font-bold text-amber-800">Chờ khám sàng lọc & đo sinh hiệu (P101)</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    const modal = document.getElementById("staff-confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function showVitalsSuccessModal(info, onClose = null) {
    ensureStaffConfirmModalDOM();
    staffModalCloseCallback = onClose;

    document.getElementById("scm-header").className = "bg-gradient-to-r from-teal-600 to-sky-600 text-white px-6 py-5 text-center relative";
    document.getElementById("scm-icon-wrap").className = "w-14 h-14 rounded-full bg-white text-teal-600 flex items-center justify-center mx-auto mb-2.5 shadow-md";
    document.getElementById("scm-icon").textContent = "monitor_heart";
    document.getElementById("scm-title").textContent = "Đã Lưu Chỉ Số Sinh Hiệu";
    document.getElementById("scm-subtitle").textContent = "Hồ sơ bệnh nhân đã được chuyển sang Phòng Bác sĩ khám";

    document.getElementById("scm-body").innerHTML = `
        <div class="space-y-3.5">
            <div class="overflow-hidden rounded-xl border border-slate-200">
                <table class="w-full text-left border-collapse text-xs sm:text-sm">
                    <tbody class="divide-y divide-slate-200">
                        <tr class="bg-teal-50/70">
                            <th class="py-2.5 px-3.5 font-semibold text-slate-600 w-2/5">Hồ sơ khám</th>
                            <td class="py-2.5 px-3.5 font-extrabold text-teal-800">
                                STT #${info.so_thu_tu_kham || 1} • Hồ sơ #${info.ma_ho_so_kham}
                            </td>
                        </tr>
                        <tr>
                            <th class="py-2.5 px-3.5 font-semibold text-slate-600">Họ và tên bệnh nhân</th>
                            <td class="py-2.5 px-3.5 font-bold text-slate-900 uppercase">
                                ${info.ho_ten || "-"} <span class="text-xs font-semibold text-slate-500">(Mã BN: #${info.ma_benh_nhan || "-"})</span>
                            </td>
                        </tr>
                        <tr>
                            <th class="py-2.5 px-3.5 font-semibold text-slate-600">Chuyển đến phòng</th>
                            <td class="py-2.5 px-3.5 font-bold text-emerald-700">
                                Phòng ${info.so_phong || "P102"} (${info.ten_khoa || "Khoa Khám Bệnh"})
                            </td>
                        </tr>
                        <tr>
                            <th class="py-2.5 px-3.5 font-semibold text-slate-600">Bác sĩ khám</th>
                            <td class="py-2.5 px-3.5 font-bold text-sky-800">${info.ten_bac_si || "Bác sĩ chuyên khoa"}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] font-bold text-slate-500 uppercase mb-2 text-center">Chỉ Số Sinh Hiệu Đã Ghi Nhận</div>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
                    <div class="p-2 rounded-lg bg-white border border-slate-200">
                        <span class="text-[10px] text-slate-400 block">Mạch</span>
                        <b class="text-teal-700">${info.mach} l/p</b>
                    </div>
                    <div class="p-2 rounded-lg bg-white border border-slate-200">
                        <span class="text-[10px] text-slate-400 block">Nhiệt độ</span>
                        <b class="text-rose-600">${info.nhiet_do}°C</b>
                    </div>
                    <div class="p-2 rounded-lg bg-white border border-slate-200">
                        <span class="text-[10px] text-slate-400 block">Huyết áp</span>
                        <b class="text-sky-700">${info.huyet_ap}</b>
                    </div>
                    <div class="p-2 rounded-lg bg-white border border-slate-200">
                        <span class="text-[10px] text-slate-400 block">Nhịp thở</span>
                        <b class="text-slate-800">${info.nhip_tho} l/p</b>
                    </div>
                    <div class="p-2 rounded-lg bg-white border border-slate-200">
                        <span class="text-[10px] text-slate-400 block">Cân nặng</span>
                        <b class="text-slate-800">${info.can_nang} kg</b>
                    </div>
                    <div class="p-2 rounded-lg bg-white border border-slate-200">
                        <span class="text-[10px] text-slate-400 block">Chiều cao</span>
                        <b class="text-slate-800">${info.chieu_cao} cm</b>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = document.getElementById("staff-confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function showClsSuccessModal(info, onClose = null) {
    ensureStaffConfirmModalDOM();
    staffModalCloseCallback = onClose;

    const isAllDone = info.all_cls_completed !== false;

    document.getElementById("scm-header").className = "bg-gradient-to-r from-sky-600 to-teal-600 text-white px-6 py-5 text-center relative";
    document.getElementById("scm-icon-wrap").className = "w-14 h-14 rounded-full bg-white text-sky-600 flex items-center justify-center mx-auto mb-2.5 shadow-md";
    document.getElementById("scm-icon").textContent = "biotech";
    document.getElementById("scm-title").textContent = "Đã Lưu Kết Quả Cận Lâm Sàng";
    document.getElementById("scm-subtitle").textContent = isAllDone
        ? "Đã hoàn tất 100% chỉ định CLS và chuyển về Phòng Bác sĩ"
        : `Hồ sơ #${info.ma_ho_so_kham} vẫn còn ${info.pending_cls_count} dịch vụ CLS cần nhập tiếp`;

    document.getElementById("scm-body").innerHTML = `
        <div class="overflow-hidden rounded-xl border border-slate-200">
            <table class="w-full text-left border-collapse text-xs sm:text-sm">
                <tbody class="divide-y divide-slate-200">
                    <tr class="bg-sky-50/70">
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600 w-2/5">Mã chỉ định CLS</th>
                        <td class="py-2.5 px-3.5 font-extrabold text-sky-800">
                            #${info.ma_chi_dinh_cls} <span class="text-xs font-semibold text-slate-500">(Hồ sơ #${info.ma_ho_so_kham || "-"})</span>
                        </td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Họ và tên bệnh nhân</th>
                        <td class="py-2.5 px-3.5 font-bold text-slate-900 uppercase">
                            ${info.ho_ten || "-"} <span class="text-xs font-semibold text-slate-500">(Mã BN: #${info.ma_benh_nhan || "-"})</span>
                        </td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Dịch vụ thực hiện</th>
                        <td class="py-2.5 px-3.5 font-bold text-indigo-700">${info.ten_dich_vu_cls || "-"}</td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Kết quả ghi nhận</th>
                        <td class="py-2.5 px-3.5 font-medium text-slate-800">${info.ket_qua_cls || "-"}</td>
                    </tr>
                    <tr>
                        <th class="py-2.5 px-3.5 font-semibold text-slate-600">Hình ảnh đính kèm</th>
                        <td class="py-2.5 px-3.5 font-bold text-emerald-700">${info.so_luong_anh || 0} ảnh kết quả CLS</td>
                    </tr>
                    <tr class="${isAllDone ? 'bg-emerald-50/70' : 'bg-amber-50/70'}">
                        <th class="py-2.5 px-3.5 font-semibold ${isAllDone ? 'text-emerald-900' : 'text-amber-900'}">Trạng thái hồ sơ</th>
                        <td class="py-2.5 px-3.5 font-bold ${isAllDone ? 'text-emerald-800' : 'text-amber-800'}">
                            ${isAllDone
                                ? `Đã chuyển về Phòng ${info.phong_bac_si || "P102"} (${info.ten_phong_bac_si || "Bác sĩ đọc KQ"})`
                                : `Còn ${info.pending_cls_count} dịch vụ CLS chưa nhập kết quả (Chưa chuyển qua Bác sĩ)`}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    const modal = document.getElementById("staff-confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function showStaffNoticeModal(title, message, isError = false, onClose = null) {
    ensureStaffConfirmModalDOM();
    staffModalCloseCallback = onClose;

    document.getElementById("scm-header").className = isError
        ? "bg-gradient-to-r from-rose-600 to-amber-600 text-white px-6 py-5 text-center relative"
        : "bg-gradient-to-r from-sky-600 to-teal-600 text-white px-6 py-5 text-center relative";
    document.getElementById("scm-icon-wrap").className = isError
        ? "w-14 h-14 rounded-full bg-white text-rose-600 flex items-center justify-center mx-auto mb-2.5 shadow-md"
        : "w-14 h-14 rounded-full bg-white text-sky-600 flex items-center justify-center mx-auto mb-2.5 shadow-md";
    document.getElementById("scm-icon").textContent = isError ? "warning" : "task_alt";
    document.getElementById("scm-title").textContent = title;
    document.getElementById("scm-subtitle").textContent = isError ? "Vui lòng kiểm tra lại thông tin" : "Hệ thống Quản lý Khám chữa bệnh (HIS)";

    document.getElementById("scm-body").innerHTML = `
        <div class="p-4 rounded-xl ${isError ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-teal-50/70 border-teal-200 text-slate-800'} border text-center font-semibold text-sm leading-relaxed">
            ${message}
        </div>
    `;

    const modal = document.getElementById("staff-confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

// =========================================================================
// CHUẨN HÓA GIAO DIỆN BẢNG (TABLE) CHO SINH HIỆU & CẬN LÂM SÀNG
// =========================================================================
function ensureUnifiedVitalsLayout() {
    document.getElementById("vitals-calling-banner")?.remove();

    const queueSubview = document.getElementById("vitals-subview-queue");
    if (queueSubview && !document.getElementById("vitals-table-tbody")) {
        queueSubview.className = "hospital-card rounded-2xl p-6 space-y-4";
        queueSubview.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                    <h3 class="font-heading font-bold text-base text-teal-950">Bảng Danh Sách Bệnh Nhân Đo Chỉ Số Sinh Hiệu</h3>
                    <p class="text-xs text-slate-500">Tra cứu theo tên, mã hồ sơ, lọc theo chuyên khoa, trạng thái đo, ngày tiếp nhận và sắp xếp thứ tự ngày</p>
                </div>
                <button type="button" onclick="clearVitalsFilters()"
                        class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition">
                    <span class="material-symbols-outlined text-sm">filter_alt_off</span>
                    <span>Đặt lại bộ lọc</span>
                </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 p-3.5 rounded-xl bg-sky-50/60 border border-sky-200/80 text-xs">
                <div class="lg:col-span-3">
                    <label class="font-bold text-slate-700 block mb-1">Tìm kiếm bệnh nhân</label>
                    <input id="vt-search-input" type="text" oninput="renderVitalsListsAndTable()"
                           placeholder="Tên BN, Mã HS, Mã BN, VNeID, SĐT..."
                           class="w-full h-9 px-3 rounded-lg border-slate-300 bg-white text-xs"/>
                </div>

                <div class="lg:col-span-3">
                    <label class="font-bold text-slate-700 block mb-1">Lọc theo Chuyên khoa</label>
                    <select id="vt-dept-filter" onchange="renderVitalsListsAndTable()"
                            class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-semibold text-slate-700">
                        <option value="ALL">-- Tất cả chuyên khoa --</option>
                    </select>
                </div>

                <div class="lg:col-span-2">
                    <label class="font-bold text-slate-700 block mb-1">Lọc theo Trạng thái</label>
                    <select id="vt-status-select" onchange="setVitalsStatusFilter(this.value)"
                            class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-semibold text-slate-700">
                        <option value="ChoDo">Đang chờ đo sinh hiệu</option>
                        <option value="DaDo">Đã đo sinh hiệu</option>
                        <option value="ALL">-- Tất cả đã tiếp nhận --</option>
                    </select>
                </div>

                <div class="lg:col-span-2">
                    <label class="font-bold text-slate-700 block mb-1">Lọc theo Ngày khám</label>
                    <input id="vt-date-input" type="date" onchange="renderVitalsListsAndTable()"
                           class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs"/>
                </div>

                <div class="lg:col-span-2">
                    <label class="font-bold text-slate-700 block mb-1">Sắp xếp theo Ngày</label>
                    <select id="vt-sort-date" onchange="renderVitalsListsAndTable()"
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
                            <th class="p-3">Ngày sinh / SĐT</th>
                            <th class="p-3">Phòng & Bác sĩ khám</th>
                            <th class="p-3">Chỉ số sinh hiệu</th>
                            <th class="p-3">Ngày tiếp nhận</th>
                            <th class="p-3">Triệu chứng</th>
                            <th class="p-3">Trạng thái</th>
                            <th class="p-3 text-right">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="vitals-table-tbody" class="divide-y divide-slate-200"></tbody>
                </table>
            </div>
        `;
    }

    const selectorEl = document.getElementById("vt-patient-selector");
    if (selectorEl && selectorEl.parentElement) {
        selectorEl.parentElement.remove();
    }
}

function ensureUnifiedClsLayout() {
    document.getElementById("cls-calling-banner")?.remove();

    const clsQueueSubview = document.getElementById("cls-subview-queue");
    if (clsQueueSubview && !document.getElementById("cls-table-tbody")) {
        clsQueueSubview.className = "hospital-card rounded-2xl p-6 space-y-4";
        clsQueueSubview.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                    <h3 class="font-heading font-bold text-base text-teal-950">Bảng Danh Sách Chỉ Định Cận Lâm Sàng</h3>
                    <p class="text-xs text-slate-500">Tra cứu theo tên, mã chỉ định, lọc theo loại dịch vụ CLS, trạng thái thực hiện, ngày và sắp xếp thứ tự</p>
                </div>
                <button type="button" onclick="clearClsFilters()"
                        class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition">
                    <span class="material-symbols-outlined text-sm">filter_alt_off</span>
                    <span>Đặt lại bộ lọc</span>
                </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 p-3.5 rounded-xl bg-sky-50/60 border border-sky-200/80 text-xs">
                <div class="lg:col-span-3">
                    <label class="font-bold text-slate-700 block mb-1">Tìm kiếm bệnh nhân</label>
                    <input id="cls-search-input" type="text" oninput="renderClsQueuesByPayment()"
                           placeholder="Tên BN, Mã CĐ, Mã HS, Mã BN, VNeID..."
                           class="w-full h-9 px-3 rounded-lg border-slate-300 bg-white text-xs"/>
                </div>

                <div class="lg:col-span-3">
                    <label class="font-bold text-slate-700 block mb-1">Lọc theo Dịch vụ CLS</label>
                    <select id="cls-service-filter" onchange="renderClsQueuesByPayment()"
                            class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-semibold text-slate-700">
                        <option value="ALL">-- Tất cả dịch vụ CLS --</option>
                    </select>
                </div>

                <div class="lg:col-span-2">
                    <label class="font-bold text-slate-700 block mb-1">Lọc theo Trạng thái</label>
                    <select id="cls-status-select" onchange="setClsStatusFilter(this.value)"
                            class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-semibold text-slate-700">
                        <option value="ChoLam">Đang chờ làm CLS</option>
                        <option value="DaCoKQ">Đã có kết quả</option>
                        <option value="ChuaNop">Chờ đóng phí (P104)</option>
                        <option value="ALL">-- Tất cả chỉ định --</option>
                    </select>
                </div>

                <div class="lg:col-span-2">
                    <label class="font-bold text-slate-700 block mb-1">Lọc theo Ngày</label>
                    <input id="cls-date-input" type="date" onchange="renderClsQueuesByPayment()"
                           class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs"/>
                </div>

                <div class="lg:col-span-2">
                    <label class="font-bold text-slate-700 block mb-1">Sắp xếp thứ tự</label>
                    <select id="cls-sort-date" onchange="renderClsQueuesByPayment()"
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
                            <th class="p-3">Mã CĐ / Mã BN</th>
                            <th class="p-3">Họ và tên</th>
                            <th class="p-3">Dịch vụ Cận lâm sàng</th>
                            <th class="p-3">Phòng BS chỉ định</th>
                            <th class="p-3">Viện phí CLS</th>
                            <th class="p-3">Kết quả & Ảnh CLS</th>
                            <th class="p-3">Trạng thái</th>
                            <th class="p-3 text-right">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="cls-table-tbody" class="divide-y divide-slate-200"></tbody>
                </table>
            </div>
        `;
    }
}

function logoutStaff() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

function openStaffMenu(menuKey) {
    ensureUnifiedVitalsLayout();
    ensureUnifiedClsLayout();

    const recPanel = document.getElementById("staff-panel-reception");
    const vitalsPanel = document.getElementById("staff-panel-vitals");
    const clsPanel = document.getElementById("staff-panel-cls");

    const formSubview = document.getElementById("reception-subview-form");
    const lookupSubview = document.getElementById("reception-subview-lookup");

    const vitalsQueueSubview = document.getElementById("vitals-subview-queue");
    const vitalsFormSubview = document.getElementById("vitals-subview-form");

    const clsQueueSubview = document.getElementById("cls-subview-queue");
    const clsFormSubview = document.getElementById("cls-subview-form");

    const titleEl = document.getElementById("current-workspace-title");

    if (recPanel) recPanel.classList.add("hidden");
    if (vitalsPanel) vitalsPanel.classList.add("hidden");
    if (clsPanel) clsPanel.classList.add("hidden");

    let activeTopGroup = "reception";

    if (menuKey === "reception-form") {
        activeTopGroup = "reception";
        if (recPanel) recPanel.classList.remove("hidden");
        if (formSubview) formSubview.classList.remove("hidden");
        if (lookupSubview) lookupSubview.classList.add("hidden");
        if (titleEl) titleEl.textContent = "TIẾP NHẬN BỆNH NHÂN";
    } else if (menuKey === "reception-lookup") {
        activeTopGroup = "reception";
        if (recPanel) recPanel.classList.remove("hidden");
        if (formSubview) formSubview.classList.add("hidden");
        if (lookupSubview) lookupSubview.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "TRA CỨU DANH SÁCH BỆNH NHÂN ĐÃ ĐẶT LỊCH HẸN";
    } else if (menuKey === "vitals" || menuKey === "vitals-queue") {
        activeTopGroup = "vitals";
        if (vitalsPanel) vitalsPanel.classList.remove("hidden");
        if (vitalsQueueSubview) vitalsQueueSubview.classList.remove("hidden");
        if (vitalsFormSubview) vitalsFormSubview.classList.add("hidden");
        if (titleEl) titleEl.textContent = "DANH SÁCH BỆNH NHÂN CHỜ ĐO & ĐÃ ĐO SINH HIỆU";
    } else if (menuKey === "vitals-form") {
        activeTopGroup = "vitals";
        if (vitalsPanel) vitalsPanel.classList.remove("hidden");
        if (vitalsQueueSubview) vitalsQueueSubview.classList.add("hidden");
        if (vitalsFormSubview) vitalsFormSubview.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "NHẬP CHỈ SỐ SINH HIỆU & KHÁM SÀNG LỌC";

        if (!currentVitalsPatient && cachedDashboardData) {
            const allVitals = getAllVitalsRecords();
            const firstWaiting = allVitals.find(r => r.trang_thai_do === "ChoDo") || allVitals[0];
            if (firstWaiting) {
                populateVitalsFormByRecord(firstWaiting);
            }
        }
    } else if (menuKey === "cls" || menuKey === "cls-paid" || menuKey === "cls-unpaid") {
        activeTopGroup = "cls";
        if (clsPanel) clsPanel.classList.remove("hidden");
        if (clsQueueSubview) clsQueueSubview.classList.remove("hidden");
        if (clsFormSubview) clsFormSubview.classList.add("hidden");
        if (titleEl) titleEl.textContent = "DANH SÁCH CHỜ & ĐÃ THỰC HIỆN CẬN LÂM SÀNG";

        if (menuKey === "cls-unpaid") {
            setClsStatusFilter("ChuaNop");
        }
    } else if (menuKey === "cls-form") {
        activeTopGroup = "cls";
        if (clsPanel) clsPanel.classList.remove("hidden");
        if (clsQueueSubview) clsQueueSubview.classList.add("hidden");
        if (clsFormSubview) clsFormSubview.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "NHẬP KẾT QUẢ & ĐA HÌNH ẢNH CẬN LÂM SÀNG";

        if (!currentClsOrder && cachedDashboardData) {
            const allCls = cachedDashboardData.hang_doi_cls || [];
            const firstPaidWaiting = allCls.find(
                c => c.trang_thai_nop_tien === "DaNop" && c.trang_thai_thuc_hien !== "DaCoKetQua"
            ) || allCls.find(c => c.trang_thai_nop_tien === "DaNop") || allCls[0];
            if (firstPaidWaiting) {
                populateClsFormByRecord(firstPaidWaiting);
            }
        }
    }

    const topNavs = [
        { key: "reception", id: "top-nav-reception", badgeId: "top-badge-booking", badgeIdle: "bg-teal-600 text-white" },
        { key: "vitals", id: "top-nav-vitals", badgeId: "top-badge-vitals", badgeIdle: "bg-amber-500 text-white" },
        { key: "cls", id: "top-nav-cls", badgeId: "top-badge-cls", badgeIdle: "bg-sky-600 text-white" }
    ];

    topNavs.forEach(item => {
        const btn = document.getElementById(item.id);
        const badge = document.getElementById(item.badgeId);
        if (!btn) return;
        if (item.key === activeTopGroup) {
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-white bg-teal-600 shadow-xs flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = "px-1.5 py-0.2 rounded-full bg-white/25 text-white text-[10px] font-extrabold";
        } else {
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = `px-1.5 py-0.2 rounded-full ${item.badgeIdle} text-[10px] font-extrabold`;
        }
    });
}

function switchStaffTab(tabName) {
    if (tabName === "reception") openStaffMenu("reception-form");
    else if (tabName === "vitals") openStaffMenu("vitals-queue");
    else if (tabName === "cls") openStaffMenu("cls-paid");
}

function switchReceptionSubTab(subTab) {
    if (subTab === "lookup") openStaffMenu("reception-lookup");
    else openStaffMenu("reception-form");
}

function getAllDoctorsList() {
    if (!cachedDashboardData) return [];
    const staff = cachedDashboardData.danh_sach_nhan_su || [];
    return staff.filter(
        s => s.vai_tro === "BacSi" || s.chuc_vu === "BacSi" || String(s.ho_ten || "").toUpperCase().includes("BS.")
    );
}

function getAllVitalsRecords() {
    if (!cachedDashboardData) return [];
    if (Array.isArray(cachedDashboardData.danh_sach_sinh_hieu)) {
        return cachedDashboardData.danh_sach_sinh_hieu.map(r => {
            const isWaiting = (r.trang_thai_hang_doi === "ChoSinhHieu" && !r.ma_sinh_hieu);
            return {
                ...r,
                trang_thai_do: r.trang_thai_do || (isWaiting ? "ChoDo" : "DaDo")
            };
        });
    }
    return (cachedDashboardData.hang_doi_sinh_hieu || []).map(r => ({
        ...r,
        trang_thai_do: "ChoDo"
    }));
}

// =========================================================================
// 1. ĐỒNG BỘ DỮ LIỆU TỪ MYSQL CHO CẢ 3 VAI TRÒ NHÂN VIÊN Y TẾ
// =========================================================================
async function loadStaffDashboard() {
    try {
        const res = await fetch(`${STAFF_API_BASE}/dashboard-data`, {
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        if (!res.ok) return;

        cachedDashboardData = data;
        ensureUnifiedVitalsLayout();
        ensureUnifiedClsLayout();

        const waitingBookings = (data.lich_hen_cho || [])
            .filter(b => b.trang_thai_hen === "ChoTiepNhan")
            .sort((a, b) => String(a.ngay_hen_kham || "").localeCompare(String(b.ngay_hen_kham || "")));

        const allVitals = getAllVitalsRecords();
        const waitingVitalsCount = allVitals.filter(v => v.trang_thai_do === "ChoDo").length;

        const paidWaitingCls = (data.hang_doi_cls || []).filter(
            c => c.trang_thai_nop_tien === "DaNop" && c.trang_thai_thuc_hien === "ChoLamCLS"
        );

        const setBadge = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setBadge("top-badge-booking", waitingBookings.length);
        setBadge("top-badge-vitals", waitingVitalsCount);
        setBadge("top-badge-cls", paidWaitingCls.length);

        renderExamRoomsSelect(data.danh_sach_phong_kham || []);
        renderLookupDepartmentOptions(data.danh_sach_khoa || [], data.lich_hen_cho || []);
        renderLookupDoctorOptions();
        renderReceptionBookingList(waitingBookings);
        filterBookedAppointmentsTable();

        renderVitalsDeptFilterOptions(data.danh_sach_khoa || [], allVitals);
        renderVitalsListsAndTable();

        renderClsServiceFilterOptions(data.hang_doi_cls || []);
        renderClsQueuesByPayment(data.hang_doi_cls || []);
    } catch (error) {
        console.error("Lỗi tải dữ liệu Nhân viên y tế:", error);
    }
}

function renderExamRoomsSelect(rooms) {
    const select = document.getElementById("rec-ma-phong-kham");
    if (!select) return;
    select.innerHTML = rooms.map(r => `
        <option value="${r.ma_phong}" data-ma-khoa="${r.ma_khoa || ''}">
            Phòng ${r.so_phong} - ${r.ten_phong} (${r.ten_khoa} • Giá khám: ${Number(r.gia_kham).toLocaleString("vi-VN")}đ)
        </option>
    `).join("");

    onChangeReceptionRoom();
}

function onChangeReceptionRoom(preferredDoctorId = null) {
    const roomSelect = document.getElementById("rec-ma-phong-kham");
    const docSelect = document.getElementById("rec-ma-bac-si");
    if (!roomSelect || !docSelect) return;

    const selectedOpt = roomSelect.options[roomSelect.selectedIndex];
    const maKhoa = selectedOpt ? selectedOpt.getAttribute("data-ma-khoa") : "";

    const allDoctors = getAllDoctorsList();
    let deptDoctors = maKhoa
        ? allDoctors.filter(d => String(d.ma_khoa || "") === String(maKhoa))
        : allDoctors;

    if (deptDoctors.length === 0) {
        deptDoctors = allDoctors;
    }

    if (deptDoctors.length === 0) {
        docSelect.innerHTML = `<option value="ANY">Bác sĩ phân công theo ca trực</option>`;
    } else {
        docSelect.innerHTML =
            deptDoctors.map(d => `
                <option value="${d.ma_nhan_vien}">
                    ${d.ho_ten} (${d.ten_khoa || 'Bác sĩ khám'})
                </option>
            `).join("") +
            `<option value="ANY">-- Bác sĩ bất kỳ trong khoa --</option>`;
    }

    if (preferredDoctorId) {
        const exists = Array.from(docSelect.options).some(opt => String(opt.value) === String(preferredDoctorId));
        if (exists) {
            docSelect.value = preferredDoctorId;
        }
    }
}

function renderLookupDepartmentOptions(departments, bookings) {
    const select = document.getElementById("lookup-dept-select");
    if (!select) return;

    const currentVal = select.value || "ALL";
    const deptNames = new Set();

    (departments || []).forEach(d => {
        if (d.ten_khoa) deptNames.add(d.ten_khoa.trim());
    });
    (bookings || []).forEach(b => {
        if (b.ten_khoa) deptNames.add(b.ten_khoa.trim());
    });

    select.innerHTML = `<option value="ALL">-- Tất cả chuyên khoa --</option>` +
        Array.from(deptNames).map(name => `<option value="${name}">${name}</option>`).join("");

    if (currentVal !== "ALL" && deptNames.has(currentVal)) {
        select.value = currentVal;
    }
}

function renderLookupDoctorOptions() {
    const docSelect = document.getElementById("lookup-doctor-select");
    if (!docSelect || !cachedDashboardData) return;

    const currentDocVal = docSelect.value || "ALL";
    const deptFilter = document.getElementById("lookup-dept-select")?.value || "ALL";

    const doctorNames = new Set();
    const allDoctors = getAllDoctorsList();
    const bookings = cachedDashboardData.lich_hen_cho || [];

    allDoctors.forEach(d => {
        if (!d.ho_ten) return;
        if (deptFilter === "ALL" || (d.ten_khoa && d.ten_khoa.trim() === deptFilter)) {
            doctorNames.add(d.ho_ten.trim());
        }
    });

    bookings.forEach(b => {
        if (!b.ten_bac_si) return;
        if (deptFilter === "ALL" || (b.ten_khoa && b.ten_khoa.trim() === deptFilter)) {
            doctorNames.add(b.ten_bac_si.trim());
        }
    });

    docSelect.innerHTML = `<option value="ALL">-- Tất cả bác sĩ --</option>` +
        Array.from(doctorNames).map(name => `<option value="${name}">${name}</option>`).join("");

    if (currentDocVal !== "ALL" && doctorNames.has(currentDocVal)) {
        docSelect.value = currentDocVal;
    } else {
        docSelect.value = "ALL";
    }
}

function onLookupDeptFilterChange() {
    renderLookupDoctorOptions();
    filterBookedAppointmentsTable();
}

// =========================================================================
// 2. QUÉT BHYT 2 MẶT & TRA CỨU LỊCH HẸN (CÓ KIỂM TRA "CHƯA TỚI NGÀY")
// =========================================================================
function handleSelectBhytSide(event, side) {
    const file = event.target.files[0];
    if (!file) return;

    if (side === "front") {
        bhytFrontFile = file;
        const img = document.getElementById("bhyt-front-preview");
        img.src = URL.createObjectURL(file);
        img.classList.remove("hidden");
    } else {
        bhytBackFile = file;
        const img = document.getElementById("bhyt-back-preview");
        img.src = URL.createObjectURL(file);
        img.classList.remove("hidden");
    }

    document.getElementById("ocr-status-msg").textContent =
        `Đã tải: ${bhytFrontFile ? "Mặt trước ✅" : ""} ${bhytBackFile ? "| Mặt sau ✅" : ""}. Bấm nút AI Quét bên trên!`;
}

async function scanBhytWithAi() {
    if (!bhytFrontFile) {
        showStaffNoticeModal("Thiếu Ảnh Thẻ BHYT", "Vui lòng chọn ảnh MẶT TRƯỚC thẻ BHYT (và mặt sau nếu có) trước khi quét!", true);
        return;
    }

    const btn = document.getElementById("btn-run-ocr");
    const statusMsg = document.getElementById("ocr-status-msg");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-base">progress_activity</span><span>AI đang đọc 2 mặt thẻ BHYT...</span>`;

    const formData = new FormData();
    formData.append("front_file", bhytFrontFile);
    if (bhytBackFile) {
        formData.append("back_file", bhytBackFile);
    }

    try {
        const res = await fetch(AI_OCR_BHYT_URL, {
            method: "POST",
            body: formData
        });
        const ocrData = await res.json();

        if (ocrData.ho_ten) document.getElementById("rec-ho-ten").value = ocrData.ho_ten.toUpperCase();
        if (ocrData.ngay_sinh) document.getElementById("rec-ngay-sinh").value = ocrData.ngay_sinh;
        if (ocrData.gioi_tinh) {
            document.getElementById("rec-gioi-tinh").value =
                (ocrData.gioi_tinh.includes("Nữ") || ocrData.gioi_tinh === "Nu") ? "Nu" : "Nam";
        }
        if (ocrData.so_the_bhyt) document.getElementById("rec-so-bhyt").value = ocrData.so_the_bhyt;
        if (ocrData.han_the_bhyt) document.getElementById("rec-han-bhyt").value = ocrData.han_the_bhyt;
        if (ocrData.noi_dk_kcb_ban_dau || ocrData.noi_dang_ky_bhyt) {
            document.getElementById("rec-noi-kcb").value = ocrData.noi_dang_ky_bhyt || ocrData.noi_dk_kcb_ban_dau;
        }
        if (ocrData.dia_chi) document.getElementById("rec-dia-chi").value = ocrData.dia_chi;

        statusMsg.className = "text-xs font-bold text-emerald-700 text-center";
        statusMsg.textContent = "✅ AI đã bóc tách thành công thông tin thẻ BHYT và tự động điền vào phiếu!";
    } catch (error) {
        statusMsg.className = "text-xs font-bold text-red-600 text-center";
        statusMsg.textContent = "⚠️ Không kết nối được tới Server AI (Cổng 8001). Hãy kiểm tra cửa sổ chạy uvicorn!";
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-base">auto_fix_high</span><span>AI QUÉT 2 MẶT THẺ BHYT & TỰ ĐỘNG ĐIỀN FORM</span>`;
    }
}

function renderReceptionBookingList(bookings) {
    const container = document.getElementById("reception-booking-list");
    if (!container) return;

    if (!bookings || bookings.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                Hiện chưa có lịch hẹn nào đang chờ tiếp nhận.
            </div>
        `;
        return;
    }

    const todayYmd = getTodayYmdStaff();

    container.innerHTML = bookings.map((b) => {
        const appDate = String(b.ngay_hen_kham || "").substring(0, 10);
        const isFuture = appDate > todayYmd;

        return `
            <div class="p-3 rounded-xl bg-white hover:bg-teal-50/60 border ${isFuture ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200'} flex items-center justify-between gap-2 transition">
                <div>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-2 py-0.5 rounded bg-teal-600/10 text-teal-700 font-bold text-[10px]">Mã BN: #${b.ma_benh_nhan}</span>
                        <span class="text-xs font-bold text-slate-800">${b.ho_ten}</span>
                        ${isFuture ? `<span class="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold text-[10px]">Chưa tới ngày</span>` : ""}
                    </div>
                    <p class="text-[11px] text-emerald-700 font-semibold mt-0.5">
                        ${b.ten_khoa || "Chuyên khoa"} • ${b.ten_bac_si || "BS trực"}
                    </p>
                    <p class="text-[11px] text-slate-500">
                        ${appDate} (${b.khung_gio_hen})
                    </p>
                </div>
                ${isFuture ? `
                    <button type="button" onclick="fillReceptionByAppointmentId('${b.ma_lich_hen}')"
                            class="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-500 text-amber-900 hover:text-white border border-amber-300 font-bold text-[11px] shrink-0 transition"
                            title="Bệnh nhân đến trước ngày hẹn - Bấm để xác nhận khám sớm">
                        Chưa tới ngày
                    </button>
                ` : `
                    <button type="button" onclick="fillReceptionByAppointmentId('${b.ma_lich_hen}')"
                            class="px-2.5 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-[11px] shrink-0 hover:bg-teal-700 shadow-2xs transition">
                        Tiếp nhận
                    </button>
                `}
            </div>
        `;
    }).join("");
}

function filterBookedAppointmentsTable() {
    const tbody = document.getElementById("lookup-booking-tbody");
    if (!tbody || !cachedDashboardData) return;

    const keyword = (document.getElementById("lookup-keyword-input")?.value || "").toLowerCase().trim();
    const deptFilter = document.getElementById("lookup-dept-select")?.value || "ALL";
    const docFilter = document.getElementById("lookup-doctor-select")?.value || "ALL";
    const statusFilter = document.getElementById("lookup-status-select")?.value || "ALL";
    const dateFilter = document.getElementById("lookup-date-input")?.value || "";
    const sortOrder = document.getElementById("lookup-sort-date")?.value || "ASC";

    const allBookings = cachedDashboardData.lich_hen_cho || [];
    const todayYmd = getTodayYmdStaff();

    const filtered = allBookings.filter(b => {
        const matchKeyword = !keyword ||
            (b.ho_ten && b.ho_ten.toLowerCase().includes(keyword)) ||
            (b.so_dien_thoai && b.so_dien_thoai.toLowerCase().includes(keyword)) ||
            String(b.ma_benh_nhan || "").toLowerCase().includes(keyword) ||
            String(b.ma_lich_hen || "").toLowerCase().includes(keyword) ||
            (b.vneid && b.vneid.toLowerCase().includes(keyword)) ||
            (b.so_the_bhyt && b.so_the_bhyt.toLowerCase().includes(keyword)) ||
            (b.ten_bac_si && b.ten_bac_si.toLowerCase().includes(keyword));

        const matchDept = deptFilter === "ALL" || (b.ten_khoa && b.ten_khoa.trim() === deptFilter);
        const matchDoc = docFilter === "ALL" || (b.ten_bac_si && b.ten_bac_si.trim() === docFilter);
        const matchStatus = statusFilter === "ALL" || b.trang_thai_hen === statusFilter;
        const matchDate = !dateFilter || (b.ngay_hen_kham && b.ngay_hen_kham.substring(0, 10) === dateFilter);

        return matchKeyword && matchDept && matchDoc && matchStatus && matchDate;
    });

    filtered.sort((a, b) => {
        const dateA = String(a.ngay_hen_kham || "").substring(0, 10);
        const dateB = String(b.ngay_hen_kham || "").substring(0, 10);
        if (dateA !== dateB) {
            return sortOrder === "ASC"
                ? dateA.localeCompare(dateB)
                : dateB.localeCompare(dateA);
        }
        return sortOrder === "ASC"
            ? String(a.ma_lich_hen || "").localeCompare(String(b.ma_lich_hen || ""))
            : String(b.ma_lich_hen || "").localeCompare(String(a.ma_lich_hen || ""));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="p-6 text-center text-slate-500">Không tìm thấy lịch hẹn phù hợp với bộ lọc hiện tại.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        const isWaiting = b.trang_thai_hen === "ChoTiepNhan";
        const isCanceled = b.trang_thai_hen === "DaHuy";
        const appDate = String(b.ngay_hen_kham || "").substring(0, 10);
        const isFuture = isWaiting && (appDate > todayYmd);

        let statusBadgeHtml = "";
        if (isCanceled) {
            statusBadgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Đã hủy</span>`;
        } else if (!isWaiting) {
            statusBadgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Đã tiếp nhận</span>`;
        } else if (isFuture) {
            statusBadgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200 whitespace-nowrap">📅 Chưa tới ngày</span>`;
        } else {
            statusBadgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">Chờ tiếp nhận</span>`;
        }

        let actionHtml = "";
        if (!isWaiting) {
            actionHtml = `<span class="text-slate-400 font-semibold">${isCanceled ? 'Đã hủy' : 'Hoàn tất'}</span>`;
        } else if (isFuture) {
            actionHtml = `
                <button type="button" onclick="fillReceptionByAppointmentId('${b.ma_lich_hen}')"
                        class="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-500 text-amber-900 hover:text-white border border-amber-300 font-bold text-xs transition whitespace-nowrap"
                        title="Bệnh nhân tới sớm trước ngày hẹn - Bấm để xác nhận khám trước ngày đặt lịch">
                    Chưa tới ngày
                </button>
            `;
        } else {
            actionHtml = `
                <button type="button" onclick="fillReceptionByAppointmentId('${b.ma_lich_hen}')"
                        class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition whitespace-nowrap">
                    Chọn cấp số
                </button>
            `;
        }

        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-bold text-teal-700">
                    Mã BN: #${b.ma_benh_nhan}<br/>
                    <span class="text-[10px] font-mono text-indigo-700">VNeID: ${b.vneid || "-"}</span>
                </td>
                <td class="p-3 font-bold text-slate-900">${b.ho_ten || "-"}</td>
                <td class="p-3">${b.ngay_sinh ? b.ngay_sinh.substring(0, 10) : ""} (${b.gioi_tinh || ""})</td>
                <td class="p-3 font-semibold">${b.so_dien_thoai || "-"}</td>
                <td class="p-3">${b.so_the_bhyt || "<span class='text-slate-400'>Chưa có</span>"}</td>
                <td class="p-3 font-semibold text-emerald-700">${b.ten_khoa || "-"}</td>
                <td class="p-3 font-bold text-sky-800">${b.ten_bac_si || "BS phân công"}</td>
                <td class="p-3"><b>${appDate}</b><br/><span class="text-[11px] text-slate-500">${b.khung_gio_hen}</span></td>
                <td class="p-3 max-w-[180px] truncate" title="${b.trieu_chung_ban_dau || ''}">${b.trieu_chung_ban_dau || "-"}</td>
                <td class="p-3">${statusBadgeHtml}</td>
                <td class="p-3 text-right">${actionHtml}</td>
            </tr>
        `;
    }).join("");
}

function clearLookupFilters() {
    const kwEl = document.getElementById("lookup-keyword-input");
    const deptEl = document.getElementById("lookup-dept-select");
    const docEl = document.getElementById("lookup-doctor-select");
    const statusEl = document.getElementById("lookup-status-select");
    const dateEl = document.getElementById("lookup-date-input");
    const sortEl = document.getElementById("lookup-sort-date");

    if (kwEl) kwEl.value = "";
    if (deptEl) deptEl.value = "ALL";
    renderLookupDoctorOptions();
    if (docEl) docEl.value = "ALL";
    if (statusEl) statusEl.value = "ALL";
    if (dateEl) dateEl.value = "";
    if (sortEl) sortEl.value = "ASC";

    filterBookedAppointmentsTable();
}

/**
 * Điền thông tin lịch hẹn vào Phiếu tiếp nhận.
 * Nếu chưa tới ngày hẹn (ngay_hen_kham > hôm nay) thì hiện Hộp thoại xác nhận khám trước ngày đã đặt lịch!
 */
function fillReceptionByAppointmentId(maLichHen, forceEarlyConfirm = false) {
    if (!cachedDashboardData) return;
    const b = (cachedDashboardData.lich_hen_cho || []).find(item => String(item.ma_lich_hen) === String(maLichHen));
    if (!b) return;

    const todayYmd = getTodayYmdStaff();
    const appDate = String(b.ngay_hen_kham || "").substring(0, 10);

    // Nếu lịch hẹn chưa tới ngày và chưa xác nhận khám sớm -> Hiện hộp thoại xác nhận
    if (appDate > todayYmd && !forceEarlyConfirm) {
        showEarlyAppointmentConfirmModal(b);
        return;
    }

    openStaffMenu("reception-form");

    document.getElementById("rec-ma-lich-hen").value = b.ma_lich_hen;
    document.getElementById("rec-ma-benh-nhan").value = b.ma_benh_nhan;
    document.getElementById("rec-ho-ten").value = b.ho_ten || "";
    document.getElementById("rec-gioi-tinh").value = b.gioi_tinh || "Nam";
    document.getElementById("rec-ngay-sinh").value = b.ngay_sinh ? b.ngay_sinh.substring(0, 10) : "";
    document.getElementById("rec-sdt").value = b.so_dien_thoai || "";
    document.getElementById("rec-vneid").value = b.vneid || "";
    document.getElementById("rec-stk-ngan-hang").value = b.stk_ngan_hang || "";
    document.getElementById("rec-so-bhyt").value = b.so_the_bhyt || "";
    document.getElementById("rec-han-bhyt").value = b.han_the_bhyt ? b.han_the_bhyt.substring(0, 10) : "";
    document.getElementById("rec-noi-kcb").value = b.noi_dang_ky_bhyt || "TTYT Phường Hải Châu";
    document.getElementById("rec-dia-chi").value = b.dia_chi || "";
    document.getElementById("rec-trieu-chung").value = b.trieu_chung_ban_dau || "";
    document.getElementById("rec-tien-su").value = b.tien_su_di_ung_benh_nen || "Không có";

    const roomSelect = document.getElementById("rec-ma-phong-kham");
    if (b.ma_phong && roomSelect) {
        roomSelect.value = b.ma_phong;
    }
    onChangeReceptionRoom(b.ma_bac_si || null);
}

/**
 * Hộp thoại xác nhận khi bệnh nhân đến khám trước ngày đã đặt lịch
 */
function showEarlyAppointmentConfirmModal(b) {
    const todayYmd = getTodayYmdStaff();
    const appDate = String(b.ngay_hen_kham || "").substring(0, 10);
    const diffDays = calcDaysUntilAppointment(appDate);

    let modal = document.getElementById("early-appointment-confirm-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "early-appointment-confirm-modal";
        modal.className = "fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-sm hidden items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-amber-200 animate-[fadeIn_0.18s_ease-out]">
            <div class="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-5 text-center relative">
                <button type="button" onclick="closeEarlyAppointmentConfirmModal()"
                        class="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
                <div class="w-14 h-14 rounded-full bg-white text-amber-600 flex items-center justify-center mx-auto mb-2 shadow-md">
                    <span class="material-symbols-outlined text-3xl">event_upcoming</span>
                </div>
                <h3 class="font-heading font-extrabold text-lg">Xác Nhận Khám Trước Ngày Đã Đặt Lịch</h3>
                <p class="text-xs text-amber-50 mt-0.5">Bệnh nhân đến sớm hơn ngày hẹn trên hệ thống (${diffDays} ngày)</p>
            </div>

            <div class="p-6 space-y-4 text-xs sm:text-sm">
                <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 leading-relaxed">
                    ⚠️ Bệnh nhân <b class="uppercase">${b.ho_ten || "-"}</b> (Mã BN: <b>#${b.ma_benh_nhan}</b>) đặt lịch hẹn vào ngày
                    <b class="text-rose-600">${appDate}</b> (${b.khung_gio_hen}), nhưng hôm nay là ngày <b>${todayYmd}</b>.
                </div>

                <div class="overflow-hidden rounded-xl border border-slate-200">
                    <table class="w-full text-left border-collapse text-xs">
                        <tbody class="divide-y divide-slate-200">
                            <tr>
                                <th class="py-2 px-3 bg-slate-50 font-semibold text-slate-600 w-2/5">Mã lịch hẹn</th>
                                <td class="py-2 px-3 font-bold text-teal-700">#${b.ma_lich_hen}</td>
                            </tr>
                            <tr>
                                <th class="py-2 px-3 bg-slate-50 font-semibold text-slate-600">Chuyên khoa đăng ký</th>
                                <td class="py-2 px-3 font-bold text-emerald-700">${b.ten_khoa || "-"}</td>
                            </tr>
                            <tr>
                                <th class="py-2 px-3 bg-slate-50 font-semibold text-slate-600">Bác sĩ hẹn khám</th>
                                <td class="py-2 px-3 font-bold text-sky-800">${b.ten_bac_si || "Bác sĩ chuyên khoa"}</td>
                            </tr>
                            <tr>
                                <th class="py-2 px-3 bg-slate-50 font-semibold text-slate-600">Ngày hẹn đã đặt</th>
                                <td class="py-2 px-3 font-extrabold text-rose-600">${appDate} (Sớm trước ${diffDays} ngày)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p class="text-xs text-slate-600 text-center font-medium">
                    Bạn có xác nhận tiếp nhận và cấp số thứ tự khám trước ngày hẹn cho bệnh nhân này ngay hôm nay không?
                </p>

                <div class="flex items-center gap-2.5 pt-1">
                    <button type="button" onclick="closeEarlyAppointmentConfirmModal()"
                            class="w-2/5 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition">
                        Đóng lại
                    </button>
                    <button type="button" onclick="confirmProceedEarlyAppointment('${b.ma_lich_hen}')"
                            class="w-3/5 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 transition">
                        <span class="material-symbols-outlined text-base">check_circle</span>
                        <span>Xác nhận khám trước ngày hẹn</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeEarlyAppointmentConfirmModal() {
    const modal = document.getElementById("early-appointment-confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function confirmProceedEarlyAppointment(maLichHen) {
    closeEarlyAppointmentConfirmModal();
    fillReceptionByAppointmentId(maLichHen, true);
}

function resetReceptionForm() {
    document.getElementById("staff-reception-form").reset();
    document.getElementById("rec-ma-lich-hen").value = "";
    document.getElementById("rec-ma-benh-nhan").value = "";
    onChangeReceptionRoom();
}

async function submitReceivePatient(event) {
    event.preventDefault();
    const user = getCurrentUser();

    const roomSelect = document.getElementById("rec-ma-phong-kham");
    const docSelect = document.getElementById("rec-ma-bac-si");
    const selectedRoomText = roomSelect && roomSelect.selectedIndex >= 0
        ? roomSelect.options[roomSelect.selectedIndex].text.trim()
        : "Phòng khám chuyên khoa";
    const selectedDocText = docSelect && docSelect.selectedIndex >= 0
        ? docSelect.options[docSelect.selectedIndex].text.replace(/^👨‍⚕️\s*/, "").trim()
        : "Bác sĩ chuyên khoa";

    const payload = {
        ma_lich_hen: document.getElementById("rec-ma-lich-hen").value.trim() || null,
        ma_benh_nhan: document.getElementById("rec-ma-benh-nhan").value.trim() || null,
        ma_nhan_vien: user ? (user.ma_nhan_vien || user.ma_nguoi_dung) : "NV26112002",
        vneid: document.getElementById("rec-vneid")?.value.trim() || null,
        stk_ngan_hang: document.getElementById("rec-stk-ngan-hang")?.value.trim() || null,
        ho_ten: document.getElementById("rec-ho-ten").value.trim().toUpperCase(),
        gioi_tinh: document.getElementById("rec-gioi-tinh").value,
        ngay_sinh: document.getElementById("rec-ngay-sinh").value,
        so_dien_thoai: document.getElementById("rec-sdt").value.trim(),
        so_the_bhyt: document.getElementById("rec-so-bhyt").value.trim(),
        han_the_bhyt: document.getElementById("rec-han-bhyt").value || null,
        noi_dang_ky_bhyt: document.getElementById("rec-noi-kcb").value.trim(),
        dia_chi: document.getElementById("rec-dia-chi").value.trim(),
        trieu_chung_ban_dau: document.getElementById("rec-trieu-chung").value.trim(),
        tien_su_di_ung_benh_nen: document.getElementById("rec-tien-su").value.trim(),
        ma_phong_kham: document.getElementById("rec-ma-phong-kham").value,
        ma_bac_si: document.getElementById("rec-ma-bac-si")?.value || null
    };

    try {
        const res = await fetch(`${STAFF_API_BASE}/receive-patient`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showStaffNoticeModal("Không Thể Tiếp Nhận", data.message || "Lỗi khi tiếp nhận bệnh nhân!", true);
            return;
        }

        resetReceptionForm();
        vitalsStatusFilter = "ChoDo";
        await loadStaffDashboard();

        showReceptionSuccessModal({
            so_thu_tu_kham: data.so_thu_tu_kham,
            ma_ho_so_kham: data.ma_ho_so_kham,
            ma_benh_nhan: data.ma_benh_nhan,
            ho_ten: payload.ho_ten,
            so_dien_thoai: payload.so_dien_thoai,
            so_the_bhyt: payload.so_the_bhyt,
            ten_phong_kham: selectedRoomText,
            ten_bac_si: selectedDocText
        });
    } catch (error) {
        showStaffNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel (Cổng 8000)!", true);
    }
}

// =========================================================================
// 3. KHÁM SÀNG LỌC & ĐO CHỈ SỐ SINH HIỆU
// =========================================================================
function renderVitalsDeptFilterOptions(departments, vitalsList) {
    const select = document.getElementById("vt-dept-filter");
    if (!select) return;
    const currentVal = select.value || "ALL";
    const deptSet = new Set();

    (departments || []).forEach(d => {
        if (d.ten_khoa) deptSet.add(d.ten_khoa.trim());
    });
    (vitalsList || []).forEach(v => {
        if (v.ten_khoa) deptSet.add(v.ten_khoa.trim());
    });

    select.innerHTML = `<option value="ALL">-- Tất cả chuyên khoa --</option>` +
        Array.from(deptSet).map(name => `<option value="${name}">${name}</option>`).join("");

    if (currentVal !== "ALL" && deptSet.has(currentVal)) {
        select.value = currentVal;
    }
}

function setVitalsStatusFilter(status) {
    vitalsStatusFilter = status;
    const statusSelect = document.getElementById("vt-status-select");
    if (statusSelect && statusSelect.value !== status) {
        statusSelect.value = status;
    }
    renderVitalsListsAndTable();
}

function clearVitalsFilters() {
    const kwEl = document.getElementById("vt-search-input");
    const deptEl = document.getElementById("vt-dept-filter");
    const dateEl = document.getElementById("vt-date-input");
    const sortEl = document.getElementById("vt-sort-date");

    if (kwEl) kwEl.value = "";
    if (deptEl) deptEl.value = "ALL";
    if (dateEl) dateEl.value = "";
    if (sortEl) sortEl.value = "ASC";
    setVitalsStatusFilter("ChoDo");
}

function renderVitalsListsAndTable() {
    ensureUnifiedVitalsLayout();
    const tbody = document.getElementById("vitals-table-tbody");
    if (!tbody) return;

    const allVitals = getAllVitalsRecords();
    const keyword = (document.getElementById("vt-search-input")?.value || "").toLowerCase().trim();
    const deptFilter = document.getElementById("vt-dept-filter")?.value || "ALL";
    const statusSelect = document.getElementById("vt-status-select");
    if (statusSelect) {
        vitalsStatusFilter = statusSelect.value || vitalsStatusFilter;
    }
    const dateFilter = document.getElementById("vt-date-input")?.value || "";
    const sortOrder = document.getElementById("vt-sort-date")?.value || "ASC";

    const filtered = allVitals.filter(hs => {
        if (vitalsStatusFilter === "ChoDo" && hs.trang_thai_do !== "ChoDo") return false;
        if (vitalsStatusFilter === "DaDo" && hs.trang_thai_do !== "DaDo") return false;

        if (deptFilter !== "ALL" && (!hs.ten_khoa || hs.ten_khoa.trim() !== deptFilter)) return false;

        if (dateFilter) {
            const recDate = extractVitalsDateYmd(hs);
            if (recDate !== dateFilter) return false;
        }

        if (keyword) {
            const matchName = (hs.ho_ten || "").toLowerCase().includes(keyword);
            const matchBn = String(hs.ma_benh_nhan || "").toLowerCase().includes(keyword);
            const matchHs = String(hs.ma_ho_so_kham || "").toLowerCase().includes(keyword);
            const matchPhone = (hs.so_dien_thoai || "").toLowerCase().includes(keyword);
            const matchVneid = (hs.vneid || "").toLowerCase().includes(keyword);
            if (!matchName && !matchBn && !matchHs && !matchPhone && !matchVneid) return false;
        }

        return true;
    });

    filtered.sort((a, b) => {
        const dateA = extractVitalsDateYmd(a);
        const dateB = extractVitalsDateYmd(b);
        if (dateA !== dateB) {
            return sortOrder === "ASC" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        }
        const sttA = Number(a.so_thu_tu_kham || 0);
        const sttB = Number(b.so_thu_tu_kham || 0);
        return sortOrder === "ASC" ? sttA - sttB : sttB - sttA;
    });

    if (filtered.length === 0) {
        const emptyMsg = vitalsStatusFilter === "ChoDo"
            ? "Hiện không có bệnh nhân nào đang chờ đo sinh hiệu (Bệnh nhân sau khi được Tiếp nhận & Cấp số thứ tự sẽ hiển thị tại đây)."
            : "Không tìm thấy hồ sơ đo sinh hiệu nào phù hợp với bộ lọc hiện tại.";

        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="p-8 text-center text-slate-500">${emptyMsg}</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(hs => {
        const isWaiting = hs.trang_thai_do === "ChoDo";
        const recDate = extractVitalsDateYmd(hs) || "-";
        const recTime = hs.thoi_gian_tiep_nhan && String(hs.thoi_gian_tiep_nhan).length > 10
            ? String(hs.thoi_gian_tiep_nhan).substring(11, 16)
            : "";

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3">
                    <span class="inline-block px-2 py-0.5 rounded ${isWaiting ? 'bg-amber-500' : 'bg-teal-600'} text-white font-extrabold text-[11px]">
                        STT #${hs.so_thu_tu_kham || 1}
                    </span>
                    <div class="font-bold text-teal-800 mt-1">Hồ sơ: #${hs.ma_ho_so_kham}</div>
                </td>
                <td class="p-3 font-bold text-teal-700">
                    Mã BN: #${hs.ma_benh_nhan}<br/>
                    <span class="text-[10px] font-mono text-indigo-700">VNeID: ${hs.vneid || "-"}</span>
                </td>
                <td class="p-3 font-bold text-slate-900 uppercase">
                    ${hs.ho_ten || "-"}<br/>
                    <span class="text-[11px] font-semibold text-teal-700 normal-case">${hs.so_the_bhyt || "<span class='text-slate-400 font-normal'>Không BHYT</span>"}</span>
                </td>
                <td class="p-3">
                    <div>${hs.ngay_sinh ? String(hs.ngay_sinh).substring(0, 10) : "-"} (${hs.gioi_tinh || "Nam"})</div>
                    <div class="font-semibold text-slate-700 mt-0.5">${hs.so_dien_thoai || "-"}</div>
                </td>
                <td class="p-3">
                    <div class="font-bold text-emerald-700">Phòng ${hs.so_phong || "P102"} (${hs.ten_khoa || "Khoa Khám Bệnh"})</div>
                    <div class="text-[11px] font-bold text-sky-800 mt-0.5">${hs.ten_bac_si || "Bác sĩ chuyên khoa"}</div>
                </td>
                <td class="p-3 text-[11px] leading-relaxed">
                    ${isWaiting ? `
                        <span class="text-amber-700 italic font-semibold">Chưa đo chỉ số sinh hiệu</span>
                    ` : `
                        Mạch: <b class="text-teal-700">${hs.mach || 78} l/p</b> • T: <b class="text-rose-600">${hs.nhiet_do || 37}°C</b><br/>
                        HA: <b class="text-sky-700">${hs.huyet_ap || "120/80"}</b> • CN: <b>${hs.can_nang || 60}kg</b>
                    `}
                </td>
                <td class="p-3">
                    <b class="text-slate-900">${recDate}</b><br/>
                    <span class="text-[11px] text-slate-500">${recTime ? "Giờ: " + recTime : "Trong ngày"}</span>
                </td>
                <td class="p-3 max-w-[190px] truncate" title="${hs.trieu_chung_lam_sang || ''}">
                    ${hs.trieu_chung_lam_sang || "Khám lâm sàng"}
                </td>
                <td class="p-3">
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-bold inline-block whitespace-nowrap ${
                        isWaiting ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }">
                        ${isWaiting ? 'Đang chờ đo' : 'Đã đo sinh hiệu'}
                    </span>
                </td>
                <td class="p-3 text-right">
                    <button type="button" onclick="openVitalsFormForPatient('${hs.ma_ho_so_kham}')"
                            class="px-3 py-1.5 rounded-lg ${
                                isWaiting
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-300'
                            } font-bold text-xs inline-flex items-center gap-1 transition whitespace-nowrap">
                        <span class="material-symbols-outlined text-sm">${isWaiting ? 'vital_signs' : 'edit_note'}</span>
                        <span>${isWaiting ? 'Nhập sinh hiệu' : 'Xem / Sửa'}</span>
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function openVitalsFormForPatient(maHoSo) {
    const allVitals = getAllVitalsRecords();
    const hs = allVitals.find(item => String(item.ma_ho_so_kham) === String(maHoSo));
    if (!hs) return;

    currentVitalsPatient = hs;
    openStaffMenu("vitals-form");
    populateVitalsFormByRecord(hs);
}

function populateVitalsFormByRecord(hs) {
    currentVitalsPatient = hs;

    const isWaiting = hs.trang_thai_do === "ChoDo";
    document.getElementById("vt-card-stt").textContent = `#${hs.so_thu_tu_kham || 1}`;
    document.getElementById("vt-card-name").textContent = hs.ho_ten || "Bệnh nhân";
    document.getElementById("vt-card-codes").textContent = `Hồ sơ: #${hs.ma_ho_so_kham} • Mã BN: #${hs.ma_benh_nhan}`;

    const badgeEl = document.getElementById("vt-card-status-badge");
    if (badgeEl) {
        badgeEl.className = isWaiting
            ? "px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold"
            : "px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold";
        badgeEl.textContent = isWaiting ? "Đang chờ đo" : "Đã đo";
    }

    document.getElementById("vt-card-dob-gender").textContent =
        `${hs.ngay_sinh ? String(hs.ngay_sinh).substring(0, 10) : "-"} (${hs.gioi_tinh || "Nam"})`;
    document.getElementById("vt-card-phone").textContent = hs.so_dien_thoai || "-";
    document.getElementById("vt-card-bhyt").textContent = hs.so_the_bhyt || "Chưa có";
    document.getElementById("vt-card-room-dept").textContent =
        `Phòng ${hs.so_phong || "P102"} - ${hs.ten_khoa || "Khoa Khám Bệnh"}`;
    document.getElementById("vt-card-doctor").textContent =
        `Bác sĩ khám: ${hs.ten_bac_si || "Bác sĩ chuyên khoa"}`;
    document.getElementById("vt-card-symptom").textContent = hs.trieu_chung_lam_sang || "Khám lâm sàng";
    document.getElementById("vt-card-allergy").textContent = hs.tien_su_di_ung_benh_nen || "Không có";

    document.getElementById("vt-ma-ho-so").value = hs.ma_ho_so_kham;
    document.getElementById("vt-trieu-chung-goc").value = hs.trieu_chung_lam_sang || "Khám bệnh";
    document.getElementById("vt-tien-su-goc").value = hs.tien_su_di_ung_benh_nen || "Không có";

    document.getElementById("vt-mach").value = hs.mach || 78;
    document.getElementById("vt-nhiet-do").value = hs.nhiet_do || 37.0;
    document.getElementById("vt-huyet-ap").value = hs.huyet_ap || "120/80";
    document.getElementById("vt-nhip-tho").value = hs.nhip_tho || 18;
    document.getElementById("vt-can-nang").value = hs.can_nang || 62;
    document.getElementById("vt-chieu-cao").value = hs.chieu_cao || 168;
    document.getElementById("vt-ai-summary").value = hs.tom_tat_benh_su_ai || "";

    document.getElementById("vitals-selected-patient-label").textContent =
        `Đang nhập sinh hiệu cho: ${hs.ho_ten} (Hồ sơ #${hs.ma_ho_so_kham} • STT #${hs.so_thu_tu_kham} • Chuyển tới Phòng ${hs.so_phong || "P102"} - ${hs.ten_bac_si || ""})`;
}

function reAnnounceCurrentVitalsPatient() {
    // Đã tắt thanh thông báo gọi loa theo yêu cầu
}

async function generateAiVisitSummary() {
    const maHoSo = document.getElementById("vt-ma-ho-so").value;
    if (!maHoSo) {
        showStaffNoticeModal("Chưa Chọn Bệnh Nhân", "Vui lòng chọn một bệnh nhân trước khi dùng AI tóm tắt!", true);
        return;
    }

    const btn = document.getElementById("btn-ai-summarize");
    btn.disabled = true;
    btn.textContent = "⏳ AI đang phân tích...";

    const payload = {
        trieu_chung_ban_dau: document.getElementById("vt-trieu-chung-goc").value,
        tien_su_di_ung: document.getElementById("vt-tien-su-goc").value,
        mach: parseInt(document.getElementById("vt-mach").value || "78", 10),
        nhiet_do: parseFloat(document.getElementById("vt-nhiet-do").value || "37.0"),
        huyet_ap: document.getElementById("vt-huyet-ap").value || "120/80"
    };

    try {
        const res = await fetch(AI_SUMMARIZE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        document.getElementById("vt-ai-summary").value = data.tom_tat_benh_su_ai || "";
    } catch (error) {
        document.getElementById("vt-ai-summary").value =
            `- Triệu chứng: ${payload.trieu_chung_ban_dau}\n- Tiền sử dị ứng: ${payload.tien_su_di_ung}\n- Sinh hiệu: Mạch ${payload.mach} l/p, Nhiệt độ ${payload.nhiet_do}°C, HA ${payload.huyet_ap} mmHg.`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-sm">auto_awesome</span><span>AI Tự Động Tóm Tắt Ngay</span>`;
    }
}

async function submitVitalSigns(event) {
    event.preventDefault();
    const maHoSo = document.getElementById("vt-ma-ho-so").value;
    if (!maHoSo) {
        showStaffNoticeModal("Chưa Chọn Bệnh Nhân", "Vui lòng chọn một bệnh nhân để lưu chỉ số sinh hiệu!", true);
        return;
    }

    const user = getCurrentUser();
    const payload = {
        ma_ho_so_kham: maHoSo,
        ma_nhan_vien: user ? (user.ma_nhan_vien || user.ma_nguoi_dung) : "NV26112002",
        mach: document.getElementById("vt-mach").value,
        nhiet_do: document.getElementById("vt-nhiet-do").value,
        huyet_ap: document.getElementById("vt-huyet-ap").value,
        nhip_tho: document.getElementById("vt-nhip-tho").value,
        can_nang: document.getElementById("vt-can-nang").value,
        chieu_cao: document.getElementById("vt-chieu-cao").value,
        tom_tat_benh_su_ai: document.getElementById("vt-ai-summary").value.trim()
    };

    const patientSnapshot = currentVitalsPatient || {};

    try {
        const res = await fetch(`${STAFF_API_BASE}/save-vitals`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showStaffNoticeModal("Lỗi Lưu Sinh Hiệu", data.message || "Lỗi khi lưu sinh hiệu!", true);
            return;
        }

        await loadStaffDashboard();

        showVitalsSuccessModal(
            {
                ma_ho_so_kham: maHoSo,
                so_thu_tu_kham: patientSnapshot.so_thu_tu_kham || 1,
                ho_ten: patientSnapshot.ho_ten || "",
                ma_benh_nhan: patientSnapshot.ma_benh_nhan || "",
                so_phong: patientSnapshot.so_phong || "P102",
                ten_khoa: patientSnapshot.ten_khoa || "Khoa Khám Bệnh",
                ten_bac_si: patientSnapshot.ten_bac_si || "Bác sĩ chuyên khoa",
                mach: payload.mach,
                nhiet_do: payload.nhiet_do,
                huyet_ap: payload.huyet_ap,
                nhip_tho: payload.nhip_tho,
                can_nang: payload.can_nang,
                chieu_cao: payload.chieu_cao
            },
            () => {
                openStaffMenu("vitals-queue");
            }
        );
    } catch (error) {
        showStaffNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel!", true);
    }
}

// =========================================================================
// 4. DỊCH VỤ CẬN LÂM SÀNG (HIỂN THỊ DẠNG BẢNG TABLE + TRANG NHẬP KQ RIÊNG)
// =========================================================================
function renderClsServiceFilterOptions(allOrders) {
    const select = document.getElementById("cls-service-filter");
    if (!select) return;
    const currentVal = select.value || "ALL";
    const serviceSet = new Set();

    (allOrders || []).forEach(cd => {
        if (cd.ten_dich_vu_cls) serviceSet.add(cd.ten_dich_vu_cls.trim());
    });

    select.innerHTML = `<option value="ALL">-- Tất cả dịch vụ CLS --</option>` +
        Array.from(serviceSet).map(name => `<option value="${name}">${name}</option>`).join("");

    if (currentVal !== "ALL" && serviceSet.has(currentVal)) {
        select.value = currentVal;
    }
}

function setClsStatusFilter(status) {
    clsStatusFilter = status;
    const statusSelect = document.getElementById("cls-status-select");
    if (statusSelect && statusSelect.value !== status) {
        statusSelect.value = status;
    }
    renderClsQueuesByPayment();
}

function clearClsFilters() {
    const kwEl = document.getElementById("cls-search-input");
    const srvEl = document.getElementById("cls-service-filter");
    const dateEl = document.getElementById("cls-date-input");
    const sortEl = document.getElementById("cls-sort-date");

    if (kwEl) kwEl.value = "";
    if (srvEl) srvEl.value = "ALL";
    if (dateEl) dateEl.value = "";
    if (sortEl) sortEl.value = "ASC";
    setClsStatusFilter("ChoLam");
}

function renderClsQueuesByPayment(ordersParam = null) {
    ensureUnifiedClsLayout();
    const tbody = document.getElementById("cls-table-tbody");
    if (!tbody) return;

    const allOrders = ordersParam || (cachedDashboardData ? cachedDashboardData.hang_doi_cls : []) || [];
    const keyword = (document.getElementById("cls-search-input")?.value || "").toLowerCase().trim();
    const serviceFilter = document.getElementById("cls-service-filter")?.value || "ALL";
    const statusSelect = document.getElementById("cls-status-select");
    if (statusSelect) {
        clsStatusFilter = statusSelect.value || clsStatusFilter;
    }
    const dateFilter = document.getElementById("cls-date-input")?.value || "";
    const sortOrder = document.getElementById("cls-sort-date")?.value || "ASC";

    const filtered = allOrders.filter(cd => {
        if (clsStatusFilter === "ChoLam") {
            if (!(cd.trang_thai_nop_tien === "DaNop" && cd.trang_thai_thuc_hien !== "DaCoKetQua")) return false;
        } else if (clsStatusFilter === "DaCoKQ") {
            if (cd.trang_thai_thuc_hien !== "DaCoKetQua") return false;
        } else if (clsStatusFilter === "ChuaNop") {
            if (cd.trang_thai_nop_tien !== "ChuaNop") return false;
        }

        if (serviceFilter !== "ALL" && (!cd.ten_dich_vu_cls || cd.ten_dich_vu_cls.trim() !== serviceFilter)) {
            return false;
        }

        if (dateFilter) {
            const ordDate = extractClsDateYmd(cd);
            if (ordDate !== dateFilter) return false;
        }

        if (keyword) {
            const matchName = (cd.ho_ten || "").toLowerCase().includes(keyword);
            const matchBn = String(cd.ma_benh_nhan || "").toLowerCase().includes(keyword);
            const matchHs = String(cd.ma_ho_so_kham || "").toLowerCase().includes(keyword);
            const matchCd = String(cd.ma_chi_dinh_cls || "").toLowerCase().includes(keyword);
            const matchVneid = (cd.vneid || "").toLowerCase().includes(keyword);
            const matchSrv = (cd.ten_dich_vu_cls || "").toLowerCase().includes(keyword);
            if (!matchName && !matchBn && !matchHs && !matchCd && !matchVneid && !matchSrv) return false;
        }

        return true;
    });

    filtered.sort((a, b) => {
        const dateA = extractClsDateYmd(a);
        const dateB = extractClsDateYmd(b);
        if (dateA !== dateB) {
            return sortOrder === "ASC" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        }
        return sortOrder === "ASC"
            ? String(a.ma_chi_dinh_cls || "").localeCompare(String(b.ma_chi_dinh_cls || ""))
            : String(b.ma_chi_dinh_cls || "").localeCompare(String(a.ma_chi_dinh_cls || ""));
    });

    if (filtered.length === 0) {
        const emptyMessages = {
            ChoLam: "Hiện không có bệnh nhân nào đang chờ thực hiện Cận lâm sàng.",
            DaCoKQ: "Chưa có chỉ định Cận lâm sàng nào hoàn tất trả kết quả khớp với bộ lọc.",
            ChuaNop: "Không có chỉ định Cận lâm sàng nào đang chờ đóng phí tại Quầy Kế toán P104.",
            ALL: "Không tìm thấy chỉ định Cận lâm sàng nào khớp với bộ lọc."
        };

        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="p-8 text-center text-slate-500">
                    ${emptyMessages[clsStatusFilter] || emptyMessages.ALL}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(cd => {
        const isUnpaid = cd.trang_thai_nop_tien === "ChuaNop";
        const isDone = cd.trang_thai_thuc_hien === "DaCoKetQua";
        const imgCount = cd.danh_sach_anh ? cd.danh_sach_anh.length : 0;
        const ordDate = extractClsDateYmd(cd);

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3">
                    <span class="inline-block px-2 py-0.5 rounded bg-sky-600 text-white font-extrabold text-[11px]">
                        STT #${cd.so_thu_tu_kham || 1}
                    </span>
                    <div class="font-bold text-teal-800 mt-1">Hồ sơ: #${cd.ma_ho_so_kham}</div>
                </td>
                <td class="p-3 font-bold text-indigo-700">
                    #${cd.ma_chi_dinh_cls}<br/>
                    <span class="text-[11px] font-semibold text-teal-700">Mã BN: #${cd.ma_benh_nhan || "-"}</span>
                </td>
                <td class="p-3 font-bold text-slate-900 uppercase">
                    ${cd.ho_ten || "-"}<br/>
                    <span class="text-[10px] font-mono text-slate-500 normal-case">VNeID: ${cd.vneid || "-"}</span>
                </td>
                <td class="p-3">
                    <div class="font-bold text-indigo-900">${cd.ten_dich_vu_cls || "-"}</div>
                    ${ordDate ? `<div class="text-[11px] text-slate-500 mt-0.5">Ngày: <b>${ordDate}</b></div>` : ""}
                </td>
                <td class="p-3">
                    <div class="font-semibold text-emerald-700">Phòng ${cd.phong_bac_si || "P102"}</div>
                    <div class="text-[11px] text-slate-500">${cd.ten_phong_bac_si || "Phòng Bác sĩ"}</div>
                </td>
                <td class="p-3">
                    <div class="font-bold text-slate-900">${Number(cd.don_gia_cls || 0).toLocaleString("vi-VN")}đ</div>
                    <span class="text-[10px] font-bold ${isUnpaid ? 'text-amber-700' : 'text-emerald-700'}">
                        ${isUnpaid ? 'Chờ thu tại P104' : 'Đã thu tiền'}
                    </span>
                </td>
                <td class="p-3 max-w-[220px]">
                    ${isDone ? `
                        <div class="text-slate-800 truncate" title="${cd.ket_qua_cls || ''}">${cd.ket_qua_cls || "Đã có kết quả"}</div>
                        <div class="text-[11px] font-bold text-sky-700 mt-0.5">${imgCount} ảnh đính kèm</div>
                    ` : `<span class="text-slate-400 italic">Chưa cập nhật kết quả</span>`}
                </td>
                <td class="p-3">
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-bold inline-block whitespace-nowrap ${
                        isUnpaid
                            ? 'bg-amber-100 text-amber-800'
                            : (isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800')
                    }">
                        ${isUnpaid ? '💳 Chờ đóng phí' : (isDone ? 'Đã có kết quả' : 'Chờ làm CLS')}
                    </span>
                </td>
                <td class="p-3 text-right">
                    ${isUnpaid ? `
                        <span class="text-[11px] font-semibold text-amber-700">Chờ Kế toán thu</span>
                    ` : `
                        <button type="button" onclick="openClsFormForOrder('${cd.ma_chi_dinh_cls}')"
                                class="px-3 py-1.5 rounded-lg ${
                                    !isDone
                                        ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-2xs'
                                        : 'bg-slate-100 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-300'
                                } font-bold text-xs inline-flex items-center gap-1 transition whitespace-nowrap">
                            <span class="material-symbols-outlined text-sm">${!isDone ? 'biotech' : 'edit_note'}</span>
                            <span>${!isDone ? 'Nhập kết quả' : 'Xem / Sửa KQ'}</span>
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join("");
}

function openClsFormForOrder(maChiDinhCls) {
    if (!cachedDashboardData) return;
    const cd = (cachedDashboardData.hang_doi_cls || []).find(
        item => String(item.ma_chi_dinh_cls) === String(maChiDinhCls)
    );
    if (!cd) return;

    currentClsOrder = cd;
    openStaffMenu("cls-form");
    populateClsFormByRecord(cd);
}

function callAndSelectClsOrder(maChiDinhCls) {
    openClsFormForOrder(maChiDinhCls);
}

function populateClsFormByRecord(cd) {
    currentClsOrder = cd;
    selectedClsImages = [];
    renderClsImagesPreviewGrid();

    const isDone = cd.trang_thai_thuc_hien === "DaCoKetQua";

    document.getElementById("cls-card-stt").textContent = `#${cd.so_thu_tu_kham || 1}`;
    document.getElementById("cls-card-name").textContent = cd.ho_ten || "Bệnh nhân";
    document.getElementById("cls-card-codes").textContent = `Hồ sơ: #${cd.ma_ho_so_kham} • Mã BN: #${cd.ma_benh_nhan}`;

    const badgeEl = document.getElementById("cls-card-status-badge");
    if (badgeEl) {
        badgeEl.className = isDone
            ? "px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold"
            : "px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold";
        badgeEl.textContent = isDone ? "Đã có kết quả" : "Chờ thực hiện";
    }

    document.getElementById("cls-card-service").textContent = cd.ten_dich_vu_cls || "Dịch vụ Cận lâm sàng";
    document.getElementById("cls-card-order-code").textContent = `Mã chỉ định: #${cd.ma_chi_dinh_cls}`;
    document.getElementById("cls-card-doctor-room").textContent =
        `Phòng ${cd.phong_bac_si || "P102"} (${cd.ten_phong_bac_si || "Phòng Bác sĩ"})`;
    document.getElementById("cls-card-price").textContent =
        `${Number(cd.don_gia_cls || 0).toLocaleString("vi-VN")}đ`;
    document.getElementById("cls-card-payment").textContent =
        cd.trang_thai_nop_tien === "DaNop" ? "Đã thu tại P104" : "Chờ đóng phí";

    document.getElementById("cls-ma-chi-dinh").value = cd.ma_chi_dinh_cls;
    document.getElementById("cls-ket-qua-text").value = cd.ket_qua_cls || "";
    document.getElementById("cls-ai-note").value = cd.ai_phan_tich_cls || "";

    document.getElementById("cls-selected-order-label").textContent =
        `Đang thực hiện (#${cd.ma_chi_dinh_cls}): ${cd.ten_dich_vu_cls} • Bệnh nhân: ${cd.ho_ten} • Xong đủ các dịch vụ CLS sẽ đẩy về Phòng ${cd.phong_bac_si || "P102"}`;
}

function reAnnounceCurrentClsPatient() {
    // Đã tắt thanh thông báo gọi loa theo yêu cầu
}

function handleSelectMultipleClsImages(event) {
    const files = Array.from(event.target.files);
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedClsImages.push({
                name: file.name,
                base64: e.target.result,
                note: `Ảnh kết quả ${file.name}`
            });
            renderClsImagesPreviewGrid();
        };
        reader.readAsDataURL(file);
    });
}

function updateClsImageNote(index, value) {
    if (selectedClsImages[index]) {
        selectedClsImages[index].note = value;
    }
}

function removeClsImageItem(index) {
    selectedClsImages.splice(index, 1);
    renderClsImagesPreviewGrid();
}

function renderClsImagesPreviewGrid() {
    const grid = document.getElementById("cls-images-preview-grid");
    if (!grid) return;

    if (selectedClsImages.length === 0) {
        grid.innerHTML = "";
        return;
    }

    grid.innerHTML = selectedClsImages.map((item, idx) => `
        <div class="p-2.5 rounded-xl bg-white border border-indigo-200 flex items-center gap-2.5 shadow-sm">
            <img src="${item.base64}" class="w-16 h-16 object-cover rounded-lg border border-slate-200 shrink-0"/>
            <div class="flex-1 min-w-0">
                <label class="text-[10px] font-bold text-slate-500 block">Ghi chú ảnh #${idx + 1}</label>
                <input type="text" value="${item.note}" oninput="updateClsImageNote(${idx}, this.value)"
                       placeholder="VD: Phim X-quang phổi thẳng"
                       class="w-full h-8 px-2 rounded border-slate-300 text-xs mt-0.5"/>
            </div>
            <button type="button" onclick="removeClsImageItem(${idx})" class="w-7 h-7 rounded-full bg-red-100 text-red-600 hover:bg-red-600 hover:text-white font-bold text-xs shrink-0">×</button>
        </div>
    `).join("");
}

async function submitClsResult(event) {
    event.preventDefault();
    const maChiDinh = document.getElementById("cls-ma-chi-dinh").value.trim();
    if (!maChiDinh) {
        showStaffNoticeModal("Chưa Chọn Chỉ Định CLS", "Vui lòng chọn một bệnh nhân từ Danh sách Cận lâm sàng trước!", true);
        return;
    }

    const user = getCurrentUser();
    const payload = {
        ma_chi_dinh_cls: maChiDinh,
        ma_nhan_vien: user ? (user.ma_nhan_vien || user.ma_nguoi_dung) : "NV26112008",
        ket_qua_cls: document.getElementById("cls-ket-qua-text").value.trim(),
        ai_phan_tich_cls: document.getElementById("cls-ai-note").value.trim(),
        images: selectedClsImages
    };

    const orderSnapshot = currentClsOrder || {};
    const uploadedImgCount = selectedClsImages.length + (orderSnapshot.danh_sach_anh ? orderSnapshot.danh_sach_anh.length : 0);

    try {
        const res = await fetch(`${STAFF_API_BASE}/upload-cls-result`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showStaffNoticeModal("Lỗi Lưu Kết Quả CLS", data.message || "Lỗi khi lưu kết quả CLS!", true);
            return;
        }

        selectedClsImages = [];
        renderClsImagesPreviewGrid();
        document.getElementById("staff-cls-form").reset();
        document.getElementById("cls-ma-chi-dinh").value = "";
        await loadStaffDashboard();

        const pendingCount = Number(data.pending_cls_count || 0);

        showClsSuccessModal(
            {
                ma_chi_dinh_cls: maChiDinh,
                ma_ho_so_kham: orderSnapshot.ma_ho_so_kham || "",
                ho_ten: orderSnapshot.ho_ten || "",
                ma_benh_nhan: orderSnapshot.ma_benh_nhan || "",
                ten_dich_vu_cls: orderSnapshot.ten_dich_vu_cls || "",
                ket_qua_cls: payload.ket_qua_cls,
                so_luong_anh: uploadedImgCount,
                phong_bac_si: orderSnapshot.phong_bac_si || "P102",
                ten_phong_bac_si: orderSnapshot.ten_phong_bac_si || "Phòng Bác sĩ chuyên khoa",
                pending_cls_count: pendingCount,
                all_cls_completed: pendingCount === 0
            },
            () => {
                openStaffMenu("cls-paid");
            }
        );
    } catch (error) {
        showStaffNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel!", true);
    }
}