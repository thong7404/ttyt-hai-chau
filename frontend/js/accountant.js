const ACCOUNTANT_API_BASE = "http://127.0.0.1:8000/api/accountant";

let cachedAccountantData = null;
let pendingPaymentData = null;
let accModalCloseCallback = null;
let currentExportedInvoice = null;

function getCurrentUser() {
    try {
        const raw = localStorage.getItem("current_user");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function getInitials(name) {
    if (!name) return "KT";
    const clean = name.replace(/^(CN\.|KT\.|BS\.|ThS\.|ĐD\.|DS\.)\s*/i, "").trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
}

function formatPaymentMethodLabel(methodCode) {
    const map = {
        ChuyenKhoan_VietQR: "Chuyển khoản VietQR",
        ViDienTu_VNeID: "Ví điện tử VNeID",
        TienMat: "Tiền mặt tại Quầy P104"
    };
    return map[methodCode] || methodCode || "Chuyển khoản VietQR";
}

function formatVnd(amount) {
    return Number(amount || 0).toLocaleString("vi-VN") + "đ";
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("acc-calling-banner")?.remove();

    const user = getCurrentUser();
    if (user) {
        const nameEl = document.getElementById("acc-sidebar-name");
        const dropNameEl = document.getElementById("acc-dropdown-name");
        const emailEl = document.getElementById("acc-sidebar-email");
        const initialsEl = document.getElementById("acc-sidebar-initials");
        const subEl = document.getElementById("acc-header-sub");
        const deptEl = document.getElementById("acc-dropdown-dept");

        const maNv = user.ma_nhan_vien || user.ma_nguoi_dung || "NV004";
        const tenKhoa = user.ten_khoa || "Phòng Tài Chính - Kế Toán";

        if (nameEl && user.ho_ten) nameEl.textContent = user.ho_ten;
        if (dropNameEl && user.ho_ten) dropNameEl.textContent = user.ho_ten;
        if (emailEl && user.email) emailEl.textContent = user.email;
        if (initialsEl && user.ho_ten) initialsEl.textContent = getInitials(user.ho_ten);
        if (subEl) subEl.textContent = `Mã NV: #${maNv} • P104`;
        if (deptEl) deptEl.textContent = `Mã NV: #${maNv} • ${tenKhoa}`;
    }

    ensureAccountantConfirmModalDOM();
    ensureInvoiceExportModalDOM();
    ensureRevenueReportModalDOM();
    ensureLedgerSummaryAndFilterDOM();
    loadAccountantDashboard();
});

function logoutAccountant() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

function switchAccountantView(viewName) {
    const views = ["cls", "exam", "ledger"];
    const titleEl = document.getElementById("current-acc-workspace-title");

    const titleMap = {
        cls: "THU PHÍ DỊCH VỤ CẬN LÂM SÀNG (ĐỢT 1)",
        exam: "THU VIỆN PHÍ KHÁM LÂM SÀNG & ĐƠN THUỐC NGOẠI TRÚ (ĐỢT 2)",
        ledger: "SỔ QUẢN LÝ HÓA ĐƠN VIỆN PHÍ & QUYẾT TOÁN QUỸ BHYT"
    };
    if (titleEl && titleMap[viewName]) {
        titleEl.textContent = titleMap[viewName];
    }

    const badgeConfig = {
        cls: { id: "badge-acc-cls", idleCls: "bg-amber-500 text-white" },
        exam: { id: "badge-acc-exam", idleCls: "bg-rose-500 text-white" },
        ledger: { id: "badge-acc-ledger", idleCls: "bg-sky-600 text-white" }
    };

    views.forEach(v => {
        const panel = document.getElementById(`acc-view-${v}`);
        const btn = document.getElementById(`acc-nav-${v}`);
        const badge = document.getElementById(badgeConfig[v].id);
        if (!panel || !btn) return;

        if (v === viewName) {
            panel.classList.remove("hidden");
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-white bg-teal-600 shadow-xs flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = "px-1.5 py-0.2 rounded-full bg-white/25 text-white text-[10px] font-extrabold";
        } else {
            panel.classList.add("hidden");
            btn.className = "px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 whitespace-nowrap transition";
            if (badge) badge.className = `px-1.5 py-0.2 rounded-full ${badgeConfig[v].idleCls} text-[10px] font-extrabold`;
        }
    });
}

// =========================================================================
// HỘP THOẠI THÔNG BÁO
// =========================================================================
function ensureAccountantConfirmModalDOM() {
    if (document.getElementById("accountant-confirm-modal")) return;
    const modal = document.createElement("div");
    modal.id = "accountant-confirm-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4";
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-teal-200 animate-[fadeIn_0.18s_ease-out]">
            <div id="acm-header" class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative">
                <button type="button" onclick="closeAccountantConfirmModal()"
                        class="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
                <div class="w-14 h-14 rounded-full bg-white text-teal-600 flex items-center justify-center mx-auto mb-2 shadow-md">
                    <span id="acm-icon" class="material-symbols-outlined text-3xl">verified</span>
                </div>
                <h3 id="acm-title" class="font-heading font-extrabold text-lg">Thông Báo Hệ Thống</h3>
                <p id="acm-subtitle" class="text-xs text-teal-50 mt-0.5">Quầy Thu Ngân Viện Phí P104</p>
            </div>
            <div class="p-6 space-y-4 text-xs sm:text-sm">
                <div id="acm-body"></div>
                <button type="button" onclick="closeAccountantConfirmModal()"
                        class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-md transition flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined text-base">check</span>
                    <span>Đóng</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function showAccountantNoticeModal(title, messageHtml, isError = false, onClose = null) {
    ensureAccountantConfirmModalDOM();
    accModalCloseCallback = onClose;

    document.getElementById("acm-header").className = isError
        ? "bg-gradient-to-r from-rose-600 to-amber-600 text-white px-6 py-5 text-center relative"
        : "bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative";
    document.getElementById("acm-icon").textContent = isError ? "warning" : "verified";
    document.getElementById("acm-title").textContent = title;
    document.getElementById("acm-subtitle").textContent = isError
        ? "Vui lòng kiểm tra lại thông tin"
        : "Quầy Thu Ngân Viện Phí P104 • TTYT Phường Hải Châu";

    document.getElementById("acm-body").innerHTML = `
        <div class="p-4 rounded-xl ${isError ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-teal-50/70 border-teal-200 text-slate-800'} border font-semibold text-center leading-relaxed">
            ${messageHtml}
        </div>
    `;

    const modal = document.getElementById("accountant-confirm-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeAccountantConfirmModal() {
    const modal = document.getElementById("accountant-confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    if (typeof accModalCloseCallback === "function") {
        const cb = accModalCloseCallback;
        accModalCloseCallback = null;
        cb();
    }
}

// =========================================================================
// HỆ THỐNG XUẤT & IN HÓA ĐƠN VIỆN PHÍ CÁ NHÂN KHI XÁC NHẬN THU TIỀN
// =========================================================================
function ensureInvoiceExportModalDOM() {
    if (document.getElementById("hospital-invoice-export-modal")) return;

    const modal = document.createElement("div");
    modal.id = "hospital-invoice-export-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm hidden items-center justify-center p-4 overflow-y-auto";
    modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border-2 border-teal-500 my-auto animate-[fadeIn_0.18s_ease-out]">
            <div class="bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 text-white px-6 py-4 flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-2xl">receipt_long</span>
                    <div>
                        <h3 class="font-heading font-extrabold text-sm sm:text-base uppercase tracking-wide">
                            Đã Thu Tiền & Xuất Hóa Đơn Viện Phí Điện Tử
                        </h3>
                        <p class="text-[11px] text-teal-100">Chứng từ thu ngân Quầy P104 </p>
                    </div>
                </div>
                <button type="button" onclick="closeInvoiceExportModal()"
                        class="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
            </div>

            <div id="printable-invoice-area" class="p-6 space-y-4 text-xs text-slate-800 bg-white max-h-[72vh] overflow-y-auto"></div>

            <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                <button type="button" onclick="closeInvoiceExportModal()"
                        class="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition">
                    Đóng cửa sổ
                </button>

                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" onclick="downloadCurrentInvoiceHtml()"
                            class="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition">
                        <span class="material-symbols-outlined text-base">download</span>
                        <span>Tải File Hóa Đơn</span>
                    </button>
                    <button type="button" onclick="printCurrentHospitalInvoice()"
                            class="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md transition">
                        <span class="material-symbols-outlined text-base">print</span>
                        <span>In Hóa Đơn / Xuất PDF Ngay</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeInvoiceExportModal() {
    const modal = document.getElementById("hospital-invoice-export-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function normalizeInvoiceForExport(inv) {
    const user = getCurrentUser();
    const cashierName = (user && user.ho_ten) ? user.ho_ten : "CN. Lê Thị Thu Ngân";
    const isCls = inv.loai_hoa_don === "Dot1_ThuTienCLS";

    let items = Array.isArray(inv.items) && inv.items.length > 0 ? inv.items : [];
    if (items.length === 0) {
        items = [
            {
                ten_hang_muc: isCls
                    ? (inv.ten_dich_vu_cls || "Dịch vụ Cận lâm sàng chỉ định")
                    : `Công khám lâm sàng & Đơn thuốc ngoại trú (${inv.ten_khoa || "Chuyên khoa"})`,
                loai_hang_muc: isCls ? "DichVuCLS" : "PhiKhamVaThuoc",
                so_luong: 1,
                don_gia: Number(inv.tong_tien_goc || 0),
                thanh_tien: Number(inv.tong_tien_goc || 0)
            }
        ];
    }

    const cleanDiag = String(inv.ket_luan_chan_doan || "Khám lâm sàng & Cận lâm sàng").replace(/^\[[A-Za-z0-9.]+\]\s*/, "");

    return {
        ma_hoa_don: inv.ma_hoa_don || "HD---",
        ma_ho_so_kham: inv.ma_ho_so_kham || "HS---",
        so_thu_tu_kham: inv.so_thu_tu_kham || "1",
        ten_benh_nhan: inv.ten_benh_nhan || "BỆNH NHÂN",
        ma_benh_nhan: inv.ma_benh_nhan || "BN---",
        vneid: inv.vneid || "Chưa cập nhật",
        so_dien_thoai: inv.so_dien_thoai || "-",
        so_the_bhyt: inv.so_the_bhyt || "",
        stk_ngan_hang: inv.stk_ngan_hang || "Chưa cập nhật",
        ten_khoa: inv.ten_khoa || (isCls ? "Khoa Cận Lâm Sàng" : "Khoa Khám Bệnh"),
        so_phong: inv.so_phong || (isCls ? "P201" : "P102"),
        ket_luan_chan_doan: cleanDiag,
        loai_hoa_don: inv.loai_hoa_don || "Dot2_ThuTienKhamVaThuoc",
        loai_hoa_don_label: isCls
            ? "Đợt 1: Thu Phí Dịch Vụ Cận Lâm Sàng (Chuyển Phòng P201)"
            : "Đợt 2: Thu Viện Phí Khám Lâm Sàng & Đơn Thuốc BHYT (Mở khóa Quầy Dược P105)",
        tong_tien_goc: Number(inv.tong_tien_goc || 0),
        tien_bhyt_chi_tra: Number(inv.tien_bhyt_chi_tra || 0),
        tien_benh_nhan_tra: Number(inv.tien_benh_nhan_tra || 0),
        phuong_thuc_thanh_toan: formatPaymentMethodLabel(inv.phuong_thuc_thanh_toan),
        stk_benh_vien: inv.stk_benh_vien || "0041000888999 - Vietcombank (TTYT Phường Hải Châu)",
        ma_giao_dich_ngan_hang: inv.ma_giao_dich_ngan_hang || ("VCB-FT" + new Date().getTime().toString().slice(-8)),
        thoi_gian_thu: inv.thoi_gian_thu || new Date().toLocaleString("vi-VN"),
        nguoi_thu_tien: cashierName,
        items: items
    };
}

function showAndExportHospitalInvoiceModal(rawInvoice) {
    if (!rawInvoice) return;
    ensureInvoiceExportModalDOM();

    const inv = normalizeInvoiceForExport(rawInvoice);
    currentExportedInvoice = inv;

    const hasBhyt = Boolean(inv.so_the_bhyt);
    const itemsRowsHtml = inv.items.map((it, idx) => `
        <tr class="border-b border-slate-200">
            <td class="py-2 px-2.5 text-center font-semibold text-slate-600">${idx + 1}</td>
            <td class="py-2 px-2.5 font-bold text-slate-800">
                ${it.ten_hang_muc}
                <span class="block text-[10px] font-normal text-slate-500">Phân loại: ${it.loai_hang_muc || "Viện phí"}</span>
            </td>
            <td class="py-2 px-2.5 text-center font-semibold">${it.so_luong || 1}</td>
            <td class="py-2 px-2.5 text-right font-medium">${Number(it.don_gia || 0).toLocaleString("vi-VN")}đ</td>
            <td class="py-2 px-2.5 text-right font-bold text-teal-800">${Number(it.thanh_tien || 0).toLocaleString("vi-VN")}đ</td>
        </tr>
    `).join("");

    const invoiceBox = document.getElementById("printable-invoice-area");
    invoiceBox.innerHTML = `
        <div class="flex flex-wrap items-start justify-between gap-4 border-b-2 border-teal-600 pb-3">
            <div>
                <div class="font-extrabold text-teal-900 text-xs uppercase">SỞ Y TẾ THÀNH PHỐ ĐÀ NẴNG</div>
                <div class="font-heading font-extrabold text-teal-700 text-sm sm:text-base uppercase">
                    TRUNG TÂM Y TẾ PHƯỜNG HẢI CHÂU
                </div>
                <div class="text-[11px] text-slate-500">
                    Địa chỉ: Phường Hải Châu, TP. Đà Nẵng • ĐT: (0236) 3822 292
                </div>
            </div>
            <div class="text-right">
                <span class="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs border border-emerald-300">
                    ĐÃ THU TIỀN VIỆN PHÍ
                </span>
                <div class="font-mono font-bold text-teal-800 text-xs mt-1">
                    Số HĐ: #${inv.ma_hoa_don} • Hồ sơ: #${inv.ma_ho_so_kham}
                </div>
            </div>
        </div>

        <div class="text-center py-1">
            <h2 class="font-heading font-extrabold text-lg sm:text-xl text-slate-900 uppercase tracking-tight">
                HÓA ĐƠN THU TIỀN VIỆN PHÍ & BẢO HIỂM Y TẾ
            </h2>
            <p class="text-[11px] font-bold text-teal-700 mt-0.5">${inv.loai_hoa_don_label}</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
            <div>
                <span class="text-slate-500">Họ và tên người bệnh:</span>
                <b class="text-slate-900 uppercase ml-1">${inv.ten_benh_nhan}</b>
                <span class="text-teal-700 font-bold">(#${inv.ma_benh_nhan})</span>
            </div>
            <div>
                <span class="text-slate-500">Số định danh VNeID:</span>
                <b class="font-mono text-indigo-700 ml-1">${inv.vneid}</b>
            </div>
            <div>
                <span class="text-slate-500">Mã thẻ BHYT:</span>
                <b class="${hasBhyt ? 'text-emerald-700' : 'text-slate-500'} ml-1">
                    ${hasBhyt ? `${inv.so_the_bhyt} (Quỹ BHYT hưởng 80%)` : "Không có BHYT (Viện phí 100%)"}
                </b>
            </div>
            <div>
                <span class="text-slate-500">Khoa / Phòng chỉ định:</span>
                <b class="text-slate-800 ml-1">${inv.ten_khoa} (Phòng ${inv.so_phong})</b>
            </div>
            <div class="sm:col-span-2">
                <span class="text-slate-500">Chẩn đoán / Nội dung:</span>
                <b class="text-slate-800 ml-1">${inv.ket_luan_chan_doan}</b>
            </div>
        </div>

        <div>
            <div class="font-bold text-slate-700 uppercase text-[11px] mb-1.5">
                Chi tiết hạng mục viện phí :
            </div>
            <div class="overflow-hidden rounded-xl border border-slate-300">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr class="bg-teal-600 text-white uppercase text-[11px] font-bold">
                            <th class="py-2 px-2.5 text-center w-10">STT</th>
                            <th class="py-2 px-2.5">Tên dịch vụ khám / Cận lâm sàng / Thuốc</th>
                            <th class="py-2 px-2.5 text-center w-16">SL</th>
                            <th class="py-2 px-2.5 text-right w-28">Đơn giá</th>
                            <th class="py-2 px-2.5 text-right w-28">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="p-4 rounded-2xl bg-teal-50/80 border border-teal-200 space-y-2">
            <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-600">1. Tổng chi phí gốc:</span>
                <b class="text-slate-900 text-sm">${inv.tong_tien_goc.toLocaleString("vi-VN")} đồng</b>
            </div>
            <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-600">2. Quỹ Bảo hiểm Y tế chi trả (${hasBhyt ? '80%' : '0%'}):</span>
                <b class="text-teal-700 text-sm">- ${inv.tien_bhyt_chi_tra.toLocaleString("vi-VN")} đồng</b>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-teal-200/80">
                <span class="font-extrabold text-slate-900 uppercase text-xs sm:text-sm">3. Thực thu bệnh nhân đồng chi trả:</span>
                <span class="font-heading font-extrabold text-lg text-rose-600">${inv.tien_benh_nhan_tra.toLocaleString("vi-VN")} đồng</span>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px] text-slate-600">
            <div class="space-y-1 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>Phương thức thu: <b class="text-slate-900">${inv.phuong_thuc_thanh_toan}</b></div>
                <div>Mã giao dịch: <b class="font-mono text-emerald-700">${inv.ma_giao_dich_ngan_hang}</b></div>
                <div>STK Bệnh nhân: <b class="text-slate-800">${inv.stk_ngan_hang}</b></div>
                <div>STK Bệnh viện: <b class="text-teal-800">${inv.stk_benh_vien}</b></div>
                <div>Thời gian thu: <b>${inv.thoi_gian_thu}</b></div>
            </div>

            <div class="flex flex-col justify-between text-center p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                    <div class="font-bold text-slate-800 uppercase">Kế Toán Thu Ngân (Quầy P104)</div>
                    <div class="text-[10px] text-slate-400 italic">(Ký, ghi rõ họ tên & đóng dấu xác nhận)</div>
                </div>
                <div class="py-2 text-emerald-600 font-extrabold text-xs">
                    ✓ Đã xác thực giao dịch điện tử
                </div>
                <div class="font-bold text-teal-900 text-xs">${inv.nguoi_thu_tien}</div>
            </div>
        </div>
    `;

    const modal = document.getElementById("hospital-invoice-export-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function openInvoiceExportById(maHoaDon) {
    if (!cachedAccountantData) return;
    const inv = (cachedAccountantData.invoices || []).find(
        i => String(i.ma_hoa_don) === String(maHoaDon)
    );
    if (!inv) {
        showAccountantNoticeModal("Không Tìm Thấy Hóa Đơn", `Không tìm thấy hóa đơn #${maHoaDon}!`, true);
        return;
    }
    showAndExportHospitalInvoiceModal(inv);
}

function openInvoiceExportByClsOrder(maChiDinhCls, maHoSoKham) {
    if (!cachedAccountantData) return;
    const invoices = cachedAccountantData.invoices || [];

    let matchedInv = invoices.find(
        i => String(i.ma_ho_so_kham) === String(maHoSoKham) && i.loai_hoa_don === "Dot1_ThuTienCLS"
    ) || invoices.find(i => String(i.ma_ho_so_kham) === String(maHoSoKham));

    if (matchedInv) {
        showAndExportHospitalInvoiceModal(matchedInv);
        return;
    }

    const cls = (cachedAccountantData.cls_orders || []).find(
        c => String(c.ma_chi_dinh_cls) === String(maChiDinhCls)
    );
    if (!cls) return;

    const donGia = Number(cls.don_gia_cls || 0);
    const bhytTra = cls.so_the_bhyt ? Math.round(donGia * 0.8) : 0;
    const bnTra = donGia - bhytTra;

    showAndExportHospitalInvoiceModal({
        ma_hoa_don: "HD-CLS-" + cls.ma_chi_dinh_cls,
        ma_ho_so_kham: cls.ma_ho_so_kham,
        so_thu_tu_kham: cls.so_thu_tu_kham,
        ten_benh_nhan: cls.ten_benh_nhan,
        ma_benh_nhan: cls.ma_benh_nhan,
        vneid: cls.vneid,
        so_the_bhyt: cls.so_the_bhyt,
        stk_ngan_hang: cls.stk_ngan_hang,
        ten_khoa: "Khoa Cận Lâm Sàng",
        so_phong: cls.phong_thuc_hien || "P201",
        ket_luan_chan_doan: cls.ten_dich_vu_cls,
        loai_hoa_don: "Dot1_ThuTienCLS",
        tong_tien_goc: donGia,
        tien_bhyt_chi_tra: bhytTra,
        tien_benh_nhan_tra: bnTra,
        phuong_thuc_thanh_toan: "ChuyenKhoan_VietQR",
        items: [
            {
                ten_hang_muc: cls.ten_dich_vu_cls,
                loai_hang_muc: "DichVuCLS",
                so_luong: 1,
                don_gia: donGia,
                thanh_tien: donGia
            }
        ]
    });
}

function printCurrentHospitalInvoice() {
    const area = document.getElementById("printable-invoice-area");
    if (!area || !currentExportedInvoice) return;

    const printWin = window.open("", "_blank", "width=850,height=720");
    if (!printWin) {
        window.print();
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="utf-8"/>
            <title>Hóa Đơn Viện Phí #${currentExportedInvoice.ma_hoa_don} - ${currentExportedInvoice.ten_benh_nhan}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @page { size: A4 portrait; margin: 14mm; }
                body { font-family: Arial, sans-serif; background: #fff; color: #0f172a; }
            </style>
        </head>
        <body class="p-4">
            <div class="max-w-2xl mx-auto border border-slate-300 rounded-2xl p-6 space-y-4">
                ${area.innerHTML}
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 350);
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

function downloadCurrentInvoiceHtml() {
    const area = document.getElementById("printable-invoice-area");
    if (!area || !currentExportedInvoice) return;

    const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8"/>
    <title>Hoa_Don_${currentExportedInvoice.ma_hoa_don}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-8 bg-slate-100">
    <div class="max-w-2xl mx-auto bg-white border border-teal-500 rounded-2xl p-6 space-y-4 shadow">
        ${area.innerHTML}
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Hoa_Don_Vien_Phi_${currentExportedInvoice.ma_hoa_don}_${currentExportedInvoice.ma_ho_so_kham}.html`;
    link.click();
}

// =========================================================================
// 1. TẢI DỮ LIỆU KẾ TOÁN TỪ MYSQL
// =========================================================================
async function loadAccountantDashboard() {
    try {
        const res = await fetch(`${ACCOUNTANT_API_BASE}/dashboard-data`, {
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        if (!res.ok || data.status !== "success") return;

        cachedAccountantData = data;

        const stats = calculateHospitalRevenueSummary();

        document.getElementById("acc-stat-unpaid-cls").textContent = `${stats.unpaidCls.length} chỉ định`;
        document.getElementById("acc-stat-unpaid-inv").textContent = `${stats.unpaidInv.length} hóa đơn`;
        document.getElementById("acc-stat-bhyt-paid").textContent = formatVnd(stats.paidBhyt);
        document.getElementById("acc-stat-patient-paid").textContent = formatVnd(stats.paidPatient);

        document.getElementById("badge-acc-cls").textContent = stats.unpaidCls.length;
        document.getElementById("badge-acc-exam").textContent = stats.unpaidInv.length;
        document.getElementById("badge-acc-ledger").textContent = stats.allInvoices.length;

        renderAccountantClsTable();
        renderAccountantExamInvoices();
        renderAccountantLedgerTable();
    } catch (e) {
        console.error("Lỗi tải dữ liệu Kế toán:", e);
    }
}

/**
 * Tính toán toàn bộ số liệu Báo cáo Doanh thu Viện phí (Đã thu, Chưa thu, BHYT, Thực thu BN, Phương thức, Đợt thu)
 */
function calculateHospitalRevenueSummary() {
    const allInvoices = cachedAccountantData?.invoices || [];
    const allCls = cachedAccountantData?.cls_orders || [];

    const paidInv = allInvoices.filter(i => i.trang_thai_thu === "DaThu");
    const unpaidInv = allInvoices.filter(i => i.trang_thai_thu !== "DaThu");
    const unpaidCls = allCls.filter(c => c.trang_thai_nop_tien === "ChuaNop");

    // 1. Nhóm ĐÃ THU (DaThu)
    const paidGoc = paidInv.reduce((s, i) => s + Number(i.tong_tien_goc || 0), 0);
    const paidBhyt = paidInv.reduce((s, i) => s + Number(i.tien_bhyt_chi_tra || 0), 0);
    const paidPatient = paidInv.reduce((s, i) => s + Number(i.tien_benh_nhan_tra || 0), 0);

    // Phân loại Đã thu theo Phương thức thanh toán
    const sumByMethod = (methodCode) => {
        const list = paidInv.filter(i => (i.phuong_thuc_thanh_toan || "ChuyenKhoan_VietQR") === methodCode);
        return {
            count: list.length,
            goc: list.reduce((s, i) => s + Number(i.tong_tien_goc || 0), 0),
            bhyt: list.reduce((s, i) => s + Number(i.tien_bhyt_chi_tra || 0), 0),
            bn: list.reduce((s, i) => s + Number(i.tien_benh_nhan_tra || 0), 0)
        };
    };

    const methodVietQr = sumByMethod("ChuyenKhoan_VietQR");
    const methodCash = sumByMethod("TienMat");
    const methodVneid = sumByMethod("ViDienTu_VNeID");

    // Phân loại Đã thu theo Đợt thu (Đợt 1 CLS vs Đợt 2 Khám & Thuốc)
    const sumByType = (typeCode) => {
        const list = paidInv.filter(i => i.loai_hoa_don === typeCode);
        return {
            count: list.length,
            goc: list.reduce((s, i) => s + Number(i.tong_tien_goc || 0), 0),
            bhyt: list.reduce((s, i) => s + Number(i.tien_bhyt_chi_tra || 0), 0),
            bn: list.reduce((s, i) => s + Number(i.tien_benh_nhan_tra || 0), 0)
        };
    };

    const dot1ClsPaid = sumByType("Dot1_ThuTienCLS");
    const dot2ExamPaid = sumByType("Dot2_ThuTienKhamVaThuoc");

    // 2. Nhóm CHƯA THU (Gồm Hóa đơn ChuaThu + Chỉ định CLS ChuaNop)
    const unpaidInvGoc = unpaidInv.reduce((s, i) => s + Number(i.tong_tien_goc || 0), 0);
    const unpaidInvBhyt = unpaidInv.reduce((s, i) => s + Number(i.tien_bhyt_chi_tra || 0), 0);
    const unpaidInvPatient = unpaidInv.reduce((s, i) => s + Number(i.tien_benh_nhan_tra || 0), 0);

    let unpaidClsGoc = 0;
    let unpaidClsBhyt = 0;
    let unpaidClsPatient = 0;
    unpaidCls.forEach(c => {
        const gia = Number(c.don_gia_cls || 0);
        const bhyt = c.so_the_bhyt ? Math.round(gia * 0.8) : 0;
        const bn = gia - bhyt;
        unpaidClsGoc += gia;
        unpaidClsBhyt += bhyt;
        unpaidClsPatient += bn;
    });

    const unpaidTotalCount = unpaidInv.length + unpaidCls.length;
    const unpaidTotalGoc = unpaidInvGoc + unpaidClsGoc;
    const unpaidTotalBhyt = unpaidInvBhyt + unpaidClsBhyt;
    const unpaidTotalPatient = unpaidInvPatient + unpaidClsPatient;

    // 3. TỔNG CỘNG PHÁT SINH TOÀN TRẠM (1 + 2)
    const grandTotalCount = paidInv.length + unpaidTotalCount;
    const grandTotalGoc = paidGoc + unpaidTotalGoc;
    const grandTotalBhyt = paidBhyt + unpaidTotalBhyt;
    const grandTotalPatient = paidPatient + unpaidTotalPatient;
    const collectionRate = grandTotalGoc > 0 ? ((paidGoc / grandTotalGoc) * 100).toFixed(1) : "100.0";

    return {
        allInvoices,
        paidInv,
        unpaidInv,
        unpaidCls,
        paidGoc,
        paidBhyt,
        paidPatient,
        methodVietQr,
        methodCash,
        methodVneid,
        dot1ClsPaid,
        dot2ExamPaid,
        unpaidInvGoc,
        unpaidInvBhyt,
        unpaidInvPatient,
        unpaidClsGoc,
        unpaidClsBhyt,
        unpaidClsPatient,
        unpaidTotalCount,
        unpaidTotalGoc,
        unpaidTotalBhyt,
        unpaidTotalPatient,
        grandTotalCount,
        grandTotalGoc,
        grandTotalBhyt,
        grandTotalPatient,
        collectionRate
    };
}

// =========================================================================
// 2. VIEW 1: THU PHÍ CẬN LÂM SÀNG (ĐỢT 1) -> ĐẨY SANG PHÒNG CLS P201
// =========================================================================
function clearAccClsFilters() {
    const kwEl = document.getElementById("acc-cls-search");
    const stEl = document.getElementById("acc-cls-status-filter");
    const dtEl = document.getElementById("acc-cls-date-filter");
    const sortEl = document.getElementById("acc-cls-sort");

    if (kwEl) kwEl.value = "";
    if (stEl) stEl.value = "ALL";
    if (dtEl) dtEl.value = "";
    if (sortEl) sortEl.value = "ASC";
    renderAccountantClsTable();
}

function renderAccountantClsTable() {
    if (!cachedAccountantData) return;
    const tbody = document.getElementById("acc-cls-tbody");
    if (!tbody) return;

    const keyword = (document.getElementById("acc-cls-search")?.value || "").toLowerCase().trim();
    const statusFilter = document.getElementById("acc-cls-status-filter")?.value || "ALL";
    const dateFilter = document.getElementById("acc-cls-date-filter")?.value || "";
    const sortOrder = document.getElementById("acc-cls-sort")?.value || "ASC";

    const list = (cachedAccountantData.cls_orders || []).filter(c => {
        if (statusFilter !== "ALL" && c.trang_thai_nop_tien !== statusFilter) return false;

        if (dateFilter) {
            const ordDate = String(c.thoi_gian_tiep_nhan || c.thoi_gian_co_ket_qua || "").substring(0, 10);
            if (ordDate !== dateFilter) return false;
        }

        if (!keyword) return true;
        return (c.ten_benh_nhan || "").toLowerCase().includes(keyword) ||
               String(c.ma_ho_so_kham || "").toLowerCase().includes(keyword) ||
               String(c.ma_benh_nhan || "").toLowerCase().includes(keyword) ||
               String(c.ma_chi_dinh_cls || "").toLowerCase().includes(keyword) ||
               (c.vneid || "").toLowerCase().includes(keyword) ||
               (c.ten_dich_vu_cls || "").toLowerCase().includes(keyword);
    });

    list.sort((a, b) => {
        const dA = String(a.thoi_gian_tiep_nhan || "").substring(0, 10);
        const dB = String(b.thoi_gian_tiep_nhan || "").substring(0, 10);
        if (dA !== dB) {
            return sortOrder === "ASC" ? dA.localeCompare(dB) : dB.localeCompare(dA);
        }
        return sortOrder === "ASC"
            ? String(a.ma_chi_dinh_cls || "").localeCompare(String(b.ma_chi_dinh_cls || ""))
            : String(b.ma_chi_dinh_cls || "").localeCompare(String(a.ma_chi_dinh_cls || ""));
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400">Không có chỉ định Cận lâm sàng nào khớp với bộ lọc hiện tại.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => {
        const isPaid = c.trang_thai_nop_tien === "DaNop";
        const hasBhyt = Boolean(c.so_the_bhyt);
        const donGia = Number(c.don_gia_cls || 0);
        const bhytTra = hasBhyt ? Math.round(donGia * 0.8) : 0;
        const bnTra = donGia - bhytTra;

        return `
            <tr class="${isPaid ? 'bg-slate-50/60' : 'bg-amber-50/30 hover:bg-amber-50/70'} transition">
                <td class="p-3.5 font-bold text-teal-700">
                    Hồ sơ #${c.ma_ho_so_kham}<br/>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-teal-600/10 text-teal-800">STT #${c.so_thu_tu_kham || "-"} • #${c.ma_chi_dinh_cls}</span>
                </td>
                <td class="p-3.5 font-bold text-slate-900">
                    ${c.ten_benh_nhan || "-"} (Mã BN: #${c.ma_benh_nhan})<br/>
                    <span class="text-[11px] text-slate-500 font-normal">VNeID: <b>${c.vneid || "-"}</b> • STK: <b>${c.stk_ngan_hang || "-"}</b></span>
                </td>
                <td class="p-3.5">
                    ${hasBhyt
                        ? `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">${c.so_the_bhyt} (Hưởng 80%)</span>`
                        : `<span class="text-slate-400">Viện phí 100%</span>`}
                </td>
                <td class="p-3.5">
                    <b class="text-indigo-900">${c.ten_dich_vu_cls || "-"}</b><br/>
                    <span class="text-[11px] text-slate-500">Thực hiện tại: Phòng ${c.phong_thuc_hien || "P201"}</span>
                </td>
                <td class="p-3.5 font-semibold">${donGia.toLocaleString("vi-VN")}đ</td>
                <td class="p-3.5 font-bold text-teal-700">${bhytTra.toLocaleString("vi-VN")}đ</td>
                <td class="p-3.5 font-extrabold text-rose-600 text-sm">${bnTra.toLocaleString("vi-VN")}đ</td>
                <td class="p-3.5">
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-bold inline-block whitespace-nowrap ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${isPaid ? 'Đã thu • Đã chuyển P201' : 'Chờ thu phí CLS'}
                    </span>
                </td>
                <td class="p-3.5 text-right">
                    ${!isPaid ? `
                        <button type="button" onclick="confirmCollectCls('${c.ma_chi_dinh_cls}', '${c.ma_ho_so_kham}', '${c.ten_benh_nhan}', ${bnTra})"
                                class="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs inline-flex items-center gap-1 shadow-sm transition whitespace-nowrap">
                            <span class="material-symbols-outlined text-sm">check_circle</span>
                            <span>Xác nhận Thu tiền</span>
                        </button>
                    ` : `
                        <button type="button" onclick="openInvoiceExportByClsOrder('${c.ma_chi_dinh_cls}', '${c.ma_ho_so_kham}')"
                                class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-300 font-bold text-[11px] inline-flex items-center gap-1 transition whitespace-nowrap">
                            <span class="material-symbols-outlined text-xs">receipt_long</span>
                            <span>Xuất hóa đơn</span>
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join("");
}

// =========================================================================
// 3. VIEW 2: THU VIỆN PHÍ KHÁM & ĐƠN THUỐC (ĐỢT 2)
// =========================================================================
function clearAccExamFilters() {
    const kwEl = document.getElementById("acc-inv-search");
    const stEl = document.getElementById("acc-inv-status-filter");
    const dtEl = document.getElementById("acc-inv-date-filter");

    if (kwEl) kwEl.value = "";
    if (stEl) stEl.value = "ALL";
    if (dtEl) dtEl.value = "";
    renderAccountantExamInvoices();
}

function renderAccountantExamInvoices() {
    if (!cachedAccountantData) return;
    const container = document.getElementById("acc-exam-invoices-list");
    if (!container) return;

    const keyword = (document.getElementById("acc-inv-search")?.value || "").toLowerCase().trim();
    const statusFilter = document.getElementById("acc-inv-status-filter")?.value || "ALL";
    const dateFilter = document.getElementById("acc-inv-date-filter")?.value || "";

    const list = (cachedAccountantData.invoices || []).filter(inv => {
        if (statusFilter !== "ALL" && inv.trang_thai_thu !== statusFilter) return false;

        if (dateFilter) {
            const invDate = String(inv.thoi_gian_thu || inv.thoi_gian_tiep_nhan || "").substring(0, 10);
            if (invDate !== dateFilter) return false;
        }

        if (!keyword) return true;
        return (inv.ten_benh_nhan || "").toLowerCase().includes(keyword) ||
               String(inv.ma_hoa_don || "").toLowerCase().includes(keyword) ||
               String(inv.ma_ho_so_kham || "").toLowerCase().includes(keyword) ||
               String(inv.ma_benh_nhan || "").toLowerCase().includes(keyword) ||
               (inv.vneid || "").toLowerCase().includes(keyword);
    });

    if (list.length === 0) {
        container.innerHTML = `<div class="p-8 text-center hospital-card rounded-2xl text-xs text-slate-400">Không tìm thấy hóa đơn viện phí nào khớp với bộ lọc hiện tại.</div>`;
        return;
    }

    container.innerHTML = list.map(inv => {
        const isPaid = inv.trang_thai_thu === "DaThu";
        const displayItems = (inv.items && inv.items.length > 0)
            ? inv.items
            : [
                {
                    ten_hang_muc: `Công khám lâm sàng & Đơn thuốc ngoại trú (${inv.ten_khoa || "Chuyên khoa"})`,
                    loai_hang_muc: "PhiKhamVaThuoc",
                    so_luong: 1,
                    don_gia: inv.tong_tien_goc,
                    thanh_tien: inv.tong_tien_goc
                }
            ];

        const itemsHtml = displayItems.map(it => `
            <tr class="border-b border-slate-100">
                <td class="py-1.5 font-semibold text-slate-800">${it.ten_hang_muc} <span class="text-[10px] text-slate-400">(${it.loai_hang_muc || "Viện phí"})</span></td>
                <td class="py-1.5 text-center">${it.so_luong}</td>
                <td class="py-1.5 text-right">${Number(it.don_gia || 0).toLocaleString("vi-VN")}đ</td>
                <td class="py-1.5 text-right font-bold text-teal-700">${Number(it.thanh_tien || 0).toLocaleString("vi-VN")}đ</td>
            </tr>
        `).join("");

        const cleanDiag = String(inv.ket_luan_chan_doan || "Khám lâm sàng & Cận lâm sàng").replace(/^\[[A-Za-z0-9.]+\]\s*/, "");

        return `
            <div class="hospital-card rounded-2xl p-5 border ${isPaid ? 'border-slate-200' : 'border-2 border-rose-300'} space-y-3 text-xs">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold">Hóa đơn #${inv.ma_hoa_don}</span>
                            <span class="text-slate-500 font-semibold">Hồ sơ #${inv.ma_ho_so_kham} • Phòng ${inv.so_phong || "P102"} (${inv.ten_khoa || ""})</span>
                        </div>
                        <h3 class="font-heading font-bold text-base text-slate-900 mt-1">
                            ${inv.ten_benh_nhan || "Bệnh nhân"} (Mã BN: #${inv.ma_benh_nhan} • VNeID: ${inv.vneid || "-"})
                            <span class="text-xs font-semibold text-emerald-700 ml-2">BHYT: ${inv.so_the_bhyt || "Không có"}</span>
                        </h3>
                        <p class="text-slate-600 mt-0.5">
                            Chẩn đoán: <b>${cleanDiag}</b>
                            • STK Bệnh nhân: <b class="text-indigo-700">${inv.stk_ngan_hang || "Chưa cập nhật"}</b>
                        </p>
                    </div>

                    <div class="flex items-center gap-2">
                        <span class="px-3 py-1 rounded-full font-bold ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}">
                            ${isPaid ? `Đã thu (${inv.phuong_thuc_thanh_toan || 'VietQR'})` : 'Chờ thu viện phí'}
                        </span>
                        ${!isPaid ? `
                            <button type="button" onclick="confirmCollectInvoice('${inv.ma_hoa_don}')"
                                    class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-1.5 shadow transition">
                                <span class="material-symbols-outlined text-base">payments</span>
                                <span>Xác Nhận Thu & Xuất HĐ (${Number(inv.tien_benh_nhan_tra || 0).toLocaleString("vi-VN")}đ)</span>
                            </button>
                        ` : `
                            <button type="button" onclick="openInvoiceExportById('${inv.ma_hoa_don}')"
                                    class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-300 font-bold flex items-center gap-1.5 transition">
                                <span class="material-symbols-outlined text-base">print</span>
                                <span>Xuất / In Hóa Đơn</span>
                            </button>
                        `}
                    </div>
                </div>

                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr class="text-slate-500 border-b border-slate-200">
                            <th class="pb-1.5">Hạng mục Viện phí / Thuốc </th>
                            <th class="pb-1.5 text-center">Số lượng</th>
                            <th class="pb-1.5 text-right">Đơn giá</th>
                            <th class="pb-1.5 text-right">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <div class="pt-2 flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span>Tổng tiền gốc: <b>${Number(inv.tong_tien_goc || 0).toLocaleString("vi-VN")}đ</b></span>
                    <span class="text-teal-700 font-bold">BHYT chi trả: ${Number(inv.tien_bhyt_chi_tra || 0).toLocaleString("vi-VN")}đ</span>
                    <span class="text-rose-600 font-extrabold text-sm">Bệnh nhân trả: ${Number(inv.tien_benh_nhan_tra || 0).toLocaleString("vi-VN")}đ</span>
                    <span class="text-[11px] text-slate-600">STK Bệnh viện nhận: <b>${inv.stk_benh_vien || "0041000888999 - Vietcombank"}</b></span>
                </div>
            </div>
        `;
    }).join("");
}

// =========================================================================
// 4. VIEW 3: SỔ HÓA ĐƠN, BẢNG TỔNG HỢP ĐÃ THU / CHƯA THU & XUẤT BÁO CÁO EXCEL
// =========================================================================
function ensureLedgerSummaryAndFilterDOM() {
    const ledgerSection = document.getElementById("acc-view-ledger");
    const tbody = document.getElementById("acc-ledger-tbody");
    if (!ledgerSection || !tbody || document.getElementById("acc-ledger-summary-box")) return;

    const tableEl = tbody.closest("table");
    const tableWrapper = tableEl ? tableEl.parentElement : null;
    if (!tableWrapper) return;

    // Chèn Khung Tổng Hợp Doanh Thu (Đã thu vs Chưa thu) + Bộ lọc ngay phía trên bảng Sổ hóa đơn
    const summaryContainer = document.createElement("div");
    summaryContainer.id = "acc-ledger-summary-box";
    summaryContainer.className = "space-y-4 mb-4";
    summaryContainer.innerHTML = `
        <!-- Khung Thống Kê Quyết Toán: Đã thu vs Chưa thu -->
        <div id="acc-ledger-live-cards" class="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs"></div>

        <!-- Thanh bộ lọc Sổ hóa đơn -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 p-3.5 rounded-xl bg-sky-50/60 border border-sky-200/80 text-xs">
            <div class="lg:col-span-4">
                <label class="font-bold text-slate-700 block mb-1">Tìm kiếm hóa đơn / bệnh nhân</label>
                <input id="acc-ledger-search" type="text" oninput="renderAccountantLedgerTable()"
                       placeholder="Mã HĐ (#HD...), tên BN, mã HS, VNeID, mã GD..."
                       class="w-full h-9 px-3 rounded-lg border-slate-300 bg-white text-xs"/>
            </div>
            <div class="lg:col-span-3">
                <label class="font-bold text-slate-700 block mb-1">Trạng thái quyết toán</label>
                <select id="acc-ledger-status" onchange="renderAccountantLedgerTable()"
                        class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-semibold text-slate-700">
                    <option value="ALL">-- Tất cả (Đã thu & Chưa thu) --</option>
                    <option value="DaThu">Đã thu về STK Bệnh viện</option>
                    <option value="ChuaThu">Chưa thu viện phí</option>
                </select>
            </div>
            <div class="lg:col-span-3">
                <label class="font-bold text-slate-700 block mb-1">Phương thức thanh toán</label>
                <select id="acc-ledger-method" onchange="renderAccountantLedgerTable()"
                        class="w-full h-9 px-2.5 rounded-lg border-slate-300 bg-white text-xs font-semibold text-slate-700">
                    <option value="ALL">-- Tất cả phương thức --</option>
                    <option value="ChuyenKhoan_VietQR">Chuyển khoản VietQR</option>
                    <option value="TienMat">Tiền mặt tại Quầy P104</option>
                    <option value="ViDienTu_VNeID">Ví điện tử VNeID</option>
                </select>
            </div>
            <div class="lg:col-span-2 flex items-end">
                <button type="button" onclick="resetLedgerFilters()"
                        class="w-full h-9 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1 transition">
                    <span class="material-symbols-outlined text-sm">filter_alt_off</span>
                    <span>Đặt lại</span>
                </button>
            </div>
        </div>
    `;
    ledgerSection.insertBefore(summaryContainer, tableWrapper);

    // Chèn thêm phần tfoot tổng cộng cuối bảng Sổ hóa đơn
    if (tableEl && !document.getElementById("acc-ledger-tfoot")) {
        const tfoot = document.createElement("tfoot");
        tfoot.id = "acc-ledger-tfoot";
        tfoot.className = "bg-slate-50 border-t-2 border-teal-600 text-xs";
        tableEl.appendChild(tfoot);
    }
}

function resetLedgerFilters() {
    const sEl = document.getElementById("acc-ledger-search");
    const stEl = document.getElementById("acc-ledger-status");
    const mEl = document.getElementById("acc-ledger-method");
    if (sEl) sEl.value = "";
    if (stEl) stEl.value = "ALL";
    if (mEl) mEl.value = "ALL";
    renderAccountantLedgerTable();
}

function renderAccountantLedgerTable() {
    if (!cachedAccountantData) return;
    ensureLedgerSummaryAndFilterDOM();

    const tbody = document.getElementById("acc-ledger-tbody");
    if (!tbody) return;

    const stats = calculateHospitalRevenueSummary();

    // Vẽ 3 thẻ Tổng hợp Doanh thu (Đã thu / Chưa thu / Tổng phát sinh) ngay trên đầu Sổ hóa đơn
    const liveCards = document.getElementById("acc-ledger-live-cards");
    if (liveCards) {
        liveCards.innerHTML = `
            <!-- Thẻ 1: Tổng tiền Bệnh viện ĐÃ THU -->
            <div class="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-extrabold text-emerald-900 uppercase">1. TỔNG TIỀN BỆNH VIỆN ĐÃ THU (${stats.paidInv.length} HĐ)</span>
                    <span class="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px]">Đạt ${stats.collectionRate}%</span>
                </div>
                <div class="space-y-1 text-slate-700 pt-1 border-t border-emerald-200/80">
                    <div class="flex justify-between"><span>• Tổng chi phí gốc đã thu:</span><b class="text-slate-900">${formatVnd(stats.paidGoc)}</b></div>
                    <div class="flex justify-between"><span>• Quỹ BHYT chi trả (80%):</span><b class="text-teal-700">${formatVnd(stats.paidBhyt)}</b></div>
                    <div class="flex justify-between text-sm pt-0.5"><span>• <b>Thực thu Bệnh nhân:</b></span><b class="text-emerald-700 font-extrabold">${formatVnd(stats.paidPatient)}</b></div>
                </div>
            </div>

            <!-- Thẻ 2: Tổng tiền Bệnh viện CHƯA THU -->
            <div class="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-extrabold text-amber-900 uppercase">2. TỔNG TIỀN BỆNH VIỆN CHƯA THU (${stats.unpaidTotalCount} khoản)</span>
                    <span class="px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px]">${stats.unpaidInv.length} HĐ + ${stats.unpaidCls.length} CLS</span>
                </div>
                <div class="space-y-1 text-slate-700 pt-1 border-t border-amber-200/80">
                    <div class="flex justify-between"><span>• Tổng chi phí gốc chưa thu:</span><b class="text-slate-900">${formatVnd(stats.unpaidTotalGoc)}</b></div>
                    <div class="flex justify-between"><span>• BHYT dự kiến chi trả:</span><b class="text-teal-700">${formatVnd(stats.unpaidTotalBhyt)}</b></div>
                    <div class="flex justify-between text-sm pt-0.5"><span>• <b>Bệnh nhân còn phải nộp:</b></span><b class="text-rose-600 font-extrabold">${formatVnd(stats.unpaidTotalPatient)}</b></div>
                </div>
            </div>

            <!-- Thẻ 3: Tổng cộng phát sinh toàn viện -->
            <div class="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-extrabold text-teal-950 uppercase">3. TỔNG PHÁT SINH TOÀN TRẠM (${stats.grandTotalCount} khoản)</span>
                    <span class="px-2 py-0.5 rounded-full bg-teal-700 text-white font-bold text-[10px]">Đã thu + Chưa thu</span>
                </div>
                <div class="space-y-1 text-slate-700 pt-1 border-t border-teal-200/80">
                    <div class="flex justify-between"><span>• Tổng chi phí gốc phát sinh:</span><b class="text-slate-900">${formatVnd(stats.grandTotalGoc)}</b></div>
                    <div class="flex justify-between"><span>• Tổng Quỹ BHYT chi trả:</span><b class="text-teal-700">${formatVnd(stats.grandTotalBhyt)}</b></div>
                    <div class="flex justify-between text-sm pt-0.5"><span>• <b>Tổng BN đồng chi trả:</b></span><b class="text-indigo-800 font-extrabold">${formatVnd(stats.grandTotalPatient)}</b></div>
                </div>
            </div>
        `;
    }

    const keyword = (document.getElementById("acc-ledger-search")?.value || "").toLowerCase().trim();
    const statusFilter = document.getElementById("acc-ledger-status")?.value || "ALL";
    const methodFilter = document.getElementById("acc-ledger-method")?.value || "ALL";

    const list = (cachedAccountantData.invoices || []).filter(inv => {
        if (statusFilter !== "ALL" && inv.trang_thai_thu !== statusFilter) return false;
        if (methodFilter !== "ALL" && (inv.phuong_thuc_thanh_toan || "ChuyenKhoan_VietQR") !== methodFilter) return false;
        if (!keyword) return true;
        return (inv.ten_benh_nhan || "").toLowerCase().includes(keyword) ||
               String(inv.ma_hoa_don || "").toLowerCase().includes(keyword) ||
               String(inv.ma_ho_so_kham || "").toLowerCase().includes(keyword) ||
               (inv.vneid || "").toLowerCase().includes(keyword) ||
               (inv.ma_giao_dich_ngan_hang || "").toLowerCase().includes(keyword);
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Không có hóa đơn viện phí nào khớp với bộ lọc hiện tại.</td></tr>`;
    } else {
        tbody.innerHTML = list.map(inv => {
            const isPaid = inv.trang_thai_thu === "DaThu";
            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-3.5 font-bold text-teal-700">
                        HĐ #${inv.ma_hoa_don}<br/>
                        <span class="text-[10px] text-emerald-700 font-mono">${inv.ma_giao_dich_ngan_hang || "-"}</span>
                    </td>
                    <td class="p-3.5 font-bold text-slate-900">
                        ${inv.ten_benh_nhan || "-"} (VNeID: ${inv.vneid || "-"})<br/>
                        <span class="text-[11px] text-slate-500 font-normal">Hồ sơ #${inv.ma_ho_so_kham} • STK BN: <b>${inv.stk_ngan_hang || "-"}</b></span>
                    </td>
                    <td class="p-3.5">
                        <span class="font-bold text-slate-800">${inv.phuong_thuc_thanh_toan || "ChuyenKhoan_VietQR"}</span><br/>
                        <span class="text-[10px] text-teal-700 font-semibold">STK Viện: ${inv.stk_benh_vien || "0041000888999 - VCB"}</span>
                    </td>
                    <td class="p-3.5 font-semibold">${Number(inv.tong_tien_goc || 0).toLocaleString("vi-VN")}đ</td>
                    <td class="p-3.5 font-bold text-teal-700">${Number(inv.tien_bhyt_chi_tra || 0).toLocaleString("vi-VN")}đ</td>
                    <td class="p-3.5 font-bold text-rose-600">${Number(inv.tien_benh_nhan_tra || 0).toLocaleString("vi-VN")}đ</td>
                    <td class="p-3.5 text-slate-500">${inv.thoi_gian_thu || "-"}</td>
                    <td class="p-3.5">
                        <div class="flex items-center gap-2">
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-block whitespace-nowrap ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                                ${isPaid ? 'Đã thu' : 'Chưa thu'}
                            </span>
                            ${isPaid ? `
                                <button type="button" onclick="openInvoiceExportById('${inv.ma_hoa_don}')"
                                        class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-300 font-bold text-[11px] inline-flex items-center gap-1 transition whitespace-nowrap">
                                    <span class="material-symbols-outlined text-xs">print</span>
                                    <span>Xuất HĐ</span>
                                </button>
                            ` : `
                                <button type="button" onclick="confirmCollectInvoice('${inv.ma_hoa_don}')"
                                        class="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition whitespace-nowrap">
                                    <span class="material-symbols-outlined text-xs">payments</span>
                                    <span>Thu ngay</span>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // Vẽ phần chân bảng (TFOOT) tổng hợp Đã thu / Chưa thu / Tổng cộng
    const tfoot = document.getElementById("acc-ledger-tfoot");
    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="bg-emerald-50/90 text-emerald-950 font-bold border-b border-emerald-200">
                <td colspan="3" class="p-3 text-right uppercase">Tổng tiền Bệnh viện ĐÃ THU (${stats.paidInv.length} hóa đơn):</td>
                <td class="p-3 font-extrabold">${formatVnd(stats.paidGoc)}</td>
                <td class="p-3 font-extrabold text-teal-700">${formatVnd(stats.paidBhyt)}</td>
                <td class="p-3 font-extrabold text-emerald-700 text-sm">${formatVnd(stats.paidPatient)}</td>
                <td colspan="2" class="p-3 text-[11px] text-emerald-800">Đã đối soát về STK Bệnh viện</td>
            </tr>
            <tr class="bg-amber-50/90 text-amber-950 font-bold border-b border-amber-200">
                <td colspan="3" class="p-3 text-right uppercase">Tổng tiền Bệnh viện CHƯA THU (${stats.unpaidInv.length} HĐ + ${stats.unpaidCls.length} CLS):</td>
                <td class="p-3 font-extrabold">${formatVnd(stats.unpaidTotalGoc)}</td>
                <td class="p-3 font-extrabold text-teal-700">${formatVnd(stats.unpaidTotalBhyt)}</td>
                <td class="p-3 font-extrabold text-rose-600 text-sm">${formatVnd(stats.unpaidTotalPatient)}</td>
                <td colspan="2" class="p-3 text-[11px] text-amber-800">Đang chờ bệnh nhân thanh toán</td>
            </tr>
            <tr class="bg-teal-900 text-white font-extrabold">
                <td colspan="3" class="p-3.5 text-right uppercase">TỔNG CỘNG PHÁT SINH TOÀN TRẠM (${stats.grandTotalCount} khoản):</td>
                <td class="p-3.5 text-sm">${formatVnd(stats.grandTotalGoc)}</td>
                <td class="p-3.5 text-sm text-teal-200">${formatVnd(stats.grandTotalBhyt)}</td>
                <td class="p-3.5 text-base text-amber-300">${formatVnd(stats.grandTotalPatient)}</td>
                <td colspan="2" class="p-3.5 text-xs text-emerald-300">Tỷ lệ đã thu: ${stats.collectionRate}%</td>
            </tr>
        `;
    }
}

// =========================================================================
// 5. HỆ THỐNG BÁO CÁO QUYẾT TOÁN DOANH THU EXCEL (.XLS CÓ KẺ BẢNG & .CSV)
// =========================================================================
function ensureRevenueReportModalDOM() {
    if (document.getElementById("revenue-report-modal")) return;

    const modal = document.createElement("div");
    modal.id = "revenue-report-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm hidden items-center justify-center p-4 overflow-y-auto";
    modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-5xl w-full overflow-hidden shadow-2xl border-2 border-teal-600 my-auto animate-[fadeIn_0.18s_ease-out]">
            <div class="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-700 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-3xl">analytics</span>
                    <div>
                        <h3 class="font-heading font-extrabold text-base sm:text-lg uppercase tracking-wide">
                            Báo Cáo Quyết Toán Doanh Thu Viện Phí & Quỹ BHYT
                        </h3>
                        <p class="text-[11px] text-teal-100">
                            Tổng hợp đầy đủ: Tổng tiền đã thu, Tổng tiền chưa thu, Quỹ BHYT chi trả, Thực thu bệnh nhân & Sổ chi tiết
                        </p>
                    </div>
                </div>
                <button type="button" onclick="closeRevenueReportModal()"
                        class="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
            </div>

            <div id="revenue-report-preview-body" class="p-6 space-y-5 text-xs text-slate-800 bg-white max-h-[72vh] overflow-y-auto"></div>

            <div class="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button type="button" onclick="closeRevenueReportModal()"
                        class="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs transition">
                    Đóng lại
                </button>

                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" onclick="downloadRevenueCsvFile()"
                            class="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition">
                        <span class="material-symbols-outlined text-base">table_view</span>
                        <span>Tải File CSV (.csv)</span>
                    </button>
                    <button type="button" onclick="downloadRevenueExcelFile()"
                            class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md transition">
                        <span class="material-symbols-outlined text-base">download</span>
                        <span>Tải File Excel Chuẩn Kế Toán (.xls)</span>
                    </button>
                    <button type="button" onclick="printRevenueReport()"
                            class="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition">
                        <span class="material-symbols-outlined text-base">print</span>
                        <span>In Báo Cáo / Xuất PDF</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeRevenueReportModal() {
    const modal = document.getElementById("revenue-report-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

/**
 * Khi Kế toán bấm nút "Xuất Báo Cáo Doanh Thu (Excel/CSV)":
 * 1. Tự động tải ngay file Excel (.xls) có kẻ khung bảng biểu & tổng hợp Đã thu / Chưa thu
 * 2. Đồng thời mở cửa sổ Báo cáo chi tiết trên màn hình (cho phép tải thêm CSV hoặc In PDF)
 */
function exportInvoicesCsv() {
    if (!cachedAccountantData) return;
    ensureRevenueReportModalDOM();

    const stats = calculateHospitalRevenueSummary();
    const user = getCurrentUser();
    const reporterName = (user && user.ho_ten) ? user.ho_ten : "CN. Lê Thị Thu Ngân";
    const nowStr = new Date().toLocaleString("vi-VN");

    const previewBody = document.getElementById("revenue-report-preview-body");
    if (previewBody) {
        previewBody.innerHTML = buildRevenueReportHtmlContent(stats, reporterName, nowStr);
    }

    const modal = document.getElementById("revenue-report-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    // Tự động tải ngay file Excel chuẩn Kế toán (.xls)
    downloadRevenueExcelFile();
}

/**
 * Xây dựng nội dung Báo cáo quyết toán doanh thu (Dùng chung cho Modal xem trước, Bản in PDF & File Excel .xls)
 */
function buildRevenueReportHtmlContent(stats, reporterName, nowStr) {
    const paidRowsHtml = stats.paidInv.map((inv, idx) => `
        <tr>
            <td style="text-align:center; padding:6px; border:1px solid #cbd5e1;">${idx + 1}</td>
            <td style="font-weight:bold; color:#0f766e; padding:6px; border:1px solid #cbd5e1;">#${inv.ma_hoa_don}</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">#${inv.ma_ho_so_kham || "-"}</td>
            <td style="font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${inv.ten_benh_nhan || "-"} (#${inv.ma_benh_nhan || "-"})</td>
            <td style="mso-number-format:'\\@'; font-family:monospace; padding:6px; border:1px solid #cbd5e1;">${inv.vneid || "-"}</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${inv.loai_hoa_don === "Dot1_ThuTienCLS" ? "Đợt 1: Thu CLS" : "Đợt 2: Khám & Thuốc"}</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${formatPaymentMethodLabel(inv.phuong_thuc_thanh_toan)}</td>
            <td style="mso-number-format:'\\@'; font-family:monospace; padding:6px; border:1px solid #cbd5e1;">${inv.ma_giao_dich_ngan_hang || "-"}</td>
            <td style="text-align:right; font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${Number(inv.tong_tien_goc || 0).toLocaleString("vi-VN")}</td>
            <td style="text-align:right; color:#0f766e; font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${Number(inv.tien_bhyt_chi_tra || 0).toLocaleString("vi-VN")}</td>
            <td style="text-align:right; color:#047857; font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${Number(inv.tien_benh_nhan_tra || 0).toLocaleString("vi-VN")}</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${inv.thoi_gian_thu || "-"}</td>
        </tr>
    `).join("");

    // Danh sách các khoản CHƯA THU (Gồm cả Hóa đơn ChuaThu và Chỉ định CLS ChuaNop)
    const unpaidCombinedRows = [
        ...stats.unpaidInv.map(inv => ({
            ma_chung_tu: `HĐ #${inv.ma_hoa_don}`,
            ma_ho_so: `#${inv.ma_ho_so_kham || "-"}`,
            benh_nhan: `${inv.ten_benh_nhan || "-"} (#${inv.ma_benh_nhan || "-"})`,
            vneid: inv.vneid || "-",
            so_the_bhyt: inv.so_the_bhyt || "Không BHYT",
            noi_dung: `Đợt 2: Viện phí Khám & Đơn thuốc (${inv.ten_khoa || "Chuyên khoa"})`,
            goc: Number(inv.tong_tien_goc || 0),
            bhyt: Number(inv.tien_bhyt_chi_tra || 0),
            bn: Number(inv.tien_benh_nhan_tra || 0),
            trang_thai: "Chờ thu Hóa đơn (Đợt 2)"
        })),
        ...stats.unpaidCls.map(c => {
            const gia = Number(c.don_gia_cls || 0);
            const bhyt = c.so_the_bhyt ? Math.round(gia * 0.8) : 0;
            const bn = gia - bhyt;
            return {
                ma_chung_tu: `CLS #${c.ma_chi_dinh_cls}`,
                ma_ho_so: `#${c.ma_ho_so_kham || "-"}`,
                benh_nhan: `${c.ten_benh_nhan || "-"} (#${c.ma_benh_nhan || "-"})`,
                vneid: c.vneid || "-",
                so_the_bhyt: c.so_the_bhyt || "Không BHYT",
                noi_dung: `Đợt 1: ${c.ten_dich_vu_cls || "Dịch vụ Cận lâm sàng"}`,
                goc: gia,
                bhyt: bhyt,
                bn: bn,
                trang_thai: "Chờ thu phí CLS (Đợt 1)"
            };
        })
    ];

    const unpaidRowsHtml = unpaidCombinedRows.length > 0
        ? unpaidCombinedRows.map((u, idx) => `
            <tr>
                <td style="text-align:center; padding:6px; border:1px solid #cbd5e1;">${idx + 1}</td>
                <td style="font-weight:bold; color:#b45309; padding:6px; border:1px solid #cbd5e1;">${u.ma_chung_tu}</td>
                <td style="padding:6px; border:1px solid #cbd5e1;">${u.ma_ho_so}</td>
                <td style="font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${u.benh_nhan}</td>
                <td style="mso-number-format:'\\@'; font-family:monospace; padding:6px; border:1px solid #cbd5e1;">${u.vneid}</td>
                <td style="padding:6px; border:1px solid #cbd5e1;">${u.so_the_bhyt}</td>
                <td style="padding:6px; border:1px solid #cbd5e1;">${u.noi_dung}</td>
                <td style="text-align:right; font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${u.goc.toLocaleString("vi-VN")}</td>
                <td style="text-align:right; color:#0f766e; font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${u.bhyt.toLocaleString("vi-VN")}</td>
                <td style="text-align:right; color:#e11d48; font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${u.bn.toLocaleString("vi-VN")}</td>
                <td style="color:#b45309; font-weight:bold; padding:6px; border:1px solid #cbd5e1;">${u.trang_thai}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="11" style="text-align:center; padding:12px; border:1px solid #cbd5e1; color:#64748b;">Tất cả các khoản viện phí đều đã được thu đủ 100%!</td></tr>`;

    return `
        <div style="font-family: Arial, sans-serif; color: #0f172a;">
            <!-- Tiêu đề đơn vị -->
            <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
                <tr>
                    <td colspan="6" style="font-weight:bold; font-size:13px; color:#0f766e;">
                        SỞ Y TẾ THÀNH PHỐ ĐÀ NẴNG<br/>
                        TRUNG TÂM Y TẾ PHƯỜNG HẢI CHÂU<br/>
                        <span style="font-weight:normal; font-size:11px; color:#475569;">Phòng Tài Chính - Kế Toán (Quầy Viện Phí P104) • ĐT: (0236) 3822 292</span>
                    </td>
                    <td colspan="6" style="text-align:right; font-size:11px; color:#334155;">
                        <b>Mẫu số: BC-VP01/TTYT-HC</b><br/>
                        Thời gian lập báo cáo: <b>${nowStr}</b><br/>
                        STK Bệnh viện: <b>0041000888999 - Vietcombank</b>
                    </td>
                </tr>
            </table>

            <div style="text-align:center; margin: 12px 0 18px;">
                <h2 style="margin:0; font-size:18px; font-weight:800; color:#0f172a; text-transform:uppercase;">
                    BÁO CÁO QUYẾT TOÁN DOANH THU VIỆN PHÍ & QUỸ BẢO HIỂM Y TẾ
                </h2>
                <p style="margin:4px 0 0; font-size:12px; color:#0f766e; font-weight:bold;">
                    Người lập báo cáo: ${reporterName} • Tỷ lệ hoàn thành thu ngân: ${stats.collectionRate}%
                </p>
            </div>

            <!-- MỤC I: BẢNG TỔNG HỢP DOANH THU BỆNH VIỆN (ĐÃ THU & CHƯA THU) -->
            <h3 style="font-size:13px; font-weight:bold; color:#0f766e; text-transform:uppercase; margin: 14px 0 6px;">
                I. BẢNG TỔNG HỢP DOANH THU BỆNH VIỆN (TỔNG ĐÃ THU & TỔNG CHƯA THU)
            </h3>
            <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;">
                <thead>
                    <tr style="background:#0d9488; color:#ffffff; font-weight:bold;">
                        <th style="padding:8px; border:1px solid #0f766e; text-align:center; width:45px;">STT</th>
                        <th style="padding:8px; border:1px solid #0f766e; text-align:left;">Chỉ Tiêu Tổng Hợp Doanh Thu Viện Phí</th>
                        <th style="padding:8px; border:1px solid #0f766e; text-align:center; width:110px;">Số Lượng Khoản</th>
                        <th style="padding:8px; border:1px solid #0f766e; text-align:right; width:150px;">Tổng Chi Phí Gốc (VNĐ)</th>
                        <th style="padding:8px; border:1px solid #0f766e; text-align:right; width:150px;">Quỹ BHYT Chi Trả (VNĐ)</th>
                        <th style="padding:8px; border:1px solid #0f766e; text-align:right; width:165px;">Bệnh Nhân Chi Trả (VNĐ)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background:#ecfdf5; font-weight:bold;">
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">1</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; color:#065f46;">
                            TỔNG TIỀN BỆNH VIỆN ĐÃ THU (Hóa đơn Đã thu về STK Viện / Quầy P104)
                        </td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">${stats.paidInv.length} hóa đơn</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:right;">${stats.paidGoc.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:right; color:#0f766e;">${stats.paidBhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:right; color:#047857; font-size:13px;">${stats.paidPatient.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr style="background:#fffbeb; font-weight:bold;">
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">2</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; color:#92400e;">
                            TỔNG TIỀN BỆNH VIỆN CHƯA THU (Đang chờ bệnh nhân thanh toán)
                        </td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">${stats.unpaidTotalCount} khoản</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:right;">${stats.unpaidTotalGoc.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:right; color:#0f766e;">${stats.unpaidTotalBhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #cbd5e1; text-align:right; color:#e11d48; font-size:13px;">${stats.unpaidTotalPatient.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center; color:#64748b;">2.1</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; padding-left:24px; color:#475569;">
                            • Trong đó: Hóa đơn Khám lâm sàng & Đơn thuốc chưa thu (Đợt 2)
                        </td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${stats.unpaidInv.length} hóa đơn</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.unpaidInvGoc.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.unpaidInvBhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right; color:#e11d48; font-weight:bold;">${stats.unpaidInvPatient.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center; color:#64748b;">2.2</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; padding-left:24px; color:#475569;">
                            • Trong đó: Chỉ định Cận lâm sàng chưa nộp phí (Đợt 1)
                        </td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${stats.unpaidCls.length} chỉ định</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.unpaidClsGoc.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.unpaidClsBhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right; color:#e11d48; font-weight:bold;">${stats.unpaidClsPatient.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr style="background:#134e4a; color:#ffffff; font-weight:800;">
                        <td style="padding:9px 8px; border:1px solid #134e4a; text-align:center;">3</td>
                        <td style="padding:9px 8px; border:1px solid #134e4a; text-transform:uppercase;">
                            TỔNG CỘNG DOANH THU PHÁT SINH TOÀN TRẠM (1 + 2)
                        </td>
                        <td style="padding:9px 8px; border:1px solid #134e4a; text-align:center;">${stats.grandTotalCount} khoản</td>
                        <td style="padding:9px 8px; border:1px solid #134e4a; text-align:right;">${stats.grandTotalGoc.toLocaleString("vi-VN")}</td>
                        <td style="padding:9px 8px; border:1px solid #134e4a; text-align:right; color:#99f6e4;">${stats.grandTotalBhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:9px 8px; border:1px solid #134e4a; text-align:right; color:#fde047; font-size:14px;">${stats.grandTotalPatient.toLocaleString("vi-VN")}</td>
                    </tr>
                </tbody>
            </table>

            <!-- MỤC II: PHÂN TÍCH DOANH THU ĐÃ THU THEO PHƯƠNG THỨC THANH TOÁN & ĐỢT THU -->
            <h3 style="font-size:13px; font-weight:bold; color:#0f766e; text-transform:uppercase; margin: 14px 0 6px;">
                II. PHÂN TÍCH SỐ TIỀN ĐÃ THU THEO PHƯƠNG THỨC THANH TOÁN & ĐỢT THU NGÂN
            </h3>
            <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;">
                <thead>
                    <tr style="background:#f1f5f9; color:#1e293b; font-weight:bold;">
                        <th style="padding:7px; border:1px solid #cbd5e1; text-align:left;">Phân Loại Doanh Thu Đã Thu</th>
                        <th style="padding:7px; border:1px solid #cbd5e1; text-align:center; width:110px;">Số Hóa Đơn</th>
                        <th style="padding:7px; border:1px solid #cbd5e1; text-align:right; width:150px;">Tổng Chi Phí Gốc (VNĐ)</th>
                        <th style="padding:7px; border:1px solid #cbd5e1; text-align:right; width:150px;">Quỹ BHYT Chi Trả (VNĐ)</th>
                        <th style="padding:7px; border:1px solid #cbd5e1; text-align:right; width:165px;">Thực Thu Bệnh Nhân (VNĐ)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1;">1. Thu qua Chuyển khoản Ngân hàng (VietQR)</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${stats.methodVietQr.count} HĐ</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.methodVietQr.goc.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.methodVietQr.bhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right; font-weight:bold; color:#047857;">${stats.methodVietQr.bn.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1;">2. Thu Tiền mặt trực tiếp tại Quầy P104</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${stats.methodCash.count} HĐ</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.methodCash.goc.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.methodCash.bhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right; font-weight:bold; color:#047857;">${stats.methodCash.bn.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1;">3. Thu qua Ví điện tử định danh VNeID</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${stats.methodVneid.count} HĐ</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.methodVneid.goc.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.methodVneid.bhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right; font-weight:bold; color:#047857;">${stats.methodVneid.bn.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; font-weight:bold; color:#334155;">Phân theo Đợt 1: Thu phí Cận lâm sàng</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${stats.dot1ClsPaid.count} HĐ</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.dot1ClsPaid.goc.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.dot1ClsPaid.bhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right; font-weight:bold;">${stats.dot1ClsPaid.bn.toLocaleString("vi-VN")}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; font-weight:bold; color:#334155;">Phân theo Đợt 2: Thu tiền Khám lâm sàng & Đơn thuốc</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:center;">${stats.dot2ExamPaid.count} HĐ</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.dot2ExamPaid.goc.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right;">${stats.dot2ExamPaid.bhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:6px 8px; border:1px solid #cbd5e1; text-align:right; font-weight:bold;">${stats.dot2ExamPaid.bn.toLocaleString("vi-VN")}</td>
                    </tr>
                </tbody>
            </table>

            <!-- MỤC III: DANH SÁCH CHI TIẾT HÓA ĐƠN ĐÃ THU -->
            <h3 style="font-size:13px; font-weight:bold; color:#047857; text-transform:uppercase; margin: 14px 0 6px;">
                III. DANH SÁCH CHI TIẾT HÓA ĐƠN BỆNH VIỆN ĐÃ THU (${stats.paidInv.length} HÓA ĐƠN)
            </h3>
            <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px;">
                <thead>
                    <tr style="background:#059669; color:#ffffff; font-weight:bold;">
                        <th style="padding:6px; border:1px solid #047857;">STT</th>
                        <th style="padding:6px; border:1px solid #047857;">Mã HĐ</th>
                        <th style="padding:6px; border:1px solid #047857;">Hồ Sơ</th>
                        <th style="padding:6px; border:1px solid #047857;">Họ Tên Bệnh Nhân</th>
                        <th style="padding:6px; border:1px solid #047857;">Số VNeID</th>
                        <th style="padding:6px; border:1px solid #047857;">Loại Hóa Đơn</th>
                        <th style="padding:6px; border:1px solid #047857;">Phương Thức</th>
                        <th style="padding:6px; border:1px solid #047857;">Mã Giao Dịch NH</th>
                        <th style="padding:6px; border:1px solid #047857; text-align:right;">Tổng Gốc (đ)</th>
                        <th style="padding:6px; border:1px solid #047857; text-align:right;">BHYT Trả (đ)</th>
                        <th style="padding:6px; border:1px solid #047857; text-align:right;">Thực Thu BN (đ)</th>
                        <th style="padding:6px; border:1px solid #047857;">Thời Gian Thu</th>
                    </tr>
                </thead>
                <tbody>
                    ${paidRowsHtml}
                    <tr style="background:#d1fae5; font-weight:bold; font-size:12px;">
                        <td colspan="8" style="padding:8px; border:1px solid #059669; text-align:right; text-transform:uppercase; color:#065f46;">
                            TỔNG CỘNG ĐÃ THU (${stats.paidInv.length} HÓA ĐƠN):
                        </td>
                        <td style="padding:8px; border:1px solid #059669; text-align:right;">${stats.paidGoc.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #059669; text-align:right; color:#0f766e;">${stats.paidBhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #059669; text-align:right; color:#047857;">${stats.paidPatient.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #059669;">Đã thu đủ</td>
                    </tr>
                </tbody>
            </table>

            <!-- MỤC IV: DANH SÁCH CHI TIẾT CÁC KHOẢN CHƯA THU -->
            <h3 style="font-size:13px; font-weight:bold; color:#b45309; text-transform:uppercase; margin: 14px 0 6px;">
                IV. DANH SÁCH CHI TIẾT CÁC KHOẢN BỆNH VIỆN CHƯA THU (${stats.unpaidTotalCount} KHOẢN CHỜ THU)
            </h3>
            <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px;">
                <thead>
                    <tr style="background:#d97706; color:#ffffff; font-weight:bold;">
                        <th style="padding:6px; border:1px solid #b45309;">STT</th>
                        <th style="padding:6px; border:1px solid #b45309;">Mã Chứng Từ</th>
                        <th style="padding:6px; border:1px solid #b45309;">Hồ Sơ</th>
                        <th style="padding:6px; border:1px solid #b45309;">Họ Tên Bệnh Nhân</th>
                        <th style="padding:6px; border:1px solid #b45309;">Số VNeID</th>
                        <th style="padding:6px; border:1px solid #b45309;">Thẻ BHYT</th>
                        <th style="padding:6px; border:1px solid #b45309;">Nội Dung Khoản Chưa Thu</th>
                        <th style="padding:6px; border:1px solid #b45309; text-align:right;">Tổng Gốc (đ)</th>
                        <th style="padding:6px; border:1px solid #b45309; text-align:right;">BHYT Hỗ Trợ (đ)</th>
                        <th style="padding:6px; border:1px solid #b45309; text-align:right;">BN Phải Nộp (đ)</th>
                        <th style="padding:6px; border:1px solid #b45309;">Trạng Thái</th>
                    </tr>
                </thead>
                <tbody>
                    ${unpaidRowsHtml}
                    <tr style="background:#fef3c7; font-weight:bold; font-size:12px;">
                        <td colspan="7" style="padding:8px; border:1px solid #d97706; text-align:right; text-transform:uppercase; color:#92400e;">
                            TỔNG CỘNG CHƯA THU (${stats.unpaidTotalCount} KHOẢN):
                        </td>
                        <td style="padding:8px; border:1px solid #d97706; text-align:right;">${stats.unpaidTotalGoc.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #d97706; text-align:right; color:#0f766e;">${stats.unpaidTotalBhyt.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #d97706; text-align:right; color:#e11d48;">${stats.unpaidTotalPatient.toLocaleString("vi-VN")}</td>
                        <td style="padding:8px; border:1px solid #d97706; color:#92400e;">Chờ thu ngân</td>
                    </tr>
                </tbody>
            </table>

            <!-- Chữ ký xác nhận cuối báo cáo -->
            <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:12px;">
                <tr>
                    <td colspan="6" style="text-align:center; padding:10px;">
                        <b>NGƯỜI LẬP BÁO CÁO (KẾ TOÁN THU NGÂN)</b><br/>
                        <span style="font-size:11px; color:#64748b; font-style:italic;">(Ký và ghi rõ họ tên)</span><br/><br/><br/>
                        <b style="color:#0f766e;">${reporterName}</b>
                    </td>
                    <td colspan="6" style="text-align:center; padding:10px;">
                        <b>GIÁM ĐỐC / TRƯỞNG PHÒNG TÀI CHÍNH - KẾ TOÁN</b><br/>
                        <span style="font-size:11px; color:#64748b; font-style:italic;">(Ký tên và đóng dấu xác nhận)</span><br/><br/><br/>
                        <b>TRUNG TÂM Y TẾ PHƯỜNG HẢI CHÂU</b>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

/**
 * Tải file Excel (.xls) có định dạng bảng biểu, màu sắc, kẻ khung và giữ nguyên số 0 ở đầu cho VNeID/STK
 */
function downloadRevenueExcelFile() {
    if (!cachedAccountantData) return;
    const stats = calculateHospitalRevenueSummary();
    const user = getCurrentUser();
    const reporterName = (user && user.ho_ten) ? user.ho_ten : "CN. Lê Thị Thu Ngân";
    const nowStr = new Date().toLocaleString("vi-VN");
    const dateStamp = new Date().toISOString().substring(0, 10);

    const reportHtml = buildRevenueReportHtmlContent(stats, reporterName, nowStr);

    const excelDoc = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>Bao_Cao_Doanh_Thu_TTYT</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
        </head>
        <body>
            ${reportHtml}
        </body>
        </html>
    `;

    const blob = new Blob(["\uFEFF" + excelDoc], {
        type: "application/vnd.ms-excel;charset=utf-8;"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Bao_Cao_Quyet_Toan_Doanh_Thu_TTYT_Hai_Chau_${dateStamp}.xls`;
    link.click();
}

/**
 * Tải file CSV (.csv) có đầy đủ cả 4 phần: Tổng hợp Đã thu / Chưa thu, Phân tích phương thức & Chi tiết hóa đơn
 */
function downloadRevenueCsvFile() {
    if (!cachedAccountantData) return;
    const stats = calculateHospitalRevenueSummary();
    const user = getCurrentUser();
    const reporterName = (user && user.ho_ten) ? user.ho_ten : "CN. Lê Thị Thu Ngân";
    const nowStr = new Date().toLocaleString("vi-VN");
    const dateStamp = new Date().toISOString().substring(0, 10);

    const esc = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = [
        ["SỞ Y TẾ TP. ĐÀ NẴNG - TRUNG TÂM Y TẾ PHƯỜNG HẢI CHÂU"],
        ["BÁO CÁO QUYẾT TOÁN DOANH THU VIỆN PHÍ & QUỸ BẢO HIỂM Y TẾ (PHÒNG TÀI CHÍNH - KẾ TOÁN P104)"],
        ["Thời gian xuất báo cáo:", nowStr, "Người lập biểu:", reporterName, "STK Bệnh viện:", "0041000888999 - Vietcombank"],
        [],
        ["I. BẢNG TỔNG HỢP DOANH THU BỆNH VIỆN (ĐÃ THU & CHƯA THU)"],
        ["STT", "Chỉ Tiêu Tổng Hợp", "Số Lượng", "Tổng Chi Phí Gốc (VNĐ)", "Quỹ BHYT Chi Trả (VNĐ)", "Bệnh Nhân Đồng Chi Trả (VNĐ)"],
        [1, "TỔNG TIỀN BỆNH VIỆN ĐÃ THU (Hóa đơn Đã thu)", `${stats.paidInv.length} hóa đơn`, stats.paidGoc, stats.paidBhyt, stats.paidPatient],
        [2, "TỔNG TIỀN BỆNH VIỆN CHƯA THU (Đang chờ thu)", `${stats.unpaidTotalCount} khoản`, stats.unpaidTotalGoc, stats.unpaidTotalBhyt, stats.unpaidTotalPatient],
        ["2.1", "  - Hóa đơn Khám & Đơn thuốc chưa thu (Đợt 2)", `${stats.unpaidInv.length} hóa đơn`, stats.unpaidInvGoc, stats.unpaidInvBhyt, stats.unpaidInvPatient],
        ["2.2", "  - Chỉ định Cận lâm sàng chưa nộp phí (Đợt 1)", `${stats.unpaidCls.length} chỉ định`, stats.unpaidClsGoc, stats.unpaidClsBhyt, stats.unpaidClsPatient],
        [3, "TỔNG CỘNG DOANH THU PHÁT SINH TOÀN TRẠM (1 + 2)", `${stats.grandTotalCount} khoản`, stats.grandTotalGoc, stats.grandTotalBhyt, stats.grandTotalPatient],
        [],
        ["II. PHÂN TÍCH DOANH THU ĐÃ THU THEO PHƯƠNG THỨC THANH TOÁN & ĐỢT THU"],
        ["Phân Loại", "Số Lượng HĐ", "Tổng Chi Phí Gốc (VNĐ)", "Quỹ BHYT Chi Trả (VNĐ)", "Thực Thu Bệnh Nhân (VNĐ)"],
        ["1. Chuyển khoản VietQR", stats.methodVietQr.count, stats.methodVietQr.goc, stats.methodVietQr.bhyt, stats.methodVietQr.bn],
        ["2. Tiền mặt tại Quầy P104", stats.methodCash.count, stats.methodCash.goc, stats.methodCash.bhyt, stats.methodCash.bn],
        ["3. Ví điện tử VNeID", stats.methodVneid.count, stats.methodVneid.goc, stats.methodVneid.bhyt, stats.methodVneid.bn],
        ["4. Thu Đợt 1 (Phí Cận lâm sàng)", stats.dot1ClsPaid.count, stats.dot1ClsPaid.goc, stats.dot1ClsPaid.bhyt, stats.dot1ClsPaid.bn],
        ["5. Thu Đợt 2 (Phí Khám & Đơn thuốc)", stats.dot2ExamPaid.count, stats.dot2ExamPaid.goc, stats.dot2ExamPaid.bhyt, stats.dot2ExamPaid.bn],
        [],
        ["III. DANH SÁCH CHI TIẾT CÁC HÓA ĐƠN ĐÃ THU"],
        ["STT", "Mã Hóa Đơn", "Mã Hồ Sơ", "Họ Tên Bệnh Nhân", "VNeID", "STK Bệnh Nhân", "Loại Hóa Đơn", "Phương Thức Thanh Toán", "Mã Giao Dịch NH", "Tổng Tiền Gốc", "BHYT Chi Trả", "Thực Thu Bệnh Nhân", "Thời Gian Thu"]
    ];

    stats.paidInv.forEach((i, idx) => {
        rows.push([
            idx + 1,
            i.ma_hoa_don,
            i.ma_ho_so_kham || "",
            i.ten_benh_nhan || "",
            `="${i.vneid || ""}"`,
            i.stk_ngan_hang || "",
            i.loai_hoa_don === "Dot1_ThuTienCLS" ? "Đợt 1: Thu CLS" : "Đợt 2: Khám & Thuốc",
            formatPaymentMethodLabel(i.phuong_thuc_thanh_toan),
            i.ma_giao_dich_ngan_hang || "",
            i.tong_tien_goc,
            i.tien_bhyt_chi_tra,
            i.tien_benh_nhan_tra,
            i.thoi_gian_thu || ""
        ]);
    });

    rows.push(["", "", "", "", "", "", "", "", "TỔNG CỘNG ĐÃ THU:", stats.paidGoc, stats.paidBhyt, stats.paidPatient, ""]);
    rows.push([]);
    rows.push(["IV. DANH SÁCH CHI TIẾT CÁC KHOẢN CHƯA THU (HÓA ĐƠN CHỜ THU & CHỈ ĐỊNH CLS CHỜ NỘP PHÍ)"]);
    rows.push(["STT", "Mã Chứng Từ", "Mã Hồ Sơ", "Họ Tên Bệnh Nhân", "VNeID", "Thẻ BHYT", "Nội Dung Khoản Chưa Thu", "Tổng Tiền Gốc", "BHYT Dự Kiến Chi Trả", "Bệnh Nhân Còn Phải Nộp", "Trạng Thái"]);

    let sttUnpaid = 1;
    stats.unpaidInv.forEach(i => {
        rows.push([
            sttUnpaid++,
            `HĐ #${i.ma_hoa_don}`,
            i.ma_ho_so_kham || "",
            i.ten_benh_nhan || "",
            `="${i.vneid || ""}"`,
            i.so_the_bhyt || "Không BHYT",
            `Đợt 2: Viện phí Khám & Đơn thuốc (${i.ten_khoa || "Chuyên khoa"})`,
            i.tong_tien_goc,
            i.tien_bhyt_chi_tra,
            i.tien_benh_nhan_tra,
            "Chờ thu Hóa đơn"
        ]);
    });

    stats.unpaidCls.forEach(c => {
        const gia = Number(c.don_gia_cls || 0);
        const bhyt = c.so_the_bhyt ? Math.round(gia * 0.8) : 0;
        const bn = gia - bhyt;
        rows.push([
            sttUnpaid++,
            `CLS #${c.ma_chi_dinh_cls}`,
            c.ma_ho_so_kham || "",
            c.ten_benh_nhan || "",
            `="${c.vneid || ""}"`,
            c.so_the_bhyt || "Không BHYT",
            `Đợt 1: ${c.ten_dich_vu_cls || "Dịch vụ CLS"}`,
            gia,
            bhyt,
            bn,
            "Chờ thu phí CLS"
        ]);
    });

    rows.push(["", "", "", "", "", "", "TỔNG CỘNG CHƯA THU:", stats.unpaidTotalGoc, stats.unpaidTotalBhyt, stats.unpaidTotalPatient, ""]);

    const csvContent = "\uFEFF" + rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Bao_Cao_Doanh_Thu_TTYT_Hai_Chau_${dateStamp}.csv`;
    link.click();
}

function printRevenueReport() {
    const area = document.getElementById("revenue-report-preview-body");
    if (!area) return;

    const printWin = window.open("", "_blank", "width=1000,height=780");
    if (!printWin) {
        window.print();
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="utf-8"/>
            <title>Báo Cáo Quyết Toán Doanh Thu Viện Phí - TTYT Phường Hải Châu</title>
            <style>
                @page { size: A4 landscape; margin: 12mm; }
                body { font-family: Arial, sans-serif; background: #fff; color: #0f172a; margin: 0; }
            </style>
        </head>
        <body>
            ${area.innerHTML}
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 300);
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

// =========================================================================
// 6. MODAL THANH TOÁN VIỆN PHÍ VỀ STK BỆNH VIỆN & TỰ ĐỘNG XUẤT HÓA ĐƠN
// =========================================================================
function ensureHospitalPaymentModalExists() {
    if (document.getElementById("hospital-payment-modal")) return;

    const modal = document.createElement("div");
    modal.id = "hospital-payment-modal";
    modal.className = "hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4";
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-teal-600 text-2xl">account_balance</span>
                    <div>
                        <h3 id="pay-modal-title" class="font-heading font-extrabold text-base text-slate-900">
                            Cổng Thanh Toán & Xuất Hóa Đơn Viện Phí
                        </h3>
                        <p class="text-[11px] text-emerald-700 font-semibold">Xác nhận thu tiền và tự động xuất Hóa đơn điện tử</p>
                    </div>
                </div>
                <button type="button" onclick="closeHospitalPaymentModal()" class="text-slate-400 hover:text-slate-700">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <div class="p-3.5 rounded-xl bg-teal-50/80 border border-teal-200 space-y-2">
                <div>
                    <label class="text-[11px] font-bold text-slate-700 block mb-1">STK Ngân hàng của Bệnh nhân (\`benh_nhan.stk_ngan_hang\`):</label>
                    <input id="pay-modal-patient-stk" type="text" placeholder="VD: 987691004 - MB Bank"
                           class="w-full h-8 px-2.5 rounded-lg border-slate-300 bg-white font-bold text-slate-800 text-xs"/>
                </div>
                <div>
                    <label class="text-[11px] font-bold text-slate-700 block mb-1">STK Bệnh viện nhận tiền (\`hoa_don_vien_phi.stk_benh_vien\`):</label>
                    <input id="pay-modal-hospital-stk" type="text" value="0041000888999 - Vietcombank (TTYT Phường Hải Châu)"
                           class="w-full h-8 px-2.5 rounded-lg border-slate-300 bg-white font-bold text-teal-700 text-xs"/>
                </div>
                <div class="flex items-center justify-between pt-1.5 border-t border-teal-200/80">
                    <span class="text-slate-600 font-bold">Số tiền bệnh nhân trả (\`tien_benh_nhan_tra\`):</span>
                    <span id="pay-modal-amount" class="font-heading font-extrabold text-lg text-rose-600">0đ</span>
                </div>
            </div>

            <div>
                <label class="font-bold text-slate-700 block mb-1.5">Phương thức thanh toán (\`phuong_thuc_thanh_toan\`) *</label>
                <div class="grid grid-cols-3 gap-2">
                    <label class="p-2.5 rounded-xl border border-slate-300 has-[:checked]:border-2 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/50 cursor-pointer text-center">
                        <input type="radio" name="hospital_pay_method" value="ChuyenKhoan_VietQR" checked onchange="toggleVietQrDisplay()" class="hidden"/>
                        <span class="material-symbols-outlined text-teal-600 text-xl block">qr_code_scanner</span>
                        <span class="font-bold text-[11px] block mt-0.5">Chuyển khoản VietQR</span>
                    </label>
                    <label class="p-2.5 rounded-xl border border-slate-300 has-[:checked]:border-2 has-[:checked]:border-red-600 has-[:checked]:bg-red-50/40 cursor-pointer text-center">
                        <input type="radio" name="hospital_pay_method" value="ViDienTu_VNeID" onchange="toggleVietQrDisplay()" class="hidden"/>
                        <span class="material-symbols-outlined text-red-600 text-xl block">verified_user</span>
                        <span class="font-bold text-[11px] block mt-0.5">Thanh toán VNeID</span>
                    </label>
                    <label class="p-2.5 rounded-xl border border-slate-300 has-[:checked]:border-2 has-[:checked]:border-amber-600 has-[:checked]:bg-amber-50/50 cursor-pointer text-center">
                        <input type="radio" name="hospital_pay_method" value="TienMat" onchange="toggleVietQrDisplay()" class="hidden"/>
                        <span class="material-symbols-outlined text-amber-600 text-xl block">payments</span>
                        <span class="font-bold text-[11px] block mt-0.5">Tiền mặt tại Quầy</span>
                    </label>
                </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                <img id="vietqr-img-preview" src="" alt="VietQR TTYT Hải Châu" class="w-28 h-28 rounded-xl border border-slate-300 bg-white p-1 shrink-0 object-contain"/>
                <div class="space-y-1.5 flex-1">
                    <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">Quét mã chuyển về STK Bệnh viện</span>
                    <div id="pay-modal-transfer-content" class="p-2 rounded bg-white border border-slate-300 font-mono font-bold text-teal-700 text-xs">
                        TTYT HC THANH TOAN
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-0.5">Mã giao dịch ngân hàng (\`ma_giao_dich_ngan_hang\`):</label>
                        <input id="pay-modal-tx-code" type="text" class="w-full h-8 px-2.5 rounded-lg border-slate-300 font-mono font-bold text-emerald-800 text-xs"/>
                    </div>
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onclick="closeHospitalPaymentModal()" class="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold">
                    Hủy
                </button>
                <button type="button" onclick="submitConfirmHospitalPayment()"
                        class="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold flex items-center gap-1.5 shadow-lg transition">
                    <span class="material-symbols-outlined text-base">receipt_long</span>
                    <span>Xác Nhận Thu Tiền & Xuất Hóa Đơn</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function toggleVietQrDisplay() {
    const method = document.querySelector('input[name="hospital_pay_method"]:checked')?.value || "ChuyenKhoan_VietQR";
    const txInput = document.getElementById("pay-modal-tx-code");
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").substring(2, 12);

    if (method === "TienMat") txInput.value = `TM-P104-${stamp}`;
    else if (method === "ViDienTu_VNeID") txInput.value = `VNEID-PAY-${stamp}`;
    else txInput.value = `VCB-FT${stamp}`;
}

function closeHospitalPaymentModal() {
    const modal = document.getElementById("hospital-payment-modal");
    if (modal) modal.classList.add("hidden");
    pendingPaymentData = null;
}

function confirmCollectCls(maChiDinh, maHoSo, tenBenhNhan, soTienBnTra) {
    ensureHospitalPaymentModalExists();
    const clsItem = (cachedAccountantData?.cls_orders || []).find(
        c => String(c.ma_chi_dinh_cls) === String(maChiDinh)
    );

    pendingPaymentData = {
        type: "CLS",
        ma_chi_dinh_cls: String(maChiDinh),
        ma_ho_so_kham: String(maHoSo),
        ten_benh_nhan: tenBenhNhan,
        amount: soTienBnTra
    };

    const transferNote = `TTYT HC CLS ${maHoSo}`;
    document.getElementById("pay-modal-title").textContent = `Thu Phí CLS (#${maChiDinh}) - BN: ${tenBenhNhan}`;
    document.getElementById("pay-modal-patient-stk").value = clsItem?.stk_ngan_hang || "";
    document.getElementById("pay-modal-hospital-stk").value = "0041000888999 - Vietcombank (TTYT Phường Hải Châu)";
    document.getElementById("pay-modal-amount").textContent = Number(soTienBnTra).toLocaleString("vi-VN") + "đ";
    document.getElementById("pay-modal-transfer-content").textContent = transferNote;
    document.getElementById("vietqr-img-preview").src =
        `https://img.vietqr.io/image/VCB-0041000888999-compact2.png?amount=${soTienBnTra}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent("TTYT PHUONG HAI CHAU")}`;

    toggleVietQrDisplay();
    document.getElementById("hospital-payment-modal").classList.remove("hidden");
}

function confirmCollectInvoice(maHoaDon) {
    ensureHospitalPaymentModalExists();
    const inv = (cachedAccountantData?.invoices || []).find(
        i => String(i.ma_hoa_don) === String(maHoaDon)
    );
    const amount = inv ? Number(inv.tien_benh_nhan_tra || 0) : 0;
    const tenBn = inv ? inv.ten_benh_nhan : "Bệnh nhân";

    pendingPaymentData = {
        type: "INVOICE",
        ma_hoa_don: String(maHoaDon),
        ma_ho_so_kham: inv ? String(inv.ma_ho_so_kham || "") : "",
        ten_benh_nhan: tenBn,
        amount: amount
    };

    const transferNote = `TTYT HC ${maHoaDon}`;
    document.getElementById("pay-modal-title").textContent = `Thu Viện Phí Hóa Đơn #${maHoaDon} - ${tenBn}`;
    document.getElementById("pay-modal-patient-stk").value = inv?.stk_ngan_hang || "";
    document.getElementById("pay-modal-hospital-stk").value = inv?.stk_benh_vien || "0041000888999 - Vietcombank (TTYT Phường Hải Châu)";
    document.getElementById("pay-modal-amount").textContent = amount.toLocaleString("vi-VN") + "đ";
    document.getElementById("pay-modal-transfer-content").textContent = transferNote;
    document.getElementById("vietqr-img-preview").src =
        `https://img.vietqr.io/image/VCB-0041000888999-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent("TTYT PHUONG HAI CHAU")}`;

    toggleVietQrDisplay();
    document.getElementById("hospital-payment-modal").classList.remove("hidden");
}

async function submitConfirmHospitalPayment() {
    if (!pendingPaymentData) return;
    const user = getCurrentUser();
    const method = document.querySelector('input[name="hospital_pay_method"]:checked')?.value || "ChuyenKhoan_VietQR";
    const txCode = document.getElementById("pay-modal-tx-code").value.trim();
    const stkBenhVien = document.getElementById("pay-modal-hospital-stk").value.trim();
    const stkNganHangBn = document.getElementById("pay-modal-patient-stk").value.trim();

    const paymentSnapshot = { ...pendingPaymentData };

    try {
        const endpoint = paymentSnapshot.type === "CLS"
            ? `${ACCOUNTANT_API_BASE}/collect-cls`
            : `${ACCOUNTANT_API_BASE}/collect-invoice`;

        const payload = {
            ...paymentSnapshot,
            ma_ke_toan: user ? (user.ma_nhan_vien || user.ma_nguoi_dung) : "NV004",
            phuong_thuc_thanh_toan: method,
            stk_benh_vien: stkBenhVien,
            stk_ngan_hang: stkNganHangBn,
            ma_giao_dich_ngan_hang: txCode
        };

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showAccountantNoticeModal("Lỗi Xác Nhận Thanh Toán", data.message || "Không thể xác nhận thanh toán!", true);
            return;
        }

        closeHospitalPaymentModal();
        await loadAccountantDashboard();

        const targetInvoiceId = data.ma_hoa_don || paymentSnapshot.ma_hoa_don;
        const allInvoices = cachedAccountantData?.invoices || [];

        let exportedInv = null;
        if (targetInvoiceId) {
            exportedInv = allInvoices.find(i => String(i.ma_hoa_don) === String(targetInvoiceId));
        }
        if (!exportedInv && paymentSnapshot.ma_ho_so_kham) {
            exportedInv = allInvoices.find(i => String(i.ma_ho_so_kham) === String(paymentSnapshot.ma_ho_so_kham));
        }

        if (exportedInv) {
            showAndExportHospitalInvoiceModal(exportedInv);
        } else if (paymentSnapshot.type === "CLS") {
            openInvoiceExportByClsOrder(paymentSnapshot.ma_chi_dinh_cls, paymentSnapshot.ma_ho_so_kham);
        }
    } catch (e) {
        showAccountantNoticeModal("Lỗi Kết Nối", "Không kết nối được tới Server Laravel (Cổng 8000)!", true);
    }
}