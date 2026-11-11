const ADMIN_API_BASE = "http://127.0.0.1:8000/api/admin";

let cachedAdminData = null;

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

    loadAdminOverviewData();
});

function logoutAdmin() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

function switchAdminSection(sectionName) {
    const sections = ["overview", "users", "departments", "catalogs", "records"];
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

        // Cập nhật số lượng trên Sidebar (5 mục)
        const usersBadge = document.getElementById("side-badge-users");
        if (usersBadge) usersBadge.textContent = (data.users || []).length;

        const roomsBadge = document.getElementById("side-badge-rooms");
        if (roomsBadge) roomsBadge.textContent = (data.rooms || []).length;

        const medsBadge = document.getElementById("side-badge-meds");
        if (medsBadge) medsBadge.textContent = (data.medicines || []).length;

        const recordsBadge = document.getElementById("side-badge-records");
        if (recordsBadge) recordsBadge.textContent = (data.records || []).length;

        renderOverviewRecentRecords((data.records || []).slice(0, 8));
        renderUsersTable();
        renderDepartmentsAndRooms();
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
                <button type="button" onclick='fillDeptForm(${JSON.stringify(d)})' class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-primary font-bold text-xs">
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
                <button type="button" onclick='fillRoomForm(${JSON.stringify(r)})' class="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold transition">Sửa</button>
                <button type="button" onclick="deleteRoom('${r.ma_phong}')" class="px-2.5 py-1 rounded bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-bold transition">Xóa</button>
            </td>
        </tr>
    `).join("");
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
// 4. QUẢN LÝ KHO THUỐC & DỊCH VỤ CẬN LÂM SÀNG
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
                <button type="button" onclick='fillMedForm(${JSON.stringify(m)})' class="px-2.5 py-1 rounded bg-sky-50 hover:bg-teal-600 text-primary hover:text-white font-bold transition">Sửa</button>
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
                <button type="button" onclick='fillClsServiceForm(${JSON.stringify(c)})' class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-sky-600 font-bold text-xs">
                    Sửa
                </button>
                <button type="button" onclick="deleteClsService('${c.ma_dich_vu_cls}')" class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 font-bold text-xs transition">
                    Xóa
                </button>
            </div>
        </div>
    `).join("");
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
// 5. GIÁM SÁT HỒ SƠ BỆNH ÁN & VIỆN PHÍ
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