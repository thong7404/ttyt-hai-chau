// Địa chỉ gốc kết nối tới Backend Laravel API (chạy ở cổng 8000)
const API_BASE_URL = "http://127.0.0.1:8000/api";

// Danh sách 22 bảng trong cơ sở dữ liệu MySQL (ttyt_haichau_db)
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

// Các biến lưu trạng thái hiện tại của trang
let activeTable = "KHOA";          // Tên bảng đang được chọn (mặc định là KHOA)
let currentColumns = [];           // Danh sách các cột của bảng đang chọn
let currentRows = [];              // Danh sách các bản ghi (dòng dữ liệu) của bảng đang chọn
let currentPrimaryKey = "ma_khoa"; // Tên cột khóa chính (Primary Key) của bảng đang chọn
let editingRecordId = null;        // Lưu ID bản ghi đang sửa (nếu = null nghĩa là đang ở chế độ Thêm mới)
let tableCountsMap = {};           // Lưu tổng số lượng bản ghi của từng bảng trong 22 bảng

/**
 * Hàm kiểm tra xem tên cột có phải là cột lưu đường dẫn hình ảnh hay không
 * (Ví dụ: duong_dan_anh_bhyt, duong_dan_anh_cls, duong_dan_anh)
 */
function isImageColumn(fieldName) {
    return fieldName.includes("duong_dan_anh") || fieldName.includes("hinh_anh");
}

/**
 * Hàm kiểm tra xem tên cột có phải là cột cần nút "Chọn tệp từ máy tính" hay không
 * (Bao gồm cả cột hình ảnh và cột file tài liệu huấn luyện AI: duong_dan_file_tai_lieu)
 */
function isFileColumn(fieldName) {
    return isImageColumn(fieldName) || fieldName.includes("duong_dan_file");
}

/**
 * Hàm gọi API (/api/tables-summary) để lấy số lượng bản ghi hiện có của tất cả 22 bảng
 * và cập nhật con số hiển thị bên thanh menu danh sách bảng phía bên trái
 */
async function fetchTablesSummary() {
    try {
        const res = await fetch(`${API_BASE_URL}/tables-summary`);
        const summaryList = await res.json();
        summaryList.forEach(item => {
            tableCountsMap[item.table] = item.count;
        });
        renderSidebarNav();
    } catch (err) {
        console.error("Lỗi tải summary:", err);
    }
}

/**
 * Hàm vẽ danh sách menu 22 bảng ở cột bên trái màn hình kèm số lượng bản ghi của từng bảng
 */
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

/**
 * Hàm tải cấu trúc cột (columns) và dữ liệu thực tế (rows) của 1 bảng từ MySQL thông qua API
 * khi người dùng bấm chọn tên bảng ở menu bên trái
 */
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

        renderDynamicFormFields();
        renderDynamicTableRows();
    } catch (err) {
        alert("Không kết nối được Backend API ở cổng 8000!");
    }
}

/**
 * Hàm tự động sinh các ô nhập liệu (Input) trên Form dựa theo danh sách cột của bảng đang chọn:
 * - Cột khóa chính tự tăng (auto_increment): Khóa ô nhập (disabled)
 * - Cột hình ảnh / tài liệu: Sinh nút chọn tệp từ máy tính (type="file")
 * - Cột số (int, decimal) hoặc ngày tháng (date): Sinh đúng kiểu ô nhập number / date
 */
function renderDynamicFormFields() {
    const container = document.getElementById("dynamic-form-fields");
    container.innerHTML = currentColumns.map(col => {
        const isAuto = (col.Extra || "").includes("auto_increment");
        const isRequired = col.Null === "NO" && col.Default === null && !isAuto;

        if (isFileColumn(col.Field)) {
            const acceptType = isImageColumn(col.Field) ? "image/*" : ".txt,.pdf,.doc,.docx,.xlsx,.csv,image/*";
            return `
                <div class="space-y-1.5">
                    <label class="font-bold text-slate-700 block">
                        ${col.Field}
                        
                        ${isRequired ? '<span class="text-rose-600">*</span>' : ''}
                    </label>
                    <input type="file"
                           accept="${acceptType}"
                           onchange="handleFileSelect(event, '${col.Field}', '${col.Type}')"
                           class="block w-full text-xs text-slate-600 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 border border-slate-300 rounded-xl p-1 bg-white cursor-pointer"/>
                    <input id="input-${col.Field}"
                           name="${col.Field}"
                           type="text"
                           placeholder="Hoặc dán đường dẫn..."
                           ${isRequired ? 'required' : ''}
                           class="w-full h-8 px-2.5 rounded-lg border-slate-200 bg-slate-50 text-[11px] text-slate-600"/>
                    <div id="preview-${col.Field}" class="hidden pt-1"></div>
                </div>
            `;
        }

        let inputType = "text";
        if (col.Type.includes("int") || col.Type.includes("decimal")) inputType = "number";
        if (col.Type === "date") inputType = "date";

        return `
            <div>
                <label class="font-bold text-slate-700 block mb-1">
                    ${col.Field}
        
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

/**
 * Hàm xử lý sự kiện khi người dùng chọn tệp ảnh hoặc tài liệu từ máy tính:
 * Tự động tải tệp lên Server Laravel (/api/tables-manager-upload), điền đường dẫn vào ô input
 * và hiển thị hình ảnh xem trước (Preview)
 */
async function handleFileSelect(event, fieldName, colType) {
    const file = event.target.files[0];
    if (!file) return;

    const textInput = document.getElementById(`input-${fieldName}`);
    const previewBox = document.getElementById(`preview-${fieldName}`);
    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API_BASE_URL}/tables-manager-upload`, {
            method: "POST",
            body: formData
        });
        if (res.ok) {
            const data = await res.json();
            if (data.url) {
                textInput.value = data.url;
                showImagePreview(previewBox, data.url, isImageColumn(fieldName));
                return;
            }
        }
    } catch (e) {}

    if (colType.toLowerCase().includes("text")) {
        const reader = new FileReader();
        reader.onload = function (e) {
            textInput.value = e.target.result;
            showImagePreview(previewBox, e.target.result, isImageColumn(fieldName));
        };
        reader.readAsDataURL(file);
    } else {
        textInput.value = `/uploads/${file.name}`;
        if (isImageColumn(fieldName)) {
            showImagePreview(previewBox, URL.createObjectURL(file), true);
        }
    }
}

