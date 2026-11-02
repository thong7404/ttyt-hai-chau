const API_BASE_URL = "http://127.0.0.1:8000/api";

const TABLE_LABELS = [
    { id: "KHOA", name: "1. KHOA" },
    { id: "PHONG", name: "2. PHONG" },
    { id: "NGUOI_DUNG", name: "3. NGUOI_DUNG" },
    { id: "MA_XAC_THUC_OTP", name: "4. MA_XAC_THUC_OTP" },
    { id: "NHAN_VIEN", name: "5. NHAN_VIEN" },
    { id: "BENH_NHAN", name: "6. BENH_NHAN" },
    { id: "LICH_LAM_VIEC", name: "7. LICH_LAM_VIEC" },
    { id: "LICH_HEN_KHAM", name: "8. LICH_HEN_KHAM" },
    { id: "HO_SO_KHAM_BENH", name: "9. HO_SO_KHAM_BENH" },
    { id: "CHI_SO_SINH_HIEU", name: "10. CHI_SO_SINH_HIEU" },
    { id: "DANH_MUC_CAN_LAM_SANG", name: "11. DANH_MUC_CAN_LAM_SANG" },
    { id: "CHI_DINH_CAN_LAM_SANG", name: "12. CHI_DINH_CAN_LAM_SANG" },
    { id: "ANH_KET_QUA_CLS", name: "13. ANH_KET_QUA_CLS" },
    { id: "DANH_MUC_THUOC", name: "14. DANH_MUC_THUOC" },
    { id: "DON_THUOC", name: "15. DON_THUOC" },
    { id: "CHI_TIET_DON_THUOC", name: "16. CHI_TIET_DON_THUOC" },
    { id: "HOA_DON_VIEN_PHI", name: "17. HOA_DON_VIEN_PHI" },
    { id: "CHI_TIET_HOA_DON", name: "18. CHI_TIET_HOA_DON" },
    { id: "PHIEN_TRO_CHUYEN_AI", name: "19. PHIEN_TRO_CHUYEN_AI" },
    { id: "LICH_SU_TIN_NHAN_AI", name: "20. LICH_SU_TIN_NHAN_AI" },
    { id: "ANH_TIN_NHAN_AI", name: "21. ANH_TIN_NHAN_AI" },
    { id: "TAI_LIEU_HUAN_LUYEN_AI", name: "22. TAI_LIEU_HUAN_LUYEN_AI" }
];

let activeTable = "KHOA";
let currentColumns = [];
let currentRows = [];
let currentPrimaryKey = "ma_khoa";
let editingRecordId = null;
let tableCountsMap = {};

// 1. Tải thống kê số lượng bản ghi của 22 bảng
async function fetchTablesSummary() {
    try {
        const res = await fetch(`${API_BASE_URL}/tables-summary`);
        const summaryList = await res.json();

        let validTables = 0;
        summaryList.forEach(item => {
            tableCountsMap[item.table] = item.count;
            if (item.valid) validTables++;
        });

        const badge = document.getElementById("summary-total-badge");
        badge.textContent = `Đã đạt: ${validTables}/22 bảng có ≥ 5 records`;
        renderSidebarNav();
    } catch (err) {
        console.error("Lỗi tải summary:", err);
    }
}

// 2. Hiển thị danh sách 22 bảng bên cột trái
function renderSidebarNav() {
    const navEl = document.getElementById("table-list-nav");
    navEl.innerHTML = TABLE_LABELS.map(item => {
        const isActive = item.id === activeTable;
        const count = tableCountsMap[item.id] ?? "...";
        return `
            <button type="button" onclick="loadTable('${item.id}')"
                    class="w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between gap-2 ${
                        isActive
                            ? "bg-teal-600 text-white font-bold shadow-sm"
                            : "hover:bg-teal-50 text-slate-700"
                    }">
                <span class="truncate">${item.name}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }">${count}</span>
            </button>
        `;
    }).join("");
}

// 3. Tải cấu trúc cột và dữ liệu của bảng đang chọn
async function loadTable(tableName) {
    activeTable = tableName;
    editingRecordId = null;
    renderSidebarNav();

    const labelObj = TABLE_LABELS.find(t => t.id === tableName);
    document.getElementById("current-table-title").textContent = labelObj ? labelObj.name : tableName;
    resetFormMode();

    try {
        const res = await fetch(`${API_BASE_URL}/tables-manager/${tableName}`);
        const data = await res.json();

        currentColumns = data.columns || [];
        currentRows = data.rows || [];
        tableCountsMap[tableName] = data.count;
        renderSidebarNav();

        const pkCol = currentColumns.find(c => c.Key === "PRI") || currentColumns[0];
        currentPrimaryKey = pkCol.Field;

        const statusBadge = document.getElementById("record-status");
        statusBadge.textContent = `Hiện có: ${data.count} bản ghi (${data.count >= 5 ? "Đạt yêu cầu ≥ 5" : "Cần thêm"})`;

        renderDynamicFormFields();
        renderDynamicTableRows();
    } catch (err) {
        alert("Không kết nối được Backend API ở cổng 8000!");
    }
}

