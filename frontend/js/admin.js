const ADMIN_API_BASE = "http://127.0.0.1:8000/api/admin";

let cachedAdminData = null;

// Biến điều khiển Bảng Ma Trận Phân Ca 50+ Nhân sự
let adminWeekOffset = 0;
let adminRoleFilter = "ALL";
let selectedStaffSet = new Set();
let staffDefaultRoomMap = {};

function getCurrentUser() {
    try {
        const raw = localStorage.getItem("current_user");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const user = getCurrentUser();

    if (!user || user.vai_tro !== "QuanTri") {
        window.location.replace("login.html");
        return;
    }

    document.getElementById("admin-sidebar-name").textContent = user.ho_ten || "Quản trị viên Hệ thống";
    document.getElementById("admin-sidebar-email").textContent = user.email || "admin@ttythaichau.vn";

    initSmartScheduleMatrixUI();
    loadAdminOverviewData();
});

function logoutAdmin() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

function switchAdminSection(sectionName) {
    const sections = ["overview", "users", "departments", "schedules", "catalogs", "records"];
    sections.forEach(sec => {
        const panel = document.getElementById(`admin-sec-${sec}`);
        const btn = document.getElementById(`side-btn-${sec}`);
        if (!panel || !btn) return;
        if (sec === sectionName) {
            panel.classList.remove("hidden");
            btn.className = "w-full px-3.5 py-3 rounded-xl bg-primary text-white flex items-center justify-between transition shadow-sm";
        } else {
            panel.classList.add("hidden");
            btn.className = "w-full px-3.5 py-3 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between transition";
        }
    });
}

// =========================================================================
// 1. TẢI DỮ LIỆU TỔNG HỢP TỪ MYSQL
// =========================================================================
async function loadAdminOverviewData() {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/overview-data`, {
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        if (!res.ok || data.status !== "success") return;

        cachedAdminData = data;

        // Cập nhật 6 thẻ KPI
        document.getElementById("stat-total-patients").textContent = data.stats.tong_benh_nhan;
        document.getElementById("stat-total-staff").textContent = data.stats.tong_nhan_su;
        document.getElementById("stat-total-records").textContent = data.stats.tong_ho_so;
        document.getElementById("stat-total-bookings").textContent = data.stats.tong_lich_hen;
        document.getElementById("stat-total-revenue").textContent = Number(data.stats.tong_doanh_thu || 0).toLocaleString("vi-VN") + "đ";
        document.getElementById("stat-total-ai").textContent = data.stats.tong_phien_ai;

        // Cập nhật số lượng trên Sidebar (6 mục)
        const usersBadge = document.getElementById("side-badge-users");
        if (usersBadge) usersBadge.textContent = (data.users || []).length;

        const roomsBadge = document.getElementById("side-badge-rooms");
        if (roomsBadge) roomsBadge.textContent = (data.rooms || []).length;

        const schedulesBadge = document.getElementById("side-badge-schedules");
        if (schedulesBadge) schedulesBadge.textContent = (data.schedules || []).length;

        const medsBadge = document.getElementById("side-badge-meds");
        if (medsBadge) medsBadge.textContent = (data.medicines || []).length;

        const recordsBadge = document.getElementById("side-badge-records");
        if (recordsBadge) recordsBadge.textContent = (data.records || []).length;

        renderOverviewRecentRecords((data.records || []).slice(0, 8));
        renderUsersTable();
        renderDepartmentsAndRooms();
        renderAdminScheduleMatrix();
        renderCatalogsSection();
        renderAllRecordsTable(data.records || []);
    } catch (error) {
        console.error("Lỗi kết nối Admin API:", error);
    }
}

function renderOverviewRecentRecords(records) {
    const tbody = document.getElementById("overview-recent-records-tbody");
    if (!tbody) return;
    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-5 text-center text-slate-400">Chưa có hồ sơ khám bệnh nào trong MySQL.</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(r => `
        <tr class="hover:bg-slate-50">
            <td class="p-3 font-bold text-primary">Hồ sơ #${r.ma_ho_so_kham} (STT #${r.so_thu_tu_kham})</td>
            <td class="p-3 font-bold text-slate-900">
                ${r.ten_benh_nhan || "-"}
                <span class="text-slate-400 font-normal">(Mã BN: #${r.ma_benh_nhan}${r.vneid ? " • VNeID: " + r.vneid : ""})</span>
            </td>
            <td class="p-3">Phòng ${r.so_phong || "-"} • ${r.ten_khoa || "-"}</td>
            <td class="p-3 max-w-xs truncate">${r.ket_luan_chan_doan || r.trieu_chung_lam_sang || "-"}</td>
            <td class="p-3"><span class="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 font-bold text-[11px]">${r.trang_thai_hang_doi}</span></td>
            <td class="p-3 text-slate-500">${r.thoi_gian_tiep_nhan || "-"}</td>
        </tr>
    `).join("");
}

// =========================================================================
// 2. QUẢN LÝ NHÂN SỰ & TÀI KHOẢN (NGUOI_DUNG, NHAN_VIEN, BENH_NHAN)
// =========================================================================
function renderUsersTable() {
    if (!cachedAdminData) return;
    const tbody = document.getElementById("admin-users-tbody");
    const keyword = (document.getElementById("admin-user-search")?.value || "").toLowerCase().trim();
    const roleFilter = document.getElementById("admin-user-role-filter")?.value || "ALL";

    const roleBadges = {
        QuanTri: { text: "Quản trị viên", cls: "bg-purple-100 text-purple-800" },
        BacSi: { text: "Bác sĩ", cls: "bg-emerald-100 text-emerald-800" },
        NVYT: { text: "Nhân viên y tế", cls: "bg-sky-100 text-sky-800" },
        KeToan: { text: "Kế toán", cls: "bg-amber-100 text-amber-800" },
        DuocSi: { text: "Dược sĩ", cls: "bg-indigo-100 text-indigo-800" },
        BenhNhan: { text: "Bệnh nhân", cls: "bg-slate-100 text-slate-700" }
    };

    const filtered = (cachedAdminData.users || []).filter(u => {
        const matchRole = roleFilter === "ALL" || u.vai_tro === roleFilter;
        const matchKw = !keyword ||
            (u.ma_nguoi_dung && String(u.ma_nguoi_dung).toLowerCase().includes(keyword)) ||
            (u.ma_nhan_vien && String(u.ma_nhan_vien).toLowerCase().includes(keyword)) ||
            (u.ma_benh_nhan && String(u.ma_benh_nhan).toLowerCase().includes(keyword)) ||
            (u.ho_ten && u.ho_ten.toLowerCase().includes(keyword)) ||
            (u.email && u.email.toLowerCase().includes(keyword)) ||
            (u.so_dien_thoai && u.so_dien_thoai.toLowerCase().includes(keyword)) ||
            (u.vneid && u.vneid.toLowerCase().includes(keyword));
        return matchRole && matchKw;
    });

    tbody.innerHTML = filtered.map(u => {
        const rb = roleBadges[u.vai_tro] || { text: u.vai_tro, cls: "bg-slate-100 text-slate-700" };
        const isActive = (u.trang_thai === "HoatDong" || Number(u.trang_thai) === 1);
        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3.5 font-bold text-slate-500">
                    #${u.ma_nguoi_dung}
                    ${u.ma_nhan_vien ? `<br/><span class="text-[10px] text-primary">Mã NV: #${u.ma_nhan_vien}</span>` : ""}
                    ${u.ma_benh_nhan ? `<br/><span class="text-[10px] text-emerald-700">Mã BN: #${u.ma_benh_nhan}</span>` : ""}
                </td>
                <td class="p-3.5 font-bold text-slate-900">
                    ${u.ho_ten}
                    ${u.vneid ? `<br/><span class="text-[10px] font-mono text-indigo-700">VNeID: ${u.vneid}</span>` : ""}
                </td>
                <td class="p-3.5 text-slate-600">${u.email}</td>
                <td class="p-3.5 font-semibold">${u.so_dien_thoai || "-"}</td>
                <td class="p-3.5"><span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${rb.cls}">${rb.text}</span></td>
                <td class="p-3.5 text-slate-600">${u.ten_khoa || (u.stk_ngan_hang ? `STK: ${u.stk_ngan_hang}` : "-")}</td>
                <td class="p-3.5">
                    <span class="px-2 py-0.5 rounded text-[11px] font-bold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'}">
                        ${isActive ? 'HoatDong' : 'DaKhoa'}
                    </span>
                </td>
                <td class="p-3.5 text-right whitespace-nowrap space-x-1">
                    <button type="button" onclick="editUser('${u.ma_nguoi_dung}')" class="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white font-bold transition">Sửa</button>
                    <button type="button" onclick="toggleUserActive('${u.ma_nguoi_dung}')" class="px-2.5 py-1 rounded ${isActive ? 'bg-amber-50 text-amber-700 hover:bg-amber-600' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600'} hover:text-white font-bold transition">
                        ${isActive ? 'Khóa' : 'Mở'}
                    </button>
                    <button type="button" onclick="deleteUser('${u.ma_nguoi_dung}')" class="px-2.5 py-1 rounded bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-bold transition">Xóa</button>
                </td>
            </tr>
        `;
    }).join("");
}

function openUserModal(userObj = null) {
    if (!cachedAdminData) return;
    const deptSelect = document.getElementById("usr-dept");
    deptSelect.innerHTML = `<option value="">-- Không thuộc khoa cố định --</option>` +
        cachedAdminData.departments.map(d => `<option value="${d.ma_khoa}">${d.ten_khoa}</option>`).join("");

    document.getElementById("admin-user-form").reset();
    const vneidInput = document.getElementById("usr-vneid");
    const staffIdInput = document.getElementById("usr-staff-id");

    if (userObj) {
        document.getElementById("user-modal-title").textContent = `Cập Nhật Tài Khoản #${userObj.ma_nguoi_dung}`;
        document.getElementById("usr-id").value = userObj.ma_nguoi_dung || "";
        if (staffIdInput) staffIdInput.value = userObj.ma_nhan_vien || userObj.ma_benh_nhan || "";
        if (vneidInput) vneidInput.value = userObj.vneid || "";
        document.getElementById("usr-name").value = userObj.ho_ten || "";
        document.getElementById("usr-email").value = userObj.email || "";
        document.getElementById("usr-phone").value = userObj.so_dien_thoai || "";
        document.getElementById("usr-role").value = userObj.vai_tro || "NVYT";
        document.getElementById("usr-dept").value = userObj.ma_khoa || "";
    } else {
        document.getElementById("user-modal-title").textContent = "Thêm Nhân Sự / Tài Khoản Mới";
        document.getElementById("usr-id").value = "";
        if (staffIdInput) staffIdInput.value = "";
        if (vneidInput) vneidInput.value = "";
    }

    document.getElementById("admin-user-modal").classList.remove("hidden");
}

