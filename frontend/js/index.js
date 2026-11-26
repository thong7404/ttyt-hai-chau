// =========================================================================
// CẤU HÌNH ĐỊA CHỈ API BACKEND LARAVEL (8000) & FASTAPI AI (8001)
// =========================================================================
const INDEX_API = {
    BASE_API_URL: "http://127.0.0.1:8000/api",
    LARAVEL_AUTH_URL: "http://127.0.0.1:8000/api",
    FASTAPI_CHAT_URL: "http://127.0.0.1:8001/api/ai/triage-chat"
};

const NOTIFICATION_API_BASE = "http://127.0.0.1:8000/api/notifications";

let symptomImageFiles = [];
let chatSessions = [];
let activeSessionId = null;
let cachedUserNotifications = [];

let allSchedulesFromMySql = [];
let currentDoctorSchedules = [];
let availableDoctorDatesMap = new Map(); // ymd -> Set(["Sáng", "Chiều", ...])
let bookingCalYear = new Date().getFullYear();
let bookingCalMonth = new Date().getMonth(); // 0 - 11

// Danh sách Bác sĩ mặc định theo 12 Chuyên khoa (sẽ được bổ sung/cập nhật thêm từ MySQL)
let doctorsByDeptMap = {
    "KH001": [
        { ma_nhan_vien: "NV26112003", ho_ten: "BS.CKI Nguyễn Văn Hưng" },
        { ma_nhan_vien: "NV26112026", ho_ten: "BS.CKI Hoàng Thị Thu Thủy" },
        { ma_nhan_vien: "NV26112027", ho_ten: "BS. Đinh Văn Phúc" }
    ],
    "KH002": [
        { ma_nhan_vien: "NV26112006", ho_ten: "ThS.BS Lê Quang Đức" },
        { ma_nhan_vien: "NV26112028", ho_ten: "BS.CKI Nguyễn Thị Kiều Oanh" }
    ],
    "KH003": [
        { ma_nhan_vien: "NV26112008", ho_ten: "KTV. Phạm Ngọc Ánh" }
    ],
    "KH004": [
        { ma_nhan_vien: "NV26112007", ho_ten: "BS.CKI Trần Ngọc Sơn" },
        { ma_nhan_vien: "NV26112029", ho_ten: "BS. Võ Thanh Bình" }
    ],
    "KH005": [
        { ma_nhan_vien: "NV26112030", ho_ten: "BS.CKI Phan Thị Mỹ Duyên" },
        { ma_nhan_vien: "NV26112031", ho_ten: "BS. Lý Quốc Việt" }
    ],
    "KH006": [
        { ma_nhan_vien: "NV26112032", ho_ten: "BS.CKII Trần Minh Quân" },
        { ma_nhan_vien: "NV26112033", ho_ten: "BS.CKI Nguyễn Hữu Nghĩa" },
        { ma_nhan_vien: "NV26112034", ho_ten: "BS. Phạm Quốc Thắng" }
    ],
    "KH007": [
        { ma_nhan_vien: "NV26112035", ho_ten: "BS.CKI Lê Thị Thanh Hương" },
        { ma_nhan_vien: "NV26112036", ho_ten: "BS. Nguyễn Thị Cẩm Vân" },
        { ma_nhan_vien: "NV26112037", ho_ten: "BS. Trần Thị Diễm My" }
    ],
    "KH008": [
        { ma_nhan_vien: "NV26112038", ho_ten: "BS.CKI Huỳnh Ngọc Anh" },
        { ma_nhan_vien: "NV26112039", ho_ten: "BS. Đặng Thị Phương Thảo" },
        { ma_nhan_vien: "NV26112040", ho_ten: "BS. Nguyễn Minh Khoa" }
    ],
    "KH009": [
        { ma_nhan_vien: "NV26112041", ho_ten: "BS.CKI Trương Công Danh" },
        { ma_nhan_vien: "NV26112042", ho_ten: "BS. Vũ Thị Khánh Linh" }
    ],
    "KH010": [
        { ma_nhan_vien: "NV26112043", ho_ten: "BS.CKI Nguyễn Quang Vinh" },
        { ma_nhan_vien: "NV26112044", ho_ten: "BS. Lê Thị Ngọc Hân" }
    ],
    "KH011": [
        { ma_nhan_vien: "NV26112045", ho_ten: "BS.CKI Mai Thị Hồng Nhung" },
        { ma_nhan_vien: "NV26112046", ho_ten: "BS. Cao Văn Toàn" }
    ],
    "KH012": [
        { ma_nhan_vien: "NV26112047", ho_ten: "BS.CKI Nguyễn Tấn Phát" },
        { ma_nhan_vien: "NV26112048", ho_ten: "BS. Trần Hoàng Long" },
        { ma_nhan_vien: "NV26112049", ho_ten: "BS. Lê Anh Kiệt" },
        { ma_nhan_vien: "NV26112050", ho_ten: "BS. Phạm Quốc Cường" }
    ]
};

/**
 * 1. Hàm lấy thông tin người dùng đang đăng nhập từ localStorage
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
 * 2. Hàm đăng xuất tài khoản
 */
function logoutSystem() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

/**
 * 3. Hàm nạp trực tiếp 2 file tĩnh header.html và footer.html vào #app-header và #app-footer
 */
async function loadHeaderAndFooterHtml() {
    const headerPlaceholder = document.getElementById("app-header");
    const footerPlaceholder = document.getElementById("app-footer");

    try {
        const [headerRes, footerRes] = await Promise.all([
            fetch("./header.html"),
            fetch("./footer.html")
        ]);

        if (headerRes.ok && headerPlaceholder) {
            headerPlaceholder.innerHTML = await headerRes.text();
        }
        if (footerRes.ok && footerPlaceholder) {
            footerPlaceholder.innerHTML = await footerRes.text();
        }
    } catch (err) {
        console.error("Không thể tải header.html hoặc footer.html:", err);
    }

    renderHeaderAuthStatus();
}

/**
 * 4. Các hàm tiện ích xử lý ngày & ca trực của Bác sĩ
 */
function getTodayDateStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getBookingShiftMeta(caTruc) {
    const norm = caTruc === "Toi" ? "Chieu" : caTruc;
    const map = {
        Sang:  { code: "Sang",  value: "Ca Sáng (07:00 - 11:30)",  shortLabel: "Sáng",  endHm: "11:30", order: 1 },
        Chieu: { code: "Chieu", value: "Ca Chiều (13:00 - 16:30)", shortLabel: "Chiều", endHm: "16:30", order: 2 },
        Dem:   { code: "Dem",   value: "Ca Đêm (16:30 - 07:00)",   shortLabel: "Đêm",   endHm: "23:59", order: 3 }
    };
    return map[norm] || map.Sang;
}

function isBookingShiftExpired(ymdStr, caTruc) {
    const todayStr = getTodayDateStr();
    if (!ymdStr || ymdStr < todayStr) return true;
    if (ymdStr > todayStr) return false;

    const meta = getBookingShiftMeta(caTruc);
    if (meta.code === "Dem") return false;

    const now = new Date();
    const currentHm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    return currentHm >= meta.endHm;
}

