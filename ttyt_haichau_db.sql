DROP DATABASE IF EXISTS ttyt_haichau_db;
CREATE DATABASE ttyt_haichau_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ttyt_haichau_db;

-- =========================================================================
-- PHẦN 1: KHỞI TẠO 22 BẢNG DỮ LIỆU CHUẨN ERD
-- =========================================================================

-- 1. BẢNG KHOA
CREATE TABLE KHOA (
    ma_khoa INT AUTO_INCREMENT PRIMARY KEY,
    ten_khoa VARCHAR(100) NOT NULL,
    mo_ta_chuyen_mon TEXT,
    gia_kham DECIMAL(12,2) NOT NULL DEFAULT 0
);

-- 2. BẢNG PHÒNG
CREATE TABLE PHONG (
    ma_phong INT AUTO_INCREMENT PRIMARY KEY,
    ma_khoa INT NOT NULL,
    so_phong VARCHAR(20) NOT NULL,
    ten_phong VARCHAR(100) NOT NULL,
    loai_phong VARCHAR(50) NOT NULL,
    trang_thai_hoat_dong VARCHAR(30) DEFAULT 'HoatDong',
    FOREIGN KEY (ma_khoa) REFERENCES KHOA(ma_khoa) ON DELETE CASCADE
);

-- 3. BẢNG NGƯỜI DÙNG
CREATE TABLE NGUOI_DUNG (
    ma_nguoi_dung INT AUTO_INCREMENT PRIMARY KEY,
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
    ma_otp INT AUTO_INCREMENT PRIMARY KEY,
    ma_nguoi_dung INT NOT NULL,
    ma_xac_thuc VARCHAR(6) NOT NULL,
    thoi_gian_het_han DATETIME NOT NULL,
    trang_thai_su_dung VARCHAR(30) DEFAULT 'ChuaSuDung',
    thoi_gian_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE CASCADE
);

-- 5. BẢNG NHÂN VIÊN
CREATE TABLE NHAN_VIEN (
    ma_nhan_vien INT AUTO_INCREMENT PRIMARY KEY,
    ma_nguoi_dung INT NOT NULL UNIQUE,
    ma_khoa INT NULL,
    chuc_vu VARCHAR(50) NOT NULL,
    chuyen_mon VARCHAR(150) NULL,
    chung_chi_hanh_nghe VARCHAR(50) NULL,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE CASCADE,
    FOREIGN KEY (ma_khoa) REFERENCES KHOA(ma_khoa) ON DELETE SET NULL
);

-- 6. BẢNG BỆNH NHÂN
CREATE TABLE BENH_NHAN (
    ma_benh_nhan INT AUTO_INCREMENT PRIMARY KEY,
    ma_nguoi_dung INT NULL UNIQUE,
    ngay_sinh DATE NOT NULL,
    gioi_tinh VARCHAR(10) NOT NULL,
    dia_chi VARCHAR(255),
    so_the_bhyt VARCHAR(20) NULL,
    han_the_bhyt DATE NULL,
    noi_dang_ky_bhyt VARCHAR(150) NULL,
    duong_dan_anh_bhyt VARCHAR(255) NULL,
    tien_su_di_ung_benh_nen TEXT NULL,
    stk_ngan_hang VARCHAR(100) NULL,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE SET NULL
);

-- 7. BẢNG LỊCH LÀM VIỆC
CREATE TABLE LICH_LAM_VIEC (
    ma_lich_lam INT AUTO_INCREMENT PRIMARY KEY,
    ma_nhan_vien INT NOT NULL,
    ma_phong INT NOT NULL,
    ngay_lam_viec DATE NOT NULL,
    ca_truc VARCHAR(20) NOT NULL,
    so_luong_bn_toi_da INT DEFAULT 30,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE CASCADE,
    FOREIGN KEY (ma_phong) REFERENCES PHONG(ma_phong) ON DELETE CASCADE
);

-- 8. BẢNG LỊCH HẸN KHÁM
CREATE TABLE LICH_HEN_KHAM (
    ma_lich_hen INT AUTO_INCREMENT PRIMARY KEY,
    ma_benh_nhan INT NOT NULL,
    ma_lich_lam INT NOT NULL,
    ngay_hen_kham DATE NOT NULL,
    khung_gio_hen VARCHAR(50) NOT NULL,
    trieu_chung_ban_dau TEXT,
    trang_thai_hen VARCHAR(30) DEFAULT 'ChoTiepNhan',
    ly_do_huy TEXT NULL,
    thoi_gian_huy DATETIME NULL,
    FOREIGN KEY (ma_benh_nhan) REFERENCES BENH_NHAN(ma_benh_nhan) ON DELETE CASCADE,
    FOREIGN KEY (ma_lich_lam) REFERENCES LICH_LAM_VIEC(ma_lich_lam) ON DELETE CASCADE
);

-- 9. BẢNG HỒ SƠ KHÁM BỆNH
CREATE TABLE HO_SO_KHAM_BENH (
    ma_ho_so_kham INT AUTO_INCREMENT PRIMARY KEY,
    ma_lich_hen INT NULL,
    ma_benh_nhan INT NOT NULL,
    ma_nhan_vien INT NULL,
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
    FOREIGN KEY (ma_lich_hen) REFERENCES LICH_HEN_KHAM(ma_lich_hen) ON DELETE SET NULL,
    FOREIGN KEY (ma_benh_nhan) REFERENCES BENH_NHAN(ma_benh_nhan) ON DELETE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL
);

-- 10. BẢNG CHỈ SỐ SINH HIỆU (KHÁM SÀNG LỌC)
CREATE TABLE CHI_SO_SINH_HIEU (
    ma_sinh_hieu INT AUTO_INCREMENT PRIMARY KEY,
    ma_ho_so_kham INT NOT NULL UNIQUE,
    ma_nhan_vien INT NOT NULL,
    mach INT,
    nhiet_do DECIMAL(4,1),
    huyet_ap VARCHAR(20),
    nhip_tho INT,
    can_nang DECIMAL(5,2),
    chieu_cao DECIMAL(5,2),
    thoi_gian_do DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE CASCADE
);