// 4. Tự động tạo các ô Input của Form theo cột của bảng
function renderDynamicFormFields() {
    const container = document.getElementById("dynamic-form-fields");
    container.innerHTML = currentColumns.map(col => {
        const isAuto = (col.Extra || "").includes("auto_increment");
        const isRequired = col.Null === "NO" && col.Default === null && !isAuto;

        let inputType = "text";
        if (col.Type.includes("int") || col.Type.includes("decimal")) inputType = "number";
        if (col.Type === "date") inputType = "date";

        return `
            <div>
                <label class="font-bold text-slate-700 block mb-1">
                    ${col.Field}
                    <span class="text-[10px] text-slate-400 font-normal">(${col.Type})</span>
                    ${isAuto ? '<span class="text-[10px] text-teal-600 font-semibold">[Tự tăng]</span>' : (isRequired ? '<span class="text-rose-600">*</span>' : '')}
                </label>
                <input id="input-${col.Field}"
                       name="${col.Field}"
                       type="${inputType}"
                       step="any"
                       ${isAuto ? 'disabled placeholder="Tự động tăng"' : `placeholder="Nhập ${col.Field}..."`}
                       ${isRequired ? 'required' : ''}
                       class="w-full h-9 px-3 rounded-xl text-xs ${
                           isAuto ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-300 bg-white focus:border-teal-600 focus:ring-teal-600/20"
                       }"/>
            </div>
        `;
    }).join("");
}

// 5. Hiển thị danh sách bản ghi dưới dạng Bảng kèm nút Sửa / Xóa
function renderDynamicTableRows() {
    const thead = document.getElementById("dynamic-table-head");
    const tbody = document.getElementById("dynamic-table-body");

    thead.innerHTML = `
        <tr>
            ${currentColumns.map(c => `<th class="p-3 whitespace-nowrap">${c.Field}</th>`).join("")}
            <th class="p-3 text-right whitespace-nowrap">Thao tác</th>
        </tr>
    `;

    tbody.innerHTML = currentRows.map((row, idx) => `
        <tr>
            ${currentColumns.map(c => {
                const val = row[c.Field] !== null && row[c.Field] !== undefined ? String(row[c.Field]) : '<span class="text-slate-300 italic">NULL</span>';
                return `<td class="p-3 cell-truncate" title="${String(row[c.Field] ?? '')}">${val}</td>`;
            }).join("")}
            <td class="p-3 text-right whitespace-nowrap space-x-1">
                <button type="button" onclick="startEditRecord(${idx})"
                        class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white font-bold text-[11px] transition">
                    Sửa
                </button>
                <button type="button" onclick="deleteRecord('${row[currentPrimaryKey]}')"
                        class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white font-bold text-[11px] transition">
                    Xóa
                </button>
            </td>
        </tr>
    `).join("");
}

// 6. Nạp dữ liệu dòng đang chọn lên Form để sửa
function startEditRecord(rowIndex) {
    const row = currentRows[rowIndex];
    if (!row) return;

    editingRecordId = row[currentPrimaryKey];
    currentColumns.forEach(col => {
        const inputEl = document.getElementById(`input-${col.Field}`);
        if (inputEl) {
            inputEl.value = row[col.Field] ?? "";
        }
    });

    document.getElementById("form-mode-subtitle").textContent = `Đang chỉnh sửa bản ghi có ${currentPrimaryKey} = #${editingRecordId}`;
    document.getElementById("btn-submit-text").textContent = `Cập Nhật Bản Ghi #${editingRecordId}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetFormMode() {
    editingRecordId = null;
    const form = document.getElementById("dynamic-table-form");
    if (form) form.reset();
    document.getElementById("form-mode-subtitle").textContent = "Nhập thông tin vào các trường bên dưới để thêm bản ghi mới";
    document.getElementById("btn-submit-text").textContent = "Thêm Bản Ghi Mới";
}

// 7. Gửi dữ liệu Thêm mới hoặc Cập nhật vềTableManagerApiController
async function handleFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());

    const url = editingRecordId
        ? `${API_BASE_URL}/tables-manager/${activeTable}/${currentPrimaryKey}/${editingRecordId}`
        : `${API_BASE_URL}/tables-manager/${activeTable}`;
    const method = editingRecordId ? "PUT" : "POST";

    try {
        const res = await fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        alert(result.message);

        if (result.status === "success") {
            resetFormMode();
            await loadTable(activeTable);
            await fetchTablesSummary();
        }
    } catch (err) {
        alert("Lỗi khi gửi dữ liệu lên Server!");
    }
}

// 8. Xóa bản ghi
async function deleteRecord(id) {
    if (!confirm(`Bạn có chắc chắn muốn xóa bản ghi #${id} khỏi bảng ${activeTable}?`)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/tables-manager/${activeTable}/${currentPrimaryKey}/${id}`, {
            method: "DELETE"
        });
        const result = await res.json();
        alert(result.message);
        await loadTable(activeTable);
        await fetchTablesSummary();
    } catch (err) {
        alert("Lỗi khi xóa bản ghi!");
    }
}

// Khởi chạy khi mở trang
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("dynamic-table-form").addEventListener("submit", handleFormSubmit);
    document.getElementById("btn-reset-form").addEventListener("click", resetFormMode);
    fetchTablesSummary();
    loadTable("KHOA");
});