function formatDisplayDateButton(ymdStr) {
    if (!ymdStr) return "-- Chọn ngày khám --";
    const d = new Date(ymdStr + "T00:00:00");
    if (isNaN(d.getTime())) return ymdStr;
    const days = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy} (${days[d.getDay()]})`;
}

/**
 * 5. Đảm bảo ô Ngày hẹn khám luôn có Bộ lịch tháng (Calendar Popover) chọn ngày Bác sĩ trực
 */
function ensureBookingCalendarDOM() {
    if (document.getElementById("bk-calendar-popover")) return;

    const oldDateEl = document.getElementById("bk-date");
    if (!oldDateEl || !oldDateEl.parentElement) return;

    const container = oldDateEl.parentElement;
    container.id = "bk-date-picker-wrapper";
    container.classList.add("relative");

    container.innerHTML = `
        <label class="font-semibold block mb-1 text-slate-700 text-xs">Ngày hẹn khám *</label>
        <input type="hidden" id="bk-date" value=""/>
        <button type="button" id="bk-date-display-btn" disabled onclick="toggleBookingCalendarPopover(event)"
                class="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-slate-100 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-between gap-2 text-left transition focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500">
            <span id="bk-date-display-text" class="truncate">-- Chọn Bác sĩ trước --</span>
            <span class="material-symbols-outlined text-base text-teal-600 shrink-0">calendar_month</span>
        </button>

        <div id="bk-calendar-popover"
             class="hidden absolute left-0 top-full mt-1.5 w-[290px] sm:w-[304px] bg-white rounded-2xl shadow-2xl border border-teal-200 p-3.5 z-50 select-none">
            <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
                <button type="button" onclick="shiftBookingCalendarMonth(-1, event)"
                        class="w-7 h-7 rounded-lg hover:bg-teal-50 text-slate-600 hover:text-teal-700 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">chevron_left</span>
                </button>
                <span id="bk-cal-month-label" class="font-heading font-extrabold text-xs text-teal-900 uppercase">Tháng 11 / 2026</span>
                <button type="button" onclick="shiftBookingCalendarMonth(1, event)"
                        class="w-7 h-7 rounded-lg hover:bg-teal-50 text-slate-600 hover:text-teal-700 flex items-center justify-center transition">
                    <span class="material-symbols-outlined text-lg">chevron_right</span>
                </button>
            </div>

            <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1.5">
                <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span class="text-rose-400">CN</span>
            </div>

            <div id="bk-cal-days-grid" class="grid grid-cols-7 gap-1 text-center text-xs"></div>

            <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                <span class="inline-flex items-center gap-1">
                    <span class="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block"></span> Có lịch BS
                </span>
                <span class="inline-flex items-center gap-1">
                    <span class="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block"></span> Không trực (Khóa)
                </span>
            </div>
        </div>
    `;
}

function closeBookingCalendarPopover() {
    document.getElementById("bk-calendar-popover")?.classList.add("hidden");
}

function toggleBookingCalendarPopover(event) {
    if (event) event.stopPropagation();
    const btn = document.getElementById("bk-date-display-btn");
    const pop = document.getElementById("bk-calendar-popover");
    if (!btn || btn.disabled || !pop) return;

    const willOpen = pop.classList.contains("hidden");
    if (willOpen) {
        renderBookingCalendarGrid();
        pop.classList.remove("hidden");
    } else {
        pop.classList.add("hidden");
    }
}

function shiftBookingCalendarMonth(delta, event) {
    if (event) event.stopPropagation();
    const d = new Date(bookingCalYear, bookingCalMonth + delta, 1);
    bookingCalYear = d.getFullYear();
    bookingCalMonth = d.getMonth();
    renderBookingCalendarGrid();
}

function renderBookingCalendarGrid() {
    const labelEl = document.getElementById("bk-cal-month-label");
    const gridEl = document.getElementById("bk-cal-days-grid");
    const selectedDate = document.getElementById("bk-date")?.value || "";
    if (!labelEl || !gridEl) return;

    labelEl.textContent = `Tháng ${bookingCalMonth + 1} / ${bookingCalYear}`;

    const firstDay = new Date(bookingCalYear, bookingCalMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Thứ 2 = 0 ... Chủ nhật = 6
    const daysInMonth = new Date(bookingCalYear, bookingCalMonth + 1, 0).getDate();
    const todayStr = getTodayDateStr();

    let cellsHtml = "";
    for (let i = 0; i < startOffset; i++) {
        cellsHtml += `<div></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const ymd = `${bookingCalYear}-${String(bookingCalMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const shiftsSet = availableDoctorDatesMap.get(ymd);
        const isAvailable = Boolean(shiftsSet && shiftsSet.size > 0);
        const isSelected = selectedDate === ymd;
        const isToday = ymd === todayStr;

        if (isAvailable) {
            const shiftsText = Array.from(shiftsSet).join(", ");
            const btnClass = isSelected
                ? "bg-teal-600 text-white font-extrabold shadow-sm ring-2 ring-teal-300"
                : (isToday
                    ? "bg-emerald-50 hover:bg-teal-600 text-teal-900 hover:text-white font-extrabold border-2 border-teal-500"
                    : "bg-teal-50/90 hover:bg-teal-600 text-teal-900 hover:text-white font-bold border border-teal-200");

            cellsHtml += `
                <button type="button" onclick="selectBookingCalendarDate('${ymd}', true, event)"
                        title="Có lịch trực: ${shiftsText}"
                        class="h-8 rounded-lg text-xs flex flex-col items-center justify-center relative transition ${btnClass}">
                    <span>${day}</span>
                    <span class="w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-teal-500'}"></span>
                </button>
            `;
        } else {
            cellsHtml += `
                <button type="button" disabled title="Bác sĩ không có lịch làm việc ngày này"
                        class="h-8 rounded-lg text-xs text-slate-300 bg-slate-50/70 line-through cursor-not-allowed flex items-center justify-center">
                    ${day}
                </button>
            `;
        }
    }

    gridEl.innerHTML = cellsHtml;
}

function selectBookingCalendarDate(ymd, shouldClose = true, event = null) {
    if (event) event.stopPropagation();
    if (!availableDoctorDatesMap.has(ymd)) return;

    const dateHidden = document.getElementById("bk-date");
    const displayText = document.getElementById("bk-date-display-text");

    if (dateHidden) dateHidden.value = ymd;
    if (displayText) displayText.textContent = formatDisplayDateButton(ymd);

    const parsed = new Date(ymd + "T00:00:00");
    if (!isNaN(parsed.getTime())) {
        bookingCalYear = parsed.getFullYear();
        bookingCalMonth = parsed.getMonth();
    }

    if (shouldClose) closeBookingCalendarPopover();
    renderBookingCalendarGrid();
    onChangeBookingDate();
}

function resetBookingDateAndShift(datePlaceholder = "-- Chọn Bác sĩ trước --", shiftPlaceholder = "-- Chọn Ngày khám trước --") {
    ensureBookingCalendarDOM();
    closeBookingCalendarPopover();

    const dateHidden = document.getElementById("bk-date");
    const displayBtn = document.getElementById("bk-date-display-btn");
    const displayText = document.getElementById("bk-date-display-text");
    const shiftEl = document.getElementById("bk-shift");

    if (dateHidden) dateHidden.value = "";
    if (displayBtn) {
        displayBtn.disabled = true;
        displayBtn.className = "w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-slate-100 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-between gap-2 text-left transition";
    }
    if (displayText) displayText.textContent = datePlaceholder;

    if (shiftEl) {
        shiftEl.disabled = true;
        shiftEl.className = "w-full h-10 px-3 rounded-lg border-slate-300 text-xs font-semibold text-slate-700 bg-slate-100 disabled:opacity-75 focus:border-teal-500 focus:ring-teal-500";
        shiftEl.innerHTML = `<option value="">${shiftPlaceholder}</option>`;
    }
}

function initBookingDateMin() {
    ensureBookingCalendarDOM();
    const docEl = document.getElementById("bk-doctor");
    if (docEl) docEl.onchange = onChangeBookingDoctor;
    resetBookingDateAndShift();
}

/**
 * 6. Tải danh sách Chuyên khoa, Bác sĩ & Lịch làm việc từ MySQL để đồng bộ vào ô chọn
 */
async function loadDepartmentsAndDoctorsFromMySql() {
    try {
        const res = await fetch(`${INDEX_API.BASE_API_URL}/admin/overview-data`, {
            headers: { "Accept": "application/json" }
        });
        if (!res.ok) return;
        const data = await res.json();

        const depts = data.departments || [];
        const rooms = (data.rooms || []).filter(r => r.loai_phong === "PhongKhamBS" || r.loai_phong === "PhongCLS");
        const users = (data.users || []).filter(
            u => (u.vai_tro === "BacSi" || u.chuc_vu === "BacSi") && u.trang_thai !== "DaKhoa"
        );
        allSchedulesFromMySql = Array.isArray(data.schedules) ? data.schedules : [];

        if (users.length > 0) {
            const newMap = {};
            users.forEach(u => {
                const maKhoa = u.ma_khoa || "KH001";
                if (!newMap[maKhoa]) newMap[maKhoa] = [];
                newMap[maKhoa].push({
                    ma_nhan_vien: u.ma_nhan_vien || u.ma_nguoi_dung,
                    ho_ten: u.ho_ten
                });
            });
            doctorsByDeptMap = { ...doctorsByDeptMap, ...newMap };
        }

        const defaultRoomMap = {
            KH001: "P102", KH002: "P103", KH003: "P201", KH004: "P106",
            KH005: "P107", KH006: "P108", KH007: "P109", KH008: "P110",
            KH009: "P111", KH010: "P112", KH011: "P113", KH012: "P114"
        };

        const deptSelect = document.getElementById("bk-department");
        if (deptSelect && depts.length > 0) {
            const currentVal = deptSelect.value;
            deptSelect.innerHTML = `<option value="">-- Chọn Khoa & Phòng --</option>` +
                depts.map(d => {
                    const room = rooms.find(r => String(r.ma_khoa) === String(d.ma_khoa));
                    const roomCode = room ? room.so_phong : (defaultRoomMap[d.ma_khoa] || "P102");
                    const valueStr = `${d.ten_khoa} (${roomCode})`;
                    const priceStr = Number(d.gia_kham) > 0 ? ` - ${Number(d.gia_kham).toLocaleString("vi-VN")}đ` : "";
                    return `<option value="${valueStr}" data-ma-khoa="${d.ma_khoa}">${d.ten_khoa} (${roomCode}${priceStr})</option>`;
                }).join("");
            if (currentVal) deptSelect.value = currentVal;
        }
    } catch (e) {
        // Nếu chưa bật cổng 8000 thì dùng danh sách 12 khoa & bác sĩ mặc định
    }
}

/**
 * 7. Khi bệnh nhân chọn Chuyên khoa -> Mở khóa, nạp danh sách Bác sĩ và tải lịch làm của Bác sĩ đó
 */
async function onChangeBookingDepartment() {
    const deptSelect = document.getElementById("bk-department");
    const doctorSelect = document.getElementById("bk-doctor");
    if (!deptSelect || !doctorSelect) return;

    const selectedOpt = deptSelect.options[deptSelect.selectedIndex];
    const deptVal = deptSelect.value || "";

    if (!deptVal) {
        doctorSelect.disabled = true;
        doctorSelect.className = "w-full h-10 px-3 rounded-lg border-slate-300 text-xs font-semibold text-slate-700 bg-slate-100 disabled:opacity-75";
        doctorSelect.innerHTML = `<option value="">-- Chọn Chuyên khoa trước --</option>`;
        currentDoctorSchedules = [];
        availableDoctorDatesMap = new Map();
        resetBookingDateAndShift();
        return;
    }

    let maKhoa = selectedOpt ? selectedOpt.getAttribute("data-ma-khoa") : "";
    if (!maKhoa) {
        if (deptVal.includes("Tai") || deptVal.includes("P103")) maKhoa = "KH002";
        else if (deptVal.includes("Hình") || deptVal.includes("CLS") || deptVal.includes("Cận Lâm Sàng") || deptVal.includes("P201")) maKhoa = "KH003";
        else if (deptVal.includes("Xương") || deptVal.includes("P106")) maKhoa = "KH004";
        else if (deptVal.includes("Cổ Truyền") || deptVal.includes("P107")) maKhoa = "KH005";
        else if (deptVal.includes("Ngoại") || deptVal.includes("P108")) maKhoa = "KH006";
        else if (deptVal.includes("Sản") || deptVal.includes("P109")) maKhoa = "KH007";
        else if (deptVal.includes("Nhi") || deptVal.includes("P110")) maKhoa = "KH008";
        else if (deptVal.includes("Răng") || deptVal.includes("P111")) maKhoa = "KH009";
        else if (deptVal.includes("Mắt") || deptVal.includes("P112")) maKhoa = "KH010";
        else if (deptVal.includes("Da Liễu") || deptVal.includes("Truyền Nhiễm") || deptVal.includes("P113")) maKhoa = "KH011";
        else if (deptVal.includes("Cấp Cứu") || deptVal.includes("P114")) maKhoa = "KH012";
        else maKhoa = "KH001";
    }

    let doctors = doctorsByDeptMap[maKhoa] || [];
    if (doctors.length === 0) {
        doctors = Object.values(doctorsByDeptMap).flat();
    }
    doctorSelect.disabled = false;
    doctorSelect.className = "w-full h-10 px-3 rounded-lg border-slate-300 text-xs font-bold text-teal-900 bg-white focus:border-teal-500 focus:ring-teal-500";

    if (doctors.length === 0) {
        doctorSelect.innerHTML = `<option value="ANY" data-ten-bs="Bác sĩ phân công theo ca trực">Bác sĩ phân công theo ca trực</option>`;
    } else {
        doctorSelect.innerHTML =
            doctors.map(doc => `<option value="${doc.ma_nhan_vien}" data-ten-bs="${doc.ho_ten}">${doc.ho_ten}</option>`).join("") +
            `<option value="ANY" data-ten-bs="Bác sĩ bất kỳ trong khoa">-- Bác sĩ bất kỳ trong khoa --</option>`;
    }

    await onChangeBookingDoctor();
}

/**
 * 8. Khi bệnh nhân chọn Bác sĩ -> Nạp các NGÀY bác sĩ đó làm việc lên lịch tháng & khóa các ngày nghỉ
 */
async function onChangeBookingDoctor() {
    ensureBookingCalendarDOM();
    const deptSelect = document.getElementById("bk-department");
    const doctorSelect = document.getElementById("bk-doctor");
    const displayBtn = document.getElementById("bk-date-display-btn");
    if (!doctorSelect || !displayBtn) return;

    const maNhanVien = doctorSelect.value;
    if (!maNhanVien) {
        currentDoctorSchedules = [];
        availableDoctorDatesMap = new Map();
        resetBookingDateAndShift();
        return;
    }

    resetBookingDateAndShift("⏳ Đang tải lịch bác sĩ...", "-- Chọn Ngày khám trước --");

    let rawSchedules = [];
    if (maNhanVien === "ANY") {
        const selectedDeptOpt = deptSelect && deptSelect.selectedIndex >= 0 ? deptSelect.options[deptSelect.selectedIndex] : null;
        const maKhoa = selectedDeptOpt ? (selectedDeptOpt.getAttribute("data-ma-khoa") || "") : "";
        const deptDoctorIds = new Set((doctorsByDeptMap[maKhoa] || []).map(d => String(d.ma_nhan_vien)));

        if (allSchedulesFromMySql.length === 0) {
            try {
                const res = await fetch(`${INDEX_API.BASE_API_URL}/schedules/weekly-board`, {
                    headers: { "Accept": "application/json" }
                });
                if (res.ok) {
                    const data = await res.json();
                    allSchedulesFromMySql = data.lich_lam_viec_tuan || [];
                }
            } catch (e) {}
        }

        rawSchedules = allSchedulesFromMySql.filter(s => deptDoctorIds.has(String(s.ma_nhan_vien)));
    } else {
        try {
            const res = await fetch(`${INDEX_API.BASE_API_URL}/schedules/staff/${encodeURIComponent(maNhanVien)}`, {
                headers: { "Accept": "application/json" }
            });
            if (res.ok) {
                const data = await res.json();
                rawSchedules = Array.isArray(data.schedules) ? data.schedules : [];
            }
        } catch (e) {
            rawSchedules = allSchedulesFromMySql.filter(s => String(s.ma_nhan_vien) === String(maNhanVien));
        }
    }

    currentDoctorSchedules = rawSchedules
        .map(s => ({
            ...s,
            ngay_ymd: String(s.ngay_lam_viec || "").substring(0, 10),
            shiftMeta: getBookingShiftMeta(s.ca_truc)
        }))
        .filter(s => s.ngay_ymd && !isBookingShiftExpired(s.ngay_ymd, s.ca_truc))
        .sort((a, b) => {
            if (a.ngay_ymd !== b.ngay_ymd) return a.ngay_ymd.localeCompare(b.ngay_ymd);
            return a.shiftMeta.order - b.shiftMeta.order;
        });

    availableDoctorDatesMap = new Map();
    currentDoctorSchedules.forEach(s => {
        if (!availableDoctorDatesMap.has(s.ngay_ymd)) {
            availableDoctorDatesMap.set(s.ngay_ymd, new Set());
        }
        availableDoctorDatesMap.get(s.ngay_ymd).add(s.shiftMeta.shortLabel);
    });

    if (availableDoctorDatesMap.size === 0) {
        resetBookingDateAndShift("-- Bác sĩ chưa có lịch trực --", "-- Không có ca khám --");
        return;
    }

    displayBtn.disabled = false;
    displayBtn.className = "w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-bold text-teal-900 bg-white hover:border-teal-500 flex items-center justify-between gap-2 text-left transition focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500";

    // Tự động chọn sẵn ngày làm việc gần nhất của Bác sĩ và nạp đúng khung giờ làm ngày đó
    const firstAvailableDate = Array.from(availableDoctorDatesMap.keys())[0];
    selectBookingCalendarDate(firstAvailableDate, false);
}

/**
 * 9. Khi chọn 1 ngày trên lịch -> Chỉ hiển thị đúng CA và KHUNG GIỜ bác sĩ làm việc trong ngày đó
 */
function onChangeBookingDate() {
    const dateHidden = document.getElementById("bk-date");
    const shiftSelect = document.getElementById("bk-shift");
    const doctorSelect = document.getElementById("bk-doctor");
    if (!dateHidden || !shiftSelect) return;

    const selectedDate = dateHidden.value;
    if (!selectedDate) {
        shiftSelect.disabled = true;
        shiftSelect.className = "w-full h-10 px-3 rounded-lg border-slate-300 text-xs font-semibold text-slate-700 bg-slate-100 disabled:opacity-75 focus:border-teal-500 focus:ring-teal-500";
        shiftSelect.innerHTML = `<option value="">-- Chọn Ngày khám trước --</option>`;
        return;
    }

    const daySchedules = currentDoctorSchedules.filter(s => s.ngay_ymd === selectedDate);
    if (daySchedules.length === 0) {
        shiftSelect.disabled = true;
        shiftSelect.className = "w-full h-10 px-3 rounded-lg border-slate-300 text-xs font-semibold text-slate-700 bg-slate-100 disabled:opacity-75 focus:border-teal-500 focus:ring-teal-500";
        shiftSelect.innerHTML = `<option value="">-- Không có ca khám ngày này --</option>`;
        return;
    }

    const isAnyDoctor = doctorSelect && doctorSelect.value === "ANY";
    const uniqueShiftList = [];
    const seenShiftCodes = new Set();

    daySchedules.forEach(s => {
        if (isAnyDoctor) {
            if (seenShiftCodes.has(s.shiftMeta.code)) return;
            seenShiftCodes.add(s.shiftMeta.code);
        }
        uniqueShiftList.push(s);
    });

    shiftSelect.disabled = false;
    shiftSelect.className = "w-full h-10 px-3 rounded-lg border-slate-300 text-xs font-bold text-teal-900 bg-white focus:border-teal-500 focus:ring-teal-500";
    shiftSelect.innerHTML = uniqueShiftList.map(s => {
        const maxSlots = Number(s.so_luong_bn_toi_da || 35);
        const booked = Number(s.so_lich_hen || 0);
        const isFull = s.so_lich_hen !== undefined && (maxSlots - booked) <= 0;

        return `
            <option value="${s.shiftMeta.value}"
                    data-ma-lich-lam="${s.ma_lich_lam || ''}"
                    data-ma-nhan-vien="${s.ma_nhan_vien || ''}"
                    data-ten-bs="${s.ten_nhan_su || ''}"
                    ${isFull ? 'disabled' : ''}>
                ${s.shiftMeta.value}${isFull ? " (Hết chỗ)" : ""}
            </option>
        `;
    }).join("");
}

/**
 * Khởi chạy toàn bộ chức năng khi trang index.html tải xong
 */
document.addEventListener("DOMContentLoaded", async () => {
    initHeroBannerSlider();
    await loadHeaderAndFooterHtml();
    initBookingDateMin();
    await loadDepartmentsAndDoctorsFromMySql();
    await initChatSessionsSystem();
    initScrollAnimations();

    document.addEventListener("click", (e) => {
        const wrapper = document.getElementById("header-user-dropdown-wrapper");
        const menu = document.getElementById("user-profile-menu");
        if (wrapper && menu && !wrapper.contains(e.target)) {
            menu.classList.add("hidden");
        }

        const notifWrapper = document.getElementById("header-notif-wrapper");
        const notifDropdown = document.getElementById("header-notif-dropdown");
        if (notifWrapper && notifDropdown && !notifWrapper.contains(e.target)) {
            notifDropdown.classList.add("hidden");
        }

        const calWrapper = document.getElementById("bk-date-picker-wrapper");
        const calPopover = document.getElementById("bk-calendar-popover");
        if (calWrapper && calPopover && !calWrapper.contains(e.target)) {
            calPopover.classList.add("hidden");
        }
    });
});

/**
 * Hàm khởi tạo hiệu ứng chuyển động mượt khi cuộn trang (Scroll Reveal)
 */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        ".reveal-up, .reveal-left, .reveal-right, .reveal-zoom"
    );
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                }
            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
    );
    animatedElements.forEach((el) => observer.observe(el));
}

// =========================================================================
// 1. HIỂN THỊ AVATAR + TÊN NGƯỜI DÙNG + NÚT THÔNG BÁO TRÊN HEADER
// =========================================================================
function renderHeaderAuthStatus() {
    const user = getCurrentUser();
    const guestZone = document.getElementById("header-guest-zone");
    const userDropdownWrapper = document.getElementById("header-user-dropdown-wrapper");

    const bkName = document.getElementById("bk-fullname");
    const bkPhone = document.getElementById("bk-phone");

    if (user && user.ma_nguoi_dung) {
        if (guestZone) guestZone.classList.add("hidden");
        if (userDropdownWrapper) userDropdownWrapper.classList.remove("hidden");

        const savedAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.ho_ten)}&background=0e828a&color=fff&bold=true`;

        const navAvatar = document.getElementById("nav-user-avatar");
        const navName = document.getElementById("nav-user-name");
        const navCode = document.getElementById("nav-user-code");
        const dropName = document.getElementById("dropdown-user-fullname");
        const dropEmail = document.getElementById("dropdown-user-email");

        if (navAvatar) navAvatar.src = savedAvatar;
        if (navName) navName.textContent = user.ho_ten;
        if (navCode) {
            navCode.textContent = user.ma_benh_nhan
                ? `Mã BN: #${user.ma_benh_nhan}${user.vneid ? " • VNeID: " + user.vneid : ""}`
                : user.vai_tro;
        }
        if (dropName) dropName.textContent = user.ho_ten;
        if (dropEmail) dropEmail.textContent = user.email;

        if (bkName && !bkName.value) bkName.value = user.ho_ten || "";
        if (bkPhone && !bkPhone.value) bkPhone.value = user.so_dien_thoai || "";

        initUserNotificationBell();
    } else {
        if (guestZone) guestZone.classList.remove("hidden");
        if (userDropdownWrapper) userDropdownWrapper.classList.add("hidden");
        document.getElementById("header-notif-wrapper")?.remove();
        if (bkName) bkName.value = "";
        if (bkPhone) bkPhone.value = "";
    }
}

function toggleUserProfileMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById("user-profile-menu");
    if (menu) menu.classList.toggle("hidden");
}

// =========================================================================
// 2. BẢNG YÊU CẦU ĐĂNG NHẬP & BẢNG ĐẶT LỊCH THÀNH CÔNG
// =========================================================================
function showRequireLoginModal() {
    let modal = document.getElementById("require-login-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "require-login-modal";
        modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4";
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-teal-200 animate-[fadeIn_0.2s_ease-out]">
                <div class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative">
                    <div class="w-14 h-14 rounded-full bg-white text-teal-600 flex items-center justify-center mx-auto mb-2.5 shadow-md">
                        <span class="material-symbols-outlined text-3xl">lock</span>
                    </div>
                    <h3 class="font-heading font-extrabold text-lg">Thông Báo Hệ Thống</h3>
                </div>
                <div class="p-6 text-center space-y-5">
                    <p class="text-sm sm:text-base text-slate-700 font-bold leading-relaxed">
                        Hãy đăng nhập để đặt lịch và xem hồ sơ bệnh án
                    </p>
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="closeRequireLoginModal()"
                                class="w-2/5 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition">
                            Đóng lại
                        </button>
                        <a href="login.html"
                           class="w-3/5 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition">
                            <span class="material-symbols-outlined text-base">login</span>
                            <span>Đăng nhập ngay</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    }
}