-- 11. BẢNG DANH MỤC CẬN LÂM SÀNG
CREATE TABLE DANH_MUC_CAN_LAM_SANG (
    ma_dich_vu_cls INT AUTO_INCREMENT PRIMARY KEY,
    ma_phong INT NOT NULL,
    ten_dich_vu_cls VARCHAR(150) NOT NULL,
    don_gia_cls DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (ma_phong) REFERENCES PHONG(ma_phong) ON DELETE CASCADE
);

-- 12. BẢNG CHỈ ĐỊNH CẬN LÂM SÀNG
CREATE TABLE CHI_DINH_CAN_LAM_SANG (
    ma_chi_dinh_cls INT AUTO_INCREMENT PRIMARY KEY,
    ma_ho_so_kham INT NOT NULL,
    ma_dich_vu_cls INT NOT NULL,
    ma_nhan_vien INT NULL,
    trang_thai_nop_tien VARCHAR(30) DEFAULT 'ChuaNop',
    trang_thai_thuc_hien VARCHAR(30) DEFAULT 'ChoLamCLS',
    ket_qua_cls TEXT NULL,
    ai_phan_tich_cls TEXT NULL,
    thoi_gian_co_ket_qua DATETIME NULL,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE,
    FOREIGN KEY (ma_dich_vu_cls) REFERENCES DANH_MUC_CAN_LAM_SANG(ma_dich_vu_cls) ON DELETE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL
);

-- 13. BẢNG ẢNH KẾT QUẢ CẬN LÂM SÀNG
CREATE TABLE ANH_KET_QUA_CLS (
    ma_anh_cls INT AUTO_INCREMENT PRIMARY KEY,
    ma_chi_dinh_cls INT NOT NULL,
    duong_dan_anh_cls LONGTEXT NOT NULL,
    ghi_chu_anh VARCHAR(150) NULL,
    thoi_gian_tai_len DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_chi_dinh_cls) REFERENCES CHI_DINH_CAN_LAM_SANG(ma_chi_dinh_cls) ON DELETE CASCADE
);

-- 14. BẢNG DANH MỤC THUỐC
CREATE TABLE DANH_MUC_THUOC (
    ma_thuoc INT AUTO_INCREMENT PRIMARY KEY,
    ten_thuoc VARCHAR(150) NOT NULL,
    hoat_chat VARCHAR(150) NOT NULL,
    don_vi_tinh VARCHAR(30) NOT NULL,
    don_gia_thuoc DECIMAL(12,2) NOT NULL,
    so_luong_ton_kho INT NOT NULL DEFAULT 0
);

-- 15. BẢNG ĐƠN THUỐC
CREATE TABLE DON_THUOC (
    ma_don_thuoc INT AUTO_INCREMENT PRIMARY KEY,
    ma_ho_so_kham INT NOT NULL UNIQUE,
    ma_nhan_vien INT NULL,
    trang_thai_thanh_toan VARCHAR(30) DEFAULT 'ChuaThu',
    trang_thai_cap_thuoc VARCHAR(30) DEFAULT 'ChoCapThuoc',
    ghi_chu_don_thuoc TEXT NULL,
    thoi_gian_ke_don DATETIME DEFAULT CURRENT_TIMESTAMP,
    thoi_gian_cap_thuoc DATETIME NULL,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL
);

-- 16. BẢNG CHI TIẾT ĐƠN THUỐC
CREATE TABLE CHI_TIET_DON_THUOC (
    ma_chi_tiet_don INT AUTO_INCREMENT PRIMARY KEY,
    ma_don_thuoc INT NOT NULL,
    ma_thuoc INT NOT NULL,
    so_luong INT NOT NULL,
    lieu_dung_huong_dan VARCHAR(255) NOT NULL,
    don_gia_luc_ke DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (ma_don_thuoc) REFERENCES DON_THUOC(ma_don_thuoc) ON DELETE CASCADE,
    FOREIGN KEY (ma_thuoc) REFERENCES DANH_MUC_THUOC(ma_thuoc) ON DELETE CASCADE
);

-- 17. BẢNG HÓA ĐƠN VIỆN PHÍ
CREATE TABLE HOA_DON_VIEN_PHI (
    ma_hoa_don INT AUTO_INCREMENT PRIMARY KEY,
    ma_ho_so_kham INT NOT NULL,
    ma_nhan_vien INT NULL,
    loai_hoa_don VARCHAR(50) NOT NULL,
    tong_tien_goc DECIMAL(12,2) NOT NULL DEFAULT 0,
    tien_bhyt_chi_tra DECIMAL(12,2) NOT NULL DEFAULT 0,
    tien_benh_nhan_tra DECIMAL(12,2) NOT NULL DEFAULT 0,
    phuong_thuc_thanh_toan VARCHAR(50) DEFAULT 'ChuyenKhoan_VietQR',
    trang_thai_thu VARCHAR(30) DEFAULT 'ChuaThu',
    thoi_gian_thu DATETIME NULL,
    stk_benh_vien VARCHAR(150) DEFAULT '0041000888999 - Vietcombank (TTYT Phường Hải Châu)',
    ma_giao_dich_ngan_hang VARCHAR(100) NULL,
    FOREIGN KEY (ma_ho_so_kham) REFERENCES HO_SO_KHAM_BENH(ma_ho_so_kham) ON DELETE CASCADE,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE SET NULL
);