/**
 * Hàm hiển thị ảnh thu nhỏ (Preview) ngay bên dưới ô chọn tệp khi người dùng chọn ảnh
 */
function showImagePreview(previewBox, src, isImg) {
    if (!previewBox) return;
    if (isImg && src) {
        previewBox.classList.remove("hidden");
        previewBox.innerHTML = `<img src="${src}" alt="Preview" class="h-14 w-20 object-cover rounded-lg border border-teal-300 shadow-xs"/>`;
    } else {
        previewBox.classList.add("hidden");
        previewBox.innerHTML = "";
    }
}

/**
 * Hàm vẽ bảng danh sách các dòng dữ liệu (rows) bên dưới Form kèm theo 2 nút "Sửa" và "Xóa" ở mỗi dòng
 */
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
                const rawVal = row[c.Field];
                if (rawVal === null || rawVal === undefined || rawVal === "") {
                    return `<td class="p-3"><span class="text-slate-300 italic">NULL</span></td>`;
                }
                const strVal = String(rawVal);
                if (isImageColumn(c.Field) && (strVal.startsWith("http") || strVal.startsWith("data:image"))) {
                    return `
                        <td class="p-2.5">
                            <img src="${strVal}" alt="Ảnh" class="h-10 w-14 object-cover rounded-lg border border-slate-200"/>
                        </td>
                    `;
                }
                return `<td class="p-3 cell-truncate" title="${strVal}">${strVal}</td>`;
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

/**
 * Hàm nạp dữ liệu của dòng được chọn lên các ô Input trên Form khi người dùng bấm nút "Sửa"
 */
function startEditRecord(rowIndex) {
    const row = currentRows[rowIndex];
    if (!row) return;

    editingRecordId = row[currentPrimaryKey];
    currentColumns.forEach(col => {
        const inputEl = document.getElementById(`input-${col.Field}`);
        if (inputEl) {
            inputEl.value = row[col.Field] ?? "";
        }
        const previewBox = document.getElementById(`preview-${col.Field}`);
        if (previewBox && isImageColumn(col.Field) && row[col.Field]) {
            showImagePreview(previewBox, row[col.Field], true);
        }
    });

    document.getElementById("btn-submit-text").textContent = `Cập Nhật Bản Ghi #${editingRecordId}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Hàm làm mới (Reset) các ô nhập trên Form và chuyển trạng thái về chế độ "Thêm Bản Ghi Mới"
 */
function resetFormMode() {
    editingRecordId = null;
    const form = document.getElementById("dynamic-table-form");
    if (form) form.reset();
    document.querySelectorAll("[id^='preview-']").forEach(el => {
        el.classList.add("hidden");
        el.innerHTML = "";
    });
    document.getElementById("btn-submit-text").textContent = "Thêm Bản Ghi Mới";
}

/**
 * Hàm xử lý khi người dùng bấm nút Lưu trên Form:
 * - Nếu editingRecordId == null: Gửi request POST để thêm bản ghi mới vào MySQL
 * - Nếu editingRecordId != null: Gửi request PUT để cập nhật bản ghi đang sửa trong MySQL
 */
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

/**
 * Hàm xóa 1 bản ghi khỏi bảng trong MySQL (gửi request DELETE) khi người dùng bấm nút "Xóa"
 */
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

/**
 * Khởi chạy tự động ngay khi trang web tải xong:
 * Gắn sự kiện cho nút Lưu / Làm mới, tải thống kê 22 bảng và hiển thị bảng đầu tiên (KHOA)
 */
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("dynamic-table-form").addEventListener("submit", handleFormSubmit);
    document.getElementById("btn-reset-form").addEventListener("click", resetFormMode);
    fetchTablesSummary();
    loadTable("KHOA");
});