function closeRequireLoginModal() {
    const modal = document.getElementById("require-login-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function showBookingSuccessModal(bookingInfo) {
    const modal = document.getElementById("booking-success-modal");
    if (!modal) return;

    document.getElementById("bsm-ma-lich-hen").textContent = `#${bookingInfo.ma_lich_hen}`;
    document.getElementById("bsm-ho-ten").textContent = bookingInfo.ho_ten || "";
    document.getElementById("bsm-sdt").textContent = bookingInfo.so_dien_thoai || "";
    document.getElementById("bsm-chuyen-khoa").textContent = bookingInfo.chuyen_khoa || "";

    const bsEl = document.getElementById("bsm-bac-si");
    if (bsEl) bsEl.textContent = bookingInfo.ten_bac_si || "Bác sĩ chuyên khoa";

    document.getElementById("bsm-thoi-gian").textContent = `${bookingInfo.ngay_hen_kham} • ${bookingInfo.khung_gio_hen}`;
    document.getElementById("bsm-trieu-chung").textContent = bookingInfo.trieu_chung_ban_dau || "Khám lâm sàng theo lịch hẹn";

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeBookingSuccessModal() {
    const modal = document.getElementById("booking-success-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function openBookedListFromSuccessModal() {
    window.location.href = "account.html?tab=appointments";
}

// =========================================================================
// 3. TỰ ĐỘNG ĐIỀN FORM ĐẶT LỊCH & LƯU VÀO BẢNG LICH_HEN_KHAM
// =========================================================================
async function autoFillHomepageBookingForm(suggestion) {
    if (!suggestion) return;
    const user = getCurrentUser();

    const deptEl = document.getElementById("bk-department");
    const shiftEl = document.getElementById("bk-shift");
    const symptomEl = document.getElementById("bk-symptom");
    const nameEl = document.getElementById("bk-fullname");
    const phoneEl = document.getElementById("bk-phone");

    if (deptEl && suggestion.chuyen_khoa) {
        deptEl.value = suggestion.chuyen_khoa;
        await onChangeBookingDepartment();
    }
    if (suggestion.ngay_hen && availableDoctorDatesMap.has(suggestion.ngay_hen)) {
        selectBookingCalendarDate(suggestion.ngay_hen, true);
    }
    if (shiftEl && suggestion.ca_kham) {
        const hasSuggestedShift = Array.from(shiftEl.options).some(o => o.value === suggestion.ca_kham && !o.disabled);
        if (hasSuggestedShift) shiftEl.value = suggestion.ca_kham;
    }
    if (symptomEl && suggestion.trieu_chung_tom_tat) {
        symptomEl.value = suggestion.trieu_chung_tom_tat;
    }
    if (user) {
        if (nameEl) nameEl.value = user.ho_ten || "";
        if (phoneEl) phoneEl.value = user.so_dien_thoai || "";
    }
}

function scrollAndHighlightBookingForm() {
    const win = document.getElementById("ai-chat-popup");
    if (win) win.classList.add("hidden");

    const bookingBox = document.getElementById("booking-box");
    if (bookingBox) {
        bookingBox.scrollIntoView({ behavior: "smooth", block: "center" });
        bookingBox.classList.add("ring-4", "ring-emerald-400", "transition-all");
        setTimeout(() => {
            bookingBox.classList.remove("ring-4", "ring-emerald-400");
        }, 3500);
    }
}

async function saveAppointmentToMySql(bookingPayload) {
    const res = await fetch(`${INDEX_API.LARAVEL_AUTH_URL}/book-appointment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(bookingPayload)
    });
    const data = await res.json();
    return {
        ok: res.ok && data.status === "success",
        ma_lich_hen: data.ma_lich_hen,
        message: data.message
    };
}

/**
 * Đặt lịch trực tiếp từ Phiếu đặt lịch gợi ý trong khung Chat AI
 */
async function confirmAiBookingDirectly(cardId) {
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) {
        showRequireLoginModal();
        return;
    }

    const todayStr = getTodayDateStr();
    const dept = document.getElementById(`ai-bk-dept-${cardId}`).value;
    const shift = document.getElementById(`ai-bk-shift-${cardId}`).value;
    const dateInput = document.getElementById(`ai-bk-date-${cardId}`);
    const date = dateInput.value;
    const symptom = document.getElementById(`ai-bk-symptom-${cardId}`).value;
    const nameInput = document.getElementById(`ai-bk-name-${cardId}`);
    const phoneInput = document.getElementById(`ai-bk-phone-${cardId}`);

    const hoTen = nameInput ? nameInput.value.trim() : (user.ho_ten || "");
    const soDienThoai = phoneInput ? phoneInput.value.trim() : (user.so_dien_thoai || "");

    if (!hoTen || !soDienThoai) {
        alert("⚠️ Vui lòng nhập Họ tên và Số điện thoại trong thẻ đặt lịch để xác nhận!");
        return;
    }

    if (!date || date < todayStr) {
        alert(`⚠️ Không thể đặt lịch vào ngày đã qua (${date})!`);
        dateInput.value = todayStr;
        return;
    }

    const bookingPayload = {
        ma_nguoi_dung: user.ma_nguoi_dung,
        ma_benh_nhan: user.ma_benh_nhan,
        ho_ten: hoTen,
        so_dien_thoai: soDienThoai,
        chuyen_khoa: dept,
        khung_gio_hen: shift,
        ngay_hen_kham: date,
        trieu_chung_ban_dau: symptom
    };

    try {
        const result = await saveAppointmentToMySql(bookingPayload);
        if (!result.ok) {
            alert("⚠️ " + (result.message || "Không thể lưu lịch hẹn vào MySQL!"));
            return;
        }

        const btnConfirm = document.getElementById(`btn-ai-confirm-${cardId}`);
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.className = "w-full py-2 rounded-lg bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-default";
            btnConfirm.innerHTML = `<span class="material-symbols-outlined text-sm">verified</span> Đã lưu Lịch hẹn #${result.ma_lich_hen}`;
        }

        loadUserNotifications();

        showBookingSuccessModal({
            ma_lich_hen: result.ma_lich_hen,
            ho_ten: hoTen,
            so_dien_thoai: soDienThoai,
            chuyen_khoa: dept,
            ten_bac_si: "Bác sĩ chuyên khoa theo ca trực",
            ngay_hen_kham: date,
            khung_gio_hen: shift,
            trieu_chung_ban_dau: symptom
        });
    } catch (e) {
        alert("⚠️ Không kết nối được tới Server Laravel (Cổng 8000) để lưu lịch hẹn!");
    }
}

/**
 * Xử lý khi nhấn nút "XÁC NHẬN ĐẶT LỊCH KHÁM" trên trang chủ (Theo đúng lịch trực của Bác sĩ)
 */
async function handleQuickBooking(event) {
    event.preventDefault();
    const user = getCurrentUser();

    if (!user || !user.ma_nguoi_dung) {
        showRequireLoginModal();
        return;
    }

    const deptSelect = document.getElementById("bk-department");
    const doctorSelect = document.getElementById("bk-doctor");
    const dateHidden = document.getElementById("bk-date");
    const shiftSelect = document.getElementById("bk-shift");

    const selectedDate = dateHidden ? dateHidden.value : "";
    const shiftVal = shiftSelect ? shiftSelect.value : "";

    if (!selectedDate || !shiftVal) {
        alert("⚠️ Vui lòng chọn ngày có lịch làm việc của Bác sĩ và khung giờ khám phù hợp!");
        return;
    }

    const selectedDeptOpt = deptSelect.options[deptSelect.selectedIndex];
    const selectedDocOpt = doctorSelect && doctorSelect.selectedIndex >= 0
        ? doctorSelect.options[doctorSelect.selectedIndex]
        : null;
    const selectedShiftOpt = shiftSelect && shiftSelect.selectedIndex >= 0
        ? shiftSelect.options[shiftSelect.selectedIndex]
        : null;

    const deptVal = deptSelect.value;
    const maKhoa = selectedDeptOpt ? (selectedDeptOpt.getAttribute("data-ma-khoa") || null) : null;
    const maLichLam = selectedShiftOpt ? (selectedShiftOpt.getAttribute("data-ma-lich-lam") || null) : null;

    const maNhanVienBs = (doctorSelect && doctorSelect.value && doctorSelect.value !== "ANY")
        ? doctorSelect.value
        : (selectedShiftOpt ? (selectedShiftOpt.getAttribute("data-ma-nhan-vien") || null) : null);

    const tenBacSi = (doctorSelect && doctorSelect.value === "ANY" && selectedShiftOpt && selectedShiftOpt.getAttribute("data-ten-bs"))
        ? selectedShiftOpt.getAttribute("data-ten-bs")
        : (selectedDocOpt
            ? (selectedDocOpt.getAttribute("data-ten-bs") || selectedDocOpt.text.replace(/^👨‍⚕️\s*/, ""))
            : "Bác sĩ chuyên khoa");

    const fullNameVal = document.getElementById("bk-fullname").value.trim().toUpperCase();
    const phoneVal = document.getElementById("bk-phone").value.trim();
    const symptomVal = document.getElementById("bk-symptom").value.trim() || "Khám lâm sàng theo lịch hẹn";

    const bookingPayload = {
        ma_nguoi_dung: user.ma_nguoi_dung,
        ma_benh_nhan: user.ma_benh_nhan,
        ma_khoa: maKhoa,
        chuyen_khoa: deptVal,
        ma_lich_lam: maLichLam,
        ma_nhan_vien: maNhanVienBs,
        ten_bac_si: tenBacSi,
        ho_ten: fullNameVal,
        so_dien_thoai: phoneVal,
        khung_gio_hen: shiftVal,
        ngay_hen_kham: selectedDate,
        trieu_chung_ban_dau: symptomVal
    };

    try {
        const result = await saveAppointmentToMySql(bookingPayload);
        if (!result.ok) {
            alert("⚠️ " + (result.message || "Không thể đặt lịch khám!"));
            return;
        }

        loadUserNotifications();

        showBookingSuccessModal({
            ma_lich_hen: result.ma_lich_hen,
            ho_ten: fullNameVal,
            so_dien_thoai: phoneVal,
            chuyen_khoa: deptVal,
            ten_bac_si: tenBacSi,
            ngay_hen_kham: selectedDate,
            khung_gio_hen: shiftVal,
            trieu_chung_ban_dau: symptomVal
        });

        event.target.reset();
        await onChangeBookingDepartment();
        renderHeaderAuthStatus();
    } catch (e) {
        alert("⚠️ Không kết nối được tới Server Laravel (Cổng 8000)!");
    }
}

// =========================================================================
// 4. HỆ THỐNG LỊCH SỬ CHAT AI ĐA PHIÊN
// =========================================================================
function getChatStorageConfig() {
    const user = getCurrentUser();
    if (user && user.ma_nguoi_dung) {
        return {
            storage: localStorage,
            key: `ai_sessions_user_${user.ma_nguoi_dung}`,
            isLogged: true,
            user: user
        };
    }
    return {
        storage: sessionStorage,
        key: "ai_sessions_guest_temp",
        isLogged: false,
        user: null
    };
}

async function initChatSessionsSystem() {
    const cfg = getChatStorageConfig();
    const badge = document.getElementById("ai-storage-mode-badge");
    if (badge) {
        if (cfg.isLogged) {
            badge.className = "text-[11px] text-emerald-400 flex items-center gap-1.5";
            badge.innerHTML = `<span class="material-symbols-outlined text-sm">cloud_done</span><span>Lưu MySQL: ${cfg.user.ho_ten}</span>`;
        } else {
            badge.className = "text-[11px] text-amber-300 flex items-center gap-1.5";
            badge.innerHTML = `<span class="material-symbols-outlined text-sm">hourglass_top</span><span>Khách: Tự xóa khi đóng tab</span>`;
        }
    }

    if (cfg.isLogged) {
        try {
            const res = await fetch(`${INDEX_API.LARAVEL_AUTH_URL}/ai-sessions/${cfg.user.ma_nguoi_dung}`, {
                headers: { "Accept": "application/json" }
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.sessions)) {
                chatSessions = data.sessions.map(s => ({
                    id: "session_" + (s.ma_phien_chat || Date.now()),
                    ma_phien_chat: s.ma_phien_chat || null,
                    title: s.tieu_de_cuoc_tro_chuyen || "Cuộc trò chuyện AI",
                    createdAt: s.thoi_gian_tao || "",
                    messages: (s.messages || []).map(m => ({
                        ma_tin_nhan: m.ma_tin_nhan || null,
                        nguoi_gui: m.nguoi_gui || "NguoiDung",
                        noi_dung: m.noi_dung_tin_nhan || m.noi_dung || "",
                        images: (m.images || []).map(img => typeof img === "string" ? img : (img.duong_dan_anh || "")),
                        booking_suggestion: m.booking_suggestion || null
                    }))
                }));
                cfg.storage.setItem(cfg.key, JSON.stringify(chatSessions));
            } else {
                chatSessions = [];
            }
        } catch (e) {
            const raw = cfg.storage.getItem(cfg.key);
            chatSessions = raw ? JSON.parse(raw) : [];
        }
    } else {
        const raw = cfg.storage.getItem(cfg.key);
        chatSessions = raw ? JSON.parse(raw) : [];
    }

    if (chatSessions.length === 0) {
        createNewSessionObject();
    } else {
        activeSessionId = chatSessions[0].id;
    }

    renderSessionSidebarList();
    renderActiveSessionMessages();
}

function createNewSessionObject() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) +
        " " + now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });

    const newSession = {
        id: "session_" + Date.now(),
        ma_phien_chat: null,
        title: "Cuộc trò chuyện mới",
        createdAt: timeStr,
        messages: []
    };

    chatSessions.unshift(newSession);
    activeSessionId = newSession.id;
    saveAllChatSessions();
    return newSession;
}