-- 18. BẢNG CHI TIẾT HÓA ĐƠN
CREATE TABLE CHI_TIET_HOA_DON (
    ma_chi_tiet_hd INT AUTO_INCREMENT PRIMARY KEY,
    ma_hoa_don INT NOT NULL,
    loai_hang_muc VARCHAR(30) NOT NULL,
    ten_hang_muc VARCHAR(150) NOT NULL,
    so_luong INT NOT NULL DEFAULT 1,
    don_gia DECIMAL(12,2) NOT NULL,
    thanh_tien DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (ma_hoa_don) REFERENCES HOA_DON_VIEN_PHI(ma_hoa_don) ON DELETE CASCADE
);

-- 19. BẢNG PHIÊN TRÒ CHUYỆN AI
CREATE TABLE PHIEN_TRO_CHUYEN_AI (
    ma_phien_chat INT AUTO_INCREMENT PRIMARY KEY,
    ma_nguoi_dung INT NOT NULL,
    tieu_de_cuoc_tro_chuyen VARCHAR(150),
    thoi_gian_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung) ON DELETE CASCADE
);

-- 20. BẢNG LỊCH SỬ TIN NHẮN AI
CREATE TABLE LICH_SU_TIN_NHAN_AI (
    ma_tin_nhan INT AUTO_INCREMENT PRIMARY KEY,
    ma_phien_chat INT NOT NULL,
    nguoi_gui VARCHAR(20) NOT NULL,
    noi_dung_tin_nhan TEXT NOT NULL,
    thoi_gian_gui DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_phien_chat) REFERENCES PHIEN_TRO_CHUYEN_AI(ma_phien_chat) ON DELETE CASCADE
);

-- 21. BẢNG ẢNH TIN NHẮN AI
CREATE TABLE ANH_TIN_NHAN_AI (
    ma_anh_tin_nhan INT AUTO_INCREMENT PRIMARY KEY,
    ma_tin_nhan INT NOT NULL,
    duong_dan_anh LONGTEXT NOT NULL,
    thoi_gian_tai_len DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_tin_nhan) REFERENCES LICH_SU_TIN_NHAN_AI(ma_tin_nhan) ON DELETE CASCADE
);

-- 22. BẢNG TÀI LIỆU HUẤN LUYỆN AI
CREATE TABLE TAI_LIEU_HUAN_LUYEN_AI (
    ma_tai_lieu INT AUTO_INCREMENT PRIMARY KEY,
    ma_nhan_vien INT NOT NULL,
    tieu_de_tai_lieu VARCHAR(150) NOT NULL,
    phan_loai_tri_thuc VARCHAR(50) NOT NULL,
    duong_dan_file_tai_lieu VARCHAR(255) NOT NULL,
    noi_dung_van_ban TEXT,
    ten_collection_chromadb VARCHAR(100),
    danh_sach_ma_vector TEXT,
    trang_thai_dong_bo VARCHAR(30) DEFAULT 'ChoVectorHoa',
    thoi_gian_cap_nhat DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ma_nhan_vien) REFERENCES NHAN_VIEN(ma_nhan_vien) ON DELETE CASCADE
);

-- =========================================================================
-- PHẦN 2: NẠP DỮ LIỆU MẪU (MỖI BẢNG TỐI THIỂU >= 5 BẢN GHI)
-- =========================================================================

-- 1. KHOA (5 bản ghi)
INSERT INTO KHOA (ma_khoa, ten_khoa, mo_ta_chuyen_mon, gia_kham) VALUES
(1, 'Khoa Nội Tổng Quát', 'Khám và điều trị các bệnh lý tim mạch, huyết áp, tiêu hóa, hô hấp nội khoa', 45000),
(2, 'Khoa Tai - Mũi - Họng', 'Khám viêm họng cấp, viêm xoang, viêm amidan, viêm tai giữa, nội soi TMH', 50000),
(3, 'Khoa Cận Lâm Sàng', 'Thực hiện xét nghiệm huyết học, sinh hóa, siêu âm 4D, chụp X-Quang kỹ thuật số', 0),
(4, 'Khoa Cơ - Xương - Khớp', 'Khám thoái hóa cột sống, viêm khớp, đau thần kinh tọa, gout và phục hồi chức năng', 50000),
(5, 'Khoa Y Học Cổ Truyền & PHCN', 'Châm cứu, bấm huyệt, phục hồi chức năng sau chấn thương và bệnh lý mãn tính', 45000);

-- 2. PHONG (8 bản ghi)
INSERT INTO PHONG (ma_phong, ma_khoa, so_phong, ten_phong, loai_phong, trang_thai_hoat_dong) VALUES
(1, 1, 'P101', 'Quầy Tiếp Đón & Bàn Khám Sàng Lọc', 'TiepDon_SinhHieu', 'HoatDong'),
(2, 1, 'P102', 'Phòng Khám Nội Tổng Quát', 'PhongKhamBS', 'HoatDong'),
(3, 2, 'P103', 'Phòng Khám Tai - Mũi - Họng', 'PhongKhamBS', 'HoatDong'),
(4, 3, 'P201', 'Phòng Xét Nghiệm, Siêu Âm & X-Quang', 'PhongCLS', 'HoatDong'),
(5, 1, 'P104', 'Quầy Thu Ngân - Kế Toán Viện Phí', 'KeToan', 'HoatDong'),
(6, 1, 'P105', 'Quầy Dược - Cấp Phát Thuốc BHYT', 'Duoc', 'HoatDong'),
(7, 4, 'P106', 'Phòng Khám Cơ - Xương - Khớp', 'PhongKhamBS', 'HoatDong'),
(8, 5, 'P107', 'Phòng Khám Y Học Cổ Truyền', 'PhongKhamBS', 'HoatDong');

