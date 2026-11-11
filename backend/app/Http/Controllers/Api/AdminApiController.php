<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class AdminApiController extends Controller
{
    /**
     * Hàm chỉ giữ lại các cột thực sự tồn tại trong bảng MySQL (Chống lỗi 500 Unknown Column khi Insert/Update)
     */
    private function filterValidColumns(string $table, array $data): array
    {
        try {
            $columns = Schema::getColumnListing($table);
            if (empty($columns)) {
                return $data;
            }
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
     * Hàm đọc bảng an toàn (Không gây sập API nếu bảng chưa có dữ liệu)
     */
    private function safeGetTable(string $table)
    {
        try {
            return DB::table($table)->get();
        } catch (\Throwable $e) {
            return collect([]);
        }
    }

    /**
     * Hàm tự động sinh mã khóa chính Chữ + Số tiếp theo (VD: ND015, NV008, KH005, PH008, TH010, DV006)
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
     * 1. LẤY DỮ LIỆU TỔNG QUAN 5 PHÂN HỆ CHO TRANG ADMIN
     */
    public function getOverviewData()
    {
        try {
            $ndList     = $this->safeGetTable('NGUOI_DUNG');
            $nvList     = $this->safeGetTable('NHAN_VIEN');
            $bnList     = $this->safeGetTable('BENH_NHAN');
            $khoaList   = $this->safeGetTable('KHOA');
            $phongList  = $this->safeGetTable('PHONG');
            $lhList     = $this->safeGetTable('LICH_HEN_KHAM');
            $thuocList  = $this->safeGetTable('DANH_MUC_THUOC');
            $clsList    = $this->safeGetTable('DANH_MUC_CAN_LAM_SANG');
            $hsList     = $this->safeGetTable('HO_SO_KHAM_BENH');
            $hdList     = $this->safeGetTable('HOA_DON_VIEN_PHI');
            $aiChatList = $this->safeGetTable('PHIEN_TRO_CHUYEN_AI');

            // Tạo Map tra cứu nhanh theo khóa chính
            $ndById    = $ndList->keyBy('ma_nguoi_dung');
            $nvById    = $nvList->keyBy('ma_nhan_vien');
            $nvByNdId  = $nvList->keyBy('ma_nguoi_dung');
            $bnById    = $bnList->keyBy('ma_benh_nhan');
            $bnByNdId  = $bnList->keyBy('ma_nguoi_dung');
            $khoaById  = $khoaList->keyBy('ma_khoa');
            $phongById = $phongList->keyBy('ma_phong');
            $hdByHsId  = $hdList->keyBy('ma_ho_so_kham');

            // Tính tổng doanh thu từ các hóa đơn đã thu
            $tongDoanhThu = 0;
            foreach ($hdList as $hd) {
                $trangThaiThu = $hd->trang_thai_thu ?? $hd->trang_thai_thanh_toan ?? 'DaThu';
                if ($trangThaiThu === 'DaThu' || $trangThaiThu === 'DaThanhToan') {
                    $tongDoanhThu += (float) ($hd->tong_tien_goc ?? $hd->tong_tien ?? 0);
                }
            }

            $stats = [
                'tong_benh_nhan' => $bnList->count(),
                'tong_nhan_su'   => $nvList->count(),
                'tong_ho_so'     => $hsList->count(),
                'tong_lich_hen'  => $lhList->count(),
                'tong_doanh_thu' => $tongDoanhThu,
                'tong_phien_ai'  => $aiChatList->count(),
            ];

            // 1. Danh sách Nhân sự & Tài khoản
            $users = $ndList->map(function ($nd) use ($nvByNdId, $bnByNdId, $khoaById) {
                $nv = $nvByNdId->get($nd->ma_nguoi_dung);
                $bn = $bnByNdId->get($nd->ma_nguoi_dung);
                $khoa = ($nv && isset($nv->ma_khoa)) ? $khoaById->get($nv->ma_khoa) : null;

                return [
                    'ma_nguoi_dung'       => $nd->ma_nguoi_dung,
                    'vneid'               => $nd->vneid ?? ($bn->vneid ?? ($bn->so_cccd ?? null)),
                    'ho_ten'              => $nd->ho_ten ?? '',
                    'email'               => $nd->email ?? '',
                    'so_dien_thoai'       => $nd->so_dien_thoai ?? '',
                    'vai_tro'             => $nd->vai_tro ?? 'BenhNhan',
                    'trang_thai'          => $nd->trang_thai ?? 'HoatDong',
                    'ma_nhan_vien'        => $nv->ma_nhan_vien ?? null,
                    'ma_khoa'             => $nv->ma_khoa ?? null,
                    'chuc_vu'             => $nv->chuc_vu ?? null,
                    'chuyen_mon'          => $nv->chuyen_mon ?? null,
                    'chung_chi_hanh_nghe' => $nv->chung_chi_hanh_nghe ?? null,
                    'ma_benh_nhan'        => $bn->ma_benh_nhan ?? null,
                    'stk_ngan_hang'       => $bn->stk_ngan_hang ?? ($nd->stk_ngan_hang ?? null),
                    'ten_khoa'            => $khoa->ten_khoa ?? null,
                ];
            })->values();

            // 2. Danh sách Phòng kèm tên Khoa
            $rooms = $phongList->map(function ($p) use ($khoaById) {
                $khoa = isset($p->ma_khoa) ? $khoaById->get($p->ma_khoa) : null;
                $arr = (array) $p;
                $arr['ten_khoa'] = $khoa->ten_khoa ?? null;
                return $arr;
            })->values();

            // 3. Dịch vụ Cận lâm sàng kèm tên Phòng
            $clsServices = $clsList->map(function ($dm) use ($phongById) {
                $phong = isset($dm->ma_phong) ? $phongById->get($dm->ma_phong) : null;
                $arr = (array) $dm;
                $arr['so_phong']  = $phong->so_phong ?? 'P201';
                $arr['ten_phong'] = $phong->ten_phong ?? 'Phòng Cận Lâm Sàng';
                return $arr;
            })->values();

            // 4. Hồ sơ bệnh án & Viện phí
            $records = $hsList->sortByDesc('ma_ho_so_kham')->map(function ($hs) use ($bnById, $ndById, $nvById, $khoaById, $phongList, $hdByHsId) {
                $bn = isset($hs->ma_benh_nhan) ? $bnById->get($hs->ma_benh_nhan) : null;
                $ndBn = ($bn && isset($bn->ma_nguoi_dung)) ? $ndById->get($bn->ma_nguoi_dung) : null;

                $maBs = $hs->ma_nhan_vien ?? ($hs->ma_bac_si ?? null);
                $nvBs = $maBs ? $nvById->get($maBs) : null;
                $ndBs = ($nvBs && isset($nvBs->ma_nguoi_dung)) ? $ndById->get($nvBs->ma_nguoi_dung) : null;
                $khoa = ($nvBs && isset($nvBs->ma_khoa)) ? $khoaById->get($nvBs->ma_khoa) : null;

                $phongKham = null;
                if ($khoa) {
                    $phongKham = $phongList->first(function ($p) use ($khoa) {
                        return ($p->ma_khoa ?? '') === $khoa->ma_khoa && ($p->loai_phong ?? '') === 'PhongKhamBS';
                    }) ?: $phongList->firstWhere('ma_khoa', $khoa->ma_khoa);
                }

                $hd = $hdByHsId->get($hs->ma_ho_so_kham);

                return [
                    'ma_ho_so_kham'          => $hs->ma_ho_so_kham,
                    'ma_benh_nhan'           => $hs->ma_benh_nhan ?? null,
                    'ma_nhan_vien'           => $maBs,
                    'so_thu_tu_kham'         => $hs->so_thu_tu_kham ?? 1,
                    'trang_thai_hang_doi'    => $hs->trang_thai_hang_doi ?? 'ChoKhamBS',
                    'trieu_chung_lam_sang'   => $hs->trieu_chung_lam_sang ?? '',
                    'ket_luan_chan_doan'     => $hs->ket_luan_chan_doan ?? '',
                    'thoi_gian_tiep_nhan'    => $hs->thoi_gian_tiep_nhan ?? '',
                    'vneid'                  => $ndBn->vneid ?? ($bn->vneid ?? ($bn->so_cccd ?? null)),
                    'ten_benh_nhan'          => $ndBn->ho_ten ?? ($bn->ho_ten ?? 'Bệnh nhân'),
                    'so_the_bhyt'            => $bn->so_the_bhyt ?? null,
                    'stk_ngan_hang'          => $bn->stk_ngan_hang ?? null,
                    'so_phong'               => $phongKham->so_phong ?? 'P102',
                    'ten_khoa'               => $khoa->ten_khoa ?? 'Khoa Khám Bệnh',
                    'ten_bac_si'             => $ndBs->ho_ten ?? null,
                    'ma_hoa_don'             => $hd->ma_hoa_don ?? null,
                    'tong_tien_goc'          => $hd->tong_tien_goc ?? ($hd->tong_tien ?? 0),
                    'tien_bhyt_chi_tra'      => $hd->tien_bhyt_chi_tra ?? 0,
                    'tien_benh_nhan_tra'     => $hd->tien_benh_nhan_tra ?? 0,
                    'phuong_thuc_thanh_toan' => $hd->phuong_thuc_thanh_toan ?? 'VietQR',
                    'stk_benh_vien'          => $hd->stk_benh_vien ?? '02363822292 - Vietcombank TTYT Hải Châu',
                    'ma_giao_dich_ngan_hang' => $hd->ma_giao_dich_ngan_hang ?? null,
                    'trang_thai_thu'         => $hd->trang_thai_thu ?? ($hd->trang_thai_thanh_toan ?? null),
                ];
            })->values();

            return response()->json([
                'status'       => 'success',
                'stats'        => $stats,
                'users'        => $users,
                'departments'  => $khoaList->values(),
                'rooms'        => $rooms,
                'medicines'    => $thuocList->values(),
                'cls_services' => $clsServices,
                'records'      => $records,
            ], 200);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Lỗi truy vấn MySQL: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * 2. THÊM / SỬA / KHÓA / XÓA NHÂN SỰ & TÀI KHOẢN (Tự nhập mã bất kỳ hoặc để trống tự sinh)
     */
    public function saveUser(Request $request)
    {
        DB::beginTransaction();
        try {
            $data = [
                'vneid'         => $request->filled('vneid') ? trim($request->vneid) : null,
                'ho_ten'        => trim($request->ho_ten),
                'email'         => trim($request->email),
                'so_dien_thoai' => trim($request->so_dien_thoai),
                'vai_tro'       => $request->vai_tro,
                'trang_thai'    => 'HoatDong',
            ];

            if ($request->filled('mat_khau')) {
                $data['mat_khau'] = Hash::make(trim($request->mat_khau));
            }

            $inputUserId = $request->filled('ma_nguoi_dung') ? trim((string) $request->ma_nguoi_dung) : '';
            $userExists = $inputUserId !== '' && DB::table('NGUOI_DUNG')->where('ma_nguoi_dung', $inputUserId)->exists();

            if ($userExists) {
                $userId = $inputUserId;
                DB::table('NGUOI_DUNG')
                    ->where('ma_nguoi_dung', $userId)
                    ->update($this->filterValidColumns('NGUOI_DUNG', $data));
                $msg = 'Đã cập nhật thông tin tài khoản #' . $userId . ' vào MySQL!';
            } else {
                if (!isset($data['mat_khau'])) {
                    $data['mat_khau'] = Hash::make('123456');
                }
                $userId = $inputUserId !== '' ? $inputUserId : $this->generateNextCode('NGUOI_DUNG', 'ma_nguoi_dung', 'ND', 3);
                $data['ma_nguoi_dung'] = $userId;
                DB::table('NGUOI_DUNG')->insert($this->filterValidColumns('NGUOI_DUNG', $data));
                $msg = 'Đã tạo tài khoản mới (#' . $userId . ') trong MySQL thành công!';
            }

            $inputSubCode = $request->filled('ma_nhan_vien')
                ? trim((string) $request->ma_nhan_vien)
                : ($request->filled('ma_benh_nhan') ? trim((string) $request->ma_benh_nhan) : '');

            if ($request->vai_tro === 'BenhNhan') {
                $existingBn = DB::table('BENH_NHAN')->where('ma_nguoi_dung', $userId)->first();
                if ($existingBn) {
                    $bnUpdate = $this->filterValidColumns('BENH_NHAN', [
                        'stk_ngan_hang' => $request->filled('stk_ngan_hang') ? trim($request->stk_ngan_hang) : ($existingBn->stk_ngan_hang ?? null)
                    ]);
                    if (!empty($bnUpdate)) {
                        DB::table('BENH_NHAN')->where('ma_nguoi_dung', $userId)->update($bnUpdate);
                    }
                } else {
                    $maBn = ($inputSubCode !== '' && !DB::table('BENH_NHAN')->where('ma_benh_nhan', $inputSubCode)->exists())
                        ? $inputSubCode
                        : $this->generateNextCode('BENH_NHAN', 'ma_benh_nhan', 'BN', 3);

                    DB::table('BENH_NHAN')->insert($this->filterValidColumns('BENH_NHAN', [
                        'ma_benh_nhan'     => $maBn,
                        'ma_nguoi_dung'    => $userId,
                        'ngay_sinh'        => '2000-01-01',
                        'gioi_tinh'        => 'Nam',
                        'noi_dang_ky_bhyt' => 'TTYT Phường Hải Châu',
                        'stk_ngan_hang'    => $request->filled('stk_ngan_hang') ? trim($request->stk_ngan_hang) : null
                    ]));
                }
            } else {
                $chucVu = $request->vai_tro === 'QuanTri' ? 'QuanTriVien' : ($request->vai_tro === 'NVYT' ? 'DieuDuong' : $request->vai_tro);
                $defaultKhoa = DB::table('KHOA')->value('ma_khoa') ?: 'KH001';
                $maKhoa = $request->filled('ma_khoa') ? trim((string) $request->ma_khoa) : $defaultKhoa;

                $existingNv = DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $userId)->first();
                if ($existingNv) {
                    DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $userId)->update($this->filterValidColumns('NHAN_VIEN', [
                        'ma_khoa' => $maKhoa,
                        'chuc_vu' => $chucVu
                    ]));
                } else {
                    $maNv = ($inputSubCode !== '' && !DB::table('NHAN_VIEN')->where('ma_nhan_vien', $inputSubCode)->exists())
                        ? $inputSubCode
                        : $this->generateNextCode('NHAN_VIEN', 'ma_nhan_vien', 'NV', 3);

                    DB::table('NHAN_VIEN')->insert($this->filterValidColumns('NHAN_VIEN', [
                        'ma_nhan_vien' => $maNv,
                        'ma_nguoi_dung'=> $userId,
                        'ma_khoa'      => $maKhoa,
                        'chuc_vu'      => $chucVu,
                        'chuyen_mon'   => 'Cán bộ chuyên môn Y tế'
                    ]));
                }
            }

            DB::commit();
            return response()->json(['status' => 'success', 'message' => $msg]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi lưu tài khoản: ' . $e->getMessage()], 400);
        }
    }

    public function toggleUserStatus(Request $request)
    {
        $maNguoiDung = trim((string) $request->ma_nguoi_dung);
        $user = DB::table('NGUOI_DUNG')->where('ma_nguoi_dung', $maNguoiDung)->first();
        if (!$user) return response()->json(['status' => 'error', 'message' => 'Không tìm thấy tài khoản!'], 404);

        $isLocked = ($user->trang_thai === 'DaKhoa' || $user->trang_thai === '0');
        $newStatus = $isLocked ? 'HoatDong' : 'DaKhoa';

        DB::table('NGUOI_DUNG')->where('ma_nguoi_dung', $user->ma_nguoi_dung)->update(['trang_thai' => $newStatus]);

        return response()->json([
            'status'  => 'success',
            'message' => $newStatus === 'HoatDong' ? 'Đã mở khóa tài khoản!' : 'Đã khóa tài khoản!'
        ]);
    }

    public function deleteUser($id)
    {
        $maNguoiDung = trim((string) $id);
        DB::beginTransaction();
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        try {
            DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $maNguoiDung)->delete();
            DB::table('BENH_NHAN')->where('ma_nguoi_dung', $maNguoiDung)->delete();
            DB::table('NGUOI_DUNG')->where('ma_nguoi_dung', $maNguoiDung)->delete();
            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::commit();
            return response()->json([
                'status'  => 'success',
                'message' => 'Đã xóa tài khoản #' . $maNguoiDung . ' khỏi MySQL!'
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi khi xóa: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 3. QUẢN LÝ KHOA & PHÒNG CHỨC NĂNG (Tự nhập mã bất kỳ hoặc để trống tự sinh + Xóa)
     */
    public function saveDepartment(Request $request)
    {
        $data = [
            'ten_khoa'         => trim($request->ten_khoa),
            'mo_ta_chuyen_mon' => trim((string) $request->mo_ta_chuyen_mon),
            'gia_kham'         => (float) $request->gia_kham,
        ];

        $inputCode = $request->filled('ma_khoa') ? trim((string) $request->ma_khoa) : '';
        $exists = $inputCode !== '' && DB::table('KHOA')->where('ma_khoa', $inputCode)->exists();

        if ($exists) {
            DB::table('KHOA')->where('ma_khoa', $inputCode)->update($this->filterValidColumns('KHOA', $data));
            $msg = 'Đã cập nhật Chuyên khoa #' . $inputCode . ' trong MySQL!';
        } else {
            $maKhoa = $inputCode !== '' ? $inputCode : $this->generateNextCode('KHOA', 'ma_khoa', 'KH', 3);
            $data['ma_khoa'] = $maKhoa;
            DB::table('KHOA')->insert($this->filterValidColumns('KHOA', $data));
            $msg = 'Đã thêm Chuyên khoa mới (#' . $maKhoa . ') vào MySQL!';
        }

        return response()->json(['status' => 'success', 'message' => $msg]);
    }

    public function deleteDepartment($id)
    {
        $maKhoa = trim((string) $id);
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        DB::table('KHOA')->where('ma_khoa', $maKhoa)->delete();
        DB::statement("SET FOREIGN_KEY_CHECKS = 1");
        return response()->json([
            'status'  => 'success',
            'message' => 'Đã xóa Chuyên khoa #' . $maKhoa . ' khỏi MySQL!'
        ]);
    }

    public function saveRoom(Request $request)
    {
        $defaultKhoa = DB::table('KHOA')->value('ma_khoa') ?: 'KH001';
        $data = [
            'ma_khoa'              => $request->filled('ma_khoa') ? trim((string) $request->ma_khoa) : $defaultKhoa,
            'so_phong'             => strtoupper(trim($request->so_phong)),
            'ten_phong'            => trim($request->ten_phong),
            'loai_phong'           => $request->loai_phong,
            'trang_thai_hoat_dong' => 'HoatDong',
        ];

        $inputCode = $request->filled('ma_phong') ? trim((string) $request->ma_phong) : '';
        $exists = $inputCode !== '' && DB::table('PHONG')->where('ma_phong', $inputCode)->exists();

        if ($exists) {
            DB::table('PHONG')->where('ma_phong', $inputCode)->update($this->filterValidColumns('PHONG', $data));
            $msg = 'Đã cập nhật Phòng chức năng #' . $inputCode . ' trong MySQL!';
        } else {
            $maPhong = $inputCode !== '' ? $inputCode : $this->generateNextCode('PHONG', 'ma_phong', 'PH', 3);
            $data['ma_phong'] = $maPhong;
            DB::table('PHONG')->insert($this->filterValidColumns('PHONG', $data));
            $msg = 'Đã thêm Phòng chức năng mới (#' . $maPhong . ') vào MySQL!';
        }

        return response()->json(['status' => 'success', 'message' => $msg]);
    }

    public function deleteRoom($id)
    {
        $maPhong = trim((string) $id);
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        DB::table('PHONG')->where('ma_phong', $maPhong)->delete();
        DB::statement("SET FOREIGN_KEY_CHECKS = 1");
        return response()->json([
            'status'  => 'success',
            'message' => 'Đã xóa Phòng chức năng #' . $maPhong . ' khỏi MySQL!'
        ]);
    }

    /**
     * 4. QUẢN LÝ DANH MỤC THUỐC & CẬN LÂM SÀNG (Tự nhập mã bất kỳ hoặc để trống tự sinh + Xóa)
     */
    public function saveMedicine(Request $request)
    {
        $data = [
            'ten_thuoc'        => trim($request->ten_thuoc),
            'hoat_chat'        => trim((string) $request->hoat_chat),
            'don_vi_tinh'      => trim($request->don_vi_tinh),
            'don_gia_thuoc'    => (float) $request->don_gia_thuoc,
            'so_luong_ton_kho' => (int) $request->so_luong_ton_kho,
        ];

        $inputCode = $request->filled('ma_thuoc') ? trim((string) $request->ma_thuoc) : '';
        $exists = $inputCode !== '' && DB::table('DANH_MUC_THUOC')->where('ma_thuoc', $inputCode)->exists();

        if ($exists) {
            DB::table('DANH_MUC_THUOC')->where('ma_thuoc', $inputCode)->update($this->filterValidColumns('DANH_MUC_THUOC', $data));
            $msg = 'Đã cập nhật thuốc #' . $inputCode . ' trong MySQL!';
        } else {
            $maThuoc = $inputCode !== '' ? $inputCode : $this->generateNextCode('DANH_MUC_THUOC', 'ma_thuoc', 'TH', 3);
            $data['ma_thuoc'] = $maThuoc;
            DB::table('DANH_MUC_THUOC')->insert($this->filterValidColumns('DANH_MUC_THUOC', $data));
            $msg = 'Đã thêm thuốc mới (#' . $maThuoc . ') vào kho MySQL!';
        }

        return response()->json(['status' => 'success', 'message' => $msg]);
    }

    public function deleteMedicine($id)
    {
        $maThuoc = trim((string) $id);
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        DB::table('DANH_MUC_THUOC')->where('ma_thuoc', $maThuoc)->delete();
        DB::statement("SET FOREIGN_KEY_CHECKS = 1");
        return response()->json([
            'status'  => 'success',
            'message' => 'Đã xóa thuốc #' . $maThuoc . ' khỏi kho MySQL!'
        ]);
    }

    public function saveClsService(Request $request)
    {
        $clsRoom = DB::table('PHONG')->where('so_phong', 'P201')->value('ma_phong')
            ?: (DB::table('PHONG')->value('ma_phong') ?: 'PH004');

        $data = [
            'ten_dich_vu_cls' => trim($request->ten_dich_vu_cls),
            'ma_phong'        => $request->filled('ma_phong') ? trim((string) $request->ma_phong) : $clsRoom,
            'don_gia_cls'     => (float) $request->don_gia_cls,
        ];

        $inputCode = $request->filled('ma_dich_vu_cls') ? trim((string) $request->ma_dich_vu_cls) : '';
        $exists = $inputCode !== '' && DB::table('DANH_MUC_CAN_LAM_SANG')->where('ma_dich_vu_cls', $inputCode)->exists();

        if ($exists) {
            DB::table('DANH_MUC_CAN_LAM_SANG')->where('ma_dich_vu_cls', $inputCode)->update($this->filterValidColumns('DANH_MUC_CAN_LAM_SANG', $data));
            $msg = 'Đã cập nhật dịch vụ Cận lâm sàng #' . $inputCode . ' trong MySQL!';
        } else {
            $maDv = $inputCode !== '' ? $inputCode : $this->generateNextCode('DANH_MUC_CAN_LAM_SANG', 'ma_dich_vu_cls', 'DV', 3);
            $data['ma_dich_vu_cls'] = $maDv;
            DB::table('DANH_MUC_CAN_LAM_SANG')->insert($this->filterValidColumns('DANH_MUC_CAN_LAM_SANG', $data));
            $msg = 'Đã thêm dịch vụ Cận lâm sàng mới (#' . $maDv . ') vào MySQL!';
        }

        return response()->json(['status' => 'success', 'message' => $msg]);
    }

    public function deleteClsService($id)
    {
        $maDv = trim((string) $id);
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        DB::table('DANH_MUC_CAN_LAM_SANG')->where('ma_dich_vu_cls', $maDv)->delete();
        DB::statement("SET FOREIGN_KEY_CHECKS = 1");
        return response()->json([
            'status'  => 'success',
            'message' => 'Đã xóa dịch vụ Cận lâm sàng #' . $maDv . ' khỏi MySQL!'
        ]);
    }
}