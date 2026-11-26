// =========================================================================
// MODULE BẢNG ĐIỀU PHỐI LỊCH LÀM VIỆC & KIỂM SOÁT QUYỀN THEO CA TRỰC / VAI TRÒ
// (Dùng chung cho 4 cổng: Nhân viên y tế, Bác sĩ, Kế toán, Dược sĩ)
// =========================================================================
(function () {
    const WEEKLY_BOARD_API_URL = "http://127.0.0.1:8000/api/schedules/weekly-board";

    // true  = Chỉ mở khóa khi đang nằm trong ĐÚNG khung giờ ca trực (Sáng 07:00-11:30 | Chiều 13:00-16:30 | Đêm 16:30-07:00)
    // false = Mở khóa cả ngày miễn là nhân sự có lịch trực trong ngày hôm nay
    const CHECK_EXACT_SHIFT_TIME = true;

    let cachedBoardData = null;
    let scheduleWeekOffset = 0;
    let scheduleViewMode = "ALL"; // 'ALL' | 'MINE'
    let selectedRosterDate = null;
    let selectedRosterShift = "Sang";
    let hasAppliedInitialAccessRoute = false;

    let currentAccessState = {
        checked: false,
        hasActiveShift: false,
        activeShift: null,
        nextShift: null,
        allowedNvytModule: null, // 'reception' | 'vitals' | 'cls' | null
        allowedNvytLabel: ""
    };

    function getLoggedUser() {
        try {
            const raw = localStorage.getItem("current_user");
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function formatYmd(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, "0");
        const d = String(dateObj.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    function formatDm(dateObj) {
        const d = String(dateObj.getDate()).padStart(2, "0");
        const m = String(dateObj.getMonth() + 1).padStart(2, "0");
        return `${d}/${m}`;
    }

    function getBaseWeekMonday() {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday + (scheduleWeekOffset * 7));
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    function normalizeShiftCode(ca) {
        if (ca === "Toi") return "Chieu";
        return ca || "Sang";
    }

    function getShiftDisplayName(ca) {
        const code = normalizeShiftCode(ca);
        if (code === "Sang") return "Ca Sáng (07:00 - 11:30)";
        if (code === "Chieu") return "Ca Chiều (13:00 - 16:30)";
        if (code === "Dem") return "Ca Đêm (16:30 - 07:00)";
        return code;
    }

    function cleanStaffDisplayName(rawName) {
        if (!rawName) return "Nhân sự";
        return String(rawName)
            .replace(/\(Lái xe CC\)/gi, "(Tiếp đón)")
            .replace(/Lái xe CC/gi, "Tiếp đón")
            .replace(/^Đ\/c\s+/i, "LT. ");
    }

    function compactStaffName(rawName) {
        return cleanStaffDisplayName(rawName)
            .replace(/\s*\(.*?\)/g, "")
            .replace(/BS\.CKII\s+/i, "BS. ")
            .replace(/BS\.CKI\s+/i, "BS. ")
            .replace(/ThS\.BS\s+/i, "BS. ")
            .trim();
    }

    function getStaffPositionCode(staffRecord) {
        const role = staffRecord.vai_tro || "";
        const chucVu = staffRecord.chuc_vu || "";
        const soPhong = staffRecord.so_phong || "";
        const name = cleanStaffDisplayName(staffRecord.ten_nhan_su || staffRecord.ho_ten || "").toUpperCase();

        if (role === "BacSi" || chucVu === "BacSi" || name.startsWith("BS.") || name.startsWith("THS.BS")) {
            return "BacSi";
        }
        if (role === "DuocSi" || chucVu === "DuocSi" || name.startsWith("DS.")) {
            return "DuocSi";
        }
        if (chucVu === "KTV_CLS" || name.startsWith("KTV.") || name.includes("NHÂN VIÊN CLS") || ["P201", "P202", "P203", "P204", "P205", "P206"].includes(soPhong)) {
            return "KTV";
        }
        if (role === "KeToan" || chucVu === "KeToan" || name.startsWith("KT.") || name.includes("KẾ TOÁN")) {
            return "KeToan";
        }
        if (chucVu === "TiepDon" || chucVu === "TiepNhan" || name.startsWith("LT.") || name.includes("TIẾP NHẬN") || (name.includes("TIẾP ĐÓN") && !name.includes("SÀNG LỌC"))) {
            return "TiepDon";
        }
        return "DieuDuong";
    }

    function getPositionLabel(posCode) {
        const map = {
            BacSi: "Bác sĩ khám",
            DieuDuong: "Điều dưỡng Đo sinh hiệu",
            KTV: "Kỹ thuật viên CLS",
            DuocSi: "Dược sĩ",
            TiepDon: "Nhân viên Tiếp nhận",
            KeToan: "Kế toán thu ngân"
        };
        return map[posCode] || "Nhân viên y tế";
    }

    function classifyStaffSubTeam(staffRecord) {
        const pos = getStaffPositionCode(staffRecord);
        if (pos === "BacSi") return "TEAM_1_DOCTOR";
        if (pos === "DieuDuong") return "TEAM_2_NURSE";
        if (pos === "KTV" || pos === "DuocSi") return "TEAM_3_CLS_PHARM";
        return "TEAM_4_RECEP_ACC";
    }

    function isRecordBelongToCurrentUser(staffRecord, currentUser) {
        if (!currentUser) return false;
        if (staffRecord.ma_nhan_vien && currentUser.ma_nhan_vien && String(staffRecord.ma_nhan_vien) === String(currentUser.ma_nhan_vien)) {
            return true;
        }
        if (staffRecord.ma_nguoi_dung && currentUser.ma_nguoi_dung && String(staffRecord.ma_nguoi_dung) === String(currentUser.ma_nguoi_dung)) {
            return true;
        }
        if (staffRecord.email && currentUser.email && staffRecord.email.toLowerCase() === currentUser.email.toLowerCase()) {
            return true;
        }
        const cleanRecName = cleanStaffDisplayName(staffRecord.ten_nhan_su || staffRecord.ho_ten || "").toLowerCase();
        const cleanUserName = (currentUser.ho_ten || "").toLowerCase();
        return cleanRecName && cleanUserName && (cleanRecName.includes(cleanUserName) || cleanUserName.includes(cleanRecName));
    }

    function getShiftTaskTitle(dayIndex, shiftCode) {
        const morningTitles = ["Khám & Điều Trị", "Khám BHYT & Sàng Lọc", "Khám & Điều Trị", "Khám Lão Khoa", "Giám Định & BHYT", "Khám BHYT Thứ 7", "Trực Chủ Nhật"];
        const afternoonTitles = ["Chuyên Khoa Phối Hợp", "Tiêm Chủng Mở Rộng", "Quản Lý Mãn Tính", "Tim Mạch & THA", "Khám Nhi & Tiêm", "Hậu Phẫu & Mãn Tính", "Ngoại Chẩn CN"];
        const nightTitles = ["Trực Đêm Số 1", "Trực Đêm Số 2", "Trực Đêm Nội Viện", "Trực Đêm Số 3", "Trực Đêm Trọng Điểm", "Trực Đêm Thứ 7", "Trực Đêm CN"];

        if (shiftCode === "Sang") return morningTitles[dayIndex] || "Khám BHYT";
        if (shiftCode === "Chieu") return afternoonTitles[dayIndex] || "Chuyên Khoa";
        return nightTitles[dayIndex] || "Trực Đêm 24/7";
    }

    // =========================================================================
    // 0. KIỂM SOÁT KHÓA / MỞ CHỨC NĂNG THEO LỊCH TRỰC & VAI TRÒ CHUYÊN TRÁCH
    // =========================================================================
    function isShiftCurrentlyActive(shiftRecord, now = new Date()) {
        const sDate = String(shiftRecord.ngay_lam_viec || "").substring(0, 10);
        const ca = normalizeShiftCode(shiftRecord.ca_truc);
        const todayYmd = formatYmd(now);

        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yesterdayYmd = formatYmd(yesterday);
        const minutesNow = now.getHours() * 60 + now.getMinutes();

        if (!CHECK_EXACT_SHIFT_TIME) {
            if (sDate === todayYmd) return true;
            if (sDate === yesterdayYmd && ca === "Dem" && minutesNow < 7 * 60) return true;
            return false;
        }

        if (ca === "Sang") {
            return sDate === todayYmd && minutesNow >= (7 * 60) && minutesNow < (11 * 60 + 30);
        }
        if (ca === "Chieu") {
            return sDate === todayYmd && minutesNow >= (13 * 60) && minutesNow < (16 * 60 + 30);
        }
        if (ca === "Dem") {
            if (sDate === todayYmd && minutesNow >= (16 * 60 + 30)) return true;
            if (sDate === yesterdayYmd && minutesNow < (7 * 60)) return true;
            return false;
        }
        return false;
    }

    function getShiftSortKey(shiftRecord) {
        const d = String(shiftRecord.ngay_lam_viec || "").substring(0, 10);
        const ca = normalizeShiftCode(shiftRecord.ca_truc);
        const order = ca === "Sang" ? "1" : (ca === "Chieu" ? "2" : "3");
        return `${d}_${order}`;
    }

    function resolveNvytAllowedModule(staffProfile, activeShift) {
        const chucVu = String(staffProfile?.chuc_vu || activeShift?.chuc_vu || "").trim();
        const loaiPhong = String(activeShift?.loai_phong || "").trim();
        const soPhong = String(activeShift?.so_phong || "").trim().toUpperCase();
        const hoTen = String(staffProfile?.ho_ten || activeShift?.ten_nhan_su || "").toLowerCase();
        const chuyenMon = String(staffProfile?.chuyen_mon || activeShift?.chuyen_mon || "").toLowerCase();

        // 1. Kỹ thuật viên Cận lâm sàng -> Chỉ mở "Cận lâm sàng"
        if (
            chucVu === "KTV_CLS" ||
            loaiPhong === "PhongCLS" ||
            ["P201", "P202", "P203", "P204", "P205", "P206"].includes(soPhong) ||
            hoTen.startsWith("ktv.") ||
            chuyenMon.includes("cận lâm sàng")
        ) {
            return { module: "cls", label: "Cận lâm sàng" };
        }

        // 2. Nhân viên Tiếp nhận / Tiếp đón -> Chỉ mở "Tiếp nhận"
        if (
            chucVu === "TiepDon" ||
            chucVu === "TiepNhan" ||
            hoTen.includes("tiếp nhận") ||
            (hoTen.includes("tiếp đón") && !hoTen.includes("sàng lọc")) ||
            (chuyenMon.includes("tiếp nhận") && !chuyenMon.includes("sinh hiệu"))
        ) {
            return { module: "reception", label: "Tiếp nhận bệnh nhân" };
        }

        // 3. Điều dưỡng Đo sinh hiệu -> Chỉ mở "Sinh hiệu"
        return { module: "vitals", label: "Đo chỉ số sinh hiệu" };
    }

    function detectNavItemModule(navChild) {
        if (!navChild) return "other";
        if (navChild.id === "nav-btn-work-schedule" || navChild.querySelector("#nav-btn-work-schedule")) {
            return "schedule";
        }
        const rawHtml = (navChild.innerHTML || "").toLowerCase();
        const text = (navChild.textContent || "").toLowerCase();

        if (rawHtml.includes("reception") || text.includes("tiếp nhận")) return "reception";
        if (rawHtml.includes("vitals") || text.includes("sinh hiệu")) return "vitals";
        if (rawHtml.includes("'cls") || rawHtml.includes('"cls') || text.includes("cận lâm sàng")) return "cls";
        return "other";
    }

    function detectModuleFromKey(keyStr) {
        const s = String(keyStr || "").toLowerCase();
        if (s.includes("reception")) return "reception";
        if (s.includes("vital")) return "vitals";
        if (s.includes("cls")) return "cls";
        return "other";
    }

    function isModuleAllowedNow(modKey) {
        if (modKey === "schedule") return true;
        if (!currentAccessState.checked) return true;
        if (!currentAccessState.hasActiveShift) return false;

        const user = getLoggedUser();
        if (user && user.vai_tro === "NVYT" && currentAccessState.allowedNvytModule) {
            if (["reception", "vitals", "cls"].includes(modKey)) {
                return modKey === currentAccessState.allowedNvytModule;
            }
        }
        return true;
    }

    function getLockReasonForModule(modKey) {
        if (!currentAccessState.hasActiveShift) {
            if (currentAccessState.nextShift) {
                const ns = currentAccessState.nextShift;
                const d = String(ns.ngay_lam_viec || "").substring(0, 10);
                return `Hiện tại bạn không có ca trực đang diễn ra nên các chức năng nghiệp vụ đang bị khóa. Ca trực gần nhất của bạn: ${getShiftDisplayName(ns.ca_truc)} ngày ${d} (Phòng ${ns.so_phong}).`;
            }
            return "Tài khoản hiện chưa được phân công lịch làm việc nên các chức năng nghiệp vụ đang bị khóa. Bạn chỉ có thể xem Lịch làm việc!";
        }
        if (currentAccessState.allowedNvytLabel) {
            return `Phân quyền chuyên trách: Bạn chỉ được thực hiện chức năng "${currentAccessState.allowedNvytLabel}" và "Lịch làm việc". Các chức năng khác đã bị khóa.`;
        }
        return "Chức năng này hiện đang bị khóa theo phân quyền vai trò.";
    }

    function showAccessLockedToast(message) {
        let toast = document.getElementById("sch-access-locked-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "sch-access-locked-toast";
            toast.className = "fixed top-20 right-5 z-[100] max-w-sm bg-rose-600 text-white px-4 py-3 rounded-2xl shadow-2xl border border-rose-400 text-xs font-bold flex items-start gap-2.5 transition-all";
            document.body.appendChild(toast);
        }
        toast.innerHTML = `
            <span class="material-symbols-outlined text-lg shrink-0 mt-0.5">lock</span>
            <div class="leading-relaxed">${message}</div>
        `;
        toast.classList.remove("hidden");
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.classList.add("hidden");
        }, 4200);
    }

    function setNavItemLockVisual(navChild, isLocked, lockReason = "") {
        const primaryBtn = navChild.tagName === "BUTTON" ? navChild : navChild.querySelector(":scope > button");
        const dropdowns = navChild.querySelectorAll('div[class*="dropdown"], div[class*="absolute"]');

        if (isLocked) {
            navChild.dataset.scheduleLocked = "1";
            navChild.dataset.lockReason = lockReason;
            dropdowns.forEach(d => {
                d.dataset.prevDisplay = d.style.display || "";
                d.style.display = "none";
            });

            if (primaryBtn) {
                primaryBtn.dataset.scheduleLocked = "1";
                primaryBtn.dataset.lockReason = lockReason;
                primaryBtn.title = lockReason;
                primaryBtn.classList.add("opacity-50", "cursor-not-allowed");
                primaryBtn.classList.remove("bg-teal-600", "text-white", "hover:bg-teal-50", "hover:text-teal-700");
                if (!primaryBtn.classList.contains("bg-slate-100")) {
                    primaryBtn.classList.add("bg-slate-100", "text-slate-500");
                }
                if (!primaryBtn.querySelector(".sch-lock-icon")) {
                    const icon = document.createElement("span");
                    icon.className = "sch-lock-icon material-symbols-outlined text-sm text-rose-500 ml-0.5";
                    icon.textContent = "lock";
                    primaryBtn.appendChild(icon);
                }
            }
        } else {
            delete navChild.dataset.scheduleLocked;
            delete navChild.dataset.lockReason;
            dropdowns.forEach(d => {
                d.style.display = d.dataset.prevDisplay || "";
            });

            if (primaryBtn) {
                delete primaryBtn.dataset.scheduleLocked;
                delete primaryBtn.dataset.lockReason;
                primaryBtn.removeAttribute("title");
                primaryBtn.classList.remove("opacity-50", "cursor-not-allowed", "bg-slate-100", "text-slate-500");
                primaryBtn.querySelectorAll(".sch-lock-icon").forEach(ic => ic.remove());
            }
        }
    }

    function renderDutyStatusBanner() {
        const root = document.getElementById("shared-schedule-board-root");
        if (!root) return;

        let banner = document.getElementById("sch-duty-access-banner");
        if (!banner) {
            banner = document.createElement("div");
            banner.id = "sch-duty-access-banner";
            root.prepend(banner);
        }

        if (!currentAccessState.hasActiveShift) {
            const ns = currentAccessState.nextShift;
            const nextText = ns
                ? `Ca trực gần nhất của bạn: <b>${getShiftDisplayName(ns.ca_truc)}</b> ngày <b>${String(ns.ngay_lam_viec).substring(0, 10)}</b> tại <b>Phòng ${ns.so_phong}</b>.`
                : `Bạn chưa được Quản trị viên phân công ca trực sắp tới.`;

            banner.className = "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs";
            banner.innerHTML = `
                <div class="flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-rose-600 text-xl shrink-0">lock_clock</span>
                    <div>
                        <div class="font-extrabold text-sm text-rose-800">Các chức năng nghiệp vụ đang tạm khóa (Ngoài lịch làm việc)</div>
                        <p class="mt-0.5 leading-relaxed">
                            Hiện tại bạn không có ca trực đang diễn ra nên chỉ có thể xem <b>Lịch làm việc</b>. Khi đến khung giờ ca trực được phân công, hệ thống sẽ tự động mở khóa chức năng theo vai trò. ${nextText}
                        </p>
                    </div>
                </div>
                <button type="button" onclick="reloadSharedWeeklySchedule()"
                        class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 transition">
                    Kiểm tra lại ca trực
                </button>
            `;
        } else {
            const s = currentAccessState.activeShift;
            const user = getLoggedUser();
            const roleScopeText = (user && user.vai_tro === "NVYT" && currentAccessState.allowedNvytLabel)
                ? ` • Chức năng được mở khóa: <b>${currentAccessState.allowedNvytLabel}</b>`
                : ` • Toàn bộ chức năng theo vai trò đã được mở khóa`;

            banner.className = "p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs";
            banner.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-emerald-600 text-lg">verified_user</span>
                    <span>
                        <b>Đang trong ca trực:</b> ${getShiftDisplayName(s.ca_truc)} • Phòng <b>${s.so_phong}</b> (${s.ten_phong || ""})${roleScopeText}
                    </span>
                </div>
            `;
        }
    }

    function guardPortalNavigationFunctions() {
        const wrapFn = (fnName, getTargetModFn) => {
            if (typeof window[fnName] === "function" && !window[fnName]._schGuarded) {
                const orig = window[fnName];
                window[fnName] = function () {
                    const modKey = getTargetModFn.apply(null, arguments);
                    if (!isModuleAllowedNow(modKey)) {
                        showAccessLockedToast(getLockReasonForModule(modKey));
                        if (!currentAccessState.hasActiveShift) {
                            window.openSharedWorkScheduleView();
                        }
                        return;
                    }
                    return orig.apply(this, arguments);
                };
                window[fnName]._schGuarded = true;
            }
        };

        wrapFn("openStaffMenu", (menuKey) => detectModuleFromKey(menuKey));
        wrapFn("switchStaffTab", (tabName) => detectModuleFromKey(tabName));
        wrapFn("openDoctorMenu", () => "other");
        wrapFn("switchDoctorView", () => "other");
        wrapFn("switchAccountantView", () => "other");
        wrapFn("openPharmacistMenu", () => "other");
        wrapFn("switchPharmacistView", () => "other");
    }

    function applyScheduleAndRoleAccessControl() {
        const user = getLoggedUser();
        if (!user || !cachedBoardData) return;

        const allShifts = (cachedBoardData.lich_lam_viec_tuan || []).map(s => ({
            ...s,
            ca_truc: normalizeShiftCode(s.ca_truc)
        }));
        const myShifts = allShifts.filter(s => isRecordBelongToCurrentUser(s, user));
        const activeShift = myShifts.find(s => isShiftCurrentlyActive(s)) || null;

        const todayYmd = formatYmd(new Date());
        const upcomingShifts = myShifts
            .filter(s => String(s.ngay_lam_viec || "").substring(0, 10) >= todayYmd)
            .sort((a, b) => getShiftSortKey(a).localeCompare(getShiftSortKey(b)));

        const staffProfile = (cachedBoardData.danh_sach_nhan_su || []).find(st => isRecordBelongToCurrentUser(st, user)) || user;
        const nvytRule = (user.vai_tro === "NVYT") ? resolveNvytAllowedModule(staffProfile, activeShift) : { module: null, label: "" };

        currentAccessState = {
            checked: true,
            hasActiveShift: Boolean(activeShift),
            activeShift: activeShift,
            nextShift: upcomingShifts[0] || null,
            allowedNvytModule: nvytRule.module,
            allowedNvytLabel: nvytRule.label
        };

        guardPortalNavigationFunctions();
        renderDutyStatusBanner();

        const headerNav = document.querySelector("header nav");
        if (!headerNav) return;

        let allowedNavBtnToActivate = null;

        Array.from(headerNav.children).forEach(navChild => {
            const modKey = detectNavItemModule(navChild);
            if (modKey === "schedule") {
                setNavItemLockVisual(navChild, false);
                return;
            }

            const allowed = isModuleAllowedNow(modKey);
            setNavItemLockVisual(navChild, !allowed, allowed ? "" : getLockReasonForModule(modKey));

            if (allowed && user.vai_tro === "NVYT" && modKey === currentAccessState.allowedNvytModule) {
                allowedNavBtnToActivate = navChild.tagName === "BUTTON" ? navChild : navChild.querySelector(":scope > button");
            }
        });

        // Nếu KHÔNG có lịch làm việc hiện tại -> Khóa và ép chuyển sang màn hình Lịch làm việc
        if (!currentAccessState.hasActiveShift) {
            scheduleViewMode = "MINE";
            window.openSharedWorkScheduleView(true);
            hasAppliedInitialAccessRoute = true;
            return;
        }

        // Nếu CÓ lịch làm việc & là NVYT -> Ở lần tải đầu tự mở đúng tab chuyên trách (Tiếp nhận / Sinh hiệu / Cận lâm sàng)
        if (!hasAppliedInitialAccessRoute) {
            hasAppliedInitialAccessRoute = true;
            if (user.vai_tro === "NVYT" && allowedNavBtnToActivate && currentAccessState.allowedNvytModule !== "reception") {
                allowedNavBtnToActivate.click();
            }
        }
    }

    // =========================================================================
    // 1. CHÈN NÚT MENU "LỊCH LÀM VIỆC" LÊN HEADER & TẠO KHUNG WORKSPACE TRONG <main>
    // =========================================================================
    function injectScheduleNavButton() {
        document.querySelectorAll(
            'header button[onclick*="loadDoctorDashboard"], ' +
            'header button[onclick*="loadStaffDashboard"], ' +
            'header button[onclick*="loadAccountantDashboard"], ' +
            'header button[onclick*="loadPharmacistDashboard"]'
        ).forEach(el => el.remove());

        if (document.getElementById("nav-btn-work-schedule")) return;

        const btn = document.createElement("button");
        btn.id = "nav-btn-work-schedule";
        btn.type = "button";
        btn.onclick = () => window.openSharedWorkScheduleView(false);
        btn.className = "px-3 py-2 rounded-xl font-bold text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 whitespace-nowrap transition";
        btn.innerHTML = `
            <span class="material-symbols-outlined text-base text-teal-600">calendar_month</span>
            <span>Lịch làm việc</span>
            <span id="badge-shared-my-shifts" class="px-1.5 py-0.2 rounded-full bg-teal-600 text-white text-[10px] font-extrabold">0</span>
        `;

        const headerNav = document.querySelector("header nav");
        if (headerNav) {
            headerNav.appendChild(btn);

            // Chặn click ở Capture Phase đối với mọi tab bị khóa theo lịch trực hoặc vai trò
            if (!headerNav._schLockClickBound) {
                headerNav.addEventListener("click", (e) => {
                    const lockedEl = e.target.closest('[data-schedule-locked="1"]');
                    if (lockedEl) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        showAccessLockedToast(lockedEl.dataset.lockReason || "Chức năng đang bị khóa!");
                    }
                }, true);
                headerNav._schLockClickBound = true;
            }
        } else {
            btn.className = "fixed bottom-5 left-5 z-40 px-4 py-2.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition";
            document.body.appendChild(btn);
        }

        const headerEl = document.querySelector("header");
        if (headerEl) {
            headerEl.addEventListener("click", (e) => {
                if (e.target.closest('[data-schedule-locked="1"]')) return;
                const trigger = e.target.closest(
                    'button[onclick*="openStaffMenu"], button[onclick*="switchStaffTab"], ' +
                    'button[onclick*="openDoctorMenu"], button[onclick*="switchDoctorView"], ' +
                    'button[onclick*="switchAccountantView"], ' +
                    'button[onclick*="openPharmacistMenu"], button[onclick*="switchPharmacistView"]'
                );
                if (trigger) {
                    hideSharedWorkSchedulePanel();
                }
            });
        }
    }

    function ensureSchedulePanelAndModalsDOM() {
        const mainEl = document.querySelector("main");
        if (mainEl && !document.getElementById("shared-work-schedule-panel")) {
            const panel = document.createElement("section");
            panel.id = "shared-work-schedule-panel";
            panel.className = "hidden space-y-5";
            mainEl.appendChild(panel);
        }

        const panel = document.getElementById("shared-work-schedule-panel");
        if (panel && !document.getElementById("shared-schedule-board-root")) {
            const user = getLoggedUser();
            const myName = (user && user.ho_ten) ? compactStaffName(user.ho_ten) : "Tôi";

            panel.innerHTML = `
                <div id="shared-schedule-board-root" class="flex flex-col gap-4">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                        <div>
                            <h2 class="text-xl lg:text-2xl font-heading font-bold text-slate-900 tracking-tight flex items-center flex-wrap gap-2">
                                <span>Bảng Điều Phối Lịch Ca Kíp Toàn Trung Tâm (3 Ca / Ngày)</span>
                                <span class="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">Đồng bộ trực tiếp MySQL</span>
                            </h2>
                            <p class="text-xs text-slate-500 mt-0.5">
                                Tất cả ca trực được chuẩn hóa theo mô hình 4 phân đội: Khám Chẩn Đoán (Bác sĩ), Điều Dưỡng & Sàng Lọc, Cận Lâm Sàng & Dược Sĩ, Tiếp Đón & Kế Toán.
                            </p>
                        </div>
                        <div class="flex items-center flex-wrap gap-2">
                            <button type="button" onclick="openSharedSwapModal()" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-sm transition-all">
                                <span class="material-symbols-outlined text-base text-teal-600">swap_horiz</span>
                                <span>Đăng ký đổi ca</span>
                            </button>
                            <button type="button" onclick="openSharedLeaveModal()" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-sm transition-all">
                                <span class="material-symbols-outlined text-base text-amber-600">event_busy</span>
                                <span>Báo vắng / Xin phép</span>
                            </button>
                            <button type="button" onclick="scrollToSharedRoster()" class="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all">
                                <span class="material-symbols-outlined text-base">checklist_rtl</span>
                                <span id="sh-btn-attendance-label">Điểm Danh NS Ca Này</span>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng lượt trực trong tuần</div>
                                <div class="text-xl font-heading font-extrabold text-slate-900 mt-0.5">
                                    <span id="sh-kpi-total-shifts">0</span> <span class="text-xs font-bold text-teal-700">lượt điều động</span>
                                </div>
                                <div class="text-[11px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-0.5">
                                    <span class="material-symbols-outlined text-xs">verified</span>Đồng bộ bảng LICH_LAM_VIEC
                                </div>
                            </div>
                            <div class="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                                <span class="material-symbols-outlined text-2xl">groups</span>
                            </div>
                        </div>

                        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Quân số trung bình / ca</div>
                                <div class="text-xl font-heading font-extrabold text-teal-700 mt-0.5">
                                    <span id="sh-kpi-avg-staff">0.0</span> <span class="text-xs font-bold text-slate-500">NS/Ca</span>
                                </div>
                                <div class="text-[11px] text-teal-700 font-semibold mt-0.5">Ca của bạn tuần này: <b id="sh-kpi-my-shifts">0</b> ca</div>
                            </div>
                            <div class="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                                <span class="material-symbols-outlined text-2xl">diversity_3</span>
                            </div>
                        </div>

                        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cơ cấu tác chiến 4 tổ</div>
                                <div class="text-xl font-heading font-extrabold text-indigo-700 mt-0.5">4 Tổ / Ca</div>
                                <div class="text-[11px] text-indigo-600 font-semibold mt-0.5">Khám • ĐD • CLS/Dược • Đón/KT</div>
                            </div>
                            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                                <span class="material-symbols-outlined text-2xl">schema</span>
                            </div>
                        </div>

                        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Trực đêm nội viện 24/7</div>
                                <div class="text-xl font-heading font-extrabold text-rose-600 mt-0.5">
                                    <span id="sh-kpi-night-total">0</span> <span class="text-xs font-bold text-slate-500">lượt/tuần</span>
                                </div>
                                <div class="text-[11px] text-emerald-600 font-semibold mt-0.5">Trực tiếp nhận & cấp cứu 24/7</div>
                            </div>
                            <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                                <span class="material-symbols-outlined text-2xl">local_hospital</span>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 text-xs">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                                <button type="button" id="sh-btn-mode-all" onclick="setSharedSchedViewMode('ALL')" class="px-3.5 py-1.5 rounded-md bg-white text-teal-700 font-bold shadow-sm transition">
                                    Theo Tuần (Toàn Trung Tâm)
                                </button>
                                <button type="button" id="sh-btn-mode-mine" onclick="setSharedSchedViewMode('MINE')" class="px-3.5 py-1.5 rounded-md text-slate-600 hover:text-slate-900 font-medium transition">
                                    <span id="sh-label-my-shifts-btn">Ca của tôi (${myName})</span>
                                </button>
                            </div>

                            <div class="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 font-medium">
                                <button type="button" onclick="navigateSharedSchedWeek(-1)" class="p-1 hover:bg-white rounded" title="Tuần trước">
                                    <span class="material-symbols-outlined text-base">chevron_left</span>
                                </button>
                                <span id="sh-week-range-label" class="font-bold text-slate-900 px-1">Tuần hiện tại</span>
                                <button type="button" onclick="navigateSharedSchedWeek(1)" class="p-1 hover:bg-white rounded" title="Tuần sau">
                                    <span class="material-symbols-outlined text-base">chevron_right</span>
                                </button>
                                <button type="button" onclick="navigateSharedSchedWeek(0)" class="ml-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-bold text-teal-700 hover:bg-teal-50">
                                    Hôm nay
                                </button>
                                <button type="button" onclick="reloadSharedWeeklySchedule()" class="ml-1 px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-[11px] font-bold text-sky-700 hover:bg-sky-600 hover:text-white transition" title="Tải lại từ MySQL">
                                    Đồng bộ
                                </button>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2.5 border-t border-slate-200 items-center">
                            <div class="md:col-span-5 relative">
                                <span class="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-base">search</span>
                                <input id="sh-search-name" type="text" oninput="renderSharedWeeklyMatrix()"
                                       placeholder="Tìm kiếm theo tên nhân sự, mã NV, phòng..."
                                       class="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:border-teal-600 focus:ring-1 focus:ring-teal-600"/>
                            </div>

                            <div class="md:col-span-5 flex items-center gap-2">
                                <label class="font-bold text-slate-700 shrink-0">Chức vụ:</label>
                                <select id="sh-search-position" onchange="renderSharedWeeklyMatrix()"
                                        class="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:border-teal-600">
                                    <option value="ALL">-- Tất cả chức vụ (6 bộ phận) --</option>
                                    <option value="BacSi">🩺 Bác sĩ khám & Chẩn đoán</option>
                                    <option value="DieuDuong">💉 Điều dưỡng & Đo sinh hiệu</option>
                                    <option value="KTV">🔬 Kỹ thuật viên Cận lâm sàng (CLS)</option>
                                    <option value="DuocSi">💊 Dược sĩ cấp phát thuốc</option>
                                    <option value="TiepDon">📋 Nhân viên Tiếp nhận BHYT</option>
                                    <option value="KeToan">💳 Kế toán thu ngân viện phí</option>
                                </select>
                            </div>

                            <div class="md:col-span-2 flex justify-end">
                                <button type="button" onclick="resetSharedSchedFilters()"
                                        class="w-full md:w-auto px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 transition">
                                    <span class="material-symbols-outlined text-sm">filter_alt_off</span>
                                    <span>Xóa bộ lọc</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full table-fixed text-left border-collapse min-w-[1060px]">
                                <thead id="sh-matrix-thead"></thead>
                                <tbody id="sh-matrix-tbody" class="divide-y divide-slate-200 text-xs"></tbody>
                            </table>
                        </div>
                        <div class="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
                            <div class="flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-teal-600 text-base">verified_user</span>
                                <span>Dữ liệu lịch trực 3 ca đồng bộ trực tiếp từ bảng <strong>LICH_LAM_VIEC</strong> (Phân công bởi Quản trị viên).</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="exportSharedScheduleCsv()" class="text-teal-700 hover:underline font-semibold flex items-center gap-0.5">
                                    <span class="material-symbols-outlined text-sm">download</span>Xuất Excel/CSV
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="sh-expanded-roster-section" class="grid grid-cols-1 lg:grid-cols-12 gap-4">
                        <div class="lg:col-span-8 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                            <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200">
                                <div class="flex items-center gap-2">
                                    <div class="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                                        <span class="material-symbols-outlined text-lg">badge</span>
                                    </div>
                                    <div>
                                        <h3 id="sh-roster-detail-heading" class="font-heading font-bold text-sm text-slate-900 flex items-center gap-2">
                                            Danh Sách Phân Công 4 Phân Đội Ca Đang Trực
                                        </h3>
                                        <p id="sh-roster-detail-subheading" class="text-[11px] text-slate-500">
                                            Bấm vào bất kỳ ô ca trực nào trên bảng để xem danh sách chi tiết toàn bộ nhân sự trong ca đó
                                        </p>
                                    </div>
                                </div>
                                <span id="sh-roster-detail-badge" class="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Đủ 100% quân số
                                </span>
                            </div>

                            <div id="sh-roster-four-subteams-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"></div>
                        </div>

                        <div class="lg:col-span-4 flex flex-col gap-3">
                            <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                                <div class="flex items-center justify-between">
                                    <span class="font-heading font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-amber-600 text-base">swap_calls</span>
                                        Yêu Cầu Đổi Ca Đang Xử Lý
                                    </span>
                                    <span class="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 font-bold">Mã #SW-8492</span>
                                </div>
                                <div id="sh-recent-swap-box" class="p-2.5 rounded-lg bg-amber-50/50 border border-amber-200 text-xs">
                                    <div class="font-semibold text-slate-900">Ca Đổi: Ca Chiều (13:00 - 16:30)</div>
                                    <div class="text-slate-600 mt-1">
                                        <strong>BS.CKI Nguyễn Văn Hưng</strong> ➔ <strong>BS.CKI Hoàng Thị Thu Thủy</strong>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                                <span class="font-heading font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-teal-600 text-base">rule</span>
                                    Quy Định Kíp Trực 3 Ca 24/7
                                </span>
                                <ul class="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                                    <li><strong>Ca Sáng:</strong> 07:00 – 11:30 • <strong>Ca Chiều:</strong> 13:00 – 16:30 • <strong>Ca Đêm:</strong> 16:30 – 07:00 sáng hôm sau.</li>
                                    <li><strong>Chỉ huy ca:</strong> Bác sĩ trưởng ca chịu trách nhiệm điều phối toàn bộ 4 phân đội trong suốt thời gian trực.</li>
                                    <li><strong>Bàn giao ca:</strong> Nhân sự trực đêm được bố trí nghỉ bù đúng quy định sau khi bàn giao ca sáng lúc 07:00.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (!document.getElementById("shared-swap-modal")) {
            const swapModal = document.createElement("div");
            swapModal.id = "shared-swap-modal";
            swapModal.className = "hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4";
            swapModal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-teal-200 space-y-4 text-xs">
                    <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h3 class="font-heading font-extrabold text-base text-slate-900 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-teal-600">swap_horiz</span>
                            Đăng Ký Đổi Ca Trực
                        </h3>
                        <button type="button" onclick="closeSharedSwapModal()" class="text-slate-400 hover:text-slate-700">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <form onsubmit="submitSharedSwapRequest(event)" class="space-y-3">
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">Chọn ca trực muốn đổi *</label>
                            <select id="sh-swap-my-shift" required class="w-full h-9 px-3 rounded-xl border-slate-300 text-xs font-semibold"></select>
                        </div>
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">Chọn đồng nghiệp trực thay *</label>
                            <select id="sh-swap-colleague" required class="w-full h-9 px-3 rounded-xl border-slate-300 text-xs font-semibold"></select>
                        </div>
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">Lý do đổi ca *</label>
                            <textarea id="sh-swap-reason" rows="2" required placeholder="Nhập lý do xin đổi ca..." class="w-full p-2.5 rounded-xl border-slate-300 text-xs"></textarea>
                        </div>
                        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onclick="closeSharedSwapModal()" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Hủy</button>
                            <button type="submit" class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-xs">Gửi yêu cầu đổi ca</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(swapModal);
        }

        if (!document.getElementById("shared-leave-modal")) {
            const leaveModal = document.createElement("div");
            leaveModal.id = "shared-leave-modal";
            leaveModal.className = "hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4";
            leaveModal.innerHTML = `
                <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-amber-200 space-y-4 text-xs">
                    <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h3 class="font-heading font-extrabold text-base text-slate-900 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-amber-600">event_busy</span>
                            Báo Vắng / Đăng Ký Nghỉ Phép
                        </h3>
                        <button type="button" onclick="closeSharedLeaveModal()" class="text-slate-400 hover:text-slate-700">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <form onsubmit="submitSharedLeaveRequest(event)" class="space-y-3">
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="font-bold text-slate-700 block mb-1">Từ ngày *</label>
                                <input id="sh-leave-from" type="date" required class="w-full h-9 px-3 rounded-xl border-slate-300 text-xs"/>
                            </div>
                            <div>
                                <label class="font-bold text-slate-700 block mb-1">Đến ngày *</label>
                                <input id="sh-leave-to" type="date" required class="w-full h-9 px-3 rounded-xl border-slate-300 text-xs"/>
                            </div>
                        </div>
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">Nhân sự đề xuất trực thay thế *</label>
                            <select id="sh-leave-replacement" required class="w-full h-9 px-3 rounded-xl border-slate-300 text-xs font-semibold"></select>
                        </div>
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">Lý do nghỉ phép *</label>
                            <textarea id="sh-leave-reason" rows="2" required placeholder="Nhập lý do xin nghỉ..." class="w-full p-2.5 rounded-xl border-slate-300 text-xs"></textarea>
                        </div>
                        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onclick="closeSharedLeaveModal()" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Hủy</button>
                            <button type="submit" class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs">Gửi đơn xin phép</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(leaveModal);
        }
    }

    function hideSharedWorkSchedulePanel() {
        const panel = document.getElementById("shared-work-schedule-panel");
        if (panel) panel.classList.add("hidden");

        const btn = document.getElementById("nav-btn-work-schedule");
        const badge = document.getElementById("badge-shared-my-shifts");
        if (btn && btn.closest("header nav")) {
            btn.className = "px-3 py-2 rounded-xl font-bold text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 whitespace-nowrap transition";
            const icon = btn.querySelector(".material-symbols-outlined");
            if (icon) icon.className = "material-symbols-outlined text-base text-teal-600";
            if (badge) badge.className = "px-1.5 py-0.2 rounded-full bg-teal-600 text-white text-[10px] font-extrabold";
        }
    }

    window.openSharedWorkScheduleView = async function (skipFetch = false) {
        ensureSchedulePanelAndModalsDOM();

        const mainEl = document.querySelector("main");
        if (mainEl) {
            Array.from(mainEl.children).forEach(child => {
                if (child.tagName === "SECTION") {
                    if (child.id === "shared-work-schedule-panel") {
                        child.classList.remove("hidden");
                    } else {
                        child.classList.add("hidden");
                    }
                }
            });
        }

        document.querySelectorAll("header nav > button, header nav > div > button").forEach(b => {
            if (b.id === "nav-btn-work-schedule" || b.dataset.scheduleLocked === "1") return;
            if (b.className.includes("bg-teal-600")) {
                b.className = "px-3 py-2 rounded-xl font-bold text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-1.5 whitespace-nowrap transition";
            }
        });

        const myBtn = document.getElementById("nav-btn-work-schedule");
        const myBadge = document.getElementById("badge-shared-my-shifts");
        if (myBtn && myBtn.closest("header nav")) {
            myBtn.className = "px-3 py-2 rounded-xl font-bold text-xs text-white bg-teal-600 shadow-xs flex items-center gap-1.5 whitespace-nowrap transition";
            const icon = myBtn.querySelector(".material-symbols-outlined");
            if (icon) icon.className = "material-symbols-outlined text-base text-white";
            if (myBadge) myBadge.className = "px-1.5 py-0.2 rounded-full bg-white/25 text-white text-[10px] font-extrabold";
        }

        const titleEl =
            document.getElementById("current-workspace-title") ||
            document.getElementById("current-doc-workspace-title") ||
            document.getElementById("current-acc-workspace-title") ||
            document.getElementById("current-pharm-workspace-title");
        if (titleEl) {
            titleEl.textContent = "BẢNG ĐIỀU PHỐI LỊCH LÀM VIỆC & CA TRỰC TUẦN";
        }

        if (skipFetch && cachedBoardData) {
            renderDutyStatusBanner();
            window.renderSharedWeeklyMatrix();
        } else {
            await window.reloadSharedWeeklySchedule();
        }
    };

    // =========================================================================
    // 2. TẢI DỮ LIỆU LỊCH TRỰC TỪ MYSQL & ÁP DỤNG KHÓA/MỞ CHỨC NĂNG
    // =========================================================================
    window.reloadSharedWeeklySchedule = async function () {
        try {
            const res = await fetch(WEEKLY_BOARD_API_URL, {
                headers: { "Accept": "application/json" }
            });
            const data = await res.json();
            if (!res.ok || data.status !== "success") return;

            cachedBoardData = data;
            updateHeaderMyShiftBadge();
            applyScheduleAndRoleAccessControl();
            window.renderSharedWeeklyMatrix();
        } catch (err) {
            console.error("Lỗi tải bảng lịch trực tuần:", err);
        }
    };

    function updateHeaderMyShiftBadge() {
        if (!cachedBoardData) return;
        const user = getLoggedUser();
        const allShifts = cachedBoardData.lich_lam_viec_tuan || [];
        const myTotal = user ? allShifts.filter(s => isRecordBelongToCurrentUser(s, user)).length : 0;
        const badge = document.getElementById("badge-shared-my-shifts");
        if (badge) badge.textContent = myTotal;
    }

    // =========================================================================
    // 3. VẼ BẢNG MA TRẬN LỊCH CA KÍP 7 NGÀY × 3 CA (KHUNG Ô GỌN ĐẸP)
    // =========================================================================
    function updateScheduleModeButtonsUI() {
        const btnAll = document.getElementById("sh-btn-mode-all");
        const btnMine = document.getElementById("sh-btn-mode-mine");
        if (!btnAll || !btnMine) return;

        if (scheduleViewMode === "ALL") {
            btnAll.className = "px-3.5 py-1.5 rounded-md bg-white text-teal-700 font-bold shadow-sm transition";
            btnMine.className = "px-3.5 py-1.5 rounded-md text-slate-600 hover:text-slate-900 font-medium transition";
        } else {
            btnMine.className = "px-3.5 py-1.5 rounded-md bg-white text-teal-700 font-bold shadow-sm transition";
            btnAll.className = "px-3.5 py-1.5 rounded-md text-slate-600 hover:text-slate-900 font-medium transition";
        }
    }

    window.setSharedSchedViewMode = function (mode) {
        scheduleViewMode = mode;
        updateScheduleModeButtonsUI();
        window.renderSharedWeeklyMatrix();
    };

    window.resetSharedSchedFilters = function () {
        const nameInput = document.getElementById("sh-search-name");
        const posSelect = document.getElementById("sh-search-position");
        if (nameInput) nameInput.value = "";
        if (posSelect) posSelect.value = "ALL";
        scheduleViewMode = "ALL";
        updateScheduleModeButtonsUI();
        window.renderSharedWeeklyMatrix();
    };

    window.navigateSharedSchedWeek = function (step) {
        if (step === 0) scheduleWeekOffset = 0;
        else scheduleWeekOffset += step;
        selectedRosterDate = null;
        window.renderSharedWeeklyMatrix();
    };

    window.scrollToSharedRoster = function () {
        document.getElementById("sh-expanded-roster-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    window.renderSharedWeeklyMatrix = function () {
        if (!cachedBoardData) return;
        const thead = document.getElementById("sh-matrix-thead");
        const tbody = document.getElementById("sh-matrix-tbody");
        if (!thead || !tbody) return;

        updateScheduleModeButtonsUI();

        const allShifts = (cachedBoardData.lich_lam_viec_tuan || []).map(s => ({
            ...s,
            ca_truc: normalizeShiftCode(s.ca_truc)
        }));
        const currentUser = getLoggedUser();

        const searchName = (document.getElementById("sh-search-name")?.value || "").toLowerCase().trim();
        const searchPos = document.getElementById("sh-search-position")?.value || "ALL";
        const isFilteringBySearch = (searchName !== "" || searchPos !== "ALL");

        const monday = getBaseWeekMonday();
        const weekDays = [];
        const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
        const todayStr = formatYmd(new Date());

        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const ymd = formatYmd(d);
            weekDays.push({
                index: i,
                name: dayNames[i],
                ymd: ymd,
                dm: formatDm(d),
                fullLabel: `${formatDm(d)}/${d.getFullYear()}`,
                isToday: ymd === todayStr,
                isPast: ymd < todayStr
            });
        }

        const rangeLabel = document.getElementById("sh-week-range-label");
        if (rangeLabel) {
            rangeLabel.textContent = `Tuần: ${weekDays[0].fullLabel} — ${weekDays[6].fullLabel}`;
        }

        const startYmd = weekDays[0].ymd;
        const endYmd = weekDays[6].ymd;

        const weekShifts = allShifts.filter(s => {
            const sDate = String(s.ngay_lam_viec || "").substring(0, 10);
            return sDate >= startYmd && sDate <= endYmd;
        });

        const totalDeployments = weekShifts.length;
        const activeCellCount = new Set(weekShifts.map(s => `${String(s.ngay_lam_viec).substring(0, 10)}_${s.ca_truc}`)).size;
        const avgPerShift = activeCellCount > 0 ? (totalDeployments / activeCellCount).toFixed(1) : "0.0";
        const myShiftsInWeek = currentUser ? weekShifts.filter(s => isRecordBelongToCurrentUser(s, currentUser)).length : 0;
        const nightCountInWeek = weekShifts.filter(s => s.ca_truc === "Dem").length;

        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt("sh-kpi-total-shifts", totalDeployments);
        setTxt("sh-kpi-avg-staff", avgPerShift);
        setTxt("sh-kpi-my-shifts", myShiftsInWeek);
        setTxt("sh-kpi-night-total", nightCountInWeek);

        thead.innerHTML = `
            <tr class="bg-slate-100/80 text-slate-900 border-b border-slate-200 text-xs">
                <th class="p-2.5 font-heading font-bold uppercase tracking-wider w-[132px] text-center border-r border-slate-200 bg-slate-200/50">
                    Ca Trực
                </th>
                ${weekDays.map(day => {
                    if (day.isToday) {
                        return `
                            <th class="p-2 text-center border-r border-slate-200 bg-teal-50/70 ring-1 ring-teal-500/40">
                                <div class="font-bold text-[11px] text-teal-700">Hôm nay • ${day.name}</div>
                                <div class="font-heading font-extrabold text-sm text-teal-700">${day.dm}</div>
                                <span class="inline-block mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] bg-teal-600 text-white font-bold">ĐANG DIỄN RA</span>
                            </th>
                        `;
                    }
                    const statusBadge = day.isPast
                        ? `<span class="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] bg-slate-200 text-slate-700 font-medium">Hoàn thành</span>`
                        : `<span class="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] bg-teal-50 text-teal-800 font-semibold">Sắp tới</span>`;

                    return `
                        <th class="p-2 text-center border-r border-slate-200">
                            <div class="font-medium text-[11px] text-slate-500">${day.name}</div>
                            <div class="font-heading font-extrabold text-sm text-slate-900">${day.dm}</div>${statusBadge}
                        </th>
                    `;
                }).join("")}
            </tr>
        `;

        const rowsConfig = [
            { code: "Sang",  title: "CA SÁNG",  icon: "wb_sunny",      titleColor: "text-teal-700",  timeLabel: "07:00 – 11:30", badgeText: "Khám BHYT",    badgeCls: "text-teal-800 bg-teal-100",   rowBg: "" },
            { code: "Chieu", title: "CA CHIỀU", icon: "wb_twilight",   titleColor: "text-amber-700", timeLabel: "13:00 – 16:30", badgeText: "Chuyên Khoa",  badgeCls: "text-amber-900 bg-amber-100", rowBg: "" },
            { code: "Dem",   title: "TRỰC ĐÊM", icon: "night_shelter", titleColor: "text-rose-600",  timeLabel: "16:30 – 07:00", badgeText: "Cấp Cứu 24/7", badgeCls: "text-rose-700 bg-rose-100",   rowBg: "bg-rose-50/20" }
        ];

        tbody.innerHTML = rowsConfig.map(rCfg => {
            const cellsHtml = weekDays.map(day => {
                const cellStaff = weekShifts.filter(
                    s => String(s.ngay_lam_viec || "").substring(0, 10) === day.ymd && s.ca_truc === rCfg.code
                );

                const tdClass = day.isToday
                    ? "p-1.5 border-r border-slate-200 align-top bg-teal-50/30 ring-1 ring-teal-500/30"
                    : "p-1.5 border-r border-slate-200 align-top";

                if (cellStaff.length === 0) {
                    return `<td class="${tdClass}"><div class="p-2 rounded-lg border border-slate-200 bg-slate-50 text-center text-slate-400 text-[10px]">Chưa xếp ca</div></td>`;
                }

                const matchedStaff = cellStaff.filter(s => {
                    const haystack = `${cleanStaffDisplayName(s.ten_nhan_su || "")} ${s.ma_nhan_vien || ""} ${s.so_phong || ""} ${s.ten_khoa || ""}`.toLowerCase();
                    const posCode = getStaffPositionCode(s);
                    const matchName = !searchName || haystack.includes(searchName);
                    const matchPos = (searchPos === "ALL") || (posCode === searchPos);
                    return matchName && matchPos;
                });

                const myRecordInShift = currentUser
                    ? cellStaff.find(s => isRecordBelongToCurrentUser(s, currentUser))
                    : null;
                const hasCurrentUser = Boolean(myRecordInShift);

                if (scheduleViewMode === "MINE" && !hasCurrentUser) {
                    return `
                        <td class="${tdClass}">
                            <div class="p-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-center">
                                <div class="text-[10px] font-semibold text-slate-500">Nghỉ ca</div>
                            </div>
                        </td>
                    `;
                }

                if (isFilteringBySearch && matchedStaff.length === 0) {
                    return `<td class="${tdClass}"><div class="p-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-center text-[10px] text-slate-400 italic">Không khớp</div></td>`;
                }

                const doctors  = cellStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_1_DOCTOR");
                const nurses   = cellStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_2_NURSE");
                const clsPharm = cellStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_3_CLS_PHARM");
                const recepAcc = cellStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_4_RECEP_ACC");

                const totalInShift = cellStaff.length;
                const leadDoctor = doctors[0] ? compactStaffName(doctors[0].ten_nhan_su) : "BS. Trực";
                const taskTitle = getShiftTaskTitle(day.index, rCfg.code);
                const isNight = rCfg.code === "Dem";

                let borderCls = isNight ? "border border-rose-200 bg-white" : "border border-teal-200 bg-white";
                if (hasCurrentUser || isFilteringBySearch || day.isToday) {
                    borderCls = isNight ? "border-2 border-rose-500 bg-white shadow-sm" : "border-2 border-teal-600 bg-white shadow-sm";
                }

                const myShiftBadge = hasCurrentUser
                    ? `<span class="absolute -top-2 right-1.5 px-1.5 py-0.2 rounded text-[8.5px] ${isNight ? 'bg-rose-600' : 'bg-teal-600'} text-white font-bold uppercase">Ca của bạn</span>`
                    : "";

                let highlightBoxHtml = "";
                if (hasCurrentUser && myRecordInShift && (scheduleViewMode === "MINE" || !isFilteringBySearch)) {
                    const myPosLabel = getPositionLabel(getStaffPositionCode(myRecordInShift));
                    highlightBoxHtml = `
                        <div class="px-1.5 py-1 rounded bg-emerald-50 border border-emerald-300 text-[9.5px] text-emerald-900 font-semibold leading-tight">
                            <div class="truncate" title="${myPosLabel}">👤 ${myPosLabel}</div>
                            <div class="truncate" title="Phòng ${myRecordInShift.so_phong} - ${myRecordInShift.ten_phong || ''}">📍 Phòng <b>${myRecordInShift.so_phong}</b></div>
                        </div>
                    `;
                } else if (isFilteringBySearch) {
                    const previewNames = matchedStaff.slice(0, 2).map(
                        m => `<div class="truncate">• <b>${compactStaffName(m.ten_nhan_su)}</b> (${m.so_phong})</div>`
                    ).join("");
                    highlightBoxHtml = `
                        <div class="px-1.5 py-1 rounded bg-sky-50 border border-sky-200 text-[9.5px] text-slate-800 leading-tight">
                            <div class="font-bold text-teal-700">🔍 Khớp (${matchedStaff.length} NS):</div>
                            ${previewNames}
                        </div>
                    `;
                }

                return `
                    <td class="${tdClass}">
                        <div onclick="selectSharedShiftRoster('${day.ymd}', '${rCfg.code}', '${day.name} (${day.dm})')"
                             class="p-2 rounded-lg ${borderCls} hover:shadow-md transition-all flex flex-col gap-1 relative cursor-pointer min-w-0">
                            ${myShiftBadge}
                            <div class="flex items-center justify-between gap-1 min-w-0">
                                <span class="font-bold ${isNight ? 'text-rose-900' : 'text-teal-950'} text-[10.5px] truncate" title="${taskTitle}">${taskTitle}</span>
                                <span class="px-1 py-0.2 rounded text-[9.5px] ${isNight ? 'bg-rose-100 text-rose-800' : 'bg-teal-100 text-teal-900'} font-bold shrink-0">
                                    ${totalInShift} NS
                                </span>
                            </div>

                            <div class="text-[10px] text-slate-700 truncate" title="Chỉ huy: ${leadDoctor}">
                                <span class="font-semibold ${isNight ? 'text-rose-700' : 'text-teal-700'}">${isNight ? 'Kíp:' : 'CH:'}</span> ${leadDoctor}
                            </div>

                            ${highlightBoxHtml}

                            <div class="grid grid-cols-2 gap-1 text-[9.5px]">
                                <span class="px-1 py-0.5 bg-teal-50 rounded border border-teal-100 text-teal-900 font-medium truncate">🩺 BS: ${doctors.length}</span>
                                <span class="px-1 py-0.5 bg-amber-50 rounded border border-amber-100 text-amber-900 font-medium truncate">💉 ĐD: ${nurses.length}</span>
                                <span class="px-1 py-0.5 bg-indigo-50 rounded border border-indigo-100 text-indigo-900 font-medium truncate">🔬 CLS: ${clsPharm.length}</span>
                                <span class="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 text-slate-800 font-medium truncate">📋 TN/KT: ${recepAcc.length}</span>
                            </div>

                            <div class="pt-1 border-t border-slate-100 flex items-center justify-between text-[9.5px]">
                                <span class="text-emerald-700 font-semibold truncate">Đủ 100%</span>
                                <span class="${isNight ? 'text-rose-600' : 'text-teal-700'} hover:underline font-bold shrink-0">Xem ›</span>
                            </div>
                        </div>
                    </td>
                `;
            }).join("");

            return `
                <tr class="${rCfg.rowBg}">
                    <td class="p-2.5 bg-slate-50 border-r border-slate-200 align-top">
                        <div class="flex items-center gap-1 font-heading font-bold ${rCfg.titleColor} text-xs">
                            <span class="material-symbols-outlined text-base">${rCfg.icon}</span>${rCfg.title}
                        </div>
                        <div class="text-[10.5px] text-slate-500 font-medium mt-0.5">${rCfg.timeLabel}</div>
                        <span class="inline-block mt-1.5 text-[9.5px] font-bold ${rCfg.badgeCls} px-1.5 py-0.5 rounded">${rCfg.badgeText}</span>
                    </td>
                    ${cellsHtml}
                </tr>
            `;
        }).join("");

        const defaultDay = weekDays.find(d => d.isToday) || weekDays[0];
        const targetDate = selectedRosterDate || defaultDay.ymd;
        const targetShift = selectedRosterShift || "Sang";
        window.selectSharedShiftRoster(targetDate, targetShift, `${defaultDay.name} (${defaultDay.dm})`, false);
    };

    window.selectSharedShiftRoster = function (dateYmd, shiftCode, dayLabel = "", shouldScroll = true) {
        if (!cachedBoardData) return;
        selectedRosterDate = dateYmd;
        selectedRosterShift = shiftCode;

        const searchName = (document.getElementById("sh-search-name")?.value || "").toLowerCase().trim();
        const searchPos = document.getElementById("sh-search-position")?.value || "ALL";

        const allShifts = (cachedBoardData.lich_lam_viec_tuan || []).map(s => ({
            ...s,
            ca_truc: normalizeShiftCode(s.ca_truc)
        }));

        let shiftStaff = allShifts.filter(
            s => String(s.ngay_lam_viec || "").substring(0, 10) === dateYmd && s.ca_truc === shiftCode
        );

        if (shiftStaff.length === 0 && allShifts.length > 0) {
            const firstDate = String(allShifts[0].ngay_lam_viec || "").substring(0, 10);
            const firstShift = allShifts[0].ca_truc || "Sang";
            shiftStaff = allShifts.filter(
                s => String(s.ngay_lam_viec || "").substring(0, 10) === firstDate && s.ca_truc === firstShift
            );
            dateYmd = firstDate;
            shiftCode = firstShift;
            dayLabel = firstDate;
        }

        const filteredStaff = shiftStaff.filter(s => {
            const haystack = `${cleanStaffDisplayName(s.ten_nhan_su || "")} ${s.ma_nhan_vien || ""} ${s.so_phong || ""} ${s.ten_khoa || ""}`.toLowerCase();
            const posCode = getStaffPositionCode(s);
            const matchName = !searchName || haystack.includes(searchName);
            const matchPos = (searchPos === "ALL") || (posCode === searchPos);
            return matchName && matchPos;
        });

        const shiftNames = {
            Sang:  "Ca Sáng (07:00 - 11:30)",
            Chieu: "Ca Chiều (13:00 - 16:30)",
            Dem:   "Ca Trực Đêm 24/7 (16:30 - 07:00)"
        };

        const doctors  = filteredStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_1_DOCTOR");
        const nurses   = filteredStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_2_NURSE");
        const clsPharm = filteredStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_3_CLS_PHARM");
        const recepAcc = filteredStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_4_RECEP_ACC");

        const allDoctorsInShift = shiftStaff.filter(s => classifyStaffSubTeam(s) === "TEAM_1_DOCTOR");
        const commanderName = allDoctorsInShift[0] ? compactStaffName(allDoctorsInShift[0].ten_nhan_su) : "BS.CKI Nguyễn Văn Hưng";

        const headingEl = document.getElementById("sh-roster-detail-heading");
        const subheadingEl = document.getElementById("sh-roster-detail-subheading");
        const badgeEl = document.getElementById("sh-roster-detail-badge");
        const btnAttLabel = document.getElementById("sh-btn-attendance-label");

        if (headingEl) {
            headingEl.textContent = `Danh Sách Phân Công 4 Phân Đội Ca Đang Trực (${dayLabel || dateYmd} • ${filteredStaff.length}/${shiftStaff.length} Nhân Sự)`;
        }
        if (subheadingEl) {
            subheadingEl.textContent = `${shiftNames[shiftCode] || shiftCode} • Ngày ${dateYmd} • Chỉ huy trực tiếp: ${commanderName}`;
        }
        if (badgeEl) {
            badgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Đủ ${shiftStaff.length}/${shiftStaff.length} NS (100%)`;
        }
        if (btnAttLabel) {
            btnAttLabel.textContent = `Điểm Danh ${shiftStaff.length} NS Ca Này`;
        }

        const gridEl = document.getElementById("sh-roster-four-subteams-grid");
        if (!gridEl) return;

        const currentUser = getLoggedUser();
        const highlightMe = (rec) => isRecordBelongToCurrentUser(rec, currentUser)
            ? "ring-2 ring-teal-500 bg-teal-50/70"
            : "bg-white";

        gridEl.innerHTML = `
            <div class="p-3 rounded-lg border border-teal-200 bg-teal-50/20 flex flex-col gap-1.5">
                <div class="flex items-center justify-between font-bold text-teal-950 pb-1 border-b border-teal-100">
                    <span class="flex items-center gap-1">
                        <span class="material-symbols-outlined text-base text-teal-600">stethoscope</span>
                        Phân Đội 1: Khám & Chẩn Đoán
                    </span>
                    <span class="px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 font-bold text-[11px]">${doctors.length} Bác Sĩ</span>
                </div>
                <div class="space-y-1 text-[11px] max-h-52 overflow-y-auto pr-1">
                    ${doctors.length === 0 ? `<div class="text-slate-400 italic p-2">Không có nhân sự khớp bộ lọc</div>` : doctors.map((d, idx) => `
                        <div class="p-1.5 rounded border border-teal-100 flex items-center justify-between gap-2 ${highlightMe(d)}">
                            <div>
                                <strong class="text-slate-900">${cleanStaffDisplayName(d.ten_nhan_su)}</strong>
                                <span class="${idx === 0 ? 'text-teal-700 font-bold' : 'text-slate-500'}">
                                    (${idx === 0 ? 'Chỉ huy ca' : 'Bác sĩ khám'})
                                </span>
                            </div>
                            <span class="text-slate-500 font-medium shrink-0">${d.so_phong} • ${d.ten_khoa || ''}</span>
                        </div>
                    `).join("")}
                </div>
            </div>

            <div class="p-3 rounded-lg border border-amber-200 bg-amber-50/20 flex flex-col gap-1.5">
                <div class="flex items-center justify-between font-bold text-amber-950 pb-1 border-b border-amber-100">
                    <span class="flex items-center gap-1">
                        <span class="material-symbols-outlined text-base text-amber-700">vaccines</span>
                        Phân Đội 2: Điều Dưỡng & Đo Sinh Hiệu
                    </span>
                    <span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold text-[11px]">${nurses.length} Điều Dưỡng</span>
                </div>
                <div class="space-y-1 text-[11px] max-h-52 overflow-y-auto pr-1">
                    ${nurses.length === 0 ? `<div class="text-slate-400 italic p-2">Không có nhân sự khớp bộ lọc</div>` : nurses.map((n, idx) => `
                        <div class="p-1.5 rounded border border-amber-100 flex items-center justify-between gap-2 ${highlightMe(n)}">
                            <div>
                                <strong class="text-slate-900">${cleanStaffDisplayName(n.ten_nhan_su)}</strong>
                                <span class="${idx === 0 ? 'text-amber-800 font-bold' : 'text-slate-500'}">
                                    (${idx === 0 ? 'ĐD Trưởng ca' : 'Đo sinh hiệu'})
                                </span>
                            </div>
                            <span class="text-slate-500 font-medium shrink-0">Phòng ${n.so_phong}</span>
                        </div>
                    `).join("")}
                </div>
            </div>

            <div class="p-3 rounded-lg border border-indigo-200 bg-indigo-50/20 flex flex-col gap-1.5">
                <div class="flex items-center justify-between font-bold text-indigo-950 pb-1 border-b border-indigo-100">
                    <span class="flex items-center gap-1">
                        <span class="material-symbols-outlined text-base text-indigo-700">biotech</span>
                        Phân Đội 3: KTV Cận Lâm Sàng & Dược Sĩ
                    </span>
                    <span class="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-900 font-bold text-[11px]">${clsPharm.length} KTV & Dược Sĩ</span>
                </div>
                <div class="space-y-1 text-[11px] max-h-52 overflow-y-auto pr-1">
                    ${clsPharm.length === 0 ? `<div class="text-slate-400 italic p-2">Không có nhân sự khớp bộ lọc</div>` : clsPharm.map(cp => {
                        const posCode = getStaffPositionCode(cp);
                        return `
                            <div class="p-1.5 rounded border border-indigo-100 flex items-center justify-between gap-2 ${highlightMe(cp)}">
                                <div>
                                    <strong class="text-slate-900">${cleanStaffDisplayName(cp.ten_nhan_su)}</strong>
                                    <span class="text-indigo-700 font-semibold">
                                        (${posCode === 'DuocSi' ? 'Dược sĩ cấp thuốc' : 'KTV Cận lâm sàng'})
                                    </span>
                                </div>
                                <span class="text-slate-500 font-medium shrink-0">Phòng ${cp.so_phong}</span>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>

            <div class="p-3 rounded-lg border border-slate-300 bg-slate-50/60 flex flex-col gap-1.5">
                <div class="flex items-center justify-between font-bold text-slate-900 pb-1 border-b border-slate-200">
                    <span class="flex items-center gap-1">
                        <span class="material-symbols-outlined text-base text-slate-700">payments</span>
                        Phân Đội 4: Tiếp Nhận BHYT & Kế Toán Viện Phí
                    </span>
                    <span class="px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 font-bold text-[11px]">${recepAcc.length} Nhân Sự</span>
                </div>
                <div class="space-y-1 text-[11px] max-h-52 overflow-y-auto pr-1">
                    ${recepAcc.length === 0 ? `<div class="text-slate-400 italic p-2">Không có nhân sự khớp bộ lọc</div>` : recepAcc.map(ra => {
                        const posCode = getStaffPositionCode(ra);
                        return `
                            <div class="p-1.5 rounded border border-slate-200 flex items-center justify-between gap-2 ${highlightMe(ra)}">
                                <div>
                                    <strong class="text-slate-900">${cleanStaffDisplayName(ra.ten_nhan_su)}</strong>
                                    <span class="${posCode === 'KeToan' ? 'text-emerald-700 font-semibold' : 'text-teal-700 font-semibold'}">
                                        (${posCode === 'KeToan' ? 'Kế toán thu ngân' : 'Nhân viên Tiếp nhận'})
                                    </span>
                                </div>
                                <span class="text-slate-500 font-medium shrink-0">Phòng ${ra.so_phong}</span>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;

        if (shouldScroll) {
            window.scrollToSharedRoster();
        }
    };

    // =========================================================================
    // 4. ĐĂNG KÝ ĐỔI CA, BÁO VẮNG & XUẤT CSV LỊCH TRỰC
    // =========================================================================
    window.openSharedSwapModal = function () {
        if (!cachedBoardData) return;
        const user = getLoggedUser();
        const shifts = cachedBoardData.lich_lam_viec_tuan || [];
        const myShifts = user ? shifts.filter(s => isRecordBelongToCurrentUser(s, user)) : [];
        const listToShow = myShifts.length > 0 ? myShifts : shifts.slice(0, 40);
        const staffList = cachedBoardData.danh_sach_nhan_su || [];

        const shiftSelect = document.getElementById("sh-swap-my-shift");
        if (shiftSelect) {
            shiftSelect.innerHTML = listToShow.map(s => `
                <option value="${s.ma_lich_lam}">
                    #${s.ma_lich_lam} • Ngày ${String(s.ngay_lam_viec).substring(0, 10)} - Ca ${normalizeShiftCode(s.ca_truc)} • Phòng ${s.so_phong} (${cleanStaffDisplayName(s.ten_nhan_su)})
                </option>
            `).join("");
        }

        const colSelect = document.getElementById("sh-swap-colleague");
        if (colSelect) {
            colSelect.innerHTML = staffList.map(st => `
                <option value="${cleanStaffDisplayName(st.ho_ten)}">${cleanStaffDisplayName(st.ho_ten)} (${st.ten_khoa || st.vai_tro})</option>
            `).join("");
        }

        document.getElementById("shared-swap-modal")?.classList.remove("hidden");
    };

    window.closeSharedSwapModal = function () {
        document.getElementById("shared-swap-modal")?.classList.add("hidden");
    };

    window.submitSharedSwapRequest = function (event) {
        event.preventDefault();
        const shiftSelect = document.getElementById("sh-swap-my-shift");
        const shiftText = shiftSelect?.options[shiftSelect.selectedIndex]?.text || "";
        const colleague = document.getElementById("sh-swap-colleague")?.value || "";
        const reason = document.getElementById("sh-swap-reason")?.value.trim() || "";
        const user = getLoggedUser();

        const box = document.getElementById("sh-recent-swap-box");
        if (box) {
            box.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="font-bold text-amber-900">Mã đơn: #SW-${Math.floor(1000 + Math.random() * 9000)}</span>
                    <span class="text-emerald-700 font-bold">Vừa gửi thành công</span>
                </div>
                <div class="text-slate-800 mt-1"><strong>Ca xin đổi:</strong> ${shiftText}</div>
                <div class="flex items-center gap-2 bg-white p-2 rounded border border-amber-200 font-bold mt-1">
                    <span class="text-slate-900">${user ? user.ho_ten : 'Nhân sự trực'}</span>
                    <span class="material-symbols-outlined text-amber-600 text-sm">trending_flat</span>
                    <span class="text-teal-700">${colleague}</span>
                </div>
                <div class="text-slate-600 italic mt-1">"Lý do: ${reason}"</div>
            `;
        }

        alert("✅ Đã gửi yêu cầu đổi ca trực đến đồng nghiệp và Quản trị viên!");
        window.closeSharedSwapModal();
    };

    window.openSharedLeaveModal = function () {
        if (!cachedBoardData) return;
        const staffList = cachedBoardData.danh_sach_nhan_su || [];
        const repSelect = document.getElementById("sh-leave-replacement");
        if (repSelect) {
            repSelect.innerHTML = staffList.map(st => `
                <option value="${cleanStaffDisplayName(st.ho_ten)}">${cleanStaffDisplayName(st.ho_ten)} (${st.ten_khoa || st.vai_tro})</option>
            `).join("");
        }

        const today = formatYmd(new Date());
        const fromEl = document.getElementById("sh-leave-from");
        const toEl = document.getElementById("sh-leave-to");
        if (fromEl) fromEl.value = today;
        if (toEl) toEl.value = today;

        document.getElementById("shared-leave-modal")?.classList.remove("hidden");
    };

    window.closeSharedLeaveModal = function () {
        document.getElementById("shared-leave-modal")?.classList.add("hidden");
    };

    window.submitSharedLeaveRequest = function (event) {
        event.preventDefault();
        const fromDate = document.getElementById("sh-leave-from")?.value || "";
        const toDate = document.getElementById("sh-leave-to")?.value || "";
        const replacement = document.getElementById("sh-leave-replacement")?.value || "";
        alert(`✅ Đã gửi đơn xin nghỉ phép (${fromDate} đến ${toDate})!\nNhân sự đề xuất trực thay thế: ${replacement}`);
        window.closeSharedLeaveModal();
    };

    window.exportSharedScheduleCsv = function () {
        if (!cachedBoardData || !cachedBoardData.lich_lam_viec_tuan) return;
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const rows = [
            ["Mã Lịch Làm", "Mã Nhân Viên", "Ngày Làm Việc", "Ca Trực", "Nhân Sự", "Chức Vụ", "Phòng Trực", "Chuyên Khoa", "Số BN Tối Đa"]
        ];
        cachedBoardData.lich_lam_viec_tuan.forEach(s => {
            rows.push([
                s.ma_lich_lam,
                s.ma_nhan_vien,
                String(s.ngay_lam_viec || "").substring(0, 10),
                normalizeShiftCode(s.ca_truc),
                cleanStaffDisplayName(s.ten_nhan_su),
                getPositionLabel(getStaffPositionCode(s)),
                s.so_phong,
                s.ten_khoa || "",
                s.so_luong_bn_toi_da || 35
            ]);
        });
        const csvContent = "\uFEFF" + rows.map(r => r.map(esc).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Lich_Phan_Ca_TTYT_Hai_Chau.csv";
        link.click();
    };

    // Khởi tạo tự động trên 4 cổng nhân sự: NVYT, Bác sĩ, Kế toán, Dược sĩ
    document.addEventListener("DOMContentLoaded", () => {
        const user = getLoggedUser();
        if (!user || !["NVYT", "BacSi", "KeToan", "DuocSi"].includes(user.vai_tro)) return;

        injectScheduleNavButton();
        ensureSchedulePanelAndModalsDOM();
        guardPortalNavigationFunctions();
        window.reloadSharedWeeklySchedule();
    });
})();