function startNewAiChatSession() {
    const current = chatSessions.find(s => s.id === activeSessionId);
    if (current && current.messages.length === 0) {
        document.getElementById("ai-chat-input").focus();
        return;
    }

    createNewSessionObject();
    renderSessionSidebarList();
    renderActiveSessionMessages();
    document.getElementById("ai-chat-input").focus();
}

function selectAiChatSession(sessionId) {
    activeSessionId = sessionId;
    renderSessionSidebarList();
    renderActiveSessionMessages();
}

async function deleteAiChatSession(sessionId, event) {
    event.stopPropagation();
    const target = chatSessions.find(s => s.id === sessionId);

    if (target && target.ma_phien_chat) {
        try {
            await fetch(`${INDEX_API.LARAVEL_AUTH_URL}/ai-sessions/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ ma_phien_chat: target.ma_phien_chat })
            });
        } catch (e) {}
    }

    chatSessions = chatSessions.filter(s => s.id !== sessionId);

    if (chatSessions.length === 0) {
        createNewSessionObject();
    } else if (activeSessionId === sessionId) {
        activeSessionId = chatSessions[0].id;
    }

    saveAllChatSessions();
    renderSessionSidebarList();
    renderActiveSessionMessages();
}

async function clearAllAiChatSessions() {
    if (!confirm("Bạn có chắc muốn xóa toàn bộ lịch sử các cuộc trò chuyện không?")) return;
    const cfg = getChatStorageConfig();

    if (cfg.isLogged) {
        for (const s of chatSessions) {
            if (s.ma_phien_chat) {
                try {
                    await fetch(`${INDEX_API.LARAVEL_AUTH_URL}/ai-sessions/delete`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Accept": "application/json" },
                        body: JSON.stringify({ ma_phien_chat: s.ma_phien_chat })
                    });
                } catch (e) {}
            }
        }
    }

    chatSessions = [];
    createNewSessionObject();
    renderSessionSidebarList();
    renderActiveSessionMessages();
}

function saveAllChatSessions() {
    const cfg = getChatStorageConfig();
    cfg.storage.setItem(cfg.key, JSON.stringify(chatSessions));
}

async function syncMessageToMySql(sessionObj, sender, content, images = []) {
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) return;

    try {
        const res = await fetch(`${INDEX_API.LARAVEL_AUTH_URL}/ai-sessions/save-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ma_nguoi_dung: user.ma_nguoi_dung,
                ma_phien_chat: sessionObj.ma_phien_chat || null,
                tieu_de_cuoc_tro_chuyen: sessionObj.title,
                nguoi_gui: sender,
                noi_dung_tin_nhan: content,
                images: images
            })
        });
        const data = await res.json();
        if (res.ok && data.ma_phien_chat) {
            sessionObj.ma_phien_chat = data.ma_phien_chat;
            saveAllChatSessions();
        }
    } catch (err) {
        console.error("Không thể đồng bộ tin nhắn AI vào MySQL:", err);
    }
}

function renderSessionSidebarList() {
    const listEl = document.getElementById("ai-session-list");
    const countEl = document.getElementById("ai-session-count");
    if (!listEl) return;

    if (countEl) countEl.textContent = chatSessions.length;

    listEl.innerHTML = chatSessions.map(session => {
        const isActive = session.id === activeSessionId;
        return `
            <div onclick="selectAiChatSession('${session.id}')"
                 class="group px-3 py-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition ${
                     isActive
                         ? "bg-teal-600 text-white font-semibold shadow-sm"
                         : "bg-white/80 text-slate-700 hover:bg-teal-50 hover:text-teal-800 border border-teal-100/80"
                 }">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-sm shrink-0 ${isActive ? 'text-white' : 'text-teal-600'}">chat_bubble</span>
                        <p class="truncate text-xs font-semibold">${session.title}</p>
                    </div>
                    <span class="text-[10px] ${isActive ? "text-teal-100" : "text-slate-500"} block pl-5 mt-0.5">
                        ${session.createdAt} • ${session.messages.length} tin nhắn
                    </span>
                </div>
                <button type="button" onclick="deleteAiChatSession('${session.id}', event)"
                        class="opacity-75 group-hover:opacity-100 ${isActive ? 'text-white hover:text-rose-200' : 'text-slate-400 hover:text-rose-600'} p-1 rounded transition shrink-0"
                        title="Xóa cuộc trò chuyện này">
                    <span class="material-symbols-outlined text-sm">delete</span>
                </button>
            </div>
        `;
    }).join("");
}

