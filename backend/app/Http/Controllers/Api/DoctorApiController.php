<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class DoctorApiController extends Controller
{
    /**
     * Lọc chỉ giữ các cột thực tế tồn tại trong bảng MySQL
     */
    private function filterValidColumns(string $table, array $data): array
    {
        try {
            $columns = Schema::getColumnListing($table);
            if (empty($columns)) return $data;
            $colMap = array_flip(array_map('strtolower', $columns));
            $filtered = [];
            foreach ($data as $key => $val) {
                if (isset($colMap[strtolower($key)])) {
                    $filtered[$key] = $val;
                }
            }
            return $filtered;
        } catch (\Throwable $e) {
            return $data;
        }
    }

    /**
     * Tự động sinh mã khóa chính Chữ + Số tiếp theo (CDCLS006, DT005, CTDT009, HD006...)
     */
    private function generateNextCode(string $table, string $pkCol, string $prefix, int $padLength = 3): string
    {
        $rows = DB::table($table)->pluck($pkCol);
        $maxNum = 0;
        foreach ($rows as $code) {
            if (preg_match('/(\d+)$/', (string) $code, $matches)) {
                $num = (int) $matches[1];
                if ($num > $maxNum) {
                    $maxNum = $num;
                }
            }
        }
        return $prefix . str_pad((string) ($maxNum + 1), $padLength, '0', STR_PAD_LEFT);
    }

    /**
     * Tìm mã nhân viên Bác sĩ (VD: NV003) từ ma_nhan_vien hoặc ma_nguoi_dung
     */
    private function resolveMaNhanVien($idOrUserId, $default = 'NV003')
    {
        if (!$idOrUserId) {
            return DB::table('NHAN_VIEN')->where('chuc_vu', 'BacSi')->value('ma_nhan_vien') ?: $default;
        }
        $val = trim((string) $idOrUserId);
        $byNv = DB::table('NHAN_VIEN')->where('ma_nhan_vien', $val)->value('ma_nhan_vien');
        if ($byNv) return $byNv;

        $byNd = DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $val)->value('ma_nhan_vien');
        if ($byNd) return $byNd;

        return DB::table('NHAN_VIEN')->where('chuc_vu', 'BacSi')->value('ma_nhan_vien') ?: $default;
    }

    /**
     * 1. LẤY DỮ LIỆU PHÒNG KHÁM BÁC SĨ TỪ MYSQL (Chỉ lấy bệnh nhân của đúng Bác sĩ đang đăng nhập)
     */
    public function getDashboardData(Request $request)
    {
        try {
            $maPhong = $request->query('ma_phong');
            $maBacSiParam = trim((string) $request->query('ma_bac_si', ''));

            // Xác định đúng mã nhân viên (VD: NV003) của Bác sĩ đang đăng nhập
            $maBacSiNv = null;
            if ($maBacSiParam !== '') {
                $maBacSiNv = DB::table('NHAN_VIEN')->where('ma_nhan_vien', $maBacSiParam)->value('ma_nhan_vien')
                    ?: DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $maBacSiParam)->value('ma_nhan_vien');
            }

            $examRooms = DB::table('PHONG as p')
                ->leftJoin('KHOA as k', 'p.ma_khoa', '=', 'k.ma_khoa')
                ->where('p.loai_phong', 'PhongKhamBS')
                ->orderBy('p.so_phong', 'asc')
                ->select('p.*', 'k.ten_khoa', 'k.gia_kham')
                ->get();

            $query = DB::table('HO_SO_KHAM_BENH as hs')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NGUOI_DUNG as nd_bn', 'bn.ma_nguoi_dung', '=', 'nd_bn.ma_nguoi_dung')
                ->leftJoin('NHAN_VIEN as nv_bs', 'hs.ma_nhan_vien', '=', 'nv_bs.ma_nhan_vien')
                ->leftJoin('NGUOI_DUNG as nd_bs', 'nv_bs.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv_bs.ma_khoa', '=', 'k.ma_khoa')
                ->leftJoin('PHONG as p', function ($join) {
                    $join->on('k.ma_khoa', '=', 'p.ma_khoa')->where('p.loai_phong', '=', 'PhongKhamBS');
                })
                ->leftJoin('CHI_SO_SINH_HIEU as sh', 'hs.ma_ho_so_kham', '=', 'sh.ma_ho_so_kham');

            // Lọc: Bệnh nhân chọn khám Bác sĩ nào thì chỉ hiển thị cho đúng Bác sĩ đó
            if ($maBacSiNv) {
                $query->where('hs.ma_nhan_vien', $maBacSiNv);
            }

            if ($maPhong && $maPhong !== 'ALL') {
                $query->where('p.ma_phong', trim((string) $maPhong));
            }

            $queueRecords = $query
                ->orderByRaw("FIELD(hs.trang_thai_hang_doi, 'ChoBSDocCLS', 'ChoKhamBS', 'ChoBSKham', 'ChoLamCLS', 'ChoThuTienCLS', 'ChoSinhHieu', 'HoanTat')")
                ->orderBy('hs.so_thu_tu_kham', 'asc')
                ->orderByDesc('hs.ma_ho_so_kham')
                ->select(
                    'hs.*',
                    'p.ma_phong',
                    'p.so_phong',
                    'p.ten_phong',
                    'k.ma_khoa',
                    'k.ten_khoa',
                    'k.gia_kham',
                    'nv_bs.ma_nguoi_dung as ma_nguoi_dung_bs',
                    'nd_bs.ho_ten as ten_bac_si',
                    'nd_bn.vneid',
                    'nd_bn.ho_ten as ten_benh_nhan',
                    'nd_bn.so_dien_thoai',
                    'bn.ngay_sinh',
                    'bn.gioi_tinh',
                    'bn.dia_chi',
                    'bn.so_the_bhyt',
                    'bn.han_the_bhyt',
                    'bn.noi_dang_ky_bhyt',
                    'bn.tien_su_di_ung_benh_nen',
                    'bn.stk_ngan_hang',
                    'sh.mach',
                    'sh.nhiet_do',
                    'sh.huyet_ap',
                    'sh.nhip_tho',
                    'sh.can_nang',
                    'sh.chieu_cao',
                    'sh.thoi_gian_do'
                )
                ->get();

            foreach ($queueRecords as $rec) {
                $rec->cls_orders = DB::table('CHI_DINH_CAN_LAM_SANG as cd')
                    ->leftJoin('DANH_MUC_CAN_LAM_SANG as dm', 'cd.ma_dich_vu_cls', '=', 'dm.ma_dich_vu_cls')
                    ->leftJoin('PHONG as pcls', 'dm.ma_phong', '=', 'pcls.ma_phong')
                    ->where('cd.ma_ho_so_kham', $rec->ma_ho_so_kham)
                    ->select('cd.*', 'dm.ten_dich_vu_cls', 'dm.don_gia_cls', 'pcls.so_phong as phong_cls')
                    ->get();

                $pendingClsCount = 0;
                $unpaidClsCount = 0;

                foreach ($rec->cls_orders as $cls) {
                    $cls->images = DB::table('ANH_KET_QUA_CLS')
                        ->where('ma_chi_dinh_cls', $cls->ma_chi_dinh_cls)
                        ->get();

                    if ($cls->trang_thai_nop_tien !== 'DaNop') {
                        $unpaidClsCount++;
                    }
                    if ($cls->trang_thai_thuc_hien !== 'DaCoKetQua' || trim((string) ($cls->ket_qua_cls ?? '')) === '') {
                        $pendingClsCount++;
                    }
                }

                $rec->pending_cls_count = $pendingClsCount;
                $rec->unpaid_cls_count = $unpaidClsCount;

                // Nếu hồ sơ vẫn còn dịch vụ CLS chưa cập nhật kết quả thì giữ ở trạng thái đang xử lý CLS (không đưa vào hàng đợi chờ Bác sĩ đọc)
                if ($pendingClsCount > 0 && $rec->trang_thai_hang_doi !== 'HoanTat') {
                    $correctStatus = ($unpaidClsCount > 0) ? 'ChoThuTienCLS' : 'ChoLamCLS';
                    if ($rec->trang_thai_hang_doi !== $correctStatus) {
                        $rec->trang_thai_hang_doi = $correctStatus;
                        DB::table('HO_SO_KHAM_BENH')
                            ->where('ma_ho_so_kham', $rec->ma_ho_so_kham)
                            ->update($this->filterValidColumns('HO_SO_KHAM_BENH', [
                                'trang_thai_hang_doi' => $correctStatus
                            ]));
                    }
                }

                $donThuoc = DB::table('DON_THUOC')->where('ma_ho_so_kham', $rec->ma_ho_so_kham)->first();
                if ($donThuoc) {
                    $rec->prescription = $donThuoc;
                    $rec->prescription_items = DB::table('CHI_TIET_DON_THUOC as ct')
                        ->leftJoin('DANH_MUC_THUOC as t', 'ct.ma_thuoc', '=', 't.ma_thuoc')
                        ->where('ct.ma_don_thuoc', $donThuoc->ma_don_thuoc)
                        ->select('ct.*', 't.ten_thuoc', 't.hoat_chat', 't.don_vi_tinh')
                        ->get();
                } else {
                    $rec->prescription = null;
                    $rec->prescription_items = [];
                }
            }

            $clsCatalog = DB::table('DANH_MUC_CAN_LAM_SANG as dm')
                ->leftJoin('PHONG as p', 'dm.ma_phong', '=', 'p.ma_phong')
                ->orderBy('dm.ma_dich_vu_cls', 'asc')
                ->select('dm.*', 'p.so_phong', 'p.ten_phong')
                ->get();

            $medicineCatalog = DB::table('DANH_MUC_THUOC')->orderBy('ten_thuoc', 'asc')->get();

            return response()->json([
                'status'           => 'success',
                'ma_bac_si_loc'    => $maBacSiNv,
                'exam_rooms'       => $examRooms,
                'queue_records'    => $queueRecords,
                'cls_catalog'      => $clsCatalog,
                'medicine_catalog' => $medicineCatalog
            ], 200);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * 2. BÁC SĨ CHỈ ĐỊNH DỊCH VỤ CẬN LÂM SÀNG
     */
    public function orderClsServices(Request $request)
    {
        $maHoSo = trim((string) $request->ma_ho_so_kham);
        $clsIds = $request->cls_service_ids;
        $maBacSiNv = $this->resolveMaNhanVien($request->ma_bac_si, 'NV003');

        if ($maHoSo === '' || !is_array($clsIds) || empty($clsIds)) {
            return response()->json(['status' => 'error', 'message' => 'Vui lòng chọn ít nhất 1 dịch vụ CLS!'], 400);
        }

        DB::beginTransaction();
        try {
            $addedCount = 0;
            foreach ($clsIds as $dichVuId) {
                $maDichVu = trim((string) $dichVuId);
                if ($maDichVu === '') continue;

                $exists = DB::table('CHI_DINH_CAN_LAM_SANG')
                    ->where('ma_ho_so_kham', $maHoSo)
                    ->where('ma_dich_vu_cls', $maDichVu)
                    ->exists();

                if (!$exists) {
                    $maChiDinh = $this->generateNextCode('CHI_DINH_CAN_LAM_SANG', 'ma_chi_dinh_cls', 'CDCLS', 3);
                    DB::table('CHI_DINH_CAN_LAM_SANG')->insert($this->filterValidColumns('CHI_DINH_CAN_LAM_SANG', [
                        'ma_chi_dinh_cls'      => $maChiDinh,
                        'ma_ho_so_kham'        => $maHoSo,
                        'ma_dich_vu_cls'       => $maDichVu,
                        'ma_nhan_vien'         => null,
                        'trang_thai_nop_tien'  => 'ChuaNop',
                        'trang_thai_thuc_hien' => 'ChoLamCLS'
                    ]));
                    $addedCount++;
                }
            }

            DB::table('HO_SO_KHAM_BENH')
                ->where('ma_ho_so_kham', $maHoSo)
                ->update($this->filterValidColumns('HO_SO_KHAM_BENH', [
                    'ma_nhan_vien'         => $maBacSiNv,
                    'trieu_chung_lam_sang' => trim((string) ($request->trieu_chung_lam_sang ?: 'Khám lâm sàng')),
                    'trang_thai_hang_doi'  => 'ChoThuTienCLS'
                ]));

            DB::commit();

            return response()->json([
                'status'  => 'success',
                'message' => "Đã lập chỉ định {$addedCount} dịch vụ Cận lâm sàng và chuyển sang Quầy Kế toán (P104) thu phí!"
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi chỉ định CLS: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 3. BÁC SĨ KẾT LUẬN CHẨN ĐOÁN & KÊ ĐƠN THUỐC ĐIỆN TỬ
     */
    public function completeExamination(Request $request)
    {
        $maHoSo = trim((string) $request->ma_ho_so_kham);
        $maBacSiNv = $this->resolveMaNhanVien($request->ma_bac_si, 'NV003');
        $medicines = $request->medicines ?? [];

        DB::beginTransaction();
        try {
            $hoSo = DB::table('HO_SO_KHAM_BENH as hs')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NHAN_VIEN as nv', 'hs.ma_nhan_vien', '=', 'nv.ma_nhan_vien')
                ->leftJoin('KHOA as k', 'nv.ma_khoa', '=', 'k.ma_khoa')
                ->where('hs.ma_ho_so_kham', $maHoSo)
                ->select('hs.*', 'bn.so_the_bhyt', 'k.ten_khoa', 'k.gia_kham')
                ->first();

            if (!$hoSo) {
                return response()->json(['status' => 'error', 'message' => 'Không tìm thấy hồ sơ khám bệnh!'], 404);
            }

            // CHẶN HOÀN TẤT KHÁM NẾU CÒN BẤT KỲ DỊCH VỤ CẬN LÂM SÀNG NÀO CHƯA CẬP NHẬT ĐỦ KẾT QUẢ
            $pendingClsCount = DB::table('CHI_DINH_CAN_LAM_SANG')
                ->where('ma_ho_so_kham', $maHoSo)
                ->where(function ($q) {
                    $q->where('trang_thai_thuc_hien', '!=', 'DaCoKetQua')
                      ->orWhereNull('ket_qua_cls')
                      ->orWhereRaw("TRIM(ket_qua_cls) = ''");
                })
                ->count();

            if ($pendingClsCount > 0) {
                DB::rollBack();
                return response()->json([
                    'status'  => 'error',
                    'message' => "Không thể hoàn tất khám! Hồ sơ #{$maHoSo} vẫn còn {$pendingClsCount} dịch vụ Cận lâm sàng chưa cập nhật kết quả từ Phòng P201."
                ], 400);
            }

            DB::table('HO_SO_KHAM_BENH')
                ->where('ma_ho_so_kham', $maHoSo)
                ->update($this->filterValidColumns('HO_SO_KHAM_BENH', [
                    'ma_nhan_vien'         => $maBacSiNv,
                    'trieu_chung_lam_sang' => trim((string) ($request->trieu_chung_lam_sang ?: $hoSo->trieu_chung_lam_sang)),
                    'ket_luan_chan_doan'   => trim((string) $request->ket_luan_chan_doan),
                    'huong_xu_tri'         => !empty($medicines) ? 'KeDonThuoc' : 'DieuTriNgoaiTru',
                    'loi_dan_bac_si'       => trim((string) ($request->loi_dan_bac_si ?: 'Uống thuốc đúng chỉ dẫn sau ăn.')),
                    'ngay_hen_tai_kham'    => $request->ngay_hen_tai_kham ?: null,
                    'trang_thai_hang_doi'  => 'HoanTat',
                    'thoi_gian_hoan_tat'   => Carbon::now('Asia/Ho_Chi_Minh')
                ]));

            $tongTienThuoc = 0;
            if (is_array($medicines) && count($medicines) > 0) {
                $existingDon = DB::table('DON_THUOC')->where('ma_ho_so_kham', $maHoSo)->first();
                if ($existingDon) {
                    $maDonThuoc = $existingDon->ma_don_thuoc;
                    DB::table('CHI_TIET_DON_THUOC')->where('ma_don_thuoc', $maDonThuoc)->delete();
                } else {
                    $maDonThuoc = $this->generateNextCode('DON_THUOC', 'ma_don_thuoc', 'DT', 3);
                    DB::table('DON_THUOC')->insert($this->filterValidColumns('DON_THUOC', [
                        'ma_don_thuoc'          => $maDonThuoc,
                        'ma_ho_so_kham'         => $maHoSo,
                        'ma_nhan_vien'          => null,
                        'trang_thai_thanh_toan' => 'ChuaThu',
                        'trang_thai_cap_thuoc'  => 'ChoCapThuoc',
                        'ghi_chu_don_thuoc'     => trim((string) ($request->loi_dan_bac_si ?: 'Uống sau ăn')),
                        'thoi_gian_ke_don'      => Carbon::now('Asia/Ho_Chi_Minh')
                    ]));
                }

                $ctdtCols = Schema::getColumnListing('CHI_TIET_DON_THUOC');
                $ctdtPk = in_array('ma_chi_tiet_don', $ctdtCols)
                    ? 'ma_chi_tiet_don'
                    : (in_array('ma_ct_don_thuoc', $ctdtCols) ? 'ma_ct_don_thuoc' : null);

                foreach ($medicines as $medItem) {
                    $maThuoc = trim((string) ($medItem['ma_thuoc'] ?? ''));
                    if ($maThuoc === '') continue;

                    $thuocDb = DB::table('DANH_MUC_THUOC')->where('ma_thuoc', $maThuoc)->first();
                    if (!$thuocDb) continue;

                    $soLuong = max(1, (int) ($medItem['so_luong'] ?? 1));
                    $donGia = (float) ($thuocDb->don_gia_thuoc ?? 0);
                    $tongTienThuoc += ($soLuong * $donGia);

                    $rowCtdt = [
                        'ma_don_thuoc'        => $maDonThuoc,
                        'ma_thuoc'            => $thuocDb->ma_thuoc,
                        'so_luong'            => $soLuong,
                        'lieu_dung_huong_dan' => trim((string) ($medItem['lieu_dung_huong_dan'] ?? 'Ngày uống 2 lần sau ăn')),
                        'don_gia_luc_ke'      => $donGia
                    ];
                    if ($ctdtPk) {
                        $rowCtdt[$ctdtPk] = $this->generateNextCode('CHI_TIET_DON_THUOC', $ctdtPk, 'CTDT', 3);
                    }

                    DB::table('CHI_TIET_DON_THUOC')->insert($this->filterValidColumns('CHI_TIET_DON_THUOC', $rowCtdt));

                    DB::table('DANH_MUC_THUOC')
                        ->where('ma_thuoc', $thuocDb->ma_thuoc)
                        ->update($this->filterValidColumns('DANH_MUC_THUOC', [
                            'so_luong_ton_kho' => max(0, (int) ($thuocDb->so_luong_ton_kho ?? 0) - $soLuong)
                        ]));
                }
            }

            $giaKham = (float) ($hoSo->gia_kham ?: 45000);
            $tongTienGoc = $giaKham + $tongTienThuoc;
            $tyLeBhyt = !empty($hoSo->so_the_bhyt) ? 0.8 : 0.0;
            $tienBhyt = round($tongTienGoc * $tyLeBhyt);
            $tienBn = $tongTienGoc - $tienBhyt;

            $hasInvoice = DB::table('HOA_DON_VIEN_PHI')
                ->where('ma_ho_so_kham', $maHoSo)
                ->where('loai_hoa_don', 'Dot2_ThuTienKhamVaThuoc')
                ->exists();

            if (!$hasInvoice) {
                $keToanNv = DB::table('NHAN_VIEN')->where('chuc_vu', 'KeToan')->value('ma_nhan_vien')
                    ?: (DB::table('NHAN_VIEN')->value('ma_nhan_vien') ?: 'NV004');

                $maHoaDon = $this->generateNextCode('HOA_DON_VIEN_PHI', 'ma_hoa_don', 'HD', 3);
                DB::table('HOA_DON_VIEN_PHI')->insert($this->filterValidColumns('HOA_DON_VIEN_PHI', [
                    'ma_hoa_don'             => $maHoaDon,
                    'ma_ho_so_kham'          => $maHoSo,
                    'ma_nhan_vien'           => $keToanNv,
                    'loai_hoa_don'           => 'Dot2_ThuTienKhamVaThuoc',
                    'tong_tien_goc'          => $tongTienGoc,
                    'tien_bhyt_chi_tra'      => $tienBhyt,
                    'tien_benh_nhan_tra'     => $tienBn,
                    'phuong_thuc_thanh_toan' => 'ChuyenKhoan_VietQR',
                    'trang_thai_thu'         => 'ChuaThu',
                    'thoi_gian_thu'          => null,
                    'stk_benh_vien'          => '0041000888999 - Vietcombank (TTYT Phường Hải Châu)',
                    'ma_giao_dich_ngan_hang' => null
                ]));

                $cthdCols = Schema::getColumnListing('CHI_TIET_HOA_DON');
                $cthdPk = in_array('ma_chi_tiet_hd', $cthdCols)
                    ? 'ma_chi_tiet_hd'
                    : (in_array('ma_ct_hoa_don', $cthdCols) ? 'ma_ct_hoa_don' : null);

                $itemKham = [
                    'ma_hoa_don'    => $maHoaDon,
                    'loai_hang_muc' => 'PhiKhamKhoa',
                    'ten_hang_muc'  => 'Công khám lâm sàng ' . ($hoSo->ten_khoa ?: 'Chuyên khoa'),
                    'so_luong'      => 1,
                    'don_gia'       => $giaKham,
                    'thanh_tien'    => $giaKham
                ];
                if ($cthdPk) {
                    $itemKham[$cthdPk] = $this->generateNextCode('CHI_TIET_HOA_DON', $cthdPk, 'CTHD', 3);
                }
                DB::table('CHI_TIET_HOA_DON')->insert($this->filterValidColumns('CHI_TIET_HOA_DON', $itemKham));

                if ($tongTienThuoc > 0) {
                    $itemThuoc = [
                        'ma_hoa_don'    => $maHoaDon,
                        'loai_hang_muc' => 'ThuocKeDon',
                        'ten_hang_muc'  => 'Đơn thuốc điều trị ngoại trú BHYT',
                        'so_luong'      => 1,
                        'don_gia'       => $tongTienThuoc,
                        'thanh_tien'    => $tongTienThuoc
                    ];
                    if ($cthdPk) {
                        $itemThuoc[$cthdPk] = $this->generateNextCode('CHI_TIET_HOA_DON', $cthdPk, 'CTHD', 3);
                    }
                    DB::table('CHI_TIET_HOA_DON')->insert($this->filterValidColumns('CHI_TIET_HOA_DON', $itemThuoc));
                }
            }

            DB::commit();

            return response()->json([
                'status'  => 'success',
                'message' => 'Đã lưu Kết luận chẩn đoán, Kê đơn thuốc điện tử vào MySQL và hoàn tất bệnh án!'
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi lưu bệnh án: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 4. XEM LỊCH SỬ CÁC LẦN KHÁM CŨ CỦA BỆNH NHÂN
     */
    public function getPatientHistory($maBenhNhan)
    {
        try {
            $history = DB::table('HO_SO_KHAM_BENH as hs')
                ->leftJoin('NHAN_VIEN as nv', 'hs.ma_nhan_vien', '=', 'nv.ma_nhan_vien')
                ->leftJoin('NGUOI_DUNG as nd_bs', 'nv.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv.ma_khoa', '=', 'k.ma_khoa')
                ->leftJoin('PHONG as p', function ($join) {
                    $join->on('k.ma_khoa', '=', 'p.ma_khoa')->where('p.loai_phong', '=', 'PhongKhamBS');
                })
                ->where('hs.ma_benh_nhan', trim((string) $maBenhNhan))
                ->orderByDesc('hs.ma_ho_so_kham')
                ->select('hs.*', 'p.so_phong', 'k.ten_khoa', 'nd_bs.ho_ten as ten_bac_si')
                ->get();

            return response()->json(['status' => 'success', 'history' => $history]);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 400);
        }
    }
}