function closeUserModal() {
    document.getElementById("admin-user-modal").classList.add("hidden");
}

function editUser(id) {
    const u = cachedAdminData.users.find(item => String(item.ma_nguoi_dung) === String(id));
    if (u) openUserModal(u);
}

async function submitSaveUser(event) {
    event.preventDefault();
    const vneidEl = document.getElementById("usr-vneid");
    const staffIdEl = document.getElementById("usr-staff-id");
    const customSubId = staffIdEl ? staffIdEl.value.trim() : "";

    const payload = {
        ma_nguoi_dung: document.getElementById("usr-id").value.trim() || null,
        ma_nhan_vien: customSubId || null,
        ma_benh_nhan: customSubId || null,
        vneid: vneidEl ? vneidEl.value.trim() : null,
        ho_ten: document.getElementById("usr-name").value.trim(),
        email: document.getElementById("usr-email").value.trim(),
        so_dien_thoai: document.getElementById("usr-phone").value.trim(),
        vai_tro: document.getElementById("usr-role").value,
        ma_khoa: document.getElementById("usr-dept").value || null,
        mat_khau: document.getElementById("usr-password").value.trim()
    };

    try {
        const res = await fetch(`${ADMIN_API_BASE}/save-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            alert("⚠️ " + (data.message || "Lỗi lưu tài khoản!"));
            return;
        }
        alert("✅ " + data.message);
        closeUserModal();
        await loadAdminOverviewData();
    } catch (e) {
        alert("⚠️ Lỗi kết nối Server Laravel!");
    }
}

async function toggleUserActive(id) {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/toggle-user-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ ma_nguoi_dung: id })
        });
        const data = await res.json();
        alert("✅ " + data.message);
        await loadAdminOverviewData();
    } catch (e) {}
}

async function deleteUser(id) {
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản #${id} khỏi cơ sở dữ liệu MySQL?`)) return;
    try {
        const res = await fetch(`${ADMIN_API_BASE}/delete-user/${id}`, {
            method: "DELETE",
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        alert(data.message || "Đã xóa tài khoản!");
        await loadAdminOverviewData();
    } catch (e) {
        alert("⚠️ Lỗi kết nối khi xóa tài khoản!");
    }
}

// =========================================================================
// 3. QUẢN LÝ CHUYÊN KHOA & PHÒNG CHỨC NĂNG (KHOA, PHONG)
// =========================================================================
function renderDepartmentsAndRooms() {
    if (!cachedAdminData) return;

    const deptList = document.getElementById("admin-departments-list");
    deptList.innerHTML = cachedAdminData.departments.map(d => `
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
            <div>
                <span class="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold text-[10px]">Mã Khoa: #${d.ma_khoa}</span>
                <h4 class="font-bold text-sm text-slate-900 mt-1">${d.ten_khoa}</h4>
                <p class="text-emerald-700 font-bold mt-0.5">Giá khám: ${Number(d.gia_kham).toLocaleString("vi-VN")}đ</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="editDepartmentById('${d.ma_khoa}')" class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-primary font-bold text-xs">
                    Sửa
                </button>
                <button type="button" onclick="deleteDepartment('${d.ma_khoa}')" class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 font-bold text-xs transition">
                    Xóa
                </button>
            </div>
        </div>
    `).join("");

    const roomDeptSelect = document.getElementById("room-dept-id");
    roomDeptSelect.innerHTML = cachedAdminData.departments.map(d => `<option value="${d.ma_khoa}">${d.ten_khoa}</option>`).join("");

    const roomsTbody = document.getElementById("admin-rooms-tbody");
    roomsTbody.innerHTML = cachedAdminData.rooms.map(r => `
        <tr class="hover:bg-slate-50">
            <td class="p-3 font-bold text-indigo-700">${r.so_phong} <span class="text-[10px] text-slate-400">(#${r.ma_phong})</span></td>
            <td class="p-3 font-bold text-slate-900">${r.ten_phong}</td>
            <td class="p-3">${r.ten_khoa || "-"}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">${r.loai_phong}</span></td>
            <td class="p-3 text-right whitespace-nowrap space-x-1">
                <button type="button" onclick="editRoomById('${r.ma_phong}')" class="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold transition">Sửa</button>
                <button type="button" onclick="deleteRoom('${r.ma_phong}')" class="px-2.5 py-1 rounded bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-bold transition">Xóa</button>
            </td>
        </tr>
    `).join("");
}

function editDepartmentById(maKhoa) {
    const d = (cachedAdminData?.departments || []).find(item => String(item.ma_khoa) === String(maKhoa));
    if (d) fillDeptForm(d);
}

function fillDeptForm(d) {
    document.getElementById("dept-id").value = d.ma_khoa;
    document.getElementById("dept-name").value = d.ten_khoa || "";
    document.getElementById("dept-price").value = d.gia_kham || 0;
    document.getElementById("dept-desc").value = d.mo_ta_chuyen_mon || "";
}

function resetDeptForm() {
    document.getElementById("admin-dept-form").reset();
    document.getElementById("dept-id").value = "";
}

async function submitSaveDepartment(event) {
    event.preventDefault();
    const payload = {
        ma_khoa: document.getElementById("dept-id").value.trim() || null,
        ten_khoa: document.getElementById("dept-name").value.trim(),
        gia_kham: document.getElementById("dept-price").value,
        mo_ta_chuyen_mon: document.getElementById("dept-desc").value.trim()
    };
    const res = await fetch(`${ADMIN_API_BASE}/save-department`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
    resetDeptForm();
    await loadAdminOverviewData();
}

async function deleteDepartment(id) {
    if (!confirm(`Bạn có chắc chắn muốn xóa Chuyên khoa #${id} khỏi MySQL?`)) return;
    const res = await fetch(`${ADMIN_API_BASE}/delete-department/${id}`, {
        method: "DELETE",
        headers: { "Accept": "application/json" }
    });
    const data = await res.json();
    alert(data.message || "Đã xóa Chuyên khoa!");
    await loadAdminOverviewData();
}

function editRoomById(maPhong) {
    const r = (cachedAdminData?.rooms || []).find(item => String(item.ma_phong) === String(maPhong));
    if (r) fillRoomForm(r);
}

function fillRoomForm(r) {
    document.getElementById("room-id").value = r.ma_phong;
    document.getElementById("room-number").value = r.so_phong;
    document.getElementById("room-dept-id").value = r.ma_khoa;
    document.getElementById("room-type").value = r.loai_phong;
    document.getElementById("room-name").value = r.ten_phong;
}

function resetRoomForm() {
    document.getElementById("admin-room-form").reset();
    document.getElementById("room-id").value = "";
}

async function submitSaveRoom(event) {
    event.preventDefault();
    const payload = {
        ma_phong: document.getElementById("room-id").value.trim() || null,
        so_phong: document.getElementById("room-number").value,
        ma_khoa: document.getElementById("room-dept-id").value,
        loai_phong: document.getElementById("room-type").value,
        ten_phong: document.getElementById("room-name").value
    };
    const res = await fetch(`${ADMIN_API_BASE}/save-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
    resetRoomForm();
    await loadAdminOverviewData();
}

async function deleteRoom(id) {
    if (!confirm(`Bạn có chắc chắn muốn xóa Phòng #${id} khỏi MySQL?`)) return;
    const res = await fetch(`${ADMIN_API_BASE}/delete-room/${id}`, {
        method: "DELETE",
        headers: { "Accept": "application/json" }
    });
    const data = await res.json();
    alert(data.message || "Đã xóa Phòng chức năng!");
    await loadAdminOverviewData();
}

// =========================================================================
// 4. BẢNG MA TRẬN PHÂN CÔNG LỊCH TRỰC 1 TUẦN (CHUẨN NGHỈ BÙ • 3 CA SÁNG/CHIỀU/ĐÊM)
// =========================================================================
function initSmartScheduleMatrixUI() {
    const sec = document.getElementById("admin-sec-schedules");
    if (!sec) return;

    sec.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
                <div class="flex items-center gap-2">
                    <h2 class="font-heading text-2xl font-extrabold text-slate-900">📅 Bảng Ma Trận Phân Ca Nhanh (Toàn Trung Tâm / Tuần)</h2>
                    <span id="matrix-staff-total-badge" class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">0 Nhân sự</span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">
                    Nhấn trực tiếp vào các nút <b class="text-teal-700">S (Sáng)</b> • <b class="text-amber-600">C (Chiều)</b> • <b class="text-rose-600">Đ (Đêm)</b> trên từng ô ngày để bật/tắt ca trực (Tự động kiểm tra quy định nghỉ bù ra trực sau ca Đêm).
                </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <button type="button" onclick="autoGenerateFullWeekFor50Staff()"
                        class="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow transition">
                    <span class="material-symbols-outlined text-base">bolt</span>
                    <span>⚡ Tự Động Xếp Lịch Cả Tuần (Chuẩn Nghỉ Bù)</span>
                </button>
                <button type="button" onclick="copyPreviousWeekSchedule()"
                        class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow transition">
                    <span class="material-symbols-outlined text-base">content_copy</span>
                    <span>Sao Chép Tuần Trước</span>
                </button>
            </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 card-shadow space-y-3.5 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button type="button" onclick="changeAdminScheduleWeek(-1)" class="px-2.5 py-1.5 rounded-lg hover:bg-white font-bold text-slate-700 flex items-center gap-1 transition">
                        <span class="material-symbols-outlined text-base">chevron_left</span> Tuần trước
                    </button>
                    <div class="px-3 py-1 bg-white rounded-lg shadow-sm font-heading font-bold text-slate-900 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-teal-600 text-base">date_range</span>
                        <span id="admin-matrix-week-label">Tuần hiện tại</span>
                    </div>
                    <button type="button" onclick="changeAdminScheduleWeek(1)" class="px-2.5 py-1.5 rounded-lg hover:bg-white font-bold text-slate-700 flex items-center gap-1 transition">
                        Tuần sau <span class="material-symbols-outlined text-base">chevron_right</span>
                    </button>
                    <button type="button" onclick="changeAdminScheduleWeek(0)" class="px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white font-bold transition">
                        Tuần hiện tại
                    </button>
                </div>

                <div class="relative w-full sm:w-72">
                    <span class="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-base">search</span>
                    <input id="matrix-search-input" type="text" oninput="renderAdminScheduleMatrix()"
                           placeholder="Tìm nhanh tên nhân viên, mã NV, khoa..."
                           class="w-full h-9 pl-9 pr-3 rounded-xl border-slate-300 text-xs focus:border-teal-600"/>
                </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
                <div id="matrix-role-filter-pills" class="flex flex-wrap items-center gap-1.5"></div>

                <div class="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
                    <span class="inline-flex items-center gap-1"><span class="w-4 h-4 rounded bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">S</span> Ca Sáng (07:00-11:30)</span>
                    <span class="inline-flex items-center gap-1"><span class="w-4 h-4 rounded bg-amber-500 text-white font-bold inline-flex items-center justify-center text-[10px]">C</span> Ca Chiều (13:00-16:30)</span>
                    <span class="inline-flex items-center gap-1"><span class="w-4 h-4 rounded bg-rose-600 text-white font-bold inline-flex items-center justify-center text-[10px]">Đ</span> Ca Đêm (16:30-07:00)</span>
                </div>
            </div>

            <div class="p-3 rounded-xl bg-sky-50/90 border border-sky-200 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-teal-600 text-lg">checklist</span>
                    <span class="font-bold text-slate-800">Phân ca hàng loạt (<span id="selected-staff-count" class="text-teal-700">0</span> nhân sự đang chọn):</span>
                    <button type="button" onclick="selectAllVisibleStaff(true)" class="px-2 py-1 rounded bg-white border border-slate-300 hover:border-teal-600 text-[11px] font-bold text-slate-700">
                        Chọn tất cả danh sách đang lọc
                    </button>
                    <button type="button" onclick="selectAllVisibleStaff(false)" class="px-2 py-1 rounded bg-white border border-slate-300 hover:border-red-400 text-[11px] font-bold text-slate-600">
                        Bỏ chọn
                    </button>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[11px] font-semibold text-slate-600 mr-1">Gán mẫu nhanh:</span>
                    <button type="button" onclick="applyBulkPatternToSelected('OFFICE_T2_T6')" class="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] shadow-sm transition">
                        ☀️🌇 Hành chính (S+C T2–T6)
                    </button>
                    <button type="button" onclick="applyBulkPatternToSelected('MORNING_T2_T7')" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm transition">
                        ☀️ Chuyên Sáng (T2–T7)
                    </button>
                    <button type="button" onclick="applyBulkPatternToSelected('AFTERNOON_T2_T7')" class="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-sm transition">
                        🌇 Chuyên Chiều (T2–T7)
                    </button>
                    <button type="button" onclick="applyBulkPatternToSelected('NIGHT_246')" class="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] shadow-sm transition">
                        🌙 Đêm 2-4-6
                    </button>
                    <button type="button" onclick="applyBulkPatternToSelected('NIGHT_357')" class="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold text-[11px] shadow-sm transition">
                        🌙 Đêm 3-5-7
                    </button>
                    <button type="button" onclick="applyBulkPatternToSelected('FULL_ROTATION')" class="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-sm transition">
                        🔄 Xoay ca tự động
                    </button>
                    <button type="button" onclick="applyBulkPatternToSelected('CLEAR')" class="px-2.5 py-1.5 rounded-lg bg-red-100 hover:bg-red-600 text-red-700 hover:text-white font-bold text-[11px] transition">
                        🗑️ Xóa ca tuần
                    </button>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 card-shadow overflow-hidden">
            <div class="overflow-auto max-h-[600px]">
                <table class="w-full text-left border-collapse min-w-[1280px] text-xs">
                    <thead id="admin-matrix-thead" class="sticky top-0 z-20 bg-slate-900 text-white shadow-sm"></thead>
                    <tbody id="admin-matrix-tbody" class="divide-y divide-slate-200"></tbody>
                </table>
            </div>
        </div>
    `;
}

function getAdminWeekDays() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday + (adminWeekOffset * 7));
    monday.setHours(0, 0, 0, 0);

    const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
    const todayYmd = formatYmdDate(new Date());
    const days = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const ymd = formatYmdDate(d);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        days.push({
            index: i,
            label: dayNames[i],
            ymd: ymd,
            dm: `${dd}/${mm}`,
            full: `${dd}/${mm}/${d.getFullYear()}`,
            isToday: ymd === todayYmd
        });
    }
    return days;
}

function formatYmdDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function changeAdminScheduleWeek(step) {
    if (step === 0) adminWeekOffset = 0;
    else adminWeekOffset += step;
    renderAdminScheduleMatrix();
}

function getStaffPositionCategory(userObj) {
    const role = userObj.vai_tro || "";
    const chucVu = userObj.chuc_vu || "";
    const name = (userObj.ho_ten || "").toUpperCase();
    if (role === "BacSi" || chucVu === "BacSi" || name.startsWith("BS.") || name.startsWith("THS.BS")) return "BacSi";
    if (role === "DuocSi" || chucVu === "DuocSi" || name.startsWith("DS.")) return "DuocSi";
    if (role === "KeToan" || chucVu === "KeToan" || name.startsWith("KT.") || name.includes("KẾ TOÁN")) return "KeToan";
    if (chucVu === "KTV_CLS" || name.startsWith("KTV.") || name.includes("CLS") || userObj.ma_khoa === "KH003") return "KTV";
    return "DieuDuong";
}

function getPositionBadgeInfo(cat) {
    const map = {
        BacSi: { label: "🩺 Bác sĩ", cls: "bg-teal-100 text-teal-800 border-teal-200" },
        DieuDuong: { label: "💉 Điều dưỡng", cls: "bg-amber-100 text-amber-800 border-amber-200" },
        KTV: { label: "🔬 KTV CLS", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
        DuocSi: { label: "💊 Dược sĩ", cls: "bg-purple-100 text-purple-800 border-purple-200" },
        KeToan: { label: "💳 Kế toán", cls: "bg-rose-100 text-rose-800 border-rose-200" }
    };
    return map[cat] || { label: "Nhân sự", cls: "bg-slate-100 text-slate-700" };
}

function getDefaultRoomForStaff(userObj, rooms) {
    const userKey = String(userObj.ma_nguoi_dung);
    if (staffDefaultRoomMap[userKey]) {
        return staffDefaultRoomMap[userKey];
    }

    const cat = getStaffPositionCategory(userObj);
    const listRooms = rooms || [];
    let matchedRoom = null;

    if (cat === "BacSi") {
        matchedRoom = listRooms.find(r => String(r.ma_khoa) === String(userObj.ma_khoa) && r.loai_phong === "PhongKhamBS")
            || listRooms.find(r => r.so_phong === "P102");
    } else if (cat === "KTV") {
        const cm = (userObj.chuyen_mon || userObj.ho_ten || "").toLowerCase();
        if (cm.includes("mri")) matchedRoom = listRooms.find(r => r.so_phong === "P205");
        else if (cm.includes("ct")) matchedRoom = listRooms.find(r => r.so_phong === "P204");
        else if (cm.includes("x-quang")) matchedRoom = listRooms.find(r => r.so_phong === "P202");
        else if (cm.includes("siêu âm")) matchedRoom = listRooms.find(r => r.so_phong === "P203");
        else if (cm.includes("nội soi") || cm.includes("ecg")) matchedRoom = listRooms.find(r => r.so_phong === "P206");
        if (!matchedRoom) matchedRoom = listRooms.find(r => r.so_phong === "P201");
    } else if (cat === "KeToan") {
        matchedRoom = listRooms.find(r => r.so_phong === "P104");
    } else if (cat === "DuocSi") {
        matchedRoom = listRooms.find(r => r.so_phong === "P105");
    } else {
        matchedRoom = listRooms.find(r => r.so_phong === "P101");
    }

    const roomId = matchedRoom ? String(matchedRoom.ma_phong) : (listRooms[0] ? String(listRooms[0].ma_phong) : "PH001");
    staffDefaultRoomMap[userKey] = roomId;
    return roomId;
}

function setAdminRoleFilter(roleCat) {
    adminRoleFilter = roleCat;
    renderAdminScheduleMatrix();
}

function renderAdminScheduleMatrix() {
    if (!cachedAdminData) return;
    if (!document.getElementById("admin-matrix-thead")) {
        initSmartScheduleMatrixUI();
    }

    const weekDays = getAdminWeekDays();
    const weekDates = weekDays.map(d => d.ymd);

    const weekLabelEl = document.getElementById("admin-matrix-week-label");
    if (weekLabelEl) {
        weekLabelEl.textContent = `Tuần: ${weekDays[0].full} — ${weekDays[6].full}`;
    }

    const allStaff = (cachedAdminData.users || []).filter(
        u => ["BacSi", "NVYT", "KeToan", "DuocSi"].includes(u.vai_tro) && u.trang_thai !== "DaKhoa"
    );

    const badgeTotal = document.getElementById("matrix-staff-total-badge");
    if (badgeTotal) badgeTotal.textContent = `${allStaff.length} Nhân sự chuyên môn`;

    const counts = { ALL: allStaff.length, BacSi: 0, DieuDuong: 0, KTV: 0, DuocSi: 0, KeToan: 0 };
    allStaff.forEach(u => {
        const cat = getStaffPositionCategory(u);
        if (counts[cat] !== undefined) counts[cat]++;
    });

    const pillsContainer = document.getElementById("matrix-role-filter-pills");
    if (pillsContainer) {
        const filterButtons = [
            { code: "ALL", label: `Tất cả (${counts.ALL})` },
            { code: "BacSi", label: `🩺 Bác sĩ (${counts.BacSi})` },
            { code: "DieuDuong", label: `💉 Điều dưỡng (${counts.DieuDuong})` },
            { code: "KTV", label: `🔬 KTV CLS (${counts.KTV})` },
            { code: "DuocSi", label: `💊 Dược sĩ (${counts.DuocSi})` },
            { code: "KeToan", label: `💳 Kế toán (${counts.KeToan})` }
        ];
        pillsContainer.innerHTML = filterButtons.map(b => `
            <button type="button" onclick="setAdminRoleFilter('${b.code}')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        adminRoleFilter === b.code
                            ? 'bg-teal-600 text-white shadow-sm'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }">
                ${b.label}
            </button>
        `).join("");
    }

    const shiftMap = {};
    const dayShiftCounters = {};
    weekDates.forEach(ymd => {
        dayShiftCounters[ymd] = { Sang: 0, Chieu: 0, Dem: 0 };
    });

    (cachedAdminData.schedules || []).forEach(s => {
        const ymd = String(s.ngay_lam_viec || "").substring(0, 10);
        const staffUserKey = String(s.ma_nguoi_dung || s.ma_nhan_vien);
        const ca = s.ca_truc === "Toi" ? "Chieu" : s.ca_truc;

        if (weekDates.includes(ymd)) {
            shiftMap[`${staffUserKey}_${ymd}_${ca}`] = s;
            if (s.ma_phong) {
                staffDefaultRoomMap[staffUserKey] = String(s.ma_phong);
            }
            if (dayShiftCounters[ymd] && dayShiftCounters[ymd][ca] !== undefined) {
                dayShiftCounters[ymd][ca]++;
            }
        }
    });

    const thead = document.getElementById("admin-matrix-thead");
    thead.innerHTML = `
        <tr>
            <th class="p-3 w-10 text-center border-r border-slate-700 sticky left-0 bg-slate-900 z-30">
                <input type="checkbox" onchange="selectAllVisibleStaff(this.checked)" class="rounded border-slate-500 text-teal-600 focus:ring-0"/>
            </th>
            <th class="p-3 min-w-[240px] border-r border-slate-700 sticky left-10 bg-slate-900 z-30">
                Nhân Sự & Chức Vụ
            </th>
            <th class="p-3 w-44 border-r border-slate-700 text-center">
                Phòng Trực Mặc Định
            </th>
            <th class="p-2.5 w-20 border-r border-slate-700 text-center">
                Tổng Ca
            </th>
            ${weekDays.map(d => {
                const cnt = dayShiftCounters[d.ymd] || { Sang: 0, Chieu: 0, Dem: 0 };
                return `
                    <th class="p-2.5 text-center border-r border-slate-700 min-w-[118px] ${d.isToday ? 'bg-teal-900/90' : ''}">
                        <div class="font-bold text-xs ${d.isToday ? 'text-emerald-300' : 'text-white'}">${d.label} (${d.dm})</div>
                        <div class="flex items-center justify-center gap-1 mt-1 text-[10px] font-bold">
                            <span class="px-1.5 py-0.5 rounded bg-teal-600/90 text-white">S:${cnt.Sang}</span>
                            <span class="px-1.5 py-0.5 rounded bg-amber-500/90 text-white">C:${cnt.Chieu}</span>
                            <span class="px-1.5 py-0.5 rounded bg-rose-600/90 text-white">Đ:${cnt.Dem}</span>
                        </div>
                    </th>
                `;
            }).join("")}
            <th class="p-2.5 w-40 text-center">
                Gán Nhanh 1 Dòng
            </th>
        </tr>
    `;

    const keyword = (document.getElementById("matrix-search-input")?.value || "").toLowerCase().trim();
    const rooms = cachedAdminData.rooms || [];

    const visibleStaff = allStaff.filter(u => {
        const cat = getStaffPositionCategory(u);
        if (adminRoleFilter !== "ALL" && cat !== adminRoleFilter) return false;
        if (keyword) {
            const haystack = `${u.ho_ten || ""} ${u.ma_nhan_vien || ""} ${u.so_dien_thoai || ""} ${u.ten_khoa || ""}`.toLowerCase();
            if (!haystack.includes(keyword)) return false;
        }
        return true;
    });

    updateSelectedCountLabel();

    const tbody = document.getElementById("admin-matrix-tbody");
    if (visibleStaff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="p-8 text-center text-slate-400">Không tìm thấy nhân sự phù hợp với bộ lọc hiện tại.</td></tr>`;
        return;
    }

    tbody.innerHTML = visibleStaff.map((u, idx) => {
        const userKey = String(u.ma_nguoi_dung);
        const cat = getStaffPositionCategory(u);
        const badge = getPositionBadgeInfo(cat);
        const currentRoomId = getDefaultRoomForStaff(u, rooms);
        const isChecked = selectedStaffSet.has(userKey);

        let totalShiftsForUser = 0;
        weekDays.forEach(d => {
            ["Sang", "Chieu", "Dem"].forEach(sh => {
                if (shiftMap[`${userKey}_${d.ymd}_${sh}`]) totalShiftsForUser++;
            });
        });

        const roomOptionsHtml = rooms.map(r => `
            <option value="${r.ma_phong}" ${String(r.ma_phong) === String(currentRoomId) ? 'selected' : ''}>
                ${r.so_phong} - ${r.ten_phong}
            </option>
        `).join("");

        const dayCellsHtml = weekDays.map(d => {
            const hasSang  = Boolean(shiftMap[`${userKey}_${d.ymd}_Sang`]);
            const hasChieu = Boolean(shiftMap[`${userKey}_${d.ymd}_Chieu`]);
            const hasDem   = Boolean(shiftMap[`${userKey}_${d.ymd}_Dem`]);

            const btnSangCls = hasSang
                ? "bg-teal-600 text-white border-teal-700 shadow-sm"
                : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-teal-50 hover:text-teal-700";
            const btnChieuCls = hasChieu
                ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-700";
            const btnDemCls = hasDem
                ? "bg-rose-600 text-white border-rose-700 shadow-sm"
                : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-rose-50 hover:text-rose-700";

            return `
                <td class="p-2 border-r border-slate-200 text-center ${d.isToday ? 'bg-teal-50/40' : ''}">
                    <div class="inline-flex items-center gap-1">
                        <button type="button"
                                onclick="toggleMatrixCellShift('${userKey}', '${d.ymd}', 'Sang')"
                                class="w-7 h-7 rounded-lg border font-extrabold text-[11px] transition ${btnSangCls}">
                            S
                        </button>
                        <button type="button"
                                onclick="toggleMatrixCellShift('${userKey}', '${d.ymd}', 'Chieu')"
                                class="w-7 h-7 rounded-lg border font-extrabold text-[11px] transition ${btnChieuCls}">
                            C
                        </button>
                        <button type="button"
                                onclick="toggleMatrixCellShift('${userKey}', '${d.ymd}', 'Dem')"
                                class="w-7 h-7 rounded-lg border font-extrabold text-[11px] transition ${btnDemCls}">
                            Đ
                        </button>
                    </div>
                </td>
            `;
        }).join("");

        return `
            <tr class="hover:bg-slate-50/90 transition ${isChecked ? 'bg-sky-50/60' : ''}">
                <td class="p-2.5 text-center border-r border-slate-200 sticky left-0 bg-white z-10">
                    <input type="checkbox" ${isChecked ? 'checked' : ''}
                           onchange="toggleSelectStaffRow('${userKey}', this.checked)"
                           class="rounded border-slate-300 text-teal-600 focus:ring-0"/>
                </td>
                <td class="p-2.5 border-r border-slate-200 sticky left-10 bg-white z-10">
                    <div class="flex items-center justify-between gap-1.5">
                        <span class="font-bold text-slate-900 truncate">${idx + 1}. ${u.ho_ten}</span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-1">
                        <span class="px-2 py-0.2 rounded border text-[10px] font-bold ${badge.cls}">${badge.label}</span>
                        <span class="text-[10px] font-mono text-slate-400 truncate">#${u.ma_nhan_vien || userKey}</span>
                    </div>
                </td>
                <td class="p-2 border-r border-slate-200">
                    <select onchange="onChangeStaffDefaultRoom('${userKey}', this.value)"
                            class="w-full h-8 px-2 rounded-lg border-slate-200 bg-slate-50 text-[11px] font-bold text-indigo-800 focus:border-teal-600">
                        ${roomOptionsHtml}
                    </select>
                </td>
                <td class="p-2 border-r border-slate-200 text-center">
                    <span class="px-2 py-1 rounded-full text-[11px] font-extrabold ${
                        totalShiftsForUser >= 5
                            ? 'bg-emerald-100 text-emerald-800'
                            : (totalShiftsForUser > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400')
                    }">
                        ${totalShiftsForUser} ca
                    </span>
                </td>
                ${dayCellsHtml}
                <td class="p-2 text-center">
                    <div class="inline-flex items-center gap-1">
                        <button type="button" onclick="applyPatternForSingleStaff('${userKey}', 'OFFICE_T2_T6')"
                                class="px-2 py-1 rounded bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white font-bold text-[10px] border border-teal-200 transition">
                            HC
                        </button>
                        <button type="button" onclick="applyPatternForSingleStaff('${userKey}', 'MORNING_T2_T7')"
                                class="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white font-bold text-[10px] border border-emerald-200 transition">
                            Sáng
                        </button>
                        <button type="button" onclick="applyPatternForSingleStaff('${userKey}', 'NIGHT_246')"
                                class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-800 hover:text-white font-bold text-[10px] border border-rose-200 transition">
                            Đêm
                        </button>
                        <button type="button" onclick="applyPatternForSingleStaff('${userKey}', 'CLEAR')"
                                class="px-1.5 py-1 rounded bg-slate-100 hover:bg-red-600 text-slate-500 hover:text-white font-bold text-[10px] transition">
                            ×
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

async function toggleMatrixCellShift(maNguoiDung, dateYmd, shiftCode) {
    if (!cachedAdminData) return;
    const userKey = String(maNguoiDung);
    const roomId = staffDefaultRoomMap[userKey] || "PH001";
    const staffObj = (cachedAdminData.users || []).find(u => String(u.ma_nguoi_dung) === userKey);
    const maNhanVien = staffObj?.ma_nhan_vien || userKey;

    try {
        const res = await fetch(`${ADMIN_API_BASE}/toggle-single-shift`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ma_nhan_vien: maNhanVien,
                ngay_lam_viec: dateYmd,
                ca_truc: shiftCode,
                ma_phong: roomId
            })
        });
        const data = await res.json();
        if (!res.ok || data.status === "error") {
            alert("⚠️ " + (data.message || "Không thể thay đổi ca trực do vi phạm quy định nghỉ bù!"));
            return;
        }

        if (!Array.isArray(cachedAdminData.schedules)) cachedAdminData.schedules = [];
        const schedules = cachedAdminData.schedules;
        const existingIdx = schedules.findIndex(
            s => (String(s.ma_nguoi_dung) === userKey || String(s.ma_nhan_vien) === String(maNhanVien)) &&
                 String(s.ngay_lam_viec || "").substring(0, 10) === dateYmd &&
                 (s.ca_truc === shiftCode || (shiftCode === "Chieu" && s.ca_truc === "Toi"))
        );

        if (data.action === "removed") {
            if (existingIdx >= 0) schedules.splice(existingIdx, 1);
        } else if (data.action === "added") {
            const roomObj = (cachedAdminData.rooms || []).find(r => String(r.ma_phong) === String(roomId));
            schedules.push({
                ma_lich_lam: data.ma_lich_lam || ("LLV_TMP_" + Date.now()),
                ma_nhan_vien: maNhanVien,
                ma_nguoi_dung: userKey,
                ma_phong: roomId,
                ngay_lam_viec: dateYmd,
                ca_truc: shiftCode,
                so_luong_bn_toi_da: shiftCode === "Sang" ? 35 : (shiftCode === "Chieu" ? 30 : 25),
                ten_nhan_su: staffObj ? staffObj.ho_ten : "",
                vai_tro: staffObj ? staffObj.vai_tro : "",
                so_phong: roomObj ? roomObj.so_phong : "P101",
                ten_phong: roomObj ? roomObj.ten_phong : ""
            });
        }

        const badge = document.getElementById("side-badge-schedules");
        if (badge) badge.textContent = schedules.length;
        renderAdminScheduleMatrix();
    } catch (e) {
        alert("⚠️ Lỗi kết nối tới Server Laravel khi cập nhật ca trực!");
    }
}

async function onChangeStaffDefaultRoom(maNguoiDung, newRoomId) {
    const userKey = String(maNguoiDung);
    staffDefaultRoomMap[userKey] = String(newRoomId);
    const weekDates = getAdminWeekDays().map(d => d.ymd);

    try {
        await fetch(`${ADMIN_API_BASE}/bulk-assign-week`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                staff_ids: [userKey],
                week_dates: weekDates,
                pattern: "UPDATE_ROOM_ONLY",
                staff_rooms: staffDefaultRoomMap
            })
        });
    } catch (e) {
        console.error("Lỗi cập nhật phòng trực:", e);
    }
}

function toggleSelectStaffRow(maNguoiDung, isChecked) {
    const userKey = String(maNguoiDung);
    if (isChecked) selectedStaffSet.add(userKey);
    else selectedStaffSet.delete(userKey);
    updateSelectedCountLabel();
}

function selectAllVisibleStaff(isChecked) {
    if (!cachedAdminData) return;
    const keyword = (document.getElementById("matrix-search-input")?.value || "").toLowerCase().trim();
    const allStaff = (cachedAdminData.users || []).filter(
        u => ["BacSi", "NVYT", "KeToan", "DuocSi"].includes(u.vai_tro) && u.trang_thai !== "DaKhoa"
    );

    allStaff.forEach(u => {
        const cat = getStaffPositionCategory(u);
        if (adminRoleFilter !== "ALL" && cat !== adminRoleFilter) return;
        const haystack = `${u.ho_ten || ""} ${u.ma_nhan_vien || ""} ${u.so_dien_thoai || ""} ${u.ten_khoa || ""}`.toLowerCase();
        if (keyword && !haystack.includes(keyword)) return;

        const userKey = String(u.ma_nguoi_dung);
        if (isChecked) selectedStaffSet.add(userKey);
        else selectedStaffSet.delete(userKey);
    });

    renderAdminScheduleMatrix();
}

function updateSelectedCountLabel() {
    const el = document.getElementById("selected-staff-count");
    if (el) el.textContent = selectedStaffSet.size;
}

async function applyPatternForSingleStaff(maNguoiDung, patternCode) {
    const userKey = String(maNguoiDung);
    const weekDates = getAdminWeekDays().map(d => d.ymd);

    try {
        const res = await fetch(`${ADMIN_API_BASE}/bulk-assign-week`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                staff_ids: [userKey],
                week_dates: weekDates,
                pattern: patternCode,
                staff_rooms: staffDefaultRoomMap
            })
        });
        if (res.ok) {
            await loadAdminOverviewData();
        }
    } catch (e) {}
}

async function applyBulkPatternToSelected(patternCode) {
    if (selectedStaffSet.size === 0) {
        alert("⚠️ Vui lòng tích chọn ít nhất 1 nhân sự ở cột ngoài cùng bên trái trước khi gán mẫu hàng loạt!");
        return;
    }

    const weekDates = getAdminWeekDays().map(d => d.ymd);

    try {
        const res = await fetch(`${ADMIN_API_BASE}/bulk-assign-week`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                staff_ids: Array.from(selectedStaffSet),
                week_dates: weekDates,
                pattern: patternCode,
                staff_rooms: staffDefaultRoomMap
            })
        });
        const data = await res.json();
        if (!res.ok) {
            alert("⚠️ " + (data.message || "Lỗi phân ca hàng loạt!"));
            return;
        }
        await loadAdminOverviewData();
    } catch (e) {
        alert("⚠️ Lỗi kết nối tới Server Laravel!");
    }
}

async function autoGenerateFullWeekFor50Staff() {
    const weekDays = getAdminWeekDays();
    const weekDates = weekDays.map(d => d.ymd);

    if (!confirm(`Bạn muốn hệ thống tự động phân bổ lịch trực 3 ca chuẩn (đảm bảo nghỉ bù ra trực sau ca Đêm) cho cả tuần (${weekDays[0].dm} — ${weekDays[6].dm})?`)) {
        return;
    }

    try {
        const res = await fetch(`${ADMIN_API_BASE}/auto-generate-week`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ week_dates: weekDates })
        });
        const data = await res.json();
        if (!res.ok) {
            alert("⚠️ " + (data.message || "Không thể xếp lịch tự động!"));
            return;
        }
        alert("🎉 " + data.message);
        await loadAdminOverviewData();
    } catch (e) {
        alert("⚠️ Lỗi kết nối tới Server Laravel!");
    }
}

async function copyPreviousWeekSchedule() {
    const weekDays = getAdminWeekDays();
    const weekDates = weekDays.map(d => d.ymd);

    try {
        const res = await fetch(`${ADMIN_API_BASE}/copy-previous-week`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ week_dates: weekDates })
        });
        const data = await res.json();
        if (!res.ok) {
            alert("⚠️ " + (data.message || "Không thể sao chép lịch tuần trước!"));
            return;
        }
        alert("✅ " + data.message);
        await loadAdminOverviewData();
    } catch (e) {
        alert("⚠️ Lỗi kết nối tới Server Laravel!");
    }
}

// =========================================================================
// 5. QUẢN LÝ KHO THUỐC & DỊCH VỤ CẬN LÂM SÀNG
// =========================================================================
function renderCatalogsSection() {
    if (!cachedAdminData) return;

    const medsTbody = document.getElementById("admin-meds-tbody");
    medsTbody.innerHTML = cachedAdminData.medicines.map(m => `
        <tr class="hover:bg-slate-50">
            <td class="p-2.5 font-bold text-primary">#${m.ma_thuoc}</td>
            <td class="p-2.5 font-bold text-slate-900">${m.ten_thuoc}<br/><span class="text-[10px] text-slate-500 font-normal">${m.hoat_chat || ""}</span></td>
            <td class="p-2.5">${m.don_vi_tinh}</td>
            <td class="p-2.5 font-bold text-emerald-700">${Number(m.don_gia_thuoc).toLocaleString("vi-VN")}đ</td>
            <td class="p-2.5 font-bold">${m.so_luong_ton_kho}</td>
            <td class="p-2.5 text-right whitespace-nowrap space-x-1">
                <button type="button" onclick="editMedById('${m.ma_thuoc}')" class="px-2.5 py-1 rounded bg-sky-50 hover:bg-teal-600 text-primary hover:text-white font-bold transition">Sửa</button>
                <button type="button" onclick="deleteMedicine('${m.ma_thuoc}')" class="px-2.5 py-1 rounded bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-bold transition">Xóa</button>
            </td>
        </tr>
    `).join("");

    const clsList = document.getElementById("admin-cls-services-list");
    clsList.innerHTML = cachedAdminData.cls_services.map(c => `
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
            <div>
                <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">Mã DV CLS: #${c.ma_dich_vu_cls}</span>
                <h4 class="font-bold text-slate-900 mt-1">${c.ten_dich_vu_cls}</h4>
                <p class="text-indigo-700 font-bold mt-0.5">Đơn giá: ${Number(c.don_gia_cls).toLocaleString("vi-VN")}đ • Phòng ${c.so_phong || "P201"}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="editClsServiceById('${c.ma_dich_vu_cls}')" class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-sky-600 font-bold text-xs">
                    Sửa
                </button>
                <button type="button" onclick="deleteClsService('${c.ma_dich_vu_cls}')" class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 font-bold text-xs transition">
                    Xóa
                </button>
            </div>
        </div>
    `).join("");
}

function editMedById(maThuoc) {
    const m = (cachedAdminData?.medicines || []).find(item => String(item.ma_thuoc) === String(maThuoc));
    if (m) fillMedForm(m);
}

function fillMedForm(m) {
    document.getElementById("med-id").value = m.ma_thuoc;
    document.getElementById("med-name").value = m.ten_thuoc || "";
    document.getElementById("med-active").value = m.hoat_chat || "";
    document.getElementById("med-unit").value = m.don_vi_tinh || "";
    document.getElementById("med-price").value = m.don_gia_thuoc || 0;
    document.getElementById("med-stock").value = m.so_luong_ton_kho || 0;
}

function resetMedForm() {
    document.getElementById("admin-med-form").reset();
    document.getElementById("med-id").value = "";
}

async function submitSaveMedicine(event) {
    event.preventDefault();
    const payload = {
        ma_thuoc: document.getElementById("med-id").value.trim() || null,
        ten_thuoc: document.getElementById("med-name").value.trim(),
        hoat_chat: document.getElementById("med-active").value.trim(),
        don_vi_tinh: document.getElementById("med-unit").value.trim(),
        don_gia_thuoc: document.getElementById("med-price").value,
        so_luong_ton_kho: document.getElementById("med-stock").value
    };
    const res = await fetch(`${ADMIN_API_BASE}/save-medicine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
    resetMedForm();
    await loadAdminOverviewData();
}

async function deleteMedicine(id) {
    if (!confirm(`Bạn có chắc chắn muốn xóa thuốc #${id} khỏi kho MySQL?`)) return;
    const res = await fetch(`${ADMIN_API_BASE}/delete-medicine/${id}`, {
        method: "DELETE",
        headers: { "Accept": "application/json" }
    });
    const data = await res.json();
    alert(data.message || "Đã xóa thuốc!");
    await loadAdminOverviewData();
}

function editClsServiceById(maDv) {
    const c = (cachedAdminData?.cls_services || []).find(item => String(item.ma_dich_vu_cls) === String(maDv));
    if (c) fillClsServiceForm(c);
}

function fillClsServiceForm(c) {
    document.getElementById("cls-srv-id").value = c.ma_dich_vu_cls;
    document.getElementById("cls-srv-name").value = c.ten_dich_vu_cls || "";
    document.getElementById("cls-srv-price").value = c.don_gia_cls || 0;
}

function resetClsServiceForm() {
    document.getElementById("admin-cls-form").reset();
    document.getElementById("cls-srv-id").value = "";
}

async function submitSaveClsService(event) {
    event.preventDefault();
    const payload = {
        ma_dich_vu_cls: document.getElementById("cls-srv-id").value.trim() || null,
        ten_dich_vu_cls: document.getElementById("cls-srv-name").value.trim(),
        don_gia_cls: document.getElementById("cls-srv-price").value
    };
    const res = await fetch(`${ADMIN_API_BASE}/save-cls-service`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
    resetClsServiceForm();
    await loadAdminOverviewData();
}

async function deleteClsService(id) {
    if (!confirm(`Bạn có chắc chắn muốn xóa dịch vụ Cận lâm sàng #${id} khỏi MySQL?`)) return;
    const res = await fetch(`${ADMIN_API_BASE}/delete-cls-service/${id}`, {
        method: "DELETE",
        headers: { "Accept": "application/json" }
    });
    const data = await res.json();
    alert(data.message || "Đã xóa dịch vụ CLS!");
    await loadAdminOverviewData();
}

// =========================================================================
// 6. GIÁM SÁT HỒ SƠ BỆNH ÁN & VIỆN PHÍ
// =========================================================================
function renderAllRecordsTable(records) {
    const tbody = document.getElementById("admin-all-records-tbody");
    if (!tbody) return;

    tbody.innerHTML = records.map(r => `
        <tr class="hover:bg-slate-50">
            <td class="p-3.5 font-bold text-primary">
                Hồ sơ #${r.ma_ho_so_kham}<br/>
                <span class="text-[11px] text-slate-400">STT #${r.so_thu_tu_kham} • ${r.thoi_gian_tiep_nhan || ""}</span>
            </td>
            <td class="p-3.5 font-bold text-slate-900">
                ${r.ten_benh_nhan || "-"} (Mã BN: #${r.ma_benh_nhan})<br/>
                <span class="text-[11px] text-indigo-700 font-semibold">VNeID: ${r.vneid || "-"} • BHYT: ${r.so_the_bhyt || "Không có"}</span>
            </td>
            <td class="p-3.5 font-semibold">
                Phòng ${r.so_phong || "-"}<br/>
                <span class="text-[11px] text-slate-500">${r.ten_khoa || ""}</span>
            </td>
            <td class="p-3.5 max-w-xs">${r.ket_luan_chan_doan || r.trieu_chung_lam_sang || "-"}</td>
            <td class="p-3.5"><span class="px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 font-bold text-[11px]">${r.trang_thai_hang_doi}</span></td>
            <td class="p-3.5">
                ${r.ma_hoa_don
                    ? `<span class="font-bold text-emerald-700">HĐ #${r.ma_hoa_don}: ${Number(r.tong_tien_goc).toLocaleString("vi-VN")}đ (${r.phuong_thuc_thanh_toan || "VietQR"})</span><br/>
                       <span class="text-[11px] text-slate-500">BHYT: ${Number(r.tien_bhyt_chi_tra).toLocaleString("vi-VN")}đ | BN: ${Number(r.tien_benh_nhan_tra).toLocaleString("vi-VN")}đ</span><br/>
                       <span class="text-[10px] text-primary font-semibold">STK Viện: ${r.stk_benh_vien || "-"}</span>`
                    : `<span class="text-slate-400 italic">Chưa lập hóa đơn</span>`}
            </td>
        </tr>
    `).join("");
}