function buildLocalMedicalTriageFallback(userMessage, hasImages = false) {
    const msg = (userMessage || "").toLowerCase().trim();
    const todayStr = getTodayDateStr();

    const cleanGreeting = msg.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, "").trim();
    const greetings = ["xin chào", "chào", "chào bạn", "chào bác sĩ", "hi", "hello", "alo", "bác sĩ ơi"];
    if (greetings.includes(cleanGreeting) && !hasImages) {
        return {
            reply: "Xin chào bạn! 👋 Tôi là **Bác sĩ Trợ lý AI** của **Trung tâm Y tế Phường Hải Châu**.\n\nHiện tại bạn đang gặp triệu chứng gì (ví dụ: *đau rát họng, sốt, đau đầu, chóng mặt, đau nhức xương khớp...*) hoặc cần tư vấn thủ tục khám BHYT? Hãy mô tả hoặc gửi kèm hình ảnh để tôi tư vấn đúng Khoa/Phòng cho bạn nhé!",
            booking_suggestion: null
        };
    }

    let dept = "Khoa Nội Tổng Quát (P102)";
    let price = "50.000đ";
    let analysis = "Triệu chứng nội khoa tổng quát, cần kiểm tra sinh hiệu (mạch, huyết áp, nhiệt độ) tại Phòng P101 và khám lâm sàng tại Phòng P102.";

    if (msg.includes("cấp cứu") || msg.includes("ngất") || msg.includes("khó thở") || msg.includes("đau ngực dữ dội")) {
        dept = "Khoa Cấp Cứu - Hồi Sức Tích Cực (P114)";
        price = "70.000đ";
        analysis = "Dấu hiệu cảnh báo cần xử trí khẩn cấp. Khuyến nghị đến ngay Phòng Cấp Cứu P114 (trực 24/7).";
    } else if (msg.includes("tay") || msg.includes("chân") || msg.includes("khớp") || msg.includes("xương") || msg.includes("lưng") || msg.includes("gối") || msg.includes("cổ tay") || msg.includes("sưng") || msg.includes("tê bì") || msg.includes("gout")) {
        dept = "Khoa Cơ - Xương - Khớp (P106)";
        price = "55.000đ";
        analysis = "Tình trạng sưng đau vùng cơ xương khớp / vận động. Bác sĩ khuyến nghị khám chuyên khoa Cơ - Xương - Khớp (Phòng P106) và có thể kết hợp chụp X-Quang kiểm tra tổn thương khớp.";
    } else if (msg.includes("họng") || msg.includes("ho") || msg.includes("tai") || msg.includes("mũi") || msg.includes("xoang") || msg.includes("amidan") || msg.includes("đờm") || msg.includes("sốt")) {
        dept = "Khoa Tai - Mũi - Họng (P103)";
        price = "55.000đ";
        analysis = "Triệu chứng viêm đường hô hấp trên / Tai - Mũi - Họng. Bác sĩ khuyến nghị khám nội soi tại Phòng P103.";
    } else if (msg.includes("răng") || msg.includes("nướu") || msg.includes("lợi")) {
        dept = "Khoa Răng - Hàm - Mặt (P111)";
        price = "55.000đ";
        analysis = "Triệu chứng bệnh lý răng miệng, khuyến nghị khám tại Phòng Răng - Hàm - Mặt (P111).";
    } else if (msg.includes("mắt") || msg.includes("nhìn mờ") || msg.includes("đỏ mắt")) {
        dept = "Khoa Mắt (P112)";
        price = "55.000đ";
        analysis = "Triệu chứng nhãn khoa, khuyến nghị kiểm tra thị lực và khám tại Khoa Mắt (P112).";
    } else if (msg.includes("thai") || msg.includes("phụ khoa") || msg.includes("kinh nguyệt")) {
        dept = "Khoa Phụ Sản & KHHGĐ (P109)";
        price = "55.000đ";
        analysis = "Khuyến nghị khám chuyên khoa Phụ Sản & Siêu âm sản phụ khoa tại Phòng P109.";
    } else if (msg.includes("trẻ em") || msg.includes("bé ") || msg.includes("em bé")) {
        dept = "Khoa Nhi (P110)";
        price = "50.000đ";
        analysis = "Khuyến nghị đưa trẻ khám chuyên khoa Nhi tại Phòng P110.";
    } else if (msg.includes("ngứa da") || msg.includes("mẩn đỏ") || msg.includes("nấm da") || msg.includes("dị ứng da")) {
        dept = "Khoa Da Liễu & Truyền Nhiễm (P113)";
        price = "50.000đ";
        analysis = "Triệu chứng da liễu, khuyến nghị khám chuyên khoa Da Liễu & Truyền Nhiễm tại Phòng P113.";
    } else if (msg.includes("siêu âm") || msg.includes("x-quang") || msg.includes("xét nghiệm") || msg.includes("chụp") || msg.includes("mri") || msg.includes("ct")) {
        dept = "Khoa Cận Lâm Sàng (P201)";
        price = "50.000đ + Phí dịch vụ CLS";
        analysis = "Thực hiện kỹ thuật Xét nghiệm, Siêu âm, X-Quang, CT hoặc MRI tại khu Cận lâm sàng (P201–P206).";
    }

    const wantsBooking = ["đặt lịch", "đặt hẹn", "đăng ký khám", "đặt cho tôi", "lập phiếu"].some(k => msg.includes(k));

    const reply =
        `🩺 **Đánh giá sơ bộ từ Bác sĩ Trợ lý AI:**\n` +
        `- **Triệu chứng ghi nhận:** ${userMessage || "Hình ảnh triệu chứng lâm sàng"}${hasImages ? " (Đã phân tích hình ảnh đính kèm)" : ""}.\n` +
        `- **Nhận định chuyên môn:** ${analysis}\n` +
        `- **Chỉ định phân luồng:** **${dept}** (Giá khám niêm yết: **${price}**, BHYT hỗ trợ 80%).\n\n` +
        (wantsBooking
            ? `📋 Tôi đã tự động điền sẵn **Phiếu Đặt Lịch Khám** bên dưới cho bạn. Bạn chỉ cần bấm nút **"Xác nhận đặt lịch ngay"** để lưu vào hệ thống!`
            : `👉 Nếu bạn muốn đặt lịch khám ngay, hãy nhắn **"Hãy đặt lịch cho tôi"** nhé!`);

    return {
        reply: reply,
        booking_suggestion: wantsBooking ? {
            chuyen_khoa: dept,
            ca_kham: "Ca Sáng (07:00 - 11:30)",
            ngay_hen: todayStr,
            trieu_chung_tom_tat: userMessage || "Khám theo tư vấn phân luồng của AI"
        } : null
    };
}

function escapeSafeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
}

function formatAiMarkdownText(text) {
    if (!text) return "";
    return escapeSafeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-teal-900">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic text-slate-600">$1</em>');
}

function renderActiveSessionMessages() {
    const box = document.getElementById("ai-chat-messages");
    const titleEl = document.getElementById("ai-current-session-title");
    if (!box) return;

    const currentSession = chatSessions.find(s => s.id === activeSessionId);
    if (titleEl && currentSession) {
        titleEl.textContent = currentSession.title;
    }

    box.innerHTML = `
        <div class="flex items-start gap-2.5">
            <div class="w-7 h-7 rounded-full bg-teal-600/15 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-base">smart_toy</span>
            </div>
            <div class="bg-white p-3 rounded-xl rounded-tl-none shadow-sm border border-slate-200 text-sm text-slate-700 max-w-[88%]">
                Xin chào! Tôi là Bác sĩ Trợ lý AI của <b>TTYT Phường Hải Châu</b>.<br>
                Hãy mô tả triệu chứng hoặc gửi <b>📷 nhiều ảnh triệu chứng</b>. Khi cần đặt lịch, hãy nhắn <b>"Hãy đặt lịch cho tôi"</b> để tôi tự động điền phiếu khám nhé!
            </div>
        </div>
    `;

    if (!currentSession) return;

    currentSession.messages.forEach((msg, idx) => {
        if (msg.nguoi_gui === "NguoiDung") {
            renderUserBubbleDOM(msg.noi_dung, msg.images || []);
        } else {
            renderAiBubbleDOM(msg.noi_dung, msg.booking_suggestion || null, idx);
        }
    });
}

function toggleAiHistorySidebar() {
    const sidebar = document.getElementById("ai-history-sidebar");
    if (sidebar) sidebar.classList.toggle("hidden");
}

function toggleAiChatPopup() {
    const win = document.getElementById("ai-chat-popup");
    win.classList.toggle("hidden");
    if (!win.classList.contains("hidden")) {
        document.getElementById("ai-chat-input").focus();
    }
}

function quickAskSymptom(text) {
    const input = document.getElementById("ai-chat-input");
    input.value = text;
    sendSymptomChatToAi(new Event("submit"));
}

// =========================================================================
// 5. CHỌN NHIỀU ẢNH TRIỆU CHỨNG & GỬI LÊN SERVER AI (FASTAPI 8001)
// =========================================================================
function onSelectSymptomImages(event) {
    const files = Array.from(event.target.files);
    symptomImageFiles = symptomImageFiles.concat(files);
    renderSymptomPreviewStrip();
}

function removeSelectedSymptomImage(index) {
    symptomImageFiles.splice(index, 1);
    renderSymptomPreviewStrip();
}

