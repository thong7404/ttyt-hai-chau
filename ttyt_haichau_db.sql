CREATE DATABASE ttyt_haichau_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ttyt_haichau_db;

-- =========================================================================
-- PHẦN 1: KHỞI TẠO CẤU TRÚC 23 BẢNG
-- =========================================================================

-- 1. BẢNG KHOA
CREATE TABLE KHOA (
    ma_khoa VARCHAR(20) PRIMARY KEY,
    ten_khoa VARCHAR(100) NOT NULL,
    mo_ta_chuyen_mon TEXT,
    gia_kham DECIMAL(12,2) NOT NULL DEFAULT 50000
);

-- 2. BẢNG PHÒNG
CREATE TABLE PHONG (
    ma_phong VARCHAR(20) PRIMARY KEY,
    ma_khoa VARCHAR(20) NOT NULL,
    so_phong VARCHAR(20) NOT NULL,
    ten_phong VARCHAR(100) NOT NULL,
    loai_phong VARCHAR(50) NOT NULL,
    trang_thai_hoat_dong VARCHAR(30) DEFAULT 'HoatDong',
    FOREIGN KEY (ma_khoa) REFERENCES KHOA(ma_khoa) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. BẢNG NGƯỜI DÙNG
CREATE TABLE NGUOI_DUNG (
    ma_nguoi_dung VARCHAR(20) PRIMARY KEY,
    vneid VARCHAR(20) NULL UNIQUE,
    ho_ten VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    so_dien_thoai VARCHAR(20),
    mat_khau VARCHAR(255) NOT NULL,
    vai_tro VARCHAR(30) NOT NULL,
    trang_thai VARCHAR(30) DEFAULT 'HoatDong'
);

-- 4. BẢNG MÃ XÁC THỰC OTP
CREATE TABLE MA_XAC_THUC_OTP (
    ma_otp VARCHAR(20) PRIMARY KEY,
    ma_nguoi_dung VARCHAR(20) NOT NULL,
    ma_xac_thuc VARCHAR(6) NOT NULL,
    thoi_gian_het_han DATETIME NOT NULL,
    trang_thai_su_dung VARCHAR(30) DEFAULT 'ChuaSuDung',
    thoi_gian_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. BẢNG NHÂN VIÊN (Định dạng mã: NV + YYMMDD + XX)
CREATE TABLE NHAN_VIEN (
    ma_nhan_vien VARCHAR(20) PRIMARY KEY,
    ma_nguoi_dung VARCHAR(20) NOT NULL UNIQUE,
    ma_khoa VARCHAR(20) NULL,
    chuc_vu VARCHAR(50) NOT NULL,
    chuyen_mon VARCHAR(150) NULL,
    chung_chi_hanh_nghe VARCHAR(50) NULL,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_khoa) REFERENCES KHOA(ma_khoa) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 6. BẢNG BỆNH NHÂN (Định dạng mã: BN + YYMMDD + XX)
CREATE TABLE BENH_NHAN (
    ma_benh_nhan VARCHAR(20) PRIMARY KEY,
    ma_nguoi_dung VARCHAR(20) NULL UNIQUE,
    ngay_sinh DATE NOT NULL,
    gioi_tinh VARCHAR(10) NOT NULL,
    dia_chi VARCHAR(255),
    so_the_bhyt VARCHAR(20) NULL,
    han_the_bhyt DATE NULL,
    noi_dang_ky_bhyt VARCHAR(150) NULL,
    duong_dan_anh_bhyt VARCHAR(255) NULL,
    tien_su_di_ung_benh_nen TEXT NULL,
    stk_ngan_hang VARCHAR(100) NULL,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 7. BẢNG LỊCH LÀM VIỆC (3 ca: Sang, Chieu, Dem)
CREATE TABLE LICH_LAM_VIEC (
    ma_lich_lam VARCHAR(20) PRIMARY KEY,
    ma_nhan_vien VARCHAR(20) NOT NULL,
    ma_phong VARCHAR(20) NOT NULL,
    ngay_lam_viec DATE NOT NULL,
    ca_truc VARCHAR(20) NOT NULL,
    so_luong_bn_toi_da INT DEFAULT 30,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_phong) REFERENCES PHONG(ma_phong) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 8. BẢNG LỊCH HẸN KHÁM
CREATE TABLE LICH_HEN_KHAM (
    ma_lich_hen VARCHAR(20) PRIMARY KEY,
    ma_benh_nhan VARCHAR(20) NOT NULL,
    ma_lich_lam VARCHAR(20) NOT NULL,
    ngay_hen_kham DATE NOT NULL,
    khung_gio_hen VARCHAR(50) NOT NULL,
    trieu_chung_ban_dau TEXT,
    trang_thai_hen VARCHAR(30) DEFAULT 'ChoTiepNhan',
    ly_do_huy TEXT NULL,
    thoi_gian_huy DATETIME NULL,
    FOREIGN KEY (ma_benh_nhan) REFERENCES BENH_NHAN(ma_benh_nhan) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_lich_lam) REFERENCES LICH_LAM_VIEC(ma_lich_lam) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 9. BẢNG HỒ SƠ KHÁM BỆNH
CREATE TABLE HO_SO_KHAM_BENH (
    ma_ho_so_kham VARCHAR(20) PRIMARY KEY,
    ma_lich_hen VARCHAR(20) NULL,
    ma_benh_nhan VARCHAR(20) NOT NULL,
    ma_nhan_vien VARCHAR(20) NULL,
    so_thu_tu_kham INT NOT NULL,
    trang_thai_hang_doi VARCHAR(30) DEFAULT 'ChoSinhHieu',
    tom_tat_benh_su_ai TEXT NULL,
    trieu_chung_lam_sang TEXT NULL,
    ket_luan_chan_doan TEXT NULL,
    huong_xu_tri VARCHAR(30) NULL,
    loi_dan_bac_si TEXT NULL,
    ngay_hen_tai_kham DATE NULL,
    thoi_gian_tiep_nhan DATETIME DEFAULT CURRENT_TIMESTAMP,
    thoi_gian_hoan_tat DATETIME NULL,
    FOREIGN KEY (ma_lich_hen) REFERENCES LICH_HEN_KHAM(ma_lich_hen) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (ma_benh_nhan) REFERENCES BENH_NHAN(ma_benh_nhan) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 10. BẢNG CHỈ SỐ SINH HIỆU
CREATE TABLE CHI_SO_SINH_HIEU (
    ma_sinh_hieu VARCHAR(20) PRIMARY KEY,
    ma_ho_so_kham VARCHAR(20) NOT NULL UNIQUE,
    ma_nhan_vien VARCHAR(20) NOT NULL,
    mach INT,
    nhiet_do DECIMAL(4,1),
    huyet_ap VARCHAR(20),
    nhip_tho INT,
    can_nang DECIMAL(5,2),
    chieu_cao DECIMAL(5,2),
    thoi_gian_do DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 11. BẢNG DANH MỤC CẬN LÂM SÀNG
CREATE TABLE DANH_MUC_CAN_LAM_SANG (
    ma_dich_vu_cls VARCHAR(20) PRIMARY KEY,
    ma_phong VARCHAR(20) NOT NULL,
    ten_dich_vu_cls VARCHAR(150) NOT NULL,
    don_gia_cls DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (ma_phong) REFERENCES PHONG(ma_phong) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 12. BẢNG CHỈ ĐỊNH CẬN LÂM SÀNG
CREATE TABLE CHI_DINH_CAN_LAM_SANG (
    ma_chi_dinh_cls VARCHAR(20) PRIMARY KEY,
    ma_ho_so_kham VARCHAR(20) NOT NULL,
    ma_dich_vu_cls VARCHAR(20) NOT NULL,
    ma_nhan_vien VARCHAR(20) NULL,
    trang_thai_nop_tien VARCHAR(30) DEFAULT 'ChuaNop',
    trang_thai_thuc_hien VARCHAR(30) DEFAULT 'ChoLamCLS',
    ket_qua_cls TEXT NULL,
    ai_phan_tich_cls TEXT NULL,
    thoi_gian_co_ket_qua DATETIME NULL,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_dich_vu_cls) REFERENCES DANH_MUC_CAN_LAM_SANG(ma_dich_vu_cls) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 13. BẢNG ẢNH KẾT QUẢ CẬN LÂM SÀNG
CREATE TABLE ANH_KET_QUA_CLS (
    ma_anh_cls VARCHAR(20) PRIMARY KEY,
    ma_chi_dinh_cls VARCHAR(20) NOT NULL,
    duong_dan_anh_cls LONGTEXT NOT NULL,
    ghi_chu_anh VARCHAR(150) NULL,
    thoi_gian_tai_len DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_chi_dinh_cls) REFERENCES CHI_DINH_CAN_LAM_SANG(ma_chi_dinh_cls) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 14. BẢNG DANH MỤC THUỐC
CREATE TABLE DANH_MUC_THUOC (
    ma_thuoc VARCHAR(20) PRIMARY KEY,
    ten_thuoc VARCHAR(150) NOT NULL,
    hoat_chat VARCHAR(150) NOT NULL,
    don_vi_tinh VARCHAR(30) NOT NULL,
    don_gia_thuoc DECIMAL(12,2) NOT NULL,
    so_luong_ton_kho INT NOT NULL DEFAULT 0
);

-- 15. BẢNG ĐƠN THUỐC
CREATE TABLE DON_THUOC (
    ma_don_thuoc VARCHAR(20) PRIMARY KEY,
    ma_ho_so_kham VARCHAR(20) NOT NULL UNIQUE,
    ma_nhan_vien VARCHAR(20) NULL,
    trang_thai_thanh_toan VARCHAR(30) DEFAULT 'ChuaThu',
    trang_thai_cap_thuoc VARCHAR(30) DEFAULT 'ChoCapThuoc',
    ghi_chu_don_thuoc TEXT NULL,
    thoi_gian_ke_don DATETIME DEFAULT CURRENT_TIMESTAMP,
    thoi_gian_cap_thuoc DATETIME NULL,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 16. BẢNG CHI TIẾT ĐƠN THUỐC
CREATE TABLE CHI_TIET_DON_THUOC (
    ma_chi_tiet_don VARCHAR(20) PRIMARY KEY,
    ma_don_thuoc VARCHAR(20) NOT NULL,
    ma_thuoc VARCHAR(20) NOT NULL,
    so_luong INT NOT NULL,
    lieu_dung_huong_dan VARCHAR(255) NOT NULL,
    don_gia_luc_ke DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (ma_don_thuoc) REFERENCES DON_THUOC(ma_don_thuoc) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_thuoc) REFERENCES DANH_MUC_THUOC(ma_thuoc) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 17. BẢNG HÓA ĐƠN VIỆN PHÍ
CREATE TABLE HOA_DON_VIEN_PHI (
    ma_hoa_don VARCHAR(20) PRIMARY KEY,
    ma_ho_so_kham VARCHAR(20) NOT NULL,
    ma_nhan_vien VARCHAR(20) NULL,
    loai_hoa_don VARCHAR(50) NOT NULL,
    tong_tien_goc DECIMAL(12,2) NOT NULL DEFAULT 0,
    tien_bhyt_chi_tra DECIMAL(12,2) NOT NULL DEFAULT 0,
    tien_benh_nhan_tra DECIMAL(12,2) NOT NULL DEFAULT 0,
    phuong_thuc_thanh_toan VARCHAR(50) DEFAULT 'ChuyenKhoan_VietQR',
    trang_thai_thu VARCHAR(30) DEFAULT 'ChuaThu',
    thoi_gian_thu DATETIME NULL,
    stk_benh_vien VARCHAR(150) DEFAULT '0041000888999 - Vietcombank (TTYT Phường Hải Châu)',
    ma_giao_dich_ngan_hang VARCHAR(100) NULL,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 18. BẢNG CHI TIẾT HÓA ĐƠN
CREATE TABLE CHI_TIET_HOA_DON (
    ma_chi_tiet_hd VARCHAR(20) PRIMARY KEY,
    ma_hoa_don VARCHAR(20) NOT NULL,
    loai_hang_muc VARCHAR(30) NOT NULL,
    ten_hang_muc VARCHAR(150) NOT NULL,
    so_luong INT NOT NULL DEFAULT 1,
    don_gia DECIMAL(12,2) NOT NULL,
    thanh_tien DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (ma_hoa_don) REFERENCES HOA_DON_VIEN_PHI(ma_hoa_don) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 19. BẢNG PHIÊN TRÒ CHUYỆN AI
CREATE TABLE PHIEN_TRO_CHUYEN_AI (
    ma_phien_chat VARCHAR(20) PRIMARY KEY,
    ma_nguoi_dung VARCHAR(20) NOT NULL,
    tieu_de_cuoc_tro_chuyen VARCHAR(150),
    thoi_gian_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 20. BẢNG LỊCH SỬ TIN NHẮN AI
CREATE TABLE LICH_SU_TIN_NHAN_AI (
    ma_tin_nhan VARCHAR(20) PRIMARY KEY,
    ma_phien_chat VARCHAR(20) NOT NULL,
    nguoi_gui VARCHAR(20) NOT NULL,
    noi_dung_tin_nhan TEXT NOT NULL,
    thoi_gian_gui DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_phien_chat) REFERENCES PHIEN_TRO_CHUYEN_AI(ma_phien_chat) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 21. BẢNG ẢNH TIN NHẮN AI
CREATE TABLE ANH_TIN_NHAN_AI (
    ma_anh_tin_nhan VARCHAR(20) PRIMARY KEY,
    ma_tin_nhan VARCHAR(20) NOT NULL,
    duong_dan_anh LONGTEXT NOT NULL,
    thoi_gian_tai_len DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_tin_nhan) REFERENCES LICH_SU_TIN_NHAN_AI(ma_tin_nhan) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 22. BẢNG TÀI LIỆU HUẤN LUYỆN AI
CREATE TABLE TAI_LIEU_HUAN_LUYEN_AI (
    ma_tai_lieu VARCHAR(20) PRIMARY KEY,
    ma_nhan_vien VARCHAR(20) NOT NULL,
    tieu_de_tai_lieu VARCHAR(150) NOT NULL,
    phan_loai_tri_thuc VARCHAR(50) NOT NULL,
    duong_dan_file_tai_lieu VARCHAR(255) NOT NULL,
    noi_dung_van_ban TEXT,
    ten_collection_chromadb VARCHAR(100),
    danh_sach_ma_vector TEXT,
    trang_thai_dong_bo VARCHAR(30) DEFAULT 'ChoVectorHoa',
    thoi_gian_cap_nhat DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 23. BẢNG THÔNG BÁO
CREATE TABLE THONG_BAO (
    ma_thong_bao VARCHAR(20) PRIMARY KEY,
    ma_nguoi_dung VARCHAR(20) NOT NULL,
    loai_thong_bao VARCHAR(50) DEFAULT 'NhacLichHen',
    tieu_de VARCHAR(255) NOT NULL,
    noi_dung TEXT NOT NULL,
    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_thongbao_nguoidung
        FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================================================
-- PHẦN 2: DỮ LIỆU KHOA, PHÒNG, DỊCH VỤ CLS & THUỐC (GIÁ THỰC TẾ THỊ TRƯỜNG)
-- =========================================================================

-- 1. KHOA (12 khoa thực tế tại TTYT Phường Hải Châu — Không có khoa 0đ)
INSERT INTO KHOA (ma_khoa, ten_khoa, mo_ta_chuyen_mon, gia_kham) VALUES
('KH001', 'Khoa Nội Tổng Quát', 'Khám và điều trị các bệnh lý tim mạch, tăng huyết áp, đái tháo đường, tiêu hóa, hô hấp nội khoa', 50000),
('KH002', 'Khoa Tai - Mũi - Họng', 'Khám viêm họng cấp, viêm xoang, viêm amidan, viêm tai giữa, nội soi Tai - Mũi - Họng', 55000),
('KH003', 'Khoa Cận Lâm Sàng', 'Khám tư vấn chỉ định, thực hiện và đọc kết quả Xét nghiệm, X-Quang, Siêu âm 4D, CT Scanner, MRI, Nội soi', 50000),
('KH004', 'Khoa Cơ - Xương - Khớp', 'Khám thoái hóa cột sống, viêm khớp, đau thần kinh tọa, gout và chấn thương vận động', 55000),
('KH005', 'Khoa Y Học Cổ Truyền & PHCN', 'Châm cứu, điện châm, bấm huyệt, xoa bóp và phục hồi chức năng sau chấn thương, tai biến', 50000),
('KH006', 'Khoa Ngoại Tổng Hợp', 'Khám ngoại khoa tổng quát, tiểu phẫu vết thương phần mềm, áp xe, thay băng, cắt chỉ, sỏi tiết niệu', 55000),
('KH007', 'Khoa Phụ Sản & KHHGĐ', 'Khám thai định kỳ, siêu âm sản khoa, khám điều trị phụ khoa và tư vấn kế hoạch hóa gia đình', 55000),
('KH008', 'Khoa Nhi', 'Khám và điều trị bệnh lý hô hấp, tiêu hóa, sốt phát ban, dinh dưỡng và tư vấn tiêm chủng trẻ em', 50000),
('KH009', 'Khoa Răng - Hàm - Mặt', 'Khám răng miệng, lấy cao răng, hàn răng sâu, nhổ răng, điều trị viêm nha chu', 55000),
('KH010', 'Khoa Mắt', 'Đo khúc xạ, khám viêm kết mạc, đục thủy tinh thể, tăng nhãn áp và lấy dị vật giác mạc', 55000),
('KH011', 'Khoa Da Liễu & Truyền Nhiễm', 'Khám viêm da dị ứng, nấm da, zona thần kinh, sốt xuất huyết, thủy đậu và các bệnh truyền nhiễm', 50000),
('KH012', 'Khoa Cấp Cứu - Hồi Sức Tích Cực', 'Tiếp nhận cấp cứu nội - ngoại khoa 24/7, xử trí phản vệ, chấn thương và chuyển tuyến cấp cứu', 70000);

-- 2. PHONG (20 phòng: PH001 -> PH020)
INSERT INTO PHONG (ma_phong, ma_khoa, so_phong, ten_phong, loai_phong, trang_thai_hoat_dong) VALUES
('PH001', 'KH001', 'P101', 'Quầy Tiếp Đón & Bàn Khám Sàng Lọc', 'TiepDon_SinhHieu', 'HoatDong'),
('PH002', 'KH001', 'P102', 'Phòng Khám Nội Tổng Quát', 'PhongKhamBS', 'HoatDong'),
('PH003', 'KH002', 'P103', 'Phòng Khám Tai - Mũi - Họng', 'PhongKhamBS', 'HoatDong'),
('PH004', 'KH003', 'P201', 'Phòng Xét Nghiệm Huyết Học & Sinh Hóa', 'PhongCLS', 'HoatDong'),
('PH005', 'KH001', 'P104', 'Quầy Thu Ngân - Kế Toán Viện Phí', 'KeToan', 'HoatDong'),
('PH006', 'KH001', 'P105', 'Quầy Dược - Cấp Phát Thuốc BHYT', 'Duoc', 'HoatDong'),
('PH007', 'KH004', 'P106', 'Phòng Khám Cơ - Xương - Khớp', 'PhongKhamBS', 'HoatDong'),
('PH008', 'KH005', 'P107', 'Phòng Khám Y Học Cổ Truyền & PHCN', 'PhongKhamBS', 'HoatDong'),
('PH009', 'KH006', 'P108', 'Phòng Khám Ngoại Tổng Hợp & Tiểu Phẫu', 'PhongKhamBS', 'HoatDong'),
('PH010', 'KH007', 'P109', 'Phòng Khám Phụ Sản & Chăm Sóc Sinh Sản', 'PhongKhamBS', 'HoatDong'),
('PH011', 'KH008', 'P110', 'Phòng Khám Nhi Tổng Quát', 'PhongKhamBS', 'HoatDong'),
('PH012', 'KH009', 'P111', 'Phòng Khám Răng - Hàm - Mặt', 'PhongKhamBS', 'HoatDong'),
('PH013', 'KH010', 'P112', 'Phòng Khám Mắt & Đo Khúc Xạ', 'PhongKhamBS', 'HoatDong'),
('PH014', 'KH011', 'P113', 'Phòng Khám Da Liễu & Truyền Nhiễm', 'PhongKhamBS', 'HoatDong'),
('PH015', 'KH012', 'P114', 'Phòng Cấp Cứu - Hồi Sức Tích Cực 24/7', 'PhongKhamBS', 'HoatDong'),
('PH016', 'KH003', 'P202', 'Phòng Chụp X-Quang Kỹ Thuật Số', 'PhongCLS', 'HoatDong'),
('PH017', 'KH003', 'P203', 'Phòng Siêu Âm Màu 4D & Doppler', 'PhongCLS', 'HoatDong'),
('PH018', 'KH003', 'P204', 'Phòng Chụp Cắt Lớp Vi Tính (CT Scanner)', 'PhongCLS', 'HoatDong'),
('PH019', 'KH003', 'P205', 'Phòng Chụp Cộng Hưởng Từ (MRI 1.5 Tesla)', 'PhongCLS', 'HoatDong'),
('PH020', 'KH003', 'P206', 'Phòng Nội Soi & Thăm Dò Chức Năng (ECG)', 'PhongCLS', 'HoatDong');

-- 11. DANH_MUC_CAN_LAM_SANG (22 dịch vụ thực tế tại TTYT Phường Hải Châu)
INSERT INTO DANH_MUC_CAN_LAM_SANG (ma_dich_vu_cls, ma_phong, ten_dich_vu_cls, don_gia_cls) VALUES
('DVCLS001', 'PH016', 'Chụp X-Quang Tim Phổi Thẳng Kỹ Thuật Số', 85000),
('DVCLS002', 'PH017', 'Siêu Âm Tổng Quát Ổ Bụng Màu 4D', 120000),
('DVCLS003', 'PH004', 'Xét Nghiệm Tổng Phân Tích Tế Bào Máu Ngoại Vi', 60000),
('DVCLS004', 'PH020', 'Đo Điện Tâm Đồ (ECG) 12 Chuyển Đạo', 55000),
('DVCLS005', 'PH004', 'Xét Nghiệm Sinh Hóa Máu (Đường Huyết & Bộ Mỡ Máu)', 120000),
('DVCLS006', 'PH016', 'Chụp X-Quang Cột Sống Thắt Lưng (Thẳng - Nghiêng)', 110000),
('DVCLS007', 'PH016', 'Chụp X-Quang Xương Khớp Chi (Cổ Tay / Khớp Gối)', 90000),
('DVCLS008', 'PH016', 'Chụp X-Quang Xoang Blondeau - Hirtz', 95000),
('DVCLS009', 'PH017', 'Siêu Âm Tuyến Giáp & Hạch Vùng Cổ', 120000),
('DVCLS010', 'PH017', 'Siêu Âm Tim Doppler Màu Qua Thành Ngực', 250000),
('DVCLS011', 'PH017', 'Siêu Âm Thai Màu 4D & Đo Độ Mờ Da Gáy', 250000),
('DVCLS012', 'PH017', 'Siêu Âm Tuyến Vú Hai Bên', 120000),
('DVCLS013', 'PH004', 'Xét Nghiệm Chức Năng Gan (AST, ALT, GGT, Bilirubin)', 130000),
('DVCLS014', 'PH004', 'Xét Nghiệm Chức Năng Thận & Gout (Ure, Creatinin, Acid Uric)', 110000),
('DVCLS015', 'PH004', 'Xét Nghiệm Định Lượng HbA1c (Theo Dõi Đái Tháo Đường)', 140000),
('DVCLS016', 'PH004', 'Xét Nghiệm Tổng Phân Tích Nước Tiểu 10 Thông Số', 45000),
('DVCLS017', 'PH004', 'Test Nhanh Sốt Xuất Huyết Dengue NS1Ag / IgM / IgG', 150000),
('DVCLS018', 'PH018', 'Chụp Cắt Lớp Vi Tính (CT Scanner) Sọ Não Không Tiêm Thuốc', 750000),
('DVCLS019', 'PH018', 'Chụp Cắt Lớp Vi Tính (CT Scanner) Lồng Ngực / Ổ Bụng', 950000),
('DVCLS020', 'PH019', 'Chụp Cộng Hưởng Từ (MRI 1.5 Tesla) Cột Sống Thắt Lưng', 2100000),
('DVCLS021', 'PH020', 'Nội Soi Tai - Mũi - Họng Ống Mềm Kỹ Thuật Số', 150000),
('DVCLS022', 'PH020', 'Nội Soi Thực Quản - Dạ Dày - Tá Tràng Có Test HP', 450000);

-- 14. DANH_MUC_THUOC (25 loại thuốc BHYT & dịch vụ theo giá thị trường)
INSERT INTO DANH_MUC_THUOC (ma_thuoc, ten_thuoc, hoat_chat, don_vi_tinh, don_gia_thuoc, so_luong_ton_kho) VALUES
('TH001', 'Amoxicillin 500mg', 'Amoxicillin', 'Viên', 2500, 1200),
('TH002', 'Paracetamol 500mg', 'Paracetamol', 'Viên', 1500, 2000),
('TH003', 'Vitamin C 500mg', 'Acid Ascorbic', 'Viên', 1000, 1500),
('TH004', 'Omeprazole 20mg', 'Omeprazole', 'Viên', 2500, 1000),
('TH005', 'Amlodipine 5mg', 'Amlodipine', 'Viên', 3000, 1400),
('TH006', 'Augmentin 625mg', 'Amoxicillin 500mg + Acid Clavulanic 125mg', 'Viên', 12000, 600),
('TH007', 'Cefuroxim 500mg', 'Cefuroxim Axetil', 'Viên', 7500, 750),
('TH008', 'Azithromycin 500mg', 'Azithromycin', 'Viên', 8000, 500),
('TH009', 'Ibuprofen 400mg', 'Ibuprofen', 'Viên', 2000, 900),
('TH010', 'Meloxicam 7.5mg', 'Meloxicam', 'Viên', 3500, 800),
('TH011', 'Celecoxib 200mg', 'Celecoxib', 'Viên', 6000, 650),
('TH012', 'Losartan 50mg', 'Losartan Kali', 'Viên', 4500, 1100),
('TH013', 'Metformin 850mg', 'Metformin HCl', 'Viên', 2500, 1300),
('TH014', 'Atorvastatin 20mg', 'Atorvastatin', 'Viên', 5000, 950),
('TH015', 'Esomeprazole 40mg', 'Esomeprazole', 'Viên', 6500, 850),
('TH016', 'Domperidone 10mg', 'Domperidone', 'Viên', 2000, 700),
('TH017', 'Acetylcysteine 200mg (Gói)', 'Acetylcysteine', 'Gói', 3000, 1000),
('TH018', 'Cetirizine 10mg', 'Cetirizine HCl', 'Viên', 2000, 1100),
('TH019', 'Methylprednisolone 16mg', 'Methylprednisolone', 'Viên', 4500, 600),
('TH020', 'Salbutamol 2mg', 'Salbutamol', 'Viên', 2000, 550),
('TH021', 'Oresol 245 (Gói bù nước)', 'Natri Clorid + Kali Clorid + Glucose', 'Gói', 2500, 1500),
('TH022', 'Natri Clorid 0.9% (Chai 500ml)', 'Natri Clorid 0.9%', 'Chai', 12000, 400),
('TH023', 'Canxi D3 (Calci Carbonat + Cholecalciferol)', 'Calci + Vitamin D3', 'Viên', 4000, 900),
('TH024', 'Sắt Fumarat + Acid Folic', 'Ferrous Fumarate + Folic Acid', 'Viên', 3500, 800),
('TH025', 'Nhỏ Mắt Tobramycin 0.3% (Lọ 5ml)', 'Tobramycin', 'Lọ', 25000, 350);


-- =========================================================================
-- PHẦN 3: NGƯỜI DÙNG, OTP, NHÂN VIÊN (50 NHÂN SỰ CHIA 3 CA) & BỆNH NHÂN
-- Định dạng mã: NV261120XX & BN261120XX | Mật khẩu mặc định demo: "123456"
-- =========================================================================

-- 3. NGUOI_DUNG (56 tài khoản: ND001 -> ND056)
INSERT INTO NGUOI_DUNG (ma_nguoi_dung, vneid, ho_ten, email, so_dien_thoai, mat_khau, vai_tro, trang_thai) VALUES
-- 8 Tài khoản nhân sự demo gốc
('ND001', '048200000001', 'Quản trị viên Hệ thống', 'admin@ttythaichau.vn', '0905000001', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'QuanTri', 'HoatDong'),
('ND002', '048200000002', 'ĐD. Nguyễn Thị Lan (Tiếp đón & Sàng lọc)', 'nvyt@ttythaichau.vn', '0905000002', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND003', '048200000003', 'BS.CKI Nguyễn Văn Hưng (Trưởng khoa Nội)', 'bacsi@ttythaichau.vn', '0905000003', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND004', '048200000004', 'CN. Lê Thị Thu Ngân (Kế toán)', 'ketoan@ttythaichau.vn', '0905000004', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'KeToan', 'HoatDong'),
('ND005', '048200000005', 'DS. Trần Quốc Bảo (Dược sĩ)', 'duocsi@ttythaichau.vn', '0905000005', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'DuocSi', 'HoatDong'),
('ND006', '048200000006', 'ThS.BS Lê Quang Đức (BS Tai Mũi Họng)', 'bsduc@ttythaichau.vn', '0905000006', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND007', '048200000007', 'BS.CKI Trần Ngọc Sơn (BS Cơ Xương Khớp)', 'bsson@ttythaichau.vn', '0905000007', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND008', '048200000008', 'KTV. Phạm Ngọc Ánh (Nhân viên CLS)', 'nvcls@ttythaichau.vn', '0905000008', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),

-- 6 Tài khoản Bệnh nhân mẫu
('ND009', '048200001234', 'CAO TRUNG', 'caotrung14022000@gmail.com', '0987691004', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
('ND010', '048078005678', 'NGUYỄN VĂN AN', 'nguyenvanan@gmail.com', '0905112233', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
('ND011', '048195009101', 'TRẦN THỊ MINH CHÂU', 'minhchau@gmail.com', '0914223344', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
('ND012', '048065001122', 'LÊ HOÀNG NAM', 'hoangnam@gmail.com', '0935667788', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
('ND013', '048188003344', 'PHẠM THỊ THU HÀ', 'thuha@gmail.com', '0905998877', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
('ND014', '048082005566', 'VÕ ĐỨC THẮNG', 'voducthang@gmail.com', '0977889900', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),

-- 42 Nhân sự bổ sung (Đủ xếp lịch 3 ca Sáng - Chiều - Đêm)
('ND015', '048200000015', 'CN. Võ Minh Tuấn (Quản trị CNTT)', 'admin2@ttythaichau.vn', '0905000015', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'QuanTri', 'HoatDong'),
('ND016', '048200000016', 'ĐD. Trần Thị Mai (Tiếp đón & Sàng lọc)', 'dd.mai@ttythaichau.vn', '0905000016', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND017', '048200000017', 'ĐD. Lê Thị Hồng Nhung (Tiếp đón & Sàng lọc)', 'dd.nhung@ttythaichau.vn', '0905000017', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND018', '048200000018', 'ĐD. Phạm Thị Thanh Thảo (Điều dưỡng ca Chiều)', 'dd.thao@ttythaichau.vn', '0905000018', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND019', '048200000019', 'ĐD. Huỳnh Văn Dũng (Điều dưỡng trực Đêm)', 'dd.dung@ttythaichau.vn', '0905000019', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND020', '048200000020', 'ĐD. Nguyễn Thị Bích Ngọc (Điều dưỡng trực Đêm)', 'dd.ngoc@ttythaichau.vn', '0905000020', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),

('ND021', '048200000021', 'KTV. Đặng Quốc Huy (X-Quang & CT Scanner)', 'ktv.huy@ttythaichau.vn', '0905000021', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND022', '048200000022', 'KTV. Nguyễn Thị Kim Oanh (Siêu âm 4D & Doppler)', 'ktv.oanh@ttythaichau.vn', '0905000022', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND023', '048200000023', 'KTV. Bùi Minh Khôi (Xét nghiệm Sinh hóa)', 'ktv.khoi@ttythaichau.vn', '0905000023', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND024', '048200000024', 'KTV. Trương Văn Lộc (Chẩn đoán hình ảnh MRI)', 'ktv.loc@ttythaichau.vn', '0905000024', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
('ND025', '048200000025', 'KTV. Đỗ Thị Thu Trang (Nội soi & ECG ca Đêm)', 'ktv.trang@ttythaichau.vn', '0905000025', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),

('ND026', '048200000026', 'CN. Nguyễn Thị Mỹ Linh (Kế toán ca Chiều)', 'kt.linh@ttythaichau.vn', '0905000026', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'KeToan', 'HoatDong'),
('ND027', '048200000027', 'CN. Phan Văn Thành (Kế toán trực Đêm)', 'kt.thanh@ttythaichau.vn', '0905000027', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'KeToan', 'HoatDong'),
('ND028', '048200000028', 'CN. Ngô Thị Quỳnh Như (Kế toán BHYT xoay ca)', 'kt.nhu@ttythaichau.vn', '0905000028', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'KeToan', 'HoatDong'),

('ND029', '048200000029', 'DS. Phạm Thị Thanh Tâm (Dược sĩ ca Chiều)', 'ds.tam@ttythaichau.vn', '0905000029', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'DuocSi', 'HoatDong'),
('ND030', '048200000030', 'DS. Lê Minh Hiếu (Dược sĩ trực Đêm)', 'ds.hieu@ttythaichau.vn', '0905000030', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'DuocSi', 'HoatDong'),
('ND031', '048200000031', 'DS. Nguyễn Thị Bảo Trâm (Dược sĩ Kho thuốc)', 'ds.tram@ttythaichau.vn', '0905000031', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'DuocSi', 'HoatDong'),

('ND032', '048200000032', 'BS.CKI Hoàng Thị Thu Thủy (Khoa Nội)', 'bs.thuy@ttythaichau.vn', '0905000032', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND033', '048200000033', 'BS. Đinh Văn Phúc (Khoa Nội trực Đêm)', 'bs.phuc@ttythaichau.vn', '0905000033', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND034', '048200000034', 'BS.CKI Nguyễn Thị Kiều Oanh (Khoa Tai Mũi Họng)', 'bs.kieuoanh@ttythaichau.vn', '0905000034', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND035', '048200000035', 'BS. Võ Thanh Bình (Khoa Cơ Xương Khớp)', 'bs.binh@ttythaichau.vn', '0905000035', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND036', '048200000036', 'BS.CKI Phan Thị Mỹ Duyên (Khoa YHCT & PHCN)', 'bs.duyen@ttythaichau.vn', '0905000036', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND037', '048200000037', 'BS. Lý Quốc Việt (Khoa YHCT & PHCN)', 'bs.viet@ttythaichau.vn', '0905000037', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND038', '048200000038', 'BS.CKII Trần Minh Quân (Trưởng khoa Ngoại)', 'bs.quan@ttythaichau.vn', '0905000038', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND039', '048200000039', 'BS.CKI Nguyễn Hữu Nghĩa (Khoa Ngoại)', 'bs.nghia@ttythaichau.vn', '0905000039', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND040', '048200000040', 'BS. Phạm Quốc Thắng (Khoa Ngoại trực Đêm)', 'bs.thang@ttythaichau.vn', '0905000040', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND041', '048200000041', 'BS.CKI Lê Thị Thanh Hương (Trưởng khoa Phụ Sản)', 'bs.huong@ttythaichau.vn', '0905000041', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND042', '048200000042', 'BS. Nguyễn Thị Cẩm Vân (Khoa Phụ Sản)', 'bs.van@ttythaichau.vn', '0905000042', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND043', '048200000043', 'BS. Trần Thị Diễm My (Khoa Phụ Sản trực Đêm)', 'bs.my@ttythaichau.vn', '0905000043', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND044', '048200000044', 'BS.CKI Huỳnh Ngọc Anh (Trưởng khoa Nhi)', 'bs.anh@ttythaichau.vn', '0905000044', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND045', '048200000045', 'BS. Đặng Thị Phương Thảo (Khoa Nhi)', 'bs.pthao@ttythaichau.vn', '0905000045', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND046', '048200000046', 'BS. Nguyễn Minh Khoa (Khoa Nhi trực Đêm)', 'bs.khoa@ttythaichau.vn', '0905000046', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND047', '048200000047', 'BS.CKI Trương Công Danh (Khoa Răng Hàm Mặt)', 'bs.danh@ttythaichau.vn', '0905000047', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND048', '048200000048', 'BS. Vũ Thị Khánh Linh (Khoa Răng Hàm Mặt)', 'bs.klinh@ttythaichau.vn', '0905000048', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND049', '048200000049', 'BS.CKI Nguyễn Quang Vinh (Khoa Mắt)', 'bs.vinh@ttythaichau.vn', '0905000049', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND050', '048200000050', 'BS. Lê Thị Ngọc Hân (Khoa Mắt)', 'bs.han@ttythaichau.vn', '0905000050', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND051', '048200000051', 'BS.CKI Mai Thị Hồng Nhung (Khoa Da Liễu & Truyền Nhiễm)', 'bs.hnhung@ttythaichau.vn', '0905000051', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND052', '048200000052', 'BS. Cao Văn Toàn (Khoa Da Liễu & Truyền Nhiễm)', 'bs.toan@ttythaichau.vn', '0905000052', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND053', '048200000053', 'BS.CKI Nguyễn Tấn Phát (Trưởng khoa Cấp Cứu)', 'bs.phat@ttythaichau.vn', '0905000053', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND054', '048200000054', 'BS. Trần Hoàng Long (Khoa Cấp Cứu ca Chiều)', 'bs.long@ttythaichau.vn', '0905000054', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND055', '048200000055', 'BS. Lê Anh Kiệt (Khoa Cấp Cứu trực Đêm)', 'bs.kiet@ttythaichau.vn', '0905000055', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
('ND056', '048200000056', 'BS. Phạm Quốc Cường (Khoa Cấp Cứu xoay ca 24/7)', 'bs.cuong@ttythaichau.vn', '0905000056', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong');

-- 4. MA_XAC_THUC_OTP (5 bản ghi)
INSERT INTO MA_XAC_THUC_OTP (ma_otp, ma_nguoi_dung, ma_xac_thuc, thoi_gian_het_han, trang_thai_su_dung, thoi_gian_tao) VALUES
('OTP001', 'ND009', '159357', '2026-11-20 10:10:00', 'DaSuDung', '2026-11-20 10:00:00'),
('OTP002', 'ND010', '246810', '2026-11-20 11:10:00', 'DaSuDung', '2026-11-20 11:00:00'),
('OTP003', 'ND011', '369258', '2026-11-20 14:10:00', 'DaSuDung', '2026-11-20 14:00:00'),
('OTP004', 'ND012', '482604', '2026-11-20 15:10:00', 'ChuaSuDung', '2026-11-20 15:00:00'),
('OTP005', 'ND013', '753951', '2026-11-20 15:30:00', 'ChuaSuDung', '2026-11-20 15:20:00');

-- 5. NHAN_VIEN (50 nhân sự theo chuẩn NV261120XX: NV26112001 -> NV26112050)
INSERT INTO NHAN_VIEN (ma_nhan_vien, ma_nguoi_dung, ma_khoa, chuc_vu, chuyen_mon, chung_chi_hanh_nghe) VALUES
('NV26112001', 'ND001', 'KH001', 'QuanTriVien', 'Quản trị Hệ thống Y tế Số', 'CCHN-QT-001'),
('NV26112002', 'ND002', 'KH001', 'DieuDuong', 'Điều dưỡng Tiếp đón & Khám sàng lọc', 'CCHN-DD-002'),
('NV26112003', 'ND003', 'KH001', 'BacSi', 'Bác sĩ CKI Nội Tổng Quát', 'CCHN-BS-003'),
('NV26112004', 'ND004', 'KH001', 'KeToan', 'Kế toán Thu ngân Viện phí', 'CCHN-KT-004'),
('NV26112005', 'ND005', 'KH001', 'DuocSi', 'Dược sĩ Lâm sàng & Kho BHYT', 'CCHN-DS-005'),
('NV26112006', 'ND006', 'KH002', 'BacSi', 'Thạc sĩ Bác sĩ Tai Mũi Họng', 'CCHN-BS-006'),
('NV26112007', 'ND007', 'KH004', 'BacSi', 'Bác sĩ CKI Cơ Xương Khớp', 'CCHN-BS-007'),
('NV26112008', 'ND008', 'KH003', 'KTV_CLS', 'Kỹ thuật viên Xét nghiệm & CĐHA', 'CCHN-CLS-008'),
('NV26112009', 'ND015', 'KH001', 'QuanTriVien', 'Quản trị Hạ tầng & Cơ sở dữ liệu HIS', 'CCHN-QT-009'),
('NV26112010', 'ND016', 'KH001', 'DieuDuong', 'Điều dưỡng Tiếp đón & Khám sàng lọc (Ca Sáng)', 'CCHN-DD-010'),
('NV26112011', 'ND017', 'KH001', 'DieuDuong', 'Điều dưỡng Tiếp đón & Khám sàng lọc (Ca Chiều)', 'CCHN-DD-011'),
('NV26112012', 'ND018', 'KH001', 'DieuDuong', 'Điều dưỡng Tiếp đón & Khám sàng lọc (Ca Chiều)', 'CCHN-DD-012'),
('NV26112013', 'ND019', 'KH001', 'DieuDuong', 'Điều dưỡng Cấp cứu & Khám sàng lọc (Ca Đêm)', 'CCHN-DD-013'),
('NV26112014', 'ND020', 'KH001', 'DieuDuong', 'Điều dưỡng Tiếp đón & Sàng lọc (Ca Đêm)', 'CCHN-DD-014'),
('NV26112015', 'ND021', 'KH003', 'KTV_CLS', 'Kỹ thuật viên Chụp X-Quang & CT Scanner', 'CCHN-CLS-015'),
('NV26112016', 'ND022', 'KH003', 'KTV_CLS', 'Kỹ thuật viên Siêu âm 4D & Doppler màu', 'CCHN-CLS-016'),
('NV26112017', 'ND023', 'KH003', 'KTV_CLS', 'Kỹ thuật viên Xét nghiệm Huyết học & Sinh hóa', 'CCHN-CLS-017'),
('NV26112018', 'ND024', 'KH003', 'KTV_CLS', 'Kỹ thuật viên Chẩn đoán Hình ảnh MRI 1.5T', 'CCHN-CLS-018'),
('NV26112019', 'ND025', 'KH003', 'KTV_CLS', 'Kỹ thuật viên Nội soi & Điện tâm đồ (Trực Đêm)', 'CCHN-CLS-019'),
('NV26112020', 'ND026', 'KH001', 'KeToan', 'Kế toán Thu ngân Viện phí (Ca Chiều)', 'CCHN-KT-020'),
('NV26112021', 'ND027', 'KH001', 'KeToan', 'Kế toán Thu ngân Viện phí (Ca Đêm)', 'CCHN-KT-021'),
('NV26112022', 'ND028', 'KH001', 'KeToan', 'Kế toán Quyết toán BHYT (Xoay ca)', 'CCHN-KT-022'),
('NV26112023', 'ND029', 'KH001', 'DuocSi', 'Dược sĩ Cấp phát Thuốc BHYT (Ca Chiều)', 'CCHN-DS-023'),
('NV26112024', 'ND030', 'KH001', 'DuocSi', 'Dược sĩ Cấp phát Thuốc Trực Đêm', 'CCHN-DS-024'),
('NV26112025', 'ND031', 'KH001', 'DuocSi', 'Dược sĩ Quản lý Kho thuốc BHYT (Xoay ca)', 'CCHN-DS-025'),
('NV26112026', 'ND032', 'KH001', 'BacSi', 'Bác sĩ CKI Nội Tổng Quát - Tim Mạch', 'CCHN-BS-026'),
('NV26112027', 'ND033', 'KH001', 'BacSi', 'Bác sĩ Nội Tổng Quát (Trực Đêm)', 'CCHN-BS-027'),
('NV26112028', 'ND034', 'KH002', 'BacSi', 'Bác sĩ CKI Tai - Mũi - Họng', 'CCHN-BS-028'),
('NV26112029', 'ND035', 'KH004', 'BacSi', 'Bác sĩ Cơ - Xương - Khớp', 'CCHN-BS-029'),
('NV26112030', 'ND036', 'KH005', 'BacSi', 'Bác sĩ CKI Y Học Cổ Truyền & PHCN', 'CCHN-BS-030'),
('NV26112031', 'ND037', 'KH005', 'BacSi', 'Bác sĩ Y Học Cổ Truyền & Châm cứu', 'CCHN-BS-031'),
('NV26112032', 'ND038', 'KH006', 'BacSi', 'Bác sĩ CKII Ngoại Tổng Hợp', 'CCHN-BS-032'),
('NV26112033', 'ND039', 'KH006', 'BacSi', 'Bác sĩ CKI Ngoại Tổng Hợp', 'CCHN-BS-033'),
('NV26112034', 'ND040', 'KH006', 'BacSi', 'Bác sĩ Ngoại Tổng Hợp (Trực Đêm)', 'CCHN-BS-034'),
('NV26112035', 'ND041', 'KH007', 'BacSi', 'Bác sĩ CKI Sản Phụ Khoa', 'CCHN-BS-035'),
('NV26112036', 'ND042', 'KH007', 'BacSi', 'Bác sĩ Sản Phụ Khoa & Siêu âm thai', 'CCHN-BS-036'),
('NV26112037', 'ND043', 'KH007', 'BacSi', 'Bác sĩ Sản Phụ Khoa (Trực Đêm)', 'CCHN-BS-037'),
('NV26112038', 'ND044', 'KH008', 'BacSi', 'Bác sĩ CKI Nhi Khoa', 'CCHN-BS-038'),
('NV26112039', 'ND045', 'KH008', 'BacSi', 'Bác sĩ Nhi Tổng Quát & Dinh dưỡng', 'CCHN-BS-039'),
('NV26112040', 'ND046', 'KH008', 'BacSi', 'Bác sĩ Nhi Khoa (Trực Đêm)', 'CCHN-BS-040'),
('NV26112041', 'ND047', 'KH009', 'BacSi', 'Bác sĩ CKI Răng - Hàm - Mặt', 'CCHN-BS-041'),
('NV26112042', 'ND048', 'KH009', 'BacSi', 'Bác sĩ Răng - Hàm - Mặt', 'CCHN-BS-042'),
('NV26112043', 'ND049', 'KH010', 'BacSi', 'Bác sĩ CKI Nhãn Khoa', 'CCHN-BS-043'),
('NV26112044', 'ND050', 'KH010', 'BacSi', 'Bác sĩ Mắt & Khúc xạ', 'CCHN-BS-044'),
('NV26112045', 'ND051', 'KH011', 'BacSi', 'Bác sĩ CKI Da Liễu & Truyền Nhiễm', 'CCHN-BS-045'),
('NV26112046', 'ND052', 'KH011', 'BacSi', 'Bác sĩ Da Liễu & Bệnh Truyền Nhiễm', 'CCHN-BS-046'),
('NV26112047', 'ND053', 'KH012', 'BacSi', 'Bác sĩ CKI Hồi Sức Cấp Cứu (Ca Sáng)', 'CCHN-BS-047'),
('NV26112048', 'ND054', 'KH012', 'BacSi', 'Bác sĩ Hồi Sức Cấp Cứu (Ca Chiều)', 'CCHN-BS-048'),
('NV26112049', 'ND055', 'KH012', 'BacSi', 'Bác sĩ Hồi Sức Cấp Cứu (Ca Đêm)', 'CCHN-BS-049'),
('NV26112050', 'ND056', 'KH012', 'BacSi', 'Bác sĩ Hồi Sức Cấp Cứu (Xoay ca 24/7)', 'CCHN-BS-050');

-- 6. BENH_NHAN (6 bệnh nhân mẫu theo chuẩn BN261120XX: BN26112001 -> BN26112006)
INSERT INTO BENH_NHAN (ma_benh_nhan, ma_nguoi_dung, ngay_sinh, gioi_tinh, dia_chi, so_the_bhyt, han_the_bhyt, noi_dang_ky_bhyt, tien_su_di_ung_benh_nen, stk_ngan_hang) VALUES
('BN26112001', 'ND009', '2000-02-14', 'Nam', '88 Trần Phú, Phường Hải Châu, TP. Đà Nẵng', 'GD4480012345678', '2027-12-31', 'TTYT Phường Hải Châu', 'Không dị ứng thuốc', '987691004 - MB Bank'),
('BN26112002', 'ND010', '1978-05-20', 'Nam', '124 Nguyễn Chí Thanh, Phường Hải Châu, TP. Đà Nẵng', 'DN4480098765432', '2027-12-31', 'TTYT Phường Hải Châu', 'Tăng huyết áp 3 năm, dị ứng Aspirin', '1029384756 - Vietcombank'),
('BN26112003', 'ND011', '1995-09-12', 'Nu', '45 Lê Duẩn, Phường Hải Châu, TP. Đà Nẵng', 'GD4480055566677', '2027-06-30', 'TTYT Phường Hải Châu', 'Viêm mũi dị ứng thời tiết', '1903456789 - Techcombank'),
('BN26112004', 'ND012', '1965-11-03', 'Nam', '19 Ông Ích Khiêm, Phường Hải Châu, TP. Đà Nẵng', 'HT3480011223344', '2027-12-31', 'TTYT Phường Hải Châu', 'Thoái hóa đốt sống lưng L4-L5', '22010005566 - BIDV'),
('BN26112005', 'ND013', '1988-04-15', 'Nu', '72 Hoàng Diệu, Phường Hải Châu, TP. Đà Nẵng', 'GD4480033445566', '2027-12-31', 'TTYT Phường Hải Châu', 'Không có', '10500234567 - VietinBank'),
('BN26112006', 'ND014', '1982-08-25', 'Nam', '30 Bạch Đằng, Phường Hải Châu, TP. Đà Nẵng', 'GD4480077889900', '2027-12-31', 'TTYT Phường Hải Châu', 'Tiền sử đau dạ dày', '040012345678 - Sacombank');


-- =========================================================================
-- PHẦN 4: LỊCH LÀM VIỆC 3 CA (SÁNG 07:00-11:30 | CHIỀU 13:00-16:30 | ĐÊM 16:30-07:00)
-- =========================================================================

-- 7. LICH_LAM_VIEC (43 phân ca mẫu ngày 2026-11-20 phủ kín 3 ca)
INSERT INTO LICH_LAM_VIEC (ma_lich_lam, ma_nhan_vien, ma_phong, ngay_lam_viec, ca_truc, so_luong_bn_toi_da) VALUES
-- CA SÁNG (07:00 - 11:30)
('LLV001', 'NV26112002', 'PH001', '2026-11-20', 'Sang', 40),
('LLV002', 'NV26112003', 'PH002', '2026-11-20', 'Sang', 35),
('LLV003', 'NV26112004', 'PH005', '2026-11-20', 'Sang', 50),
('LLV004', 'NV26112006', 'PH003', '2026-11-20', 'Sang', 35),
('LLV005', 'NV26112007', 'PH007', '2026-11-20', 'Sang', 35),
('LLV006', 'NV26112008', 'PH004', '2026-11-20', 'Sang', 40),
('LLV007', 'NV26112005', 'PH006', '2026-11-20', 'Sang', 50),
('LLV008', 'NV26112010', 'PH001', '2026-11-20', 'Sang', 40),
('LLV009', 'NV26112015', 'PH016', '2026-11-20', 'Sang', 35),
('LLV010', 'NV26112016', 'PH017', '2026-11-20', 'Sang', 35),
('LLV011', 'NV26112030', 'PH008', '2026-11-20', 'Sang', 30),
('LLV012', 'NV26112032', 'PH009', '2026-11-20', 'Sang', 30),
('LLV013', 'NV26112035', 'PH010', '2026-11-20', 'Sang', 30),
('LLV014', 'NV26112038', 'PH011', '2026-11-20', 'Sang', 35),
('LLV015', 'NV26112041', 'PH012', '2026-11-20', 'Sang', 25),
('LLV016', 'NV26112043', 'PH013', '2026-11-20', 'Sang', 30),
('LLV017', 'NV26112045', 'PH014', '2026-11-20', 'Sang', 30),
('LLV018', 'NV26112047', 'PH015', '2026-11-20', 'Sang', 50),

-- CA CHIỀU (13:00 - 16:30)
('LLV019', 'NV26112011', 'PH001', '2026-11-20', 'Chieu', 40),
('LLV020', 'NV26112026', 'PH002', '2026-11-20', 'Chieu', 35),
('LLV021', 'NV26112028', 'PH003', '2026-11-20', 'Chieu', 35),
('LLV022', 'NV26112029', 'PH007', '2026-11-20', 'Chieu', 35),
('LLV023', 'NV26112031', 'PH008', '2026-11-20', 'Chieu', 30),
('LLV024', 'NV26112033', 'PH009', '2026-11-20', 'Chieu', 30),
('LLV025', 'NV26112036', 'PH010', '2026-11-20', 'Chieu', 30),
('LLV026', 'NV26112039', 'PH011', '2026-11-20', 'Chieu', 35),
('LLV027', 'NV26112042', 'PH012', '2026-11-20', 'Chieu', 25),
('LLV028', 'NV26112044', 'PH013', '2026-11-20', 'Chieu', 30),
('LLV029', 'NV26112046', 'PH014', '2026-11-20', 'Chieu', 30),
('LLV030', 'NV26112048', 'PH015', '2026-11-20', 'Chieu', 50),
('LLV031', 'NV26112017', 'PH004', '2026-11-20', 'Chieu', 40),
('LLV032', 'NV26112018', 'PH019', '2026-11-20', 'Chieu', 25),
('LLV033', 'NV26112020', 'PH005', '2026-11-20', 'Chieu', 50),
('LLV034', 'NV26112023', 'PH006', '2026-11-20', 'Chieu', 50),

-- CA TRỰC ĐÊM (16:30 - 07:00 HÔM SAU)
('LLV035', 'NV26112013', 'PH001', '2026-11-20', 'Dem', 30),
('LLV036', 'NV26112027', 'PH002', '2026-11-20', 'Dem', 30),
('LLV037', 'NV26112034', 'PH009', '2026-11-20', 'Dem', 25),
('LLV038', 'NV26112037', 'PH010', '2026-11-20', 'Dem', 25),
('LLV039', 'NV26112040', 'PH011', '2026-11-20', 'Dem', 30),
('LLV040', 'NV26112049', 'PH015', '2026-11-20', 'Dem', 50),
('LLV041', 'NV26112019', 'PH020', '2026-11-20', 'Dem', 30),
('LLV042', 'NV26112021', 'PH005', '2026-11-20', 'Dem', 40),
('LLV043', 'NV26112024', 'PH006', '2026-11-20', 'Dem', 40);


-- =========================================================================
-- PHẦN 5: DỮ LIỆU NGHIỆP VỤ KHÁM CHỮA BỆNH MẪU (KHỚP GIÁ MỚI & MÃ MỚI)
-- =========================================================================

-- 8. LICH_HEN_KHAM (5 bản ghi)
INSERT INTO LICH_HEN_KHAM (ma_lich_hen, ma_benh_nhan, ma_lich_lam, ngay_hen_kham, khung_gio_hen, trieu_chung_ban_dau, trang_thai_hen, ly_do_huy, thoi_gian_huy) VALUES
('LH001', 'BN26112001', 'LLV005', '2026-11-20', 'Ca Sáng (07:00 - 11:30)', 'Sưng đau cổ tay phải sau khi chơi thể thao, cử động khớp cổ tay hạn chế', 'ChoTiepNhan', NULL, NULL),
('LH002', 'BN26112002', 'LLV002', '2026-11-20', 'Ca Sáng (07:00 - 11:30)', 'Đau đầu vùng chẩm, hoa mắt chóng mặt, đo huyết áp tại nhà 155/95 mmHg', 'ChoTiepNhan', NULL, NULL),
('LH003', 'BN26112003', 'LLV004', '2026-11-20', 'Ca Sáng (07:00 - 11:30)', 'Đau rát họng, ho có đờm đặc 3 ngày, sốt nhẹ về chiều 38°C', 'ChoTiepNhan', NULL, NULL),
('LH004', 'BN26112004', 'LLV005', '2026-11-19', 'Ca Sáng (07:00 - 11:30)', 'Đau nhức thắt lưng lan xuống chân trái, tê bì bàn chân', 'DaTiepNhan', NULL, NULL),
('LH005', 'BN26112005', 'LLV020', '2026-11-18', 'Ca Chiều (13:00 - 16:30)', 'Ngứa họng, ho khan về đêm', 'DaHuy', 'Bận công việc gia đình đột xuất', '2026-11-18 10:15:00');

-- 9. HO_SO_KHAM_BENH (5 bản ghi)
INSERT INTO HO_SO_KHAM_BENH (ma_ho_so_kham, ma_lich_hen, ma_benh_nhan, ma_nhan_vien, so_thu_tu_kham, trang_thai_hang_doi, tom_tat_benh_su_ai, trieu_chung_lam_sang, ket_luan_chan_doan, huong_xu_tri, loi_dan_bac_si, ngay_hen_tai_kham, thoi_gian_tiep_nhan, thoi_gian_hoan_tat) VALUES
('HS001', 'LH004', 'BN26112004', 'NV26112007', 1, 'ChoSinhHieu', '- Đau thắt lưng L4-L5 lan xuống chân trái.\n- Tiền sử thoái hóa cột sống.', 'Đau nhức thắt lưng lan xuống chân trái, tê bì bàn chân phải đi lại khó khăn', 'Đau thắt lưng / Thoái hóa cột sống L4-L5', 'KeDonThuoc', 'Tránh mang vác nặng, tập vật lý trị liệu.', '2026-11-27', '2026-11-19 07:30:00', NULL),
('HS002', NULL, 'BN26112005', 'NV26112003', 2, 'ChoKhamBS', '- Đau thượng vị kèm ợ chua.\n- Sinh hiệu ổn định.', 'Đau âm ỉ vùng thượng vị kèm ợ chua, buồn nôn sau khi ăn', 'Viêm dạ dày và tá tràng', 'KeDonThuoc', 'Ăn đúng giờ, kiêng đồ chua cay.', '2026-11-28', '2026-11-19 07:45:00', NULL),
('HS003', NULL, 'BN26112006', 'NV26112003', 3, 'ChoLamCLS', '- Triệu chứng: Ho kéo dài 5 ngày kèm tức ngực nhẹ.\n- Tiền sử: Đau dạ dày.\n- Sinh hiệu: Mạch 84 l/p, Nhiệt độ 37.8°C, HA 125/80 mmHg.', 'Ho đờm, đau tức ngực phải khi hít sâu', 'Viêm phế quản cấp', 'ChiDinhCLS', 'Chờ kết quả X-Quang tim phổi.', '2026-11-26', '2026-11-19 08:00:00', NULL),
('HS004', NULL, 'BN26112001', 'NV26112003', 4, 'HoanTat', '- Triệu chứng: Sốt nhẹ 38.2°C, đau rát họng, mệt mỏi.\n- Tiền sử: Không dị ứng thuốc.', 'Niêm mạc họng đỏ xung huyết, hai amidan sưng nhẹ', 'Viêm họng cấp do vi khuẩn', 'KeDonThuoc', 'Uống thuốc đúng liều sau ăn, súc họng nước muối sinh lý.', '2026-11-25', '2026-11-18 08:10:00', '2026-11-18 09:20:00'),
('HS005', NULL, 'BN26112002', 'NV26112003', 5, 'HoanTat', '- Triệu chứng: Hoa mắt, chóng mặt, HA cao 155/95 mmHg.\n- Dị ứng: Aspirin.', 'Đau đầu vùng chẩm, huyết áp đo tại phòng khám 150/95 mmHg', 'Tăng huyết áp vô căn (nguyên phát)', 'KeDonThuoc', 'Uống thuốc hạ áp mỗi sáng, ăn nhạt, theo dõi HA hàng ngày.', '2026-11-30', '2026-11-18 09:00:00', '2026-11-18 10:15:00');

-- 10. CHI_SO_SINH_HIEU (5 bản ghi)
INSERT INTO CHI_SO_SINH_HIEU (ma_sinh_hieu, ma_ho_so_kham, ma_nhan_vien, mach, nhiet_do, huyet_ap, nhip_tho, can_nang, chieu_cao, thoi_gian_do) VALUES
('SH001', 'HS001', 'NV26112002', 78, 36.8, '130/80', 18, 64.0, 165.0, '2026-11-19 07:35:00'),
('SH002', 'HS002', 'NV26112002', 76, 37.0, '115/75', 18, 54.0, 158.0, '2026-11-19 07:50:00'),
('SH003', 'HS003', 'NV26112002', 84, 37.8, '125/80', 19, 68.0, 170.0, '2026-11-19 08:05:00'),
('SH004', 'HS004', 'NV26112002', 80, 38.2, '120/75', 18, 65.0, 172.0, '2026-11-18 08:15:00'),
('SH005', 'HS005', 'NV26112002', 88, 37.1, '150/95', 20, 70.0, 168.0, '2026-11-18 09:05:00');

-- 12. CHI_DINH_CAN_LAM_SANG (5 bản ghi)
INSERT INTO CHI_DINH_CAN_LAM_SANG (ma_chi_dinh_cls, ma_ho_so_kham, ma_dich_vu_cls, ma_nhan_vien, trang_thai_nop_tien, trang_thai_thuc_hien, ket_qua_cls, ai_phan_tich_cls, thoi_gian_co_ket_qua) VALUES
('CDCLS001', 'HS003', 'DVCLS001', 'NV26112015', 'DaNop', 'ChoLamCLS', NULL, NULL, NULL),
('CDCLS002', 'HS003', 'DVCLS002', 'NV26112016', 'ChuaNop', 'ChoLamCLS', NULL, NULL, NULL),
('CDCLS003', 'HS004', 'DVCLS003', 'NV26112008', 'DaNop', 'DaCoKetQua', 'Bạch cầu (WBC): 11.8 G/L (Tăng nhẹ); Hồng cầu (RBC): 4.8 T/L; Tiểu cầu (PLT): 245 G/L.', 'Bạch cầu tăng nhẹ gợi ý nhiễm khuẩn hô hấp trên.', '2026-11-18 08:45:00'),
('CDCLS004', 'HS005', 'DVCLS004', 'NV26112019', 'DaNop', 'DaCoKetQua', 'Nhịp xoang đều 88 chu kỳ/phút, trục trung gian, chưa thấy thiếu máu cơ tim.', 'Điện tâm đồ trong giới hạn bình thường.', '2026-11-18 09:35:00'),
('CDCLS005', 'HS005', 'DVCLS005', 'NV26112017', 'DaNop', 'DaCoKetQua', 'Glucose lúc đói: 5.4 mmol/L; Cholesterol toàn phần: 5.6 mmol/L (Tăng nhẹ).', 'Mỡ máu tăng nhẹ, khuyến nghị điều chỉnh chế độ ăn.', '2026-11-18 09:40:00');

-- 13. ANH_KET_QUA_CLS (5 bản ghi)
INSERT INTO ANH_KET_QUA_CLS (ma_anh_cls, ma_chi_dinh_cls, duong_dan_anh_cls, ghi_chu_anh, thoi_gian_tai_len) VALUES
('ACLS001', 'CDCLS003', 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=80', 'Phiếu kết quả xét nghiệm huyết học BN Cao Trung', '2026-11-18 08:45:00'),
('ACLS002', 'CDCLS004', 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=crop&w=600&q=80', 'Bản ghi Điện tâm đồ ECG 12 chuyển đạo BN Nguyễn Văn An', '2026-11-18 09:35:00'),
('ACLS003', 'CDCLS005', 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=600&q=80', 'Phiếu kết quả sinh hóa máu BN Nguyễn Văn An', '2026-11-18 09:40:00'),
('ACLS004', 'CDCLS001', 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80', 'Ảnh chụp X-Quang tim phổi thẳng mẫu', '2026-11-19 08:20:00'),
('ACLS005', 'CDCLS002', 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80', 'Hình ảnh siêu âm ổ bụng tổng quát 4D', '2026-11-19 08:25:00');

-- 15. DON_THUOC (5 bản ghi)
INSERT INTO DON_THUOC (ma_don_thuoc, ma_ho_so_kham, ma_nhan_vien, trang_thai_thanh_toan, trang_thai_cap_thuoc, ghi_chu_don_thuoc, thoi_gian_ke_don, thoi_gian_cap_thuoc) VALUES
('DT001', 'HS001', 'NV26112005', 'ChuaThu', 'ChoCapThuoc', 'Uống sau ăn no, hạn chế vận động mạnh vùng thắt lưng', '2026-11-19 08:10:00', NULL),
('DT002', 'HS002', 'NV26112005', 'ChuaThu', 'ChoCapThuoc', 'Uống thuốc dạ dày trước ăn 30 phút', '2026-11-19 08:20:00', NULL),
('DT003', 'HS003', 'NV26112005', 'ChuaThu', 'ChoCapThuoc', 'Uống nhiều nước ấm, giữ ấm cổ ngực', '2026-11-19 08:30:00', NULL),
('DT004', 'HS004', 'NV26112005', 'DaThu', 'DaCapThuoc', 'Uống sau ăn no, kiêng nước đá lạnh', '2026-11-18 09:00:00', '2026-11-18 09:18:00'),
('DT005', 'HS005', 'NV26112005', 'DaThu', 'DaCapThuoc', 'Uống thuốc huyết áp cố định vào 7h sáng hàng ngày', '2026-11-18 09:50:00', '2026-11-18 10:12:00');

-- 16. CHI_TIET_DON_THUOC (6 bản ghi)
INSERT INTO CHI_TIET_DON_THUOC (ma_chi_tiet_don, ma_don_thuoc, ma_thuoc, so_luong, lieu_dung_huong_dan, don_gia_luc_ke) VALUES
('CTDT001', 'DT004', 'TH001', 10, 'Ngày uống 2 lần, mỗi lần 1 viên (Sáng - Tối sau ăn)', 2500),
('CTDT002', 'DT004', 'TH002', 10, 'Uống 1 viên khi sốt trên 38.5°C (Cách nhau 4-6 tiếng)', 1500),
('CTDT003', 'DT004', 'TH003', 10, 'Ngày uống 1 viên vào buổi sáng sau ăn', 1000),
('CTDT004', 'DT005', 'TH005', 14, 'Ngày uống 1 viên vào buổi sáng sau ăn', 3000),
('CTDT005', 'DT002', 'TH004', 14, 'Ngày uống 2 lần, mỗi lần 1 viên trước ăn 30 phút', 2500),
('CTDT006', 'DT001', 'TH002', 10, 'Ngày uống 2 lần, mỗi lần 1 viên sau ăn khi đau lưng', 1500);

-- 17. HOA_DON_VIEN_PHI (5 bản ghi — Khớp 100% với bảng giá mới)
INSERT INTO HOA_DON_VIEN_PHI (ma_hoa_don, ma_ho_so_kham, ma_nhan_vien, loai_hoa_don, tong_tien_goc, tien_bhyt_chi_tra, tien_benh_nhan_tra, phuong_thuc_thanh_toan, trang_thai_thu, thoi_gian_thu, stk_benh_vien, ma_giao_dich_ngan_hang) VALUES
('HD001', 'HS004', 'NV26112004', 'Dot2_ThuTienKhamVaThuoc', 160000, 128000, 32000, 'ChuyenKhoan_VietQR', 'DaThu', '2026-11-18 09:10:00', '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', 'VCB-FT2611180910'),
('HD002', 'HS005', 'NV26112004', 'Dot2_ThuTienKhamVaThuoc', 267000, 213600, 53400, 'ChuyenKhoan_VietQR', 'DaThu', '2026-11-18 10:05:00', '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', 'VCB-FT2611181005'),
('HD003', 'HS003', 'NV26112004', 'Dot1_ThuTienCLS', 85000, 68000, 17000, 'TienMat', 'DaThu', '2026-11-19 08:15:00', '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', 'TM-2611190815'),
('HD004', 'HS001', 'NV26112004', 'Dot2_ThuTienKhamVaThuoc', 70000, 56000, 14000, 'ChuyenKhoan_VietQR', 'ChuaThu', NULL, '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', NULL),
('HD005', 'HS002', 'NV26112004', 'Dot2_ThuTienKhamVaThuoc', 85000, 68000, 17000, 'ChuyenKhoan_VietQR', 'ChuaThu', NULL, '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', NULL);

-- 18. CHI_TIET_HOA_DON (7 bản ghi)
INSERT INTO CHI_TIET_HOA_DON (ma_chi_tiet_hd, ma_hoa_don, loai_hang_muc, ten_hang_muc, so_luong, don_gia, thanh_tien) VALUES
('CTHD001', 'HD001', 'PhiKhamKhoa', 'Công khám Khoa Nội Tổng Quát (P102)', 1, 50000, 50000),
('CTHD002', 'HD001', 'DichVuCLS', 'Xét Nghiệm Tổng Phân Tích Tế Bào Máu Ngoại Vi (P201)', 1, 60000, 60000),
('CTHD003', 'HD001', 'ThuocKeDon', 'Đơn thuốc ngoại trú DT004 (Amoxicillin, Paracetamol, Vitamin C)', 1, 50000, 50000),
('CTHD004', 'HD002', 'PhiKhamKhoa', 'Công khám Khoa Nội Tổng Quát (P102)', 1, 50000, 50000),
('CTHD005', 'HD002', 'DichVuCLS', 'Đo Điện Tâm Đồ ECG (55.000đ) & Xét Nghiệm Sinh Hóa Máu (120.000đ)', 1, 175000, 175000),
('CTHD006', 'HD002', 'ThuocKeDon', 'Đơn thuốc ngoại trú DT005 (Amlodipine 5mg x 14 viên)', 1, 42000, 42000),
('CTHD007', 'HD003', 'DichVuCLS', 'Chụp X-Quang Tim Phổi Thẳng Kỹ Thuật Số (P202)', 1, 85000, 85000);

-- 19. PHIEN_TRO_CHUYEN_AI (5 bản ghi)
INSERT INTO PHIEN_TRO_CHUYEN_AI (ma_phien_chat, ma_nguoi_dung, tieu_de_cuoc_tro_chuyen, thoi_gian_tao) VALUES
('PC001', 'ND009', 'Tư vấn sưng đau khớp cổ tay phải', '2026-11-18 19:00:00'),
('PC002', 'ND010', 'Tư vấn đau đầu chóng mặt huyết áp cao', '2026-11-18 20:15:00'),
('PC003', 'ND011', 'Tư vấn đau rát họng ho có đờm', '2026-11-19 08:30:00'),
('PC004', 'ND012', 'Tư vấn đau nhức thắt lưng L4-L5', '2026-11-19 15:20:00'),
('PC005', 'ND013', 'Hỏi thủ tục khám BHYT bằng VNeID', '2026-11-20 07:10:00');

-- 20. LICH_SU_TIN_NHAN_AI (6 bản ghi)
INSERT INTO LICH_SU_TIN_NHAN_AI (ma_tin_nhan, ma_phien_chat, nguoi_gui, noi_dung_tin_nhan, thoi_gian_gui) VALUES
('TN001', 'PC001', 'NguoiDung', 'Bác sĩ ơi tôi bị sưng đau cổ tay phải sau khi chơi thể thao thì khám phòng nào?', '2026-11-18 19:00:10'),
('TN002', 'PC001', 'AI', 'Chào bạn! Với triệu chứng sưng đau khớp cổ tay, bạn nên đăng ký khám tại Khoa Cơ - Xương - Khớp (Phòng P106 - Giá khám 55.000đ).', '2026-11-18 19:00:15'),
('TN003', 'PC002', 'NguoiDung', 'Tôi đo huyết áp ở nhà 155/95 mmHg kèm chóng mặt thì khám ở đâu?', '2026-11-18 20:15:10'),
('TN004', 'PC002', 'AI', 'Huyết áp 155/95 mmHg là mức tăng huyết áp. Bạn cần đến Khoa Nội Tổng Quát (Phòng P102 - Giá khám 50.000đ) để Bác sĩ kiểm tra và kê đơn.', '2026-11-18 20:15:18'),
('TN005', 'PC003', 'NguoiDung', 'Đau họng sốt nhẹ 3 ngày khám khoa nào ạ?', '2026-11-19 08:30:05'),
('TN006', 'PC003', 'AI', 'Bạn nên đặt lịch khám tại Khoa Tai - Mũi - Họng (Phòng P103 - Giá khám 55.000đ) để nội soi họng nhé.', '2026-11-19 08:30:12');

-- 21. ANH_TIN_NHAN_AI (5 bản ghi)
INSERT INTO ANH_TIN_NHAN_AI (ma_anh_tin_nhan, ma_tin_nhan, duong_dan_anh, thoi_gian_tai_len) VALUES
('ATN001', 'TN001', 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=80', '2026-11-18 19:00:10'),
('ATN002', 'TN003', 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=400&q=80', '2026-11-18 20:15:10'),
('ATN003', 'TN005', 'https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?auto=format&fit=crop&w=400&q=80', '2026-11-19 08:30:05'),
('ATN004', 'TN001', 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=400&q=80', '2026-11-18 19:00:12'),
('ATN005', 'TN003', 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=400&q=80', '2026-11-18 20:15:12');

-- 22. TAI_LIEU_HUAN_LUYEN_AI (5 bản ghi)
INSERT INTO TAI_LIEU_HUAN_LUYEN_AI (ma_tai_lieu, ma_nhan_vien, tieu_de_tai_lieu, phan_loai_tri_thuc, duong_dan_file_tai_lieu, noi_dung_van_ban, ten_collection_chromadb, danh_sach_ma_vector, trang_thai_dong_bo, thoi_gian_cap_nhat) VALUES
('TL001', 'NV26112001', 'Quy tắc phân luồng triệu chứng & Danh mục 12 Khoa Phòng TTYT Hải Châu', 'ThongTinKhoaPhong', '/storage/ai-docs/thong_tin_khoa_phong_haichau.txt', '1. Khoa Nội Tổng Quát (P102 - 50.000đ).\n2. Khoa Tai - Mũi - Họng (P103 - 55.000đ).\n3. Khoa Cơ - Xương - Khớp (P106 - 55.000đ).\n4. Khoa Ngoại (P108 - 55.000đ), Phụ Sản (P109 - 55.000đ), Nhi (P110 - 50.000đ), RHM (P111 - 55.000đ), Mắt (P112 - 55.000đ), Da liễu (P113 - 50.000đ), Cấp cứu 24/7 (P114 - 70.000đ).\n5. Cận Lâm Sàng (P201-P206).', 'tri_thuc_y_te_hai_chau', 'vec_doc_1_chunk_1', 'DaDongBoChromaDB', '2026-11-20 07:30:00'),
('TL002', 'NV26112001', 'Phác đồ chẩn đoán & Điều trị ngoại trú Nội khoa - TMH - Nhi - Sản', 'PhacDoDieuTri', '/storage/ai-docs/phac_do_dieu_tri_ngoai_tru_byt.pdf', 'Viêm họng cấp, Tăng huyết áp vô căn, Thoái hóa cột sống thắt lưng, Đái tháo đường type 2, Viêm dạ dày tá tràng.', 'tri_thuc_y_te_hai_chau', 'vec_doc_2_chunk_1', 'DaDongBoChromaDB', '2026-11-20 08:00:00'),
('TL003', 'NV26112001', 'Thủ tục tiếp đón khám BHYT (80%) & Quy trình thu viện phí 2 đợt', 'ThuTucKham', '/storage/ai-docs/thu_tuc_kham_bhyt_2026.docx', 'Bước 1: Tiếp đón & Khám sàng lọc tại P101.\nBước 2: Thu phí CLS tại P104.\nBước 3: Quyết toán đơn thuốc tại P104 & nhận thuốc tại P105.', 'tri_thuc_y_te_hai_chau', 'vec_doc_3_chunk_1', 'DaDongBoChromaDB', '2026-11-20 08:15:00'),
('TL004', 'NV26112001', 'Danh mục 25 Thuốc BHYT tồn kho & Cảnh báo chống chỉ định dị ứng thuốc', 'DanhMucThuoc', '/storage/ai-docs/danh_muc_thuoc_bhyt_p105.xlsx', 'Amoxicillin 500mg, Augmentin 625mg, Paracetamol 500mg, Omeprazole 20mg, Amlodipine 5mg, Losartan 50mg, Metformin 850mg, Atorvastatin 20mg...', 'tri_thuc_y_te_hai_chau', 'vec_doc_4_chunk_1', 'DaDongBoChromaDB', '2026-11-20 08:30:00'),
('TL005', 'NV26112001', 'Hướng dẫn nhận diện dấu hiệu Cấp cứu nội khoa & Chuyển tuyến 24/7', 'PhacDoDieuTri', '/storage/ai-docs/huong_dan_xu_tri_cap_cuu.pdf', 'Các dấu hiệu cảnh báo đỏ: Đau ngực dữ dội, khó thở SpO2 < 92%, sốt cao co giật, cơn tăng huyết áp khẩn cấp >= 180/110 mmHg -> Chuyển ngay Phòng Cấp cứu P114.', 'tri_thuc_y_te_hai_chau', 'vec_doc_5_chunk_1', 'DaDongBoChromaDB', '2026-11-20 09:00:00');

-- 23. THONG_BAO (2 bản ghi mẫu cho bệnh nhân Cao Trung - ND009)
INSERT INTO THONG_BAO (ma_thong_bao, ma_nguoi_dung, loai_thong_bao, tieu_de, noi_dung, ngay_tao) VALUES
('TB001', 'ND009', 'NhacLichHen', 'Nhắc lịch hẹn khám hôm nay (2026-11-20) [#LH001]', 'Trung tâm Y tế Phường Hải Châu nhắc lịch hẹn khám của bạn tại Phòng P106 (Khoa Cơ - Xương - Khớp) với BS.CKI Trần Ngọc Sơn. Vui lòng mang theo VNeID/CCCD và thẻ BHYT đến Quầy P101 trước 15 phút.', '2026-11-20 06:30:00'),
('TB002', 'ND009', 'UuDai', 'Ưu đãi 30% Gói Khám Sức Khỏe Tổng Quát & Tầm Soát Định Kỳ', 'Trung tâm Y tế Phường Hải Châu giảm 30% chi phí gói khám tổng quát, xét nghiệm sinh hóa máu và miễn phí đo huyết áp, đường huyết sàng lọc cho người dân phường Hải Châu.', '2026-11-20 08:00:00');


-- =========================================================================
-- PHẦN 6: TRIGGER TỰ ĐỘNG SINH MÃ BN{YYMMDD}{XX} VÀ NV{YYMMDD}{XX}
-- (Ví dụ: BN26112007, NV26112051 — tự tăng theo từng ngày hiện tại)
-- =========================================================================
DELIMITER $$

CREATE TRIGGER trg_auto_ma_benh_nhan
BEFORE INSERT ON BENH_NHAN
FOR EACH ROW
BEGIN
    DECLARE v_prefix VARCHAR(10);
    DECLARE v_max_seq INT DEFAULT 0;

    IF NEW.ma_benh_nhan IS NULL OR TRIM(NEW.ma_benh_nhan) = '' THEN
        SET v_prefix = CONCAT('BN', DATE_FORMAT(CURDATE(), '%y%m%d'));

        SELECT IFNULL(MAX(CAST(SUBSTRING(ma_benh_nhan, 9) AS UNSIGNED)), 0)
        INTO v_max_seq
        FROM BENH_NHAN
        WHERE ma_benh_nhan LIKE CONCAT(v_prefix, '%');

        SET NEW.ma_benh_nhan = CONCAT(v_prefix, LPAD(v_max_seq + 1, 2, '0'));
    END IF;
END$$

CREATE TRIGGER trg_auto_ma_nhan_vien
BEFORE INSERT ON NHAN_VIEN
FOR EACH ROW
BEGIN
    DECLARE v_prefix VARCHAR(10);
    DECLARE v_max_seq INT DEFAULT 0;

    IF NEW.ma_nhan_vien IS NULL OR TRIM(NEW.ma_nhan_vien) = '' THEN
        SET v_prefix = CONCAT('NV', DATE_FORMAT(CURDATE(), '%y%m%d'));

        SELECT IFNULL(MAX(CAST(SUBSTRING(ma_nhan_vien, 9) AS UNSIGNED)), 0)
        INTO v_max_seq
        FROM NHAN_VIEN
        WHERE ma_nhan_vien LIKE CONCAT(v_prefix, '%');

        SET NEW.ma_nhan_vien = CONCAT(v_prefix, LPAD(v_max_seq + 1, 2, '0'));
    END IF;
END$$

DELIMITER ;