// Sử dụng ACCOUNT_API_URL riêng để không bao giờ bị đụng độ biến const API_CONFIG với api-config.js
const ACCOUNT_API_URL = "http://127.0.0.1:8000/api";

let cachedMedicalRecords = [];
let cachedBookedAppointments = [];

/**
 * 1. Hàm lấy thông tin tài khoản đang đăng nhập từ localStorage
 */
function getCurrentUser() {
    try {
        const raw = localStorage.getItem("current_user");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * 2. Hàm đăng xuất tài khoản và quay về trang Đăng nhập
 */
function logoutSystem() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

/**
 * 3. Hàm tải file footer.html vào cuối trang Tài khoản
 */
async function loadFooterHtml() {
    const footerPlaceholder = document.getElementById("app-footer");
    if (!footerPlaceholder) return;
    try {
        const res = await fetch("./footer.html");
        if (res.ok) {
            footerPlaceholder.innerHTML = await res.text();
        }
    } catch (err) {}
}

/**
 * 4. Hàm chuyển đổi qua lại giữa 4 mục bên thanh menu tay trái:
 * - profile: Hồ sơ cá nhân, VNeID & BHYT
 * - password: Đổi mật khẩu
 * - records: Hồ sơ bệnh án điện tử
 * - appointments: Lịch khám đã đặt
 */
function switchAccountTab(tabName) {
    const tabs = ["profile", "password", "records", "appointments"];
    const alertBox = document.getElementById("account-modal-alert");
    if (alertBox) alertBox.classList.add("hidden");

    const iconsMap = {
        profile: { icon: "manage_accounts", color: "text-teal-600" },
        password: { icon: "lock_reset", color: "text-amber-600" },
        records: { icon: "clinical_notes", color: "text-emerald-600" },
        appointments: { icon: "event_available", color: "text-sky-600" }
    };

    tabs.forEach(t => {
        const panel = document.getElementById(`panel-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (!panel || !btn) return;

        const iconSpan = btn.querySelector(".material-symbols-outlined");

        if (t === tabName) {
            panel.classList.remove("hidden");
            btn.className = "w-full px-4 py-3 rounded-xl text-left flex items-center gap-3 transition bg-teal-600 text-white shadow-xs";
            if (iconSpan) iconSpan.className = "material-symbols-outlined text-xl text-white";
        } else {
            panel.classList.add("hidden");
            btn.className = "w-full px-4 py-3 rounded-xl text-left flex items-center gap-3 transition text-slate-700 hover:bg-teal-50 hover:text-teal-700";
            if (iconSpan) iconSpan.className = `material-symbols-outlined text-xl ${iconsMap[t].color}`;
        }
    });
}

/**
 * 5. Hàm hiển thị thông báo thành công / lỗi trên trang Tài khoản
 */
function showAccountAlert(msg, isSuccess = true) {
    const alertBox = document.getElementById("account-modal-alert");
    if (!alertBox) return;
    alertBox.className = `mb-5 p-3.5 rounded-xl border text-xs sm:text-sm font-bold ${
        isSuccess ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-red-50 text-red-700 border-red-300"
    }`;
    alertBox.textContent = msg;
    alertBox.classList.remove("hidden");
}

/**
 * 6. Hàm điền dữ liệu của người dùng vào cột bên trái và Form Hồ sơ cá nhân
 * (Đã gỡ bỏ preview-profile-avatar để không gây lỗi dừng hàm)
 */
function fillProfileFormInputs(userData) {
    if (!userData) return;

    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.ho_ten || "BN")}&background=fff&color=0d9488&bold=true`;

    const sidebarAvatarEl = document.getElementById("sidebar-user-avatar");
    if (sidebarAvatarEl) sidebarAvatarEl.src = defaultAvatar;

    const sidebarNameEl = document.getElementById("sidebar-user-name");
    if (sidebarNameEl) sidebarNameEl.textContent = userData.ho_ten || "";

    const sidebarCodeEl = document.getElementById("sidebar-user-code");
    if (sidebarCodeEl) {
        sidebarCodeEl.textContent = `Mã BN: #${userData.ma_benh_nhan || userData.ma_nguoi_dung}${userData.vneid ? " • VNeID: " + userData.vneid : ""}`;
    }

    const sidebarEmailEl = document.getElementById("sidebar-user-email");
    if (sidebarEmailEl) sidebarEmailEl.textContent = userData.email || "";

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    setVal("pf-fullname", userData.ho_ten || "");
    setVal("pf-phone", userData.so_dien_thoai || "");
    setVal("pf-dob", userData.ngay_sinh ? String(userData.ngay_sinh).substring(0, 10) : "");
    setVal("pf-gender", userData.gioi_tinh || "Nam");
    setVal("pf-bhyt", userData.so_the_bhyt || "");
    setVal("pf-vneid", userData.vneid || "");
    setVal("pf-stk-ngan-hang", userData.stk_ngan_hang || "");
    setVal("pf-bhyt-expire", userData.han_the_bhyt ? String(userData.han_the_bhyt).substring(0, 10) : "");
    setVal("pf-bhyt-place", userData.noi_dang_ky_bhyt || "TTYT Phường Hải Châu");
    setVal("pf-allergy", userData.tien_su_di_ung_benh_nen || "");
    setVal("pf-address", userData.dia_chi || "");
}

/**
 * 7. Hàm lưu cập nhật thông tin Hồ sơ cá nhân, VNeID, STK ngân hàng & BHYT vào MySQL
 */
async function handleUpdateProfile(event) {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) {
        window.location.href = "login.html";
        return;
    }

    const updatedData = {
        ma_nguoi_dung: user.ma_nguoi_dung,
        email: user.email,
        vneid: document.getElementById("pf-vneid").value.trim() || null,
        stk_ngan_hang: document.getElementById("pf-stk-ngan-hang").value.trim() || null,
        ho_ten: document.getElementById("pf-fullname").value.trim().toUpperCase(),
        so_dien_thoai: document.getElementById("pf-phone").value.trim(),
        ngay_sinh: document.getElementById("pf-dob").value,
        gioi_tinh: document.getElementById("pf-gender").value,
        so_the_bhyt: document.getElementById("pf-bhyt").value.trim().toUpperCase(),
        han_the_bhyt: document.getElementById("pf-bhyt-expire").value || null,
        noi_dang_ky_bhyt: document.getElementById("pf-bhyt-place").value.trim() || "TTYT Phường Hải Châu",
        tien_su_di_ung_benh_nen: document.getElementById("pf-allergy").value.trim() || "",
        dia_chi: document.getElementById("pf-address").value.trim()
    };

    try {
        const res = await fetch(`${ACCOUNT_API_URL}/update-profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(updatedData)
        });
        const data = await res.json();

        if (!res.ok || data.status === "error") {
            showAccountAlert("⚠️ Lỗi khi lưu vào MySQL: " + (data.message || "Không xác định"), false);
            return;
        }

        localStorage.setItem("current_user", JSON.stringify(data.user));
        fillProfileFormInputs(data.user);
        showAccountAlert("✅ Đã lưu cập nhật hồ sơ cá nhân, VNeID, thẻ BHYT & STK ngân hàng vào MySQL!", true);
    } catch (e) {
        showAccountAlert("⚠️ Không kết nối được tới Server Laravel (Cổng 8000)!", false);
    }
}

/**
 * 8. Hàm xử lý Đổi mật khẩu trong bảng NGUOI_DUNG
 */
async function handleChangePassword(event) {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) {
        window.location.href = "login.html";
        return;
    }

    const currentPassword = document.getElementById("pwd-current").value.trim();
    const newPassword = document.getElementById("pwd-new").value.trim();
    const confirmPassword = document.getElementById("pwd-confirm").value.trim();

    if (newPassword !== confirmPassword) {
        showAccountAlert("⚠️ Mật khẩu mới nhập lại không khớp!", false);
        return;
    }

    try {
        const res = await fetch(`${ACCOUNT_API_URL}/change-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ma_nguoi_dung: user.ma_nguoi_dung,
                email: user.email,
                mat_khau_cu: currentPassword,
                mat_khau_moi: newPassword
            })
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            showAccountAlert("⚠️ " + (data.message || "Mật khẩu hiện tại không đúng!"), false);
            return;
        }
        showAccountAlert("✅ " + (data.message || "Đổi mật khẩu thành công!"), true);
        event.target.reset();
    } catch (err) {
        showAccountAlert("⚠️ Không kết nối được tới Server Laravel (Cổng 8000)!", false);
    }
}

/**
 * Hàm kiểm tra xem Ngày hẹn và Khung giờ hẹn đã qua thời điểm hiện tại hay chưa
 */
function checkIsAppointmentExpired(ngayHen, khungGio) {
    if (!ngayHen) return false;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    if (ngayHen < todayStr) return true;
    if (ngayHen > todayStr) return false;

    const currentHm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    let endTime = "17:00";
    const match = String(khungGio || "").match(/-\s*(\d{2}:\d{2})/);
    if (match) {
        endTime = match[1];
    } else if (String(khungGio).toLowerCase().includes("sáng")) {
        endTime = "11:30";
    } else {
        endTime = "19:00";
    }

    return currentHm > endTime;
}

/**
 * 9. Hàm tải dữ liệu Hồ sơ bệnh án và Lịch khám đã đặt của đúng bệnh nhân đang đăng nhập từ MySQL
 */
async function loadPatientPortalDataFromMySql(maNguoiDung) {
    if (!maNguoiDung) return;
    try {
        const res = await fetch(`${ACCOUNT_API_URL}/patient-portal-data/${maNguoiDung}`, {
            headers: { "Accept": "application/json" }
        });
        if (res.ok) {
            const data = await res.json();
            const rawAppointments = Array.isArray(data.appointments) ? data.appointments : [];

            cachedBookedAppointments = await Promise.all(rawAppointments.map(async (a) => {
                let trangThai = a.trang_thai_hen;
                let lyDoHuy = a.ly_do_huy;
                let thoiGianHuy = a.thoi_gian_huy;

                if (trangThai === "ChoTiepNhan" && checkIsAppointmentExpired(a.ngay_hen_kham, a.khung_gio_hen)) {
                    trangThai = "DaHuy";
                    lyDoHuy = "Bệnh nhân không lên khám";
                    try {
                        await fetch(`${ACCOUNT_API_URL}/cancel-appointment`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Accept": "application/json" },
                            body: JSON.stringify({
                                ma_lich_hen: a.ma_lich_hen,
                                ma_nguoi_dung: maNguoiDung,
                                ly_do_huy: "Bệnh nhân không lên khám"
                            })
                        });
                    } catch (err) {}
                }

                return {
                    ma_lich_hen: a.ma_lich_hen,
                    ma_lich_lam: a.ma_lich_lam,
                    chuyen_khoa: `${a.ten_khoa || "Chuyên khoa"} • Phòng ${a.so_phong || "P102"} (${Number(a.gia_kham || 45000).toLocaleString("vi-VN")}đ)`,
                    ngay_hen: a.ngay_hen_kham,
                    ca_kham: a.khung_gio_hen,
                    trieu_chung: a.trieu_chung_ban_dau || "Khám theo lịch hẹn",
                    trang_thai: trangThai,
                    trang_thai_text: trangThai === "DaTiepNhan"
                        ? "✅ Đã tiếp nhận khám tại Trung tâm"
                        : (trangThai === "DaHuy" ? "Đã hủy lịch hẹn" : "⏳ Chờ tiếp nhận tại Quầy P101"),
                    ly_do_huy: lyDoHuy,
                    thoi_gian_huy: thoiGianHuy
                };
            }));

            renderBookedAppointmentsList();
            cachedMedicalRecords = Array.isArray(data.medical_records) ? data.medical_records : [];
            renderMedicalRecordsFromMySql(cachedMedicalRecords);
            return;
        }
    } catch (e) {}
}

/**
 * 10. Hàm vẽ danh sách Hồ sơ bệnh án điện tử
 */
function renderMedicalRecordsFromMySql(records) {
    const container = document.getElementById("records-list-container");
    if (!container) return;

    if (!records || records.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 text-slate-500">
                Hiện bạn chưa có hồ sơ bệnh án nào trong cơ sở dữ liệu MySQL.
            </div>
        `;
        return;
    }

    const statusMap = {
        ChoSinhHieu: { label: "⏳ Đang chờ khám sàng lọc", cls: "bg-amber-100 text-amber-800" },
        ChoKhamBS: { label: "👨‍⚕️ Đang chờ Bác sĩ khám", cls: "bg-sky-100 text-sky-800" },
        ChoLamCLS: { label: "🔬 Đang làm Cận lâm sàng", cls: "bg-indigo-100 text-indigo-800" },
        HoanTat: { label: "✅ Đã hoàn tất khám", cls: "bg-emerald-100 text-emerald-800" }
    };

    container.innerHTML = records.map((rec, idx) => {
        const st = statusMap[rec.trang_thai_hang_doi] || { label: rec.trang_thai_hang_doi, cls: "bg-slate-100 text-slate-700" };
        const clsList = rec.cls_results || [];
        const thuocList = rec.prescription_items || [];
        const invoicesList = rec.invoices || [];

        const clsHtml = clsList.map(c => `
            <div class="mt-2.5 p-3 rounded-lg bg-indigo-50/70 border border-indigo-200 text-xs">
                <b class="text-indigo-900">🔬 Dịch vụ Cận lâm sàng (#${c.ma_chi_dinh_cls}): ${c.ten_dich_vu_cls}</b>
                <p class="text-slate-700 mt-1"><b>Kết quả:</b> ${c.ket_qua_cls || "Đang chờ kết quả"}</p>
                ${c.ai_phan_tich_cls ? `<p class="text-indigo-800 mt-0.5"><b>Nhận định AI:</b> ${c.ai_phan_tich_cls}</p>` : ""}
                ${c.images && c.images.length > 0 ? `
                    <div class="flex gap-2 mt-2 overflow-x-auto">
                        ${c.images.map(img => `<img src="${img.duong_dan_anh_cls}" class="w-24 h-24 object-cover rounded-lg border border-indigo-300"/>`).join("")}
                    </div>
                ` : ""}
            </div>
        `).join("");

        const thuocHtml = thuocList.length > 0 ? `
            <div class="mt-2.5 p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs">
                <b class="text-sky-900">💊 Đơn thuốc Bác sĩ kê:</b>
                <ul class="list-disc list-inside mt-1 text-slate-700 space-y-1">
                    ${thuocList.map(t => `<li><b>${t.ten_thuoc}</b> (#${t.ma_thuoc}) — Số lượng: <b>${t.so_luong} ${t.don_vi_tinh}</b> (<i>${t.lieu_dung_huong_dan}</i>)</li>`).join("")}
                </ul>
            </div>
        ` : "";

        const hoaDonHtml = invoicesList.map(hd => `
            <div class="mt-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <span>💳 <b>Hóa đơn #${hd.ma_hoa_don}</b> • Tổng tiền gốc: <b>${Number(hd.tong_tien_goc).toLocaleString("vi-VN")}đ</b></span>
                    <span class="text-emerald-800 font-bold">BHYT chi trả: ${Number(hd.tien_bhyt_chi_tra).toLocaleString("vi-VN")}đ | Bệnh nhân trả: ${Number(hd.tien_benh_nhan_tra).toLocaleString("vi-VN")}đ</span>
                </div>
            </div>
        `).join("");

        return `
            <div class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <div onclick="toggleMedicalRecordDetail(${idx})"
                     class="p-4 bg-slate-50 hover:bg-teal-50/50 cursor-pointer flex flex-wrap items-center justify-between gap-3 transition">
                    <div>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-bold text-teal-800 bg-teal-100 px-2.5 py-0.5 rounded">Hồ sơ #${rec.ma_ho_so_kham}</span>
                            <span class="text-xs font-semibold text-slate-500">STT #${rec.so_thu_tu_kham}</span>
                            <span class="text-xs text-slate-500">• 🕒 ${rec.thoi_gian_tiep_nhan || ""}</span>
                        </div>
                        <h4 class="font-bold text-base text-slate-900 mt-1">${rec.ten_khoa || "Chuyên khoa"} — Phòng ${rec.so_phong || "P102"}</h4>
                        <p class="text-xs text-slate-600 mt-0.5">👨‍⚕️ Bác sĩ: <b>${rec.ten_bac_si || "-"}</b> • Chẩn đoán: <b>${rec.ket_luan_chan_doan || "Đang khám"}</b></p>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${st.cls}">${st.label}</span>
                        <span id="record-chevron-${idx}" class="material-symbols-outlined text-slate-500">expand_more</span>
                    </div>
                </div>
                <div id="record-detail-box-${idx}" class="hidden p-4 border-t border-slate-200 bg-white space-y-3">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                        <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <b class="text-teal-800 block mb-1">🩺 Kết quả Khám sàng lọc (CHI_SO_SINH_HIEU):</b>
                            Mạch: <b>${rec.mach || "-"}</b> l/p • Nhiệt độ: <b>${rec.nhiet_do || "-"}°C</b> • HA: <b>${rec.huyet_ap || "-"}</b> mmHg<br/>
                            Cân nặng: <b>${rec.can_nang || "-"}kg</b> • Chiều cao: <b>${rec.chieu_cao || "-"}cm</b>
                        </div>
                        <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <b class="text-teal-800 block mb-1">📋 Kết luận Chẩn đoán (HO_SO_KHAM_BENH):</b>
                            <p><b>Triệu chứng:</b> ${rec.trieu_chung_lam_sang || "-"}</p>
                            <p class="mt-0.5"><b>Kết luận:</b> ${rec.ket_luan_chan_doan || "-"}</p>
                            ${rec.loi_dan_bac_si ? `<p class="text-emerald-800 mt-1"><b>Lời dặn:</b> ${rec.loi_dan_bac_si}</p>` : ""}
                        </div>
                    </div>
                    ${clsHtml}
                    ${thuocHtml}
                    ${hoaDonHtml}
                </div>
            </div>
        `;
    }).join("");
}

function toggleMedicalRecordDetail(index) {
    const detailBox = document.getElementById(`record-detail-box-${index}`);
    if (detailBox) detailBox.classList.toggle("hidden");
}

/**
 * 11. Hàm vẽ danh sách Lịch khám đã đặt kèm nút Hủy lịch hẹn
 */
function renderBookedAppointmentsList() {
    const container = document.getElementById("booked-appointments-list");
    if (!container) return;

    if (!cachedBookedAppointments || cachedBookedAppointments.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 text-slate-500">
                Hiện bạn chưa có lịch hẹn khám nào trong cơ sở dữ liệu MySQL.
            </div>
        `;
        return;
    }

    container.innerHTML = cachedBookedAppointments.map((item, idx) => {
        const isCanceled = item.trang_thai === "DaHuy";
        const isReceived = item.trang_thai === "DaTiepNhan";
        const statusBadge = isCanceled
            ? `<span class="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1">
                   <span class="material-symbols-outlined text-sm">cancel</span> Đã hủy lịch hẹn
               </span>`
            : `<span class="px-3 py-1 rounded-full ${isReceived ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'} text-xs font-bold flex items-center gap-1">
                   <span class="material-symbols-outlined text-sm">schedule</span> ${item.trang_thai_text}
               </span>`;

        return `
            <div class="p-4 rounded-xl ${isCanceled ? 'bg-red-50/40 border-red-200' : 'bg-slate-50 border-slate-200'} border space-y-3 transition">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <span class="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                            Mã lịch hẹn: #${item.ma_lich_hen} (Mã ca làm: #${item.ma_lich_lam || "-"})
                        </span>
                        <h4 class="font-bold text-base ${isCanceled ? 'line-through text-slate-500' : 'text-slate-800'} mt-1.5">
                            ${item.chuyen_khoa}
                        </h4>
                        <p class="text-xs text-slate-600 mt-1">
                            📅 Ngày hẹn: <b>${item.ngay_hen}</b> • 🕒 <b>${item.ca_kham}</b>
                        </p>
                        <p class="text-xs text-slate-500 mt-0.5">
                            🩺 Triệu chứng: ${item.trieu_chung}
                        </p>
                    </div>

                    <div class="flex flex-col items-end gap-2">
                        ${statusBadge}
                        ${(!isCanceled && !isReceived) ? `
                            <button type="button" onclick="toggleCancelReasonBox(${idx})"
                                    class="px-3 py-1.5 rounded-lg bg-white hover:bg-red-600 text-red-600 hover:text-white border border-red-300 text-xs font-bold flex items-center gap-1 transition shadow-2xs">
                                <span class="material-symbols-outlined text-sm">event_busy</span>
                                <span>Hủy lịch khám</span>
                            </button>
                        ` : ''}
                    </div>
                </div>

                ${isCanceled ? `
                    <div class="p-3 rounded-lg bg-red-100/70 border border-red-200 text-xs text-red-800">
                        <b>Lý do hủy lịch:</b> ${item.ly_do_huy || "Người bệnh chủ động hủy"}
                        ${item.thoi_gian_huy ? `<span class="block text-[11px] text-red-600 mt-0.5">⏰ Thời gian hủy: ${item.thoi_gian_huy}</span>` : ''}
                    </div>
                ` : `
                    <div id="cancel-reason-box-${idx}" class="hidden pt-3 border-t border-slate-200 space-y-2.5">
                        <label class="block text-xs font-bold text-red-700">
                            ⚠️ Vui lòng chọn hoặc nhập lý do hủy lịch hẹn (#${item.ma_lich_hen}) *:
                        </label>
                        <div class="flex flex-wrap gap-1.5">
                            <button type="button" onclick="fillCancelReason(${idx}, 'Bận công việc / việc gia đình đột xuất')"
                                    class="px-2.5 py-1 rounded-full bg-white border border-slate-300 hover:border-red-500 hover:text-red-600 text-[11px] font-medium transition">
                                Bận việc đột xuất
                            </button>
                            <button type="button" onclick="fillCancelReason(${idx}, 'Muốn đổi sang ngày hoặc ca khám khác')"
                                    class="px-2.5 py-1 rounded-full bg-white border border-slate-300 hover:border-red-500 hover:text-red-600 text-[11px] font-medium transition">
                                Muốn đổi ngày/ca khám
                            </button>
                            <button type="button" onclick="fillCancelReason(${idx}, 'Đặt nhầm chuyên khoa khám')"
                                    class="px-2.5 py-1 rounded-full bg-white border border-slate-300 hover:border-red-500 hover:text-red-600 text-[11px] font-medium transition">
                                Đặt nhầm chuyên khoa
                            </button>
                        </div>
                        <textarea id="cancel-reason-input-${idx}" rows="2"
                                  placeholder="Nhập lý do hủy lịch khám của bạn..."
                                  class="w-full p-2.5 rounded-lg border-red-300 text-xs bg-white"></textarea>
                        <div class="flex items-center justify-end gap-2">
                            <button type="button" onclick="toggleCancelReasonBox(${idx})"
                                    class="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition">
                                Đóng lại
                            </button>
                            <button type="button" onclick="submitCancelAppointment(${idx})"
                                    class="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow flex items-center gap-1 transition">
                                <span class="material-symbols-outlined text-sm">check_circle</span>
                                <span>Xác nhận hủy lịch</span>
                            </button>
                        </div>
                    </div>
                `}
            </div>
        `;
    }).join("");
}

function toggleCancelReasonBox(index) {
    const box = document.getElementById(`cancel-reason-box-${index}`);
    if (box) box.classList.toggle("hidden");
}

function fillCancelReason(index, reasonText) {
    const input = document.getElementById(`cancel-reason-input-${index}`);
    if (input) input.value = reasonText;
}

async function submitCancelAppointment(index) {
    const reasonInput = document.getElementById(`cancel-reason-input-${index}`);
    const reason = reasonInput ? reasonInput.value.trim() : "";
    if (!reason) {
        alert("⚠️ Vui lòng chọn hoặc nhập lý do hủy lịch khám!");
        return;
    }

    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) {
        window.location.href = "login.html";
        return;
    }

    const targetItem = cachedBookedAppointments[index];
    if (!targetItem) return;

    try {
        await fetch(`${ACCOUNT_API_URL}/cancel-appointment`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ma_lich_hen: targetItem.ma_lich_hen,
                ma_nguoi_dung: user.ma_nguoi_dung,
                ly_do_huy: reason
            })
        });
        await loadPatientPortalDataFromMySql(user.ma_nguoi_dung);
        showAccountAlert(`✅ Đã hủy lịch hẹn #${targetItem.ma_lich_hen} và lưu lý do vào MySQL!`, true);
    } catch (e) {
        showAccountAlert("⚠️ Lỗi kết nối tới Server Laravel khi hủy lịch!", false);
    }
}

/**
 * Khởi chạy tự động khi mở trang account.html
 */
document.addEventListener("DOMContentLoaded", async () => {
    loadFooterHtml();

    let user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) {
        alert("Hãy đăng nhập để đặt lịch và xem hồ sơ bệnh án");
        window.location.href = "login.html";
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get("tab") || "profile";
    switchAccountTab(initialTab);

    fillProfileFormInputs(user);

    try {
        const res = await fetch(`${ACCOUNT_API_URL}/profile/${user.ma_nguoi_dung}`);
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                user = data.user;
                localStorage.setItem("current_user", JSON.stringify(user));
                fillProfileFormInputs(user);
            }
        }
    } catch (e) {}

    await loadPatientPortalDataFromMySql(user.ma_nguoi_dung);
});