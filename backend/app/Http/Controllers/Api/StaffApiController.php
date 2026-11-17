<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class StaffApiController extends Controller
{
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

    private function resolveMaNhanVien($idOrUserId, $default = 'NV002')
    {
        if (!$idOrUserId) {
            return DB::table('NHAN_VIEN')->value('ma_nhan_vien') ?: $default;
        }
        $val = trim((string) $idOrUserId);
        $byNv = DB::table('NHAN_VIEN')->where('ma_nhan_vien', $val)->value('ma_nhan_vien');
        if ($byNv) return $byNv;

        $byNd = DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $val)->value('ma_nhan_vien');
        if ($byNd) return $byNd;

        return DB::table('NHAN_VIEN')->value('ma_nhan_vien') ?: $default;
    }

    /**
     * 1. ĐỒNG BỘ DỮ LIỆU CHO NHÂN VIÊN Y TẾ
     */
    public function getDashboardData()
    {
        try {
            $lichHenCho = DB::table('LICH_HEN_KHAM as lh')
                ->join('BENH_NHAN as bn', 'lh.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NGUOI_DUNG as nd_bn', 'bn.ma_nguoi_dung', '=', 'nd_bn.ma_nguoi_dung')
                ->leftJoin('LICH_LAM_VIEC as llv', 'lh.ma_lich_lam', '=', 'llv.ma_lich_lam')
                ->leftJoin('PHONG as p', 'llv.ma_phong', '=', 'p.ma_phong')
                ->leftJoin('KHOA as k', 'p.ma_khoa', '=', 'k.ma_khoa')
                ->leftJoin('NHAN_VIEN as nv_bs', 'llv.ma_nhan_vien', '=', 'nv_bs.ma_nhan_vien')
                ->leftJoin('NGUOI_DUNG as nd_bs', 'nv_bs.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
                ->orderByDesc('lh.ma_lich_hen')
                ->select(
                    'lh.*',
                    'bn.ngay_sinh',
                    'bn.gioi_tinh',
                    'bn.dia_chi',
                    'bn.so_the_bhyt',
                    'bn.han_the_bhyt',
                    'bn.noi_dang_ky_bhyt',
                    'bn.tien_su_di_ung_benh_nen',
                    'bn.stk_ngan_hang',
                    'nd_bn.vneid',
                    'nd_bn.ho_ten',
                    'nd_bn.so_dien_thoai',
                    'p.ma_phong',
                    'p.so_phong',
                    'k.ma_khoa',
                    'k.ten_khoa',
                    'llv.ma_nhan_vien as ma_bac_si',
                    'nd_bs.ho_ten as ten_bac_si'
                )
                ->get();

            $danhSachKhoa = DB::table('KHOA')->orderBy('ma_khoa', 'asc')->get();

            $danhSachPhongKham = DB::table('PHONG as p')
                ->join('KHOA as k', 'p.ma_khoa', '=', 'k.ma_khoa')
                ->where('p.loai_phong', 'PhongKhamBS')
                ->orderBy('p.so_phong', 'asc')
                ->select('p.*', 'k.ten_khoa', 'k.gia_kham')
                ->get();

            $danhSachNhanSu = DB::table('NHAN_VIEN as nv')
                ->join('NGUOI_DUNG as nd', 'nv.ma_nguoi_dung', '=', 'nd.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv.ma_khoa', '=', 'k.ma_khoa')
                ->select(
                    'nv.ma_nhan_vien',
                    'nv.ma_khoa',
                    'nv.chuc_vu',
                    'nd.ma_nguoi_dung',
                    'nd.ho_ten',
                    'nd.vai_tro',
                    'k.ten_khoa'
                )
                ->get();

            $danhSachSinhHieu = DB::table('HO_SO_KHAM_BENH as hs')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NGUOI_DUNG as nd_bn', 'bn.ma_nguoi_dung', '=', 'nd_bn.ma_nguoi_dung')
                ->leftJoin('NHAN_VIEN as nv_bs', 'hs.ma_nhan_vien', '=', 'nv_bs.ma_nhan_vien')
                ->leftJoin('NGUOI_DUNG as nd_bs', 'nv_bs.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv_bs.ma_khoa', '=', 'k.ma_khoa')
                ->leftJoin('PHONG as p', function ($join) {
                    $join->on('k.ma_khoa', '=', 'p.ma_khoa')->where('p.loai_phong', '=', 'PhongKhamBS');
                })
                ->leftJoin('CHI_SO_SINH_HIEU as sh', 'hs.ma_ho_so_kham', '=', 'sh.ma_ho_so_kham')
                ->orderBy('hs.so_thu_tu_kham', 'asc')
                ->select(
                    'hs.*',
                    'nd_bn.vneid',
                    'nd_bn.ho_ten',
                    'nd_bn.so_dien_thoai',
                    'bn.ngay_sinh',
                    'bn.gioi_tinh',
                    'bn.so_the_bhyt',
                    'bn.tien_su_di_ung_benh_nen',
                    'bn.stk_ngan_hang',
                    'p.so_phong',
                    'p.ten_phong',
                    'k.ma_khoa',
                    'k.ten_khoa',
                    'nd_bs.ho_ten as ten_bac_si',
                    'sh.ma_sinh_hieu',
                    'sh.mach',
                    'sh.nhiet_do',
                    'sh.huyet_ap',
                    'sh.nhip_tho',
                    'sh.can_nang',
                    'sh.chieu_cao',
                    'sh.thoi_gian_do'
                )
                ->get()
                ->map(function ($row) {
                    $isWaiting = ($row->trang_thai_hang_doi === 'ChoSinhHieu' && empty($row->ma_sinh_hieu));
                    $row->trang_thai_do = $isWaiting ? 'ChoDo' : 'DaDo';
                    return $row;
                })
                ->values();

            $hangDoiSinhHieu = $danhSachSinhHieu->where('trang_thai_do', 'ChoDo')->values();

            $hangDoiCls = DB::table('CHI_DINH_CAN_LAM_SANG as cd')
                ->join('HO_SO_KHAM_BENH as hs', 'cd.ma_ho_so_kham', '=', 'hs.ma_ho_so_kham')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NGUOI_DUNG as nd_bn', 'bn.ma_nguoi_dung', '=', 'nd_bn.ma_nguoi_dung')
                ->join('DANH_MUC_CAN_LAM_SANG as dm', 'cd.ma_dich_vu_cls', '=', 'dm.ma_dich_vu_cls')
                ->leftJoin('NHAN_VIEN as nv_bs', 'hs.ma_nhan_vien', '=', 'nv_bs.ma_nhan_vien')
                ->leftJoin('KHOA as k', 'nv_bs.ma_khoa', '=', 'k.ma_khoa')
                ->leftJoin('PHONG as p_bs', function ($join) {
                    $join->on('k.ma_khoa', '=', 'p_bs.ma_khoa')->where('p_bs.loai_phong', '=', 'PhongKhamBS');
                })
                ->orderByDesc('cd.ma_chi_dinh_cls')
                ->select(
                    'cd.*',
                    'dm.ten_dich_vu_cls',
                    'dm.don_gia_cls',
                    'hs.ma_benh_nhan',
                    'hs.so_thu_tu_kham',
                    'hs.thoi_gian_tiep_nhan',
                    'nd_bn.vneid',
                    'nd_bn.ho_ten',
                    'p_bs.so_phong as phong_bac_si',
                    'p_bs.ten_phong as ten_phong_bac_si'
                )
                ->get();

            foreach ($hangDoiCls as $item) {
                $item->danh_sach_anh = DB::table('ANH_KET_QUA_CLS')
                    ->where('ma_chi_dinh_cls', $item->ma_chi_dinh_cls)
                    ->get();
            }

            return response()->json([
                'status'               => 'success',
                'lich_hen_cho'         => $lichHenCho,
                'danh_sach_khoa'       => $danhSachKhoa,
                'danh_sach_phong_kham' => $danhSachPhongKham,
                'danh_sach_nhan_su'    => $danhSachNhanSu,
                'hang_doi_sinh_hieu'   => $hangDoiSinhHieu,
                'danh_sach_sinh_hieu'  => $danhSachSinhHieu,
                'hang_doi_cls'         => $hangDoiCls
            ]);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * 2. TIẾP NHẬN BỆNH NHÂN & CẤP SỐ THỨ TỰ KHÁM SÀNG LỌC
     */
    public function receivePatient(Request $request)
    {
        DB::beginTransaction();
        try {
            $maBenhNhan = $request->filled('ma_benh_nhan') ? trim((string) $request->ma_benh_nhan) : '';
            $hoTen = mb_strtoupper(trim((string) $request->ho_ten), 'UTF-8');
            $sdt = trim((string) $request->so_dien_thoai);
            $vneid = $request->filled('vneid') ? trim((string) $request->vneid) : null;

            $existingBn = $maBenhNhan !== ''
                ? DB::table('BENH_NHAN')->where('ma_benh_nhan', $maBenhNhan)->first()
                : null;

            if ($existingBn) {
                if ($existingBn->ma_nguoi_dung) {
                    $updateNd = [
                        'ho_ten'        => $hoTen,
                        'so_dien_thoai' => $sdt
                    ];
                    if ($vneid) $updateNd['vneid'] = $vneid;
                    DB::table('NGUOI_DUNG')
                        ->where('ma_nguoi_dung', $existingBn->ma_nguoi_dung)
                        ->update($this->filterValidColumns('NGUOI_DUNG', $updateNd));
                }

                DB::table('BENH_NHAN')
                    ->where('ma_benh_nhan', $maBenhNhan)
                    ->update($this->filterValidColumns('BENH_NHAN', [
                        'ngay_sinh'               => $request->ngay_sinh ?: '1990-01-01',
                        'gioi_tinh'               => $request->gioi_tinh ?: 'Nam',
                        'dia_chi'                 => $request->dia_chi ?: '',
                        'so_the_bhyt'             => $request->so_the_bhyt ?: null,
                        'han_the_bhyt'            => $request->han_the_bhyt ?: null,
                        'noi_dang_ky_bhyt'        => $request->noi_dang_ky_bhyt ?: 'TTYT Phường Hải Châu',
                        'tien_su_di_ung_benh_nen' => $request->tien_su_di_ung_benh_nen ?: 'Không có',
                        'stk_ngan_hang'           => $request->stk_ngan_hang ?: null
                    ]));
            } else {
                $newUserId = $this->generateNextCode('NGUOI_DUNG', 'ma_nguoi_dung', 'ND', 3);
                DB::table('NGUOI_DUNG')->insert($this->filterValidColumns('NGUOI_DUNG', [
                    'ma_nguoi_dung' => $newUserId,
                    'vneid'         => $vneid,
                    'ho_ten'        => $hoTen,
                    'email'         => 'bn_' . strtolower($newUserId) . '@ttythaichau.vn',
                    'so_dien_thoai' => $sdt,
                    'mat_khau'      => Hash::make('123456'),
                    'vai_tro'       => 'BenhNhan',
                    'trang_thai'    => 'HoatDong',
                    'ngay_tao'      => Carbon::now('Asia/Ho_Chi_Minh')
                ]));

                $maBenhNhan = $this->generateNextCode('BENH_NHAN', 'ma_benh_nhan', 'BN', 3);
                DB::table('BENH_NHAN')->insert($this->filterValidColumns('BENH_NHAN', [
                    'ma_benh_nhan'            => $maBenhNhan,
                    'ma_nguoi_dung'           => $newUserId,
                    'ngay_sinh'               => $request->ngay_sinh ?: '1990-01-01',
                    'gioi_tinh'               => $request->gioi_tinh ?: 'Nam',
                    'dia_chi'                 => $request->dia_chi ?: '',
                    'so_the_bhyt'             => $request->so_the_bhyt ?: null,
                    'han_the_bhyt'            => $request->han_the_bhyt ?: null,
                    'noi_dang_ky_bhyt'        => $request->noi_dang_ky_bhyt ?: 'TTYT Phường Hải Châu',
                    'tien_su_di_ung_benh_nen' => $request->tien_su_di_ung_benh_nen ?: 'Không có',
                    'stk_ngan_hang'           => $request->stk_ngan_hang ?: null
                ]));
            }

            if ($request->filled('ma_lich_hen')) {
                DB::table('LICH_HEN_KHAM')
                    ->where('ma_lich_hen', trim((string) $request->ma_lich_hen))
                    ->update(['trang_thai_hen' => 'DaTiepNhan']);
            }

            $maPhongKham = trim((string) ($request->ma_phong_kham ?? $request->ma_phong ?? 'PH002'));
            $phongObj = DB::table('PHONG')->where('ma_phong', $maPhongKham)->first();
            $maKhoa = $phongObj ? $phongObj->ma_khoa : 'KH001';

            $maBacSi = $request->filled('ma_bac_si') ? trim((string) $request->ma_bac_si) : '';
            if ($maBacSi === '' || $maBacSi === 'ANY') {
                $bacSiObj = DB::table('NHAN_VIEN')
                    ->where('ma_khoa', $maKhoa)
                    ->where('chuc_vu', 'BacSi')
                    ->first() ?? DB::table('NHAN_VIEN')->where('chuc_vu', 'BacSi')->first();
                $maBacSi = $bacSiObj ? $bacSiObj->ma_nhan_vien : 'NV003';
            } else {
                $maBacSi = $this->resolveMaNhanVien($maBacSi, 'NV003');
            }

            $stt = DB::table('HO_SO_KHAM_BENH')
                ->whereDate('thoi_gian_tiep_nhan', Carbon::today())
                ->count() + 1;

            $maHoSo = $this->generateNextCode('HO_SO_KHAM_BENH', 'ma_ho_so_kham', 'HS', 3);

            DB::table('HO_SO_KHAM_BENH')->insert($this->filterValidColumns('HO_SO_KHAM_BENH', [
                'ma_ho_so_kham'        => $maHoSo,
                'ma_lich_hen'          => $request->filled('ma_lich_hen') ? trim((string) $request->ma_lich_hen) : null,
                'ma_benh_nhan'         => $maBenhNhan,
                'ma_nhan_vien'         => $maBacSi,
                'so_thu_tu_kham'       => $stt,
                'trang_thai_hang_doi'  => 'ChoSinhHieu',
                'trieu_chung_lam_sang' => $request->trieu_chung_ban_dau ?: 'Khám lâm sàng',
                'thoi_gian_tiep_nhan'  => Carbon::now('Asia/Ho_Chi_Minh')
            ]));

            DB::commit();

            return response()->json([
                'status'         => 'success',
                'so_thu_tu_kham' => $stt,
                'ma_ho_so_kham'  => $maHoSo,
                'ma_benh_nhan'   => $maBenhNhan
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi tiếp nhận: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 3. LƯU KẾT QUẢ KHÁM SÀNG LỌC (CHỈ SỐ SINH HIỆU) & ĐẨY SANG BÁC SĨ KHÁM
     */
    public function saveVitalSigns(Request $request)
    {
        $maHoSo = trim((string) $request->ma_ho_so_kham);
        $maNhanVien = $this->resolveMaNhanVien($request->ma_nhan_vien ?? $request->ma_nvyt_do, 'NV002');

        DB::beginTransaction();
        try {
            $existingVitals = DB::table('CHI_SO_SINH_HIEU')->where('ma_ho_so_kham', $maHoSo)->first();
            $vitalsData = [
                'ma_ho_so_kham' => $maHoSo,
                'ma_nhan_vien'  => $maNhanVien,
                'mach'          => (int) ($request->mach ?: 78),
                'nhiet_do'      => (float) ($request->nhiet_do ?: 37.0),
                'huyet_ap'      => $request->huyet_ap ?: '120/80',
                'nhip_tho'      => (int) ($request->nhip_tho ?: 18),
                'can_nang'      => (float) ($request->can_nang ?: 60),
                'chieu_cao'     => (float) ($request->chieu_cao ?: 165),
                'thoi_gian_do'  => Carbon::now('Asia/Ho_Chi_Minh')
            ];

            if ($existingVitals) {
                DB::table('CHI_SO_SINH_HIEU')
                    ->where('ma_ho_so_kham', $maHoSo)
                    ->update($this->filterValidColumns('CHI_SO_SINH_HIEU', $vitalsData));
            } else {
                $vitalsData['ma_sinh_hieu'] = $this->generateNextCode('CHI_SO_SINH_HIEU', 'ma_sinh_hieu', 'SH', 3);
                DB::table('CHI_SO_SINH_HIEU')->insert($this->filterValidColumns('CHI_SO_SINH_HIEU', $vitalsData));
            }

            $currentHs = DB::table('HO_SO_KHAM_BENH')->where('ma_ho_so_kham', $maHoSo)->first();
            $newQueueStatus = ($currentHs && $currentHs->trang_thai_hang_doi !== 'ChoSinhHieu')
                ? $currentHs->trang_thai_hang_doi
                : 'ChoKhamBS';

            DB::table('HO_SO_KHAM_BENH')
                ->where('ma_ho_so_kham', $maHoSo)
                ->update($this->filterValidColumns('HO_SO_KHAM_BENH', [
                    'tom_tat_benh_su_ai'  => $request->tom_tat_benh_su_ai,
                    'trang_thai_hang_doi' => $newQueueStatus
                ]));

            DB::commit();

            return response()->json([
                'status'  => 'success',
                'message' => 'Đã lưu chỉ số sinh hiệu vào MySQL và chuyển bệnh nhân sang Phòng Bác sĩ!'
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi lưu sinh hiệu: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 4. CẬP NHẬT KẾT QUẢ & ĐA ẢNH CẬN LÂM SÀNG
     * Chỉ chuyển hồ sơ sang Bác sĩ (ChoBSDocCLS) khi TẤT CẢ chỉ định CLS của hồ sơ đó đã có kết quả
     */
    public function uploadClsResult(Request $request)
    {
        $maChiDinh = trim((string) $request->ma_chi_dinh_cls);
        $ketQuaCls = trim((string) $request->ket_qua_cls);
        $aiNote = trim((string) ($request->ai_phan_tich_cls ?? ''));
        $images = $request->images ?? [];

        if ($maChiDinh === '' || $ketQuaCls === '') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Vui lòng nhập đầy đủ mô tả kết quả Cận lâm sàng!'
            ], 400);
        }

        DB::beginTransaction();
        try {
            $chiDinh = DB::table('CHI_DINH_CAN_LAM_SANG')
                ->where('ma_chi_dinh_cls', $maChiDinh)
                ->first();

            if (!$chiDinh) {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Không tìm thấy mã chỉ định Cận lâm sàng!'
                ], 404);
            }

            if ($chiDinh->trang_thai_nop_tien !== 'DaNop') {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Chỉ định CLS này chưa được đóng phí tại Quầy Kế toán P104!'
                ], 400);
            }

            $maNhanVien = $this->resolveMaNhanVien($request->ma_nhan_vien, 'NV008');

            // 1. Cập nhật kết quả cho chỉ định CLS hiện tại
            DB::table('CHI_DINH_CAN_LAM_SANG')
                ->where('ma_chi_dinh_cls', $maChiDinh)
                ->update($this->filterValidColumns('CHI_DINH_CAN_LAM_SANG', [
                    'ma_nhan_vien'         => $maNhanVien,
                    'ket_qua_cls'          => $ketQuaCls,
                    'ai_phan_tich_cls'     => $aiNote,
                    'trang_thai_thuc_hien' => 'DaCoKetQua',
                    'thoi_gian_co_ket_qua' => Carbon::now('Asia/Ho_Chi_Minh')
                ]));

            // 2. Lưu danh sách ảnh kết quả CLS (nếu có)
            if (is_array($images) && count($images) > 0) {
                $anhCols = Schema::getColumnListing('ANH_KET_QUA_CLS');
                $anhPk = in_array('ma_anh_cls', $anhCols) ? 'ma_anh_cls' : null;

                foreach ($images as $imgItem) {
                    $base64Str = $imgItem['base64'] ?? '';
                    if (!$base64Str) continue;

                    $rowAnh = [
                        'ma_chi_dinh_cls'   => $maChiDinh,
                        'duong_dan_anh_cls' => $base64Str,
                        'ghi_chu_anh'       => trim((string) ($imgItem['note'] ?? 'Ảnh kết quả CLS')),
                        'thoi_gian_tai_len' => Carbon::now('Asia/Ho_Chi_Minh')
                    ];
                    if ($anhPk) {
                        $rowAnh[$anhPk] = $this->generateNextCode('ANH_KET_QUA_CLS', $anhPk, 'ACLS', 3);
                    }
                    DB::table('ANH_KET_QUA_CLS')->insert($this->filterValidColumns('ANH_KET_QUA_CLS', $rowAnh));
                }
            }

            // 3. KIỂM TRA XEM HỒ SƠ KHÁM NÀY CÒN DỊCH VỤ CLS NÀO CHƯA CẬP NHẬT KẾT QUẢ KHÔNG
            $maHoSo = $chiDinh->ma_ho_so_kham;
            $pendingClsCount = DB::table('CHI_DINH_CAN_LAM_SANG')
                ->where('ma_ho_so_kham', $maHoSo)
                ->where(function ($q) {
                    $q->where('trang_thai_thuc_hien', '!=', 'DaCoKetQua')
                      ->orWhereNull('ket_qua_cls')
                      ->orWhereRaw("TRIM(ket_qua_cls) = ''");
                })
                ->count();

            $unpaidClsCount = DB::table('CHI_DINH_CAN_LAM_SANG')
                ->where('ma_ho_so_kham', $maHoSo)
                ->where('trang_thai_nop_tien', '!=', 'DaNop')
                ->count();

            if ($pendingClsCount === 0 && $unpaidClsCount === 0) {
                DB::table('HO_SO_KHAM_BENH')
                    ->where('ma_ho_so_kham', $maHoSo)
                    ->update($this->filterValidColumns('HO_SO_KHAM_BENH', [
                        'trang_thai_hang_doi' => 'ChoBSDocCLS'
                    ]));

                $msg = "Đã hoàn tất toàn bộ chỉ định Cận lâm sàng của hồ sơ #{$maHoSo} và chuyển về Phòng Bác sĩ đọc kết quả!";
            } else {
                $holdStatus = ($unpaidClsCount > 0) ? 'ChoThuTienCLS' : 'ChoLamCLS';
                DB::table('HO_SO_KHAM_BENH')
                    ->where('ma_ho_so_kham', $maHoSo)
                    ->update($this->filterValidColumns('HO_SO_KHAM_BENH', [
                        'trang_thai_hang_doi' => $holdStatus
                    ]));

                $msg = "Đã lưu kết quả chỉ định #{$maChiDinh}. Hồ sơ #{$maHoSo} vẫn còn {$pendingClsCount} dịch vụ Cận lâm sàng chưa có kết quả nên chưa chuyển sang Bác sĩ!";
            }

            DB::commit();

            return response()->json([
                'status'            => 'success',
                'pending_cls_count' => $pendingClsCount,
                'all_cls_completed' => ($pendingClsCount === 0 && $unpaidClsCount === 0),
                'message'           => $msg
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'status'  => 'error',
                'message' => 'Lỗi lưu kết quả CLS: ' . $e->getMessage()
            ], 400);
        }
    }
}