function renderSymptomPreviewStrip() {
    const strip = document.getElementById("ai-image-preview-strip");
    if (!strip) return;
    strip.innerHTML = "";
    if (symptomImageFiles.length === 0) {
        strip.classList.add("hidden");
        return;
    }
    strip.classList.remove("hidden");
    symptomImageFiles.forEach((file, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "relative shrink-0";
        wrap.innerHTML = `
            <img src="${URL.createObjectURL(file)}" class="w-14 h-14 object-cover rounded-lg border-2 border-teal-600"/>
            <button type="button" onclick="removeSelectedSymptomImage(${idx})" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center shadow">×</button>
        `;
        strip.appendChild(wrap);
    });
}

function fileToDataUrl(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

async function sendSymptomChatToAi(event) {
    if (event && event.preventDefault) event.preventDefault();
    const input = document.getElementById("ai-chat-input");
    const message = input.value.trim();

    if (!message && symptomImageFiles.length === 0) return;

    let currentSession = chatSessions.find(s => s.id === activeSessionId);
    if (!currentSession) {
        currentSession = createNewSessionObject();
    }

    const savedImageUrls = await Promise.all(symptomImageFiles.map(f => fileToDataUrl(f)));
    const displayMessage = message || `(Đã gửi ${savedImageUrls.length} ảnh triệu chứng)`;

    if (currentSession.messages.length === 0) {
        currentSession.title = displayMessage.length > 28
            ? displayMessage.substring(0, 28) + "..."
            : displayMessage;
    }

    currentSession.messages.push({
        nguoi_gui: "NguoiDung",
        noi_dung: displayMessage,
        images: savedImageUrls
    });
    saveAllChatSessions();
    renderSessionSidebarList();
    renderUserBubbleDOM(displayMessage, savedImageUrls);

    await syncMessageToMySql(currentSession, "NguoiDung", displayMessage, savedImageUrls);

    const formData = new FormData();
    formData.append("message", message || "Hãy phân tích các hình ảnh triệu chứng này giúp tôi");
    formData.append(
        "history_json",
        JSON.stringify(currentSession.messages.map(m => ({ nguoi_gui: m.nguoi_gui, noi_dung: m.noi_dung })))
    );
    symptomImageFiles.forEach(file => {
        formData.append("symptom_images", file);
    });

    const hadImages = symptomImageFiles.length > 0;
    input.value = "";
    symptomImageFiles = [];
    document.getElementById("ai-symptom-file-input").value = "";
    renderSymptomPreviewStrip();

    const loadingId = renderAiLoadingBubble();

    let aiResponseData = null;
    try {
        const res = await fetch(INDEX_API.FASTAPI_CHAT_URL, {
            method: "POST",
            body: formData
        });
        if (res.ok) {
            aiResponseData = await res.json();
        } else {
            aiResponseData = buildLocalMedicalTriageFallback(message, hadImages);
        }
    } catch (networkOrCorsError) {
        aiResponseData = buildLocalMedicalTriageFallback(message, hadImages);
    }

    removeBubbleById(loadingId);

    if (aiResponseData && aiResponseData.booking_suggestion) {
        await autoFillHomepageBookingForm(aiResponseData.booking_suggestion);
    }

    const replyText = (aiResponseData && aiResponseData.reply) ? aiResponseData.reply : "Đã phân tích triệu chứng.";
    const suggestionObj = (aiResponseData && aiResponseData.booking_suggestion) ? aiResponseData.booking_suggestion : null;

    const msgIndex = currentSession.messages.length;
    renderAiBubbleDOM(replyText, suggestionObj, msgIndex);

    currentSession.messages.push({
        nguoi_gui: "AI",
        noi_dung: replyText,
        booking_suggestion: suggestionObj,
        images: []
    });
    saveAllChatSessions();
    renderSessionSidebarList();

    await syncMessageToMySql(currentSession, "AI", replyText, []);
}

function renderUserBubbleDOM(text, imgUrls = []) {
    const box = document.getElementById("ai-chat-messages");
    const div = document.createElement("div");
    div.className = "flex flex-col items-end gap-1.5";
    let imgsHtml = "";
    if (imgUrls && imgUrls.length > 0) {
        imgsHtml = `<div class="flex gap-1.5 flex-wrap justify-end">` +
            imgUrls.map(u => `<img src="${u}" class="w-16 h-16 object-cover rounded-lg border-2 border-teal-600 shadow-sm">`).join("") +
            `</div>`;
    }
    div.innerHTML = `
        ${imgsHtml}
        <div class="bg-teal-600 text-white px-3.5 py-2.5 rounded-xl rounded-tr-none text-sm max-w-[85%] whitespace-pre-wrap shadow-sm">${escapeSafeHtml(text)}</div>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function renderAiLoadingBubble() {
    const box = document.getElementById("ai-chat-messages");
    const id = "ai-wait-" + Date.now();
    const div = document.createElement("div");
    div.id = id;
    div.className = "flex items-start gap-2";
    div.innerHTML = `
        <div class="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 flex items-center gap-2 shadow-sm">
            <span class="w-2.5 h-2.5 rounded-full bg-teal-600 animate-ping"></span>
            <span>Bác sĩ AI đang phân tích triệu chứng...</span>
        </div>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return id;
}

function removeBubbleById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderAiBubbleDOM(replyText, bookingSuggestion = null, cardIndex = Date.now()) {
    const box = document.getElementById("ai-chat-messages");
    const user = getCurrentUser();
    const todayStr = getTodayDateStr();
    const div = document.createElement("div");
    div.className = "flex items-start gap-2.5";

    let bookingCardHtml = "";
    if (bookingSuggestion && bookingSuggestion.chuyen_khoa) {
        const defaultName = user ? (user.ho_ten || "") : "";
        const defaultPhone = user ? (user.so_dien_thoai || "") : "";
        const validSuggestedDate = (bookingSuggestion.ngay_hen && bookingSuggestion.ngay_hen >= todayStr)
            ? bookingSuggestion.ngay_hen
            : todayStr;

        bookingCardHtml = `
            <div class="mt-3 p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-300 text-slate-800 space-y-2.5">
                <div class="flex items-center justify-between border-b border-emerald-200 pb-2">
                    <span class="font-bold text-xs text-emerald-900 flex items-center gap-1">
                        <span class="material-symbols-outlined text-base text-emerald-700">assignment_turned_in</span>
                        PHIẾU ĐẶT LỊCH KHÁM ĐÃ ĐIỀN SẴN BỞI AI
                    </span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">Chỉ cần xác nhận</span>
                </div>

                <div class="grid grid-cols-1 gap-2 text-xs">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Họ tên bệnh nhân *</label>
                            <input id="ai-bk-name-${cardIndex}" type="text" value="${escapeSafeHtml(defaultName)}" placeholder="Nhập họ tên..." class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white font-semibold"/>
                        </div>
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Số điện thoại *</label>
                            <input id="ai-bk-phone-${cardIndex}" type="tel" value="${escapeSafeHtml(defaultPhone)}" placeholder="Nhập SĐT..." class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white font-semibold"/>
                        </div>
                    </div>

                    <div>
                        <label class="text-[11px] font-semibold text-slate-600 block">Chuyên khoa AI chỉ định</label>
                        <input id="ai-bk-dept-${cardIndex}" type="text" value="${escapeSafeHtml(bookingSuggestion.chuyen_khoa)}" readonly class="w-full h-8 px-2 rounded border-emerald-300 bg-emerald-100/60 text-emerald-900 font-bold text-xs"/>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Ca khám</label>
                            <input id="ai-bk-shift-${cardIndex}" type="text" value="${escapeSafeHtml(bookingSuggestion.ca_kham || "Ca Sáng (07:00 - 11:30)")}" class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white"/>
                        </div>
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Ngày hẹn khám *</label>
                            <input id="ai-bk-date-${cardIndex}" type="date" min="${todayStr}" value="${validSuggestedDate}" class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white"/>
                        </div>
                    </div>

                    <div>
                        <label class="text-[11px] font-semibold text-slate-600 block">Tóm tắt triệu chứng gửi Bác sĩ</label>
                        <input id="ai-bk-symptom-${cardIndex}" type="text" value="${escapeSafeHtml(bookingSuggestion.trieu_chung_tom_tat || "")}" class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white"/>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row gap-2 pt-1">
                    <button id="btn-ai-confirm-${cardIndex}" type="button" onclick="confirmAiBookingDirectly('${cardIndex}')" class="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow flex items-center justify-center gap-1 transition">
                        <span class="material-symbols-outlined text-sm">check_circle</span>
                        <span>Xác nhận đặt lịch ngay</span>
                    </button>
                    <button type="button" onclick="scrollAndHighlightBookingForm()" class="py-2 px-3 rounded-lg bg-white hover:bg-slate-100 text-teal-700 border border-teal-600/40 font-bold text-xs flex items-center justify-center gap-1 transition">
                        <span class="material-symbols-outlined text-sm">open_in_new</span>
                        <span>Xem trên biểu mẫu</span>
                    </button>
                </div>
            </div>
        `;
    }

    div.innerHTML = `
        <div class="w-7 h-7 rounded-full bg-teal-600/15 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
            <span class="material-symbols-outlined text-base">smart_toy</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl rounded-tl-none shadow-sm border border-slate-200 text-sm text-slate-800 max-w-[90%] leading-relaxed">
            <div class="whitespace-pre-wrap">${formatAiMarkdownText(replyText)}</div>
            ${bookingCardHtml}
        </div>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function filterDoctorsByDept(deptCode) {
    document.querySelectorAll(".doctor-item-card").forEach(card => {
        if (deptCode === "ALL" || card.dataset.dept === deptCode) card.classList.remove("hidden");
        else card.classList.add("hidden");
    });
}

// =========================================================================
// 6. BỘ ĐIỀU KHIỂN SLIDER 3 ẢNH BANNER (ANH1.PNG, ANH2.PNG, ANH3.PNG) TỰ ĐỘNG CHUYỂN
// =========================================================================
let currentHeroSlideIndex = 0;
let heroSlideInterval = null;
const HERO_SLIDE_DELAY_MS = 4000;

function initHeroBannerSlider() {
    const slides = document.querySelectorAll("#hero-banner-slider .hero-slide");
    if (!slides || slides.length === 0) return;

    showHeroBannerSlide(0);
    startHeroBannerAutoPlay();

    const sliderBox = document.getElementById("hero-banner-slider")?.parentElement;
    if (sliderBox) {
        sliderBox.addEventListener("mouseenter", stopHeroBannerAutoPlay);
        sliderBox.addEventListener("mouseleave", startHeroBannerAutoPlay);
    }
}

function showHeroBannerSlide(index) {
    const slides = document.querySelectorAll("#hero-banner-slider .hero-slide");
    const dots = document.querySelectorAll(".hero-slide-dot");
    if (!slides || slides.length === 0) return;

    currentHeroSlideIndex = (index + slides.length) % slides.length;

    slides.forEach((slide, idx) => {
        if (idx === currentHeroSlideIndex) {
            slide.classList.remove("opacity-0", "pointer-events-none", "z-0");
            slide.classList.add("opacity-100", "z-10");
        } else {
            slide.classList.remove("opacity-100", "z-10");
            slide.classList.add("opacity-0", "pointer-events-none", "z-0");
        }
    });

    dots.forEach((dot, idx) => {
        if (idx === currentHeroSlideIndex) {
            dot.className = "hero-slide-dot w-7 h-2.5 rounded-full bg-white shadow transition-all";
        } else {
            dot.className = "hero-slide-dot w-2.5 h-2.5 rounded-full bg-white/50 hover:bg-white/80 transition-all";
        }
    });
}

function nextHeroBannerSlide() {
    showHeroBannerSlide(currentHeroSlideIndex + 1);
    restartHeroBannerAutoPlay();
}

function prevHeroBannerSlide() {
    showHeroBannerSlide(currentHeroSlideIndex - 1);
    restartHeroBannerAutoPlay();
}

function goToHeroBannerSlide(index) {
    showHeroBannerSlide(index);
    restartHeroBannerAutoPlay();
}

function startHeroBannerAutoPlay() {
    stopHeroBannerAutoPlay();
    heroSlideInterval = setInterval(() => {
        showHeroBannerSlide(currentHeroSlideIndex + 1);
    }, HERO_SLIDE_DELAY_MS);
}

function stopHeroBannerAutoPlay() {
    if (heroSlideInterval) {
        clearInterval(heroSlideInterval);
        heroSlideInterval = null;
    }
}

function restartHeroBannerAutoPlay() {
    stopHeroBannerAutoPlay();
    startHeroBannerAutoPlay();
}

// =========================================================================
// 7. HỆ THỐNG THÔNG BÁO RÚT GỌN & HỘP THOẠI XEM CHI TIẾT (THONG_BAO)
// =========================================================================
function formatRelativeNotificationTime(dateStr) {
    if (!dateStr) return "";
    const parsed = new Date(String(dateStr).replace(" ", "T"));
    if (isNaN(parsed.getTime())) return String(dateStr).substring(0, 10);

    const diffSec = Math.floor((Date.now() - parsed.getTime()) / 1000);
    if (diffSec < 60) return "Vừa xong";

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} giờ`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay} ngày`;

    const d = String(parsed.getDate()).padStart(2, "0");
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
}

function initUserNotificationBell() {
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) return;

    const userMenuBox = document.getElementById("header-user-dropdown-wrapper") || document.getElementById("header-user-menu");
    if (userMenuBox && !document.getElementById("header-notif-wrapper")) {
        if (userMenuBox.parentElement) {
            userMenuBox.parentElement.classList.add("flex", "items-center", "gap-2");
        }

        const notifWrapper = document.createElement("div");
        notifWrapper.id = "header-notif-wrapper";
        notifWrapper.className = "relative inline-block";
        notifWrapper.innerHTML = `
            <button type="button" onclick="toggleNotificationDropdown(event)"
                    class="h-10 px-3.5 rounded-full bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center gap-1.5 relative transition shadow-2xs"
                    title="Xem thông báo">
                <span>Thông báo</span>
                <span id="header-notif-badge"
                      class="hidden min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white font-extrabold text-[10px] flex items-center justify-center">
                    0
                </span>
            </button>

            <div id="header-notif-dropdown"
                 class="hidden absolute right-0 mt-2 w-80 sm:w-[360px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
                    <h4 class="font-heading font-extrabold text-base text-slate-900">Thông báo</h4>
                    <span class="text-[11px] font-semibold text-slate-400">Bấm để xem chi tiết</span>
                </div>

                <div id="header-notif-list" class="max-h-[380px] overflow-y-auto p-1.5 space-y-0.5 bg-white">
                    <div class="p-6 text-center text-xs text-slate-400">Đang tải thông báo...</div>
                </div>
            </div>
        `;
        userMenuBox.parentElement.insertBefore(notifWrapper, userMenuBox);
    }

    ensureNotificationDetailModalDOM();
    loadUserNotifications();
}

function toggleNotificationDropdown(event) {
    if (event) event.stopPropagation();
    const drop = document.getElementById("header-notif-dropdown");
    if (!drop) return;
    drop.classList.toggle("hidden");
    if (!drop.classList.contains("hidden")) {
        loadUserNotifications();
    }
}

async function loadUserNotifications() {
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) return;

    try {
        const res = await fetch(`${NOTIFICATION_API_BASE}/user/${encodeURIComponent(user.ma_nguoi_dung)}`, {
            headers: { "Accept": "application/json" }
        });
        const data = await res.json();
        if (!res.ok || data.status !== "success") return;

        const badge = document.getElementById("header-notif-badge");
        const listBox = document.getElementById("header-notif-list");
        const list = data.notifications || [];
        cachedUserNotifications = list;

        if (badge) {
            if (list.length > 0) {
                badge.textContent = list.length;
                badge.classList.remove("hidden");
            } else {
                badge.classList.add("hidden");
            }
        }

        if (!listBox) return;
        if (list.length === 0) {
            listBox.innerHTML = `
                <div class="p-6 text-center text-xs text-slate-400">
                    Hiện chưa có thông báo nào.
                </div>
            `;
            return;
        }

        listBox.innerHTML = list.map((n, index) => {
            const isPromo = n.loai_thong_bao === "UuDai";
            const prefix = isPromo ? "Ưu đãi y tế:" : "Nhắc lịch hẹn:";
            const relTime = formatRelativeNotificationTime(n.ngay_tao);

            return `
                <button type="button" onclick="openNotificationDetailModal(${index})"
                        class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100/90 flex items-center gap-3 transition">
                    <img src="../img/logo3.jpg" alt="TTYT Phường Hải Châu"
                         class="w-12 h-12 rounded-full object-contain bg-white border border-slate-200 p-1 shrink-0"/>
                    <div class="flex-1 min-w-0">
                        <p class="text-[13px] text-slate-700 leading-snug line-clamp-2">
                            <span class="font-bold text-slate-900">${prefix}</span>
                            ${escapeSafeHtml(n.tieu_de)}
                        </p>
                        <span class="text-[11px] font-medium text-slate-500 mt-1 block">${relTime}</span>
                    </div>
                </button>
            `;
        }).join("");
    } catch (e) {
        console.error("Lỗi tải thông báo:", e);
    }
}

function ensureNotificationDetailModalDOM() {
    if (document.getElementById("user-notification-detail-modal")) return;

    const modal = document.createElement("div");
    modal.id = "user-notification-detail-modal";
    modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm hidden items-center justify-center p-4";
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeNotificationDetailModal();
    });

    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-[fadeIn_0.18s_ease-out]">
            <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div class="flex items-center gap-2">
                    <span id="ndm-type-badge" class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800">Thông báo</span>
                    <span id="ndm-code" class="text-xs font-mono font-bold text-slate-500"></span>
                </div>
                <button type="button" onclick="closeNotificationDetailModal()"
                        class="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-500 font-bold text-lg flex items-center justify-center transition">
                    ×
                </button>
            </div>

            <div class="p-6 space-y-4 text-sm">
                <div>
                    <h3 id="ndm-title" class="font-heading font-extrabold text-base sm:text-lg text-slate-900 leading-snug"></h3>
                    <p id="ndm-time" class="text-xs text-slate-500 mt-1"></p>
                </div>

                <div id="ndm-content"
                     class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm whitespace-pre-line leading-relaxed">
                </div>

                <div id="ndm-email-note" class="text-xs font-semibold text-teal-700"></div>

                <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                    <a id="ndm-appointments-link" href="account.html?tab=appointments"
                       class="hidden px-4 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs transition">
                        Xem lịch đã đặt
                    </a>
                    <button type="button" onclick="closeNotificationDetailModal()"
                            class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition">
                        Đóng lại
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openNotificationDetailModal(index) {
    const item = cachedUserNotifications[index];
    if (!item) return;

    const drop = document.getElementById("header-notif-dropdown");
    if (drop) drop.classList.add("hidden");

    ensureNotificationDetailModalDOM();

    const user = getCurrentUser();
    const isPromo = item.loai_thong_bao === "UuDai";

    const badgeEl = document.getElementById("ndm-type-badge");
    badgeEl.textContent = isPromo ? "Ưu đãi y tế" : "Nhắc lịch hẹn";
    badgeEl.className = isPromo
        ? "px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800"
        : "px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800";

    document.getElementById("ndm-code").textContent = item.ma_thong_bao ? `#${item.ma_thong_bao}` : "";
    document.getElementById("ndm-title").textContent = item.tieu_de || "Thông báo từ Trung tâm Y tế";
    document.getElementById("ndm-time").textContent = item.ngay_tao
        ? `Thời gian: ${item.ngay_tao} (${formatRelativeNotificationTime(item.ngay_tao)})`
        : "";
    document.getElementById("ndm-content").textContent = item.noi_dung || "";
    document.getElementById("ndm-email-note").textContent = user && user.email
        ? `Đã đồng bộ gửi về Gmail: ${user.email}`
        : "Đã đồng bộ qua Gmail người dùng";

    const appLink = document.getElementById("ndm-appointments-link");
    if (appLink) {
        if (!isPromo) appLink.classList.remove("hidden");
        else appLink.classList.add("hidden");
    }

    const modal = document.getElementById("user-notification-detail-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeNotificationDetailModal() {
    const modal = document.getElementById("user-notification-detail-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}