-- 3. NGUOI_DUNG (14 bản ghi: 8 Nhân viên + 6 Bệnh nhân - Mật khẩu: 123456)
INSERT INTO NGUOI_DUNG (ma_nguoi_dung, vneid, ho_ten, email, so_dien_thoai, mat_khau, vai_tro, trang_thai) VALUES
(1, '048200000001', 'Quản trị viên Hệ thống', 'admin@ttythaichau.vn', '0905000001', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'QuanTri', 'HoatDong'),
(2, '048200000002', 'ĐD. Nguyễn Thị Lan (Tiếp đón & Sàng lọc)', 'nvyt@ttythaichau.vn', '0905000002', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
(3, '048200000003', 'BS.CKI Nguyễn Văn Hưng (Trưởng khoa Nội)', 'bacsi@ttythaichau.vn', '0905000003', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
(4, '048200000004', 'CN. Lê Thị Thu Ngân (Kế toán)', 'ketoan@ttythaichau.vn', '0905000004', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'KeToan', 'HoatDong'),
(5, '048200000005', 'DS. Trần Quốc Bảo (Dược sĩ)', 'duocsi@ttythaichau.vn', '0905000005', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'DuocSi', 'HoatDong'),
(6, '048200000006', 'ThS.BS Lê Quang Đức (BS Tai Mũi Họng)', 'bsduc@ttythaichau.vn', '0905000006', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
(7, '048200000007', 'BS.CKI Trần Ngọc Sơn (BS Cơ Xương Khớp)', 'bsson@ttythaichau.vn', '0905000007', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BacSi', 'HoatDong'),
(8, '048200000008', 'KTV. Phạm Ngọc Ánh (Nhân viên CLS)', 'nvcls@ttythaichau.vn', '0905000008', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'NVYT', 'HoatDong'),
(9, '048200001234', 'CAO TRUNG', 'caotrung14022000@gmail.com', '0987691004', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
(10, '048078005678', 'NGUYỄN VĂN AN', 'nguyenvanan@gmail.com', '0905112233', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
(11, '048195009101', 'TRẦN THỊ MINH CHÂU', 'minhchau@gmail.com', '0914223344', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
(12, '048065001122', 'LÊ HOÀNG NAM', 'hoangnam@gmail.com', '0935667788', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
(13, '048188003344', 'PHẠM THỊ THU HÀ', 'thuha@gmail.com', '0905998877', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong'),
(14, '048082005566', 'VÕ ĐỨC THẮNG', 'voducthang@gmail.com', '0977889900', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'BenhNhan', 'HoatDong');

-- 4. MA_XAC_THUC_OTP (5 bản ghi)
INSERT INTO MA_XAC_THUC_OTP (ma_otp, ma_nguoi_dung, ma_xac_thuc, thoi_gian_het_han, trang_thai_su_dung, thoi_gian_tao) VALUES
(1, 9, '159357', '2026-11-01 10:10:00', 'DaSuDung', '2026-11-01 10:00:00'),
(2, 10, '246810', '2026-11-01 11:10:00', 'DaSuDung', '2026-11-01 11:00:00'),
(3, 11, '369258', '2026-11-01 14:10:00', 'DaSuDung', '2026-11-01 14:00:00'),
(4, 12, '482604', '2026-11-02 09:10:00', 'ChuaSuDung', '2026-11-02 09:00:00'),
(5, 13, '753951', '2026-11-02 09:30:00', 'ChuaSuDung', '2026-11-02 09:20:00');

-- 5. NHAN_VIEN (8 bản ghi)
INSERT INTO NHAN_VIEN (ma_nhan_vien, ma_nguoi_dung, ma_khoa, chuc_vu, chuyen_mon, chung_chi_hanh_nghe) VALUES
(1, 1, 1, 'QuanTriVien', 'Quản trị Hệ thống Y tế Số', 'CCHN-QT-001'),
(2, 2, 1, 'DieuDuong', 'Điều dưỡng Tiếp đón & Khám sàng lọc', 'CCHN-DD-002'),
(3, 3, 1, 'BacSi', 'Bác sĩ CKI Nội Tổng Quát', 'CCHN-BS-003'),
(4, 4, 1, 'KeToan', 'Kế toán Thu ngân Viện phí', 'CCHN-KT-004'),
(5, 5, 1, 'DuocSi', 'Dược sĩ Lâm sàng & Kho BHYT', 'CCHN-DS-005'),
(6, 6, 2, 'BacSi', 'Thạc sĩ Bác sĩ Tai Mũi Họng', 'CCHN-BS-006'),
(7, 7, 4, 'BacSi', 'Bác sĩ CKI Cơ Xương Khớp', 'CCHN-BS-007'),
(8, 8, 3, 'KTV_CLS', 'Kỹ thuật viên Xét nghiệm & CĐHA', 'CCHN-CLS-008');

-- 6. BENH_NHAN (6 bản ghi)
INSERT INTO BENH_NHAN (ma_benh_nhan, ma_nguoi_dung, ngay_sinh, gioi_tinh, dia_chi, so_the_bhyt, han_the_bhyt, noi_dang_ky_bhyt, tien_su_di_ung_benh_nen, stk_ngan_hang) VALUES
(1, 9, '2000-02-14', 'Nam', '88 Trần Phú, Phường Hải Châu, TP. Đà Nẵng', 'GD4480012345678', '2027-12-31', 'TTYT Phường Hải Châu', 'Không dị ứng thuốc', '987691004 - MB Bank'),
(2, 10, '1978-05-20', 'Nam', '124 Nguyễn Chí Thanh, Phường Hải Châu, TP. Đà Nẵng', 'DN4480098765432', '2027-12-31', 'TTYT Phường Hải Châu', 'Tăng huyết áp 3 năm, dị ứng Aspirin', '1029384756 - Vietcombank'),
(3, 11, '1995-09-12', 'Nu', '45 Lê Duẩn, Phường Hải Châu, TP. Đà Nẵng', 'GD4480055566677', '2027-06-30', 'TTYT Phường Hải Châu', 'Viêm mũi dị ứng thời tiết', '1903456789 - Techcombank'),
(4, 12, '1965-11-03', 'Nam', '19 Ông Ích Khiêm, Phường Hải Châu, TP. Đà Nẵng', 'HT3480011223344', '2027-12-31', 'TTYT Phường Hải Châu', 'Thoái hóa đốt sống lưng L4-L5', '22010005566 - BIDV'),
(5, 13, '1988-04-15', 'Nu', '72 Hoàng Diệu, Phường Hải Châu, TP. Đà Nẵng', 'GD4480033445566', '2027-12-31', 'TTYT Phường Hải Châu', 'Không có', '10500234567 - VietinBank'),
(6, 14, '1982-08-25', 'Nam', '30 Bạch Đằng, Phường Hải Châu, TP. Đà Nẵng', 'GD4480077889900', '2027-12-31', 'TTYT Phường Hải Châu', 'Tiền sử đau dạ dày', '040012345678 - Sacombank');

-- 7. LICH_LAM_VIEC (7 bản ghi)
INSERT INTO LICH_LAM_VIEC (ma_lich_lam, ma_nhan_vien, ma_phong, ngay_lam_viec, ca_truc, so_luong_bn_toi_da) VALUES
(1, 2, 1, '2026-11-02', 'Sang', 35),
(2, 3, 2, '2026-11-02', 'Sang', 35),
(3, 4, 5, '2026-11-02', 'Sang', 35),
(4, 6, 3, '2026-11-02', 'Sang', 35),
(5, 7, 7, '2026-11-02', 'Sang', 35),
(6, 8, 4, '2026-11-02', 'Sang', 35),
(7, 5, 6, '2026-11-02', 'Sang', 35);

-- 8. LICH_HEN_KHAM (5 bản ghi)
INSERT INTO LICH_HEN_KHAM (ma_lich_hen, ma_benh_nhan, ma_lich_lam, ngay_hen_kham, khung_gio_hen, trieu_chung_ban_dau, trang_thai_hen, ly_do_huy, thoi_gian_huy) VALUES
(1, 1, 5, '2026-11-02', 'Ca Sáng (07:00 - 11:30)', 'Sưng đau cổ tay phải sau khi chơi thể thao, cử động khớp cổ tay hạn chế', 'ChoTiepNhan', NULL, NULL),
(2, 2, 2, '2026-11-02', 'Ca Sáng (07:00 - 11:30)', 'Đau đầu vùng chẩm, hoa mắt chóng mặt, đo huyết áp tại nhà 155/95 mmHg', 'ChoTiepNhan', NULL, NULL),
(3, 3, 4, '2026-11-02', 'Ca Sáng (07:00 - 11:30)', 'Đau rát họng, ho có đờm đặc 3 ngày, sốt nhẹ về chiều 38°C', 'ChoTiepNhan', NULL, NULL),
(4, 4, 5, '2026-11-01', 'Ca Sáng (07:00 - 11:30)', 'Đau nhức thắt lưng lan xuống chân trái, tê bì bàn chân', 'DaTiepNhan', NULL, NULL),
(5, 5, 2, '2026-10-31', 'Ca Tối (13:30 - 19:00)', 'Ngứa họng, ho khan về đêm', 'DaHuy', 'Bận công việc gia đình đột xuất', '2026-10-31 10:15:00');

-- 9. HO_SO_KHAM_BENH (5 bản ghi)
INSERT INTO HO_SO_KHAM_BENH (ma_ho_so_kham, ma_lich_hen, ma_benh_nhan, ma_nhan_vien, so_thu_tu_kham, trang_thai_hang_doi, tom_tat_benh_su_ai, trieu_chung_lam_sang, ket_luan_chan_doan, huong_xu_tri, loi_dan_bac_si, ngay_hen_tai_kham, thoi_gian_tiep_nhan, thoi_gian_hoan_tat) VALUES
(1, 4, 4, 7, 1, 'ChoSinhHieu', '- Đau thắt lưng L4-L5 lan xuống chân trái.\n- Tiền sử thoái hóa cột sống.', 'Đau nhức thắt lưng lan xuống chân trái, tê bì bàn chân phải đi lại khó khăn', '[M54.5] Đau thắt lưng / Thoái hóa cột sống L4-L5', 'KeDonThuoc', 'Tránh mang vác nặng, tập vật lý trị liệu.', '2026-11-10', '2026-11-01 07:30:00', NULL),
(2, NULL, 5, 3, 2, 'ChoKhamBS', '- Đau thượng vị kèm ợ chua.\n- Sinh hiệu ổn định.', 'Đau âm ỉ vùng thượng vị kèm ợ chua, buồn nôn sau khi ăn', '[K29] Viêm dạ dày và tá tràng', 'KeDonThuoc', 'Ăn đúng giờ, kiêng đồ chua cay.', '2026-11-12', '2026-11-01 07:45:00', NULL),
(3, NULL, 6, 3, 3, 'ChoLamCLS', '- Triệu chứng: Ho kéo dài 5 ngày kèm tức ngực nhẹ.\n- Tiền sử: Đau dạ dày.\n- Sinh hiệu: Mạch 84 l/p, Nhiệt độ 37.8°C, HA 125/80 mmHg.', 'Ho đờm, đau tức ngực phải khi hít sâu', '[J20] Viêm phế quản cấp', 'ChiDinhCLS', 'Chờ kết quả X-Quang tim phổi.', '2026-11-08', '2026-11-01 08:00:00', NULL),
(4, NULL, 1, 3, 4, 'HoanTat', '- Triệu chứng: Sốt nhẹ 38.2°C, đau rát họng, mệt mỏi.\n- Tiền sử: Không dị ứng thuốc.', 'Niêm mạc họng đỏ xung huyết, hai amidan sưng nhẹ', '[J02] Viêm họng cấp do vi khuẩn', 'KeDonThuoc', 'Uống thuốc đúng liều sau ăn, súc họng nước muối sinh lý.', '2026-11-07', '2026-10-30 08:10:00', '2026-10-30 09:20:00'),
(5, NULL, 2, 3, 5, 'HoanTat', '- Triệu chứng: Hoa mắt, chóng mặt, HA cao 155/95 mmHg.\n- Dị ứng: Aspirin.', 'Đau đầu vùng chẩm, huyết áp đo tại phòng khám 150/95 mmHg', '[I10] Tăng huyết áp vô căn (nguyên phát)', 'KeDonThuoc', 'Uống thuốc hạ áp mỗi sáng, ăn nhạt, theo dõi HA hàng ngày.', '2026-11-15', '2026-10-30 09:00:00', '2026-10-30 10:15:00');

-- 10. CHI_SO_SINH_HIEU (5 bản ghi)
INSERT INTO CHI_SO_SINH_HIEU (ma_sinh_hieu, ma_ho_so_kham, ma_nhan_vien, mach, nhiet_do, huyet_ap, nhip_tho, can_nang, chieu_cao, thoi_gian_do) VALUES
(1, 1, 2, 78, 36.8, '130/80', 18, 64.0, 165.0, '2026-11-01 07:35:00'),
(2, 2, 2, 76, 37.0, '115/75', 18, 54.0, 158.0, '2026-11-01 07:50:00'),
(3, 3, 2, 84, 37.8, '125/80', 19, 68.0, 170.0, '2026-11-01 08:05:00'),
(4, 4, 2, 80, 38.2, '120/75', 18, 65.0, 172.0, '2026-10-30 08:15:00'),
(5, 5, 2, 88, 37.1, '150/95', 20, 70.0, 168.0, '2026-10-30 09:05:00');

-- 11. DANH_MUC_CAN_LAM_SANG (5 bản ghi)
INSERT INTO DANH_MUC_CAN_LAM_SANG (ma_dich_vu_cls, ma_phong, ten_dich_vu_cls, don_gia_cls) VALUES
(1, 4, 'Chụp X-Quang Tim Phổi Thẳng Kỹ Thuật Số', 65000),
(2, 4, 'Siêu Âm Tổng Quát Ổ Bụng Màu 4D', 80000),
(3, 4, 'Xét Nghiệm Tổng Phân Tích Tế Bào Máu', 55000),
(4, 4, 'Đo Điện Tâm Đồ (ECG) 12 Chuyển Đạo', 45000),
(5, 4, 'Xét Nghiệm Sinh Hóa Máu (Đường Huyết & Mỡ Máu)', 75000);

-- 12. CHI_DINH_CAN_LAM_SANG (5 bản ghi)
INSERT INTO CHI_DINH_CAN_LAM_SANG (ma_chi_dinh_cls, ma_ho_so_kham, ma_dich_vu_cls, ma_nhan_vien, trang_thai_nop_tien, trang_thai_thuc_hien, ket_qua_cls, ai_phan_tich_cls, thoi_gian_co_ket_qua) VALUES
(1, 3, 1, 8, 'DaNop', 'ChoLamCLS', NULL, NULL, NULL),
(2, 3, 2, 8, 'ChuaNop', 'ChoLamCLS', NULL, NULL, NULL),
(3, 4, 3, 8, 'DaNop', 'DaCoKetQua', 'Bạch cầu (WBC): 11.8 G/L (Tăng nhẹ); Hồng cầu (RBC): 4.8 T/L; Tiểu cầu (PLT): 245 G/L.', 'Bạch cầu tăng nhẹ gợi ý nhiễm khuẩn hô hấp trên.', '2026-10-30 08:45:00'),
(4, 5, 4, 8, 'DaNop', 'DaCoKetQua', 'Nhịp xoang đều 88 chu kỳ/phút, trục trung gian, chưa thấy thiếu máu cơ tim.', 'Điện tâm đồ trong giới hạn bình thường.', '2026-10-30 09:35:00'),
(5, 5, 5, 8, 'DaNop', 'DaCoKetQua', 'Glucose lúc đói: 5.4 mmol/L; Cholesterol toàn phần: 5.6 mmol/L (Tăng nhẹ).', 'Mỡ máu tăng nhẹ, khuyến nghị điều chỉnh chế độ ăn.', '2026-10-30 09:40:00');

-- 13. ANH_KET_QUA_CLS (5 bản ghi)
INSERT INTO ANH_KET_QUA_CLS (ma_anh_cls, ma_chi_dinh_cls, duong_dan_anh_cls, ghi_chu_anh, thoi_gian_tai_len) VALUES
(1, 3, 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=80', 'Phiếu kết quả xét nghiệm huyết học BN Cao Trung', '2026-10-30 08:45:00'),
(2, 4, 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=crop&w=600&q=80', 'Bản ghi Điện tâm đồ ECG 12 chuyển đạo BN Nguyễn Văn An', '2026-10-30 09:35:00'),
(3, 5, 'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=600&q=80', 'Phiếu kết quả sinh hóa máu BN Nguyễn Văn An', '2026-10-30 09:40:00'),
(4, 1, 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80', 'Ảnh chụp X-Quang tim phổi thẳng mẫu', '2026-11-01 08:20:00'),
(5, 2, 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80', 'Hình ảnh siêu âm ổ bụng tổng quát 4D', '2026-11-01 08:25:00');

-- 14. DANH_MUC_THUOC (5 bản ghi)
INSERT INTO DANH_MUC_THUOC (ma_thuoc, ten_thuoc, hoat_chat, don_vi_tinh, don_gia_thuoc, so_luong_ton_kho) VALUES
(1, 'Amoxicillin 500mg', 'Amoxicillin', 'Viên', 2500, 500),
(2, 'Paracetamol 500mg', 'Paracetamol', 'Viên', 1500, 800),
(3, 'Vitamin C 500mg', 'Acid Ascorbic', 'Viên', 1000, 600),
(4, 'Omeprazole 20mg', 'Omeprazole', 'Viên', 2000, 450),
(5, 'Amlodipine 5mg', 'Amlodipine', 'Viên', 3000, 700);

-- 15. DON_THUOC (5 bản ghi)
INSERT INTO DON_THUOC (ma_don_thuoc, ma_ho_so_kham, ma_nhan_vien, trang_thai_thanh_toan, trang_thai_cap_thuoc, ghi_chu_don_thuoc, thoi_gian_ke_don, thoi_gian_cap_thuoc) VALUES
(1, 1, 5, 'ChuaThu', 'ChoCapThuoc', 'Uống sau ăn no, hạn chế vận động mạnh vùng thắt lưng', '2026-11-01 08:10:00', NULL),
(2, 2, 5, 'ChuaThu', 'ChoCapThuoc', 'Uống thuốc dạ dày trước ăn 30 phút', '2026-11-01 08:20:00', NULL),
(3, 3, 5, 'ChuaThu', 'ChoCapThuoc', 'Uống nhiều nước ấm, giữ ấm cổ ngực', '2026-11-01 08:30:00', NULL),
(4, 4, 5, 'DaThu', 'DaCapThuoc', 'Uống sau ăn no, kiêng nước đá lạnh', '2026-10-30 09:00:00', '2026-10-30 09:18:00'),
(5, 5, 5, 'DaThu', 'DaCapThuoc', 'Uống thuốc huyết áp cố định vào 7h sáng hàng ngày', '2026-10-30 09:50:00', '2026-10-30 10:12:00');

-- 16. CHI_TIET_DON_THUOC (6 bản ghi)
INSERT INTO CHI_TIET_DON_THUOC (ma_chi_tiet_don, ma_don_thuoc, ma_thuoc, so_luong, lieu_dung_huong_dan, don_gia_luc_ke) VALUES
(1, 4, 1, 10, 'Ngày uống 2 lần, mỗi lần 1 viên (Sáng - Tối sau ăn)', 2500),
(2, 4, 2, 10, 'Uống 1 viên khi sốt trên 38.5°C (Cách nhau 4-6 tiếng)', 1500),
(3, 4, 3, 10, 'Ngày uống 1 viên vào buổi sáng sau ăn', 1000),
(4, 5, 5, 14, 'Ngày uống 1 viên vào buổi sáng sau ăn', 3000),
(5, 2, 4, 14, 'Ngày uống 2 lần, mỗi lần 1 viên trước ăn 30 phút', 2000),
(6, 1, 2, 10, 'Ngày uống 2 lần, mỗi lần 1 viên sau ăn khi đau lưng', 1500);

-- 17. HOA_DON_VIEN_PHI (5 bản ghi)
INSERT INTO HOA_DON_VIEN_PHI (ma_hoa_don, ma_ho_so_kham, ma_nhan_vien, loai_hoa_don, tong_tien_goc, tien_bhyt_chi_tra, tien_benh_nhan_tra, phuong_thuc_thanh_toan, trang_thai_thu, thoi_gian_thu, stk_benh_vien, ma_giao_dich_ngan_hang) VALUES
(1, 4, 4, 'Dot2_ThuTienKhamVaThuoc', 150000, 120000, 30000, 'ChuyenKhoan_VietQR', 'DaThu', '2026-10-30 09:10:00', '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', 'VCB-FT2610300910'),
(2, 5, 4, 'Dot2_ThuTienKhamVaThuoc', 207000, 165600, 41400, 'ChuyenKhoan_VietQR', 'DaThu', '2026-10-30 10:05:00', '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', 'VCB-FT2610301005'),
(3, 3, 4, 'Dot1_TamUngCLS', 65000, 52000, 13000, 'TienMat', 'DaThu', '2026-11-01 08:15:00', '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', 'TM-2611010815'),
(4, 1, 4, 'Dot2_ThuTienKhamVaThuoc', 65000, 52000, 13000, 'ChuyenKhoan_VietQR', 'ChuaThu', NULL, '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', NULL),
(5, 2, 4, 'Dot2_ThuTienKhamVaThuoc', 73000, 58400, 14600, 'ChuyenKhoan_VietQR', 'ChuaThu', NULL, '0041000888999 - Vietcombank (TTYT Phường Hải Châu)', NULL);

-- 18. CHI_TIET_HOA_DON (6 bản ghi)
INSERT INTO CHI_TIET_HOA_DON (ma_chi_tiet_hd, ma_hoa_don, loai_hang_muc, ten_hang_muc, so_luong, don_gia, thanh_tien) VALUES
(1, 1, 'PhiKhamKhoa', 'Công khám Khoa Nội Tổng Quát (P102)', 1, 45000, 45000),
(2, 1, 'DichVuCLS', 'Xét Nghiệm Tổng Phân Tích Tế Bào Máu (P201)', 1, 55000, 55000),
(3, 1, 'ThuocKeDon', 'Đơn thuốc ngoại trú #4 (Amoxicillin, Paracetamol, Vitamin C)', 1, 50000, 50000),
(4, 2, 'PhiKhamKhoa', 'Công khám Khoa Nội Tổng Quát (P102)', 1, 45000, 45000),
(5, 2, 'DichVuCLS', 'Đo Điện Tâm Đồ ECG & Xét Nghiệm Sinh Hóa Máu', 1, 120000, 120000),
(6, 3, 'DichVuCLS', 'Chụp X-Quang Tim Phổi Thẳng Kỹ Thuật Số', 1, 65000, 65000);

-- 19. PHIEN_TRO_CHUYEN_AI (5 bản ghi)
INSERT INTO PHIEN_TRO_CHUYEN_AI (ma_phien_chat, ma_nguoi_dung, tieu_de_cuoc_tro_chuyen, thoi_gian_tao) VALUES
(1, 9, 'Tư vấn sưng đau khớp cổ tay phải', '2026-10-30 19:00:00'),
(2, 10, 'Tư vấn đau đầu chóng mặt huyết áp cao', '2026-10-30 20:15:00'),
(3, 11, 'Tư vấn đau rát họng ho có đờm', '2026-10-31 08:30:00'),
(4, 12, 'Tư vấn đau nhức thắt lưng L4-L5', '2026-10-31 15:20:00'),
(5, 13, 'Hỏi thủ tục khám BHYT bằng VNeID', '2026-11-01 07:10:00');

-- 20. LICH_SU_TIN_NHAN_AI (6 bản ghi)
INSERT INTO LICH_SU_TIN_NHAN_AI (ma_tin_nhan, ma_phien_chat, nguoi_gui, noi_dung_tin_nhan, thoi_gian_gui) VALUES
(1, 1, 'NguoiDung', 'Bác sĩ ơi tôi bị sưng đau cổ tay phải sau khi chơi thể thao thì khám phòng nào?', '2026-10-30 19:00:10'),
(2, 1, 'AI', 'Chào bạn! Với triệu chứng sưng đau khớp cổ tay, bạn nên đăng ký khám tại Khoa Cơ - Xương - Khớp (Phòng P106 - Giá khám 50.000đ).', '2026-10-30 19:00:15'),
(3, 2, 'NguoiDung', 'Tôi đo huyết áp ở nhà 155/95 mmHg kèm chóng mặt thì khám ở đâu?', '2026-10-30 20:15:10'),
(4, 2, 'AI', 'Huyết áp 155/95 mmHg là mức tăng huyết áp. Bạn cần đến Khoa Nội Tổng Quát (Phòng P102) để Bác sĩ kiểm tra và kê đơn.', '2026-10-30 20:15:18'),
(5, 3, 'NguoiDung', 'Đau họng sốt nhẹ 3 ngày khám khoa nào ạ?', '2026-10-31 08:30:05'),
(6, 3, 'AI', 'Bạn nên đặt lịch khám tại Khoa Tai - Mũi - Họng (Phòng P103 - Giá khám 50.000đ) để nội soi họng nhé.', '2026-10-31 08:30:12');

-- 21. ANH_TIN_NHAN_AI (5 bản ghi)
INSERT INTO ANH_TIN_NHAN_AI (ma_anh_tin_nhan, ma_tin_nhan, duong_dan_anh, thoi_gian_tai_len) VALUES
(1, 1, 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=80', '2026-10-30 19:00:10'),
(2, 3, 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=400&q=80', '2026-10-30 20:15:10'),
(3, 5, 'https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?auto=format&fit=crop&w=400&q=80', '2026-10-31 08:30:05'),
(4, 1, 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=400&q=80', '2026-10-30 19:00:12'),
(5, 3, 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=400&q=80', '2026-10-30 20:15:12');

-- 22. TAI_LIEU_HUAN_LUYEN_AI (5 bản ghi)
INSERT INTO TAI_LIEU_HUAN_LUYEN_AI (ma_tai_lieu, ma_nhan_vien, tieu_de_tai_lieu, phan_loai_tri_thuc, duong_dan_file_tai_lieu, noi_dung_van_ban, ten_collection_chromadb, danh_sach_ma_vector, trang_thai_dong_bo, thoi_gian_cap_nhat) VALUES
(1, 1, 'Quy tắc phân luồng triệu chứng & Danh mục Khoa Phòng TTYT Hải Châu', 'ThongTinKhoaPhong', '/storage/ai-docs/thong_tin_khoa_phong_haichau.txt', '1. Khoa Nội Tổng Quát (P102 - 45.000đ).\n2. Khoa Tai - Mũi - Họng (P103 - 50.000đ).\n3. Khoa Cơ - Xương - Khớp (P106 - 50.000đ).\n4. Phòng Cận Lâm Sàng (P201).', 'tri_thuc_y_te_hai_chau', 'vec_doc_1_chunk_1', 'DaDongBoChromaDB', '2026-10-30 07:30:00'),
(2, 1, 'Phác đồ chẩn đoán ICD-10 & Điều trị ngoại trú Nội khoa - TMH', 'PhacDoDieuTri', '/storage/ai-docs/phac_do_dieu_tri_ngoai_tru_byt.pdf', 'Viêm họng cấp (J02), Tăng huyết áp vô căn (I10), Thoái hóa cột sống thắt lưng (M54.5).', 'tri_thuc_y_te_hai_chau', 'vec_doc_2_chunk_1', 'DaDongBoChromaDB', '2026-10-30 08:00:00'),
(3, 1, 'Thủ tục tiếp đón khám BHYT (80%) & Quy trình thu viện phí 2 đợt', 'ThuTucKham', '/storage/ai-docs/thu_tuc_kham_bhyt_2026.docx', 'Bước 1: Tiếp đón & Khám sàng lọc tại P101.\nBước 2: Thu phí CLS tại P104.\nBước 3: Quyết toán đơn thuốc tại P104 & nhận thuốc tại P105.', 'tri_thuc_y_te_hai_chau', 'vec_doc_3_chunk_1', 'DaDongBoChromaDB', '2026-10-30 08:15:00'),
(4, 1, 'Danh mục Thuốc BHYT tồn kho & Cảnh báo chống chỉ định dị ứng thuốc', 'DanhMucThuoc', '/storage/ai-docs/danh_muc_thuoc_bhyt_p105.xlsx', 'Amoxicillin 500mg, Paracetamol 500mg, Vitamin C 500mg, Omeprazole 20mg, Amlodipine 5mg.', 'tri_thuc_y_te_hai_chau', 'vec_doc_4_chunk_1', 'DaDongBoChromaDB', '2026-10-30 08:30:00'),
(5, 1, 'Hướng dẫn nhận diện dấu hiệu Cấp cứu nội khoa & Chuyển tuyến', 'PhacDoDieuTri', '/storage/ai-docs/huong_dan_xu_tri_cap_cuu.pdf', 'Các dấu hiệu cảnh báo đỏ: Đau ngực dữ dội, khó thở SpO2 < 92%, sốt cao co giật, cơn tăng huyết áp khẩn cấp >= 180/110 mmHg.', 'tri_thuc_y_te_hai_chau', 'vec_doc_5_chunk_1', 'DaDongBoChromaDB', '2026-10-30 09:00:00');