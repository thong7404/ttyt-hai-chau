<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class AdminApiController extends Controller
{
    /**
     * Hàm chỉ giữ lại các cột thực sự tồn tại trong bảng MySQL
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
     * Hàm đọc bảng an toàn
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
     * Lấy số thứ tự lớn nhất hiện có của cột mã (VD: LLV043 -> 43)
     */
    private function getMaxNumericSuffix(string $table, string $pkCol): int
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
        return $maxNum;
    }

    /**
     * Hàm tự động sinh mã khóa chính Chữ + Số tiếp theo (VD: ND065, KH013, PH021, TH026, DVCLS023, LLV046)
     */
    private function generateNextCode(string $table, string $pkCol, string $prefix, int $padLength = 3): string
    {
        $maxNum = $this->getMaxNumericSuffix($table, $pkCol);
        return $prefix . str_pad((string) ($maxNum + 1), $padLength, '0', STR_PAD_LEFT);
    }

    /**
     * Sinh mã theo ngày hiện tại: BN{YYMMDD}{XX} hoặc NV{YYMMDD}{XX}
     */
    private function generateDateBasedCode(string $table, string $pkCol, string $prefix): string
    {
        $datePart = Carbon::now('Asia/Ho_Chi_Minh')->format('ymd');
        $fullPrefix = $prefix . $datePart;

        $codes = DB::table($table)
            ->where($pkCol, 'like', $fullPrefix . '%')
            ->pluck($pkCol);

        $maxSeq = 0;
        foreach ($codes as $code) {
            $seq = (int) substr((string) $code, strlen($fullPrefix));
            if ($seq > $maxSeq) {
                $maxSeq = $seq;
            }
        }

        return $fullPrefix . str_pad((string) ($maxSeq + 1), 2, '0', STR_PAD_LEFT);
    }

    /**
     * Chuyển đổi ma_nhan_vien (NV...) hoặc ma_nguoi_dung (ND...) sang ma_nhan_vien thực tế trong bảng NHAN_VIEN
     */
    private function resolveMaNhanVien($idOrUserId, $default = null)
    {
        if (!$idOrUserId) return $default;
        $val = trim((string) $idOrUserId);

        $byNv = DB::table('NHAN_VIEN')->where('ma_nhan_vien', $val)->value('ma_nhan_vien');
        if ($byNv) return $byNv;

        $byNd = DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $val)->value('ma_nhan_vien');
        return $byNd ?: $default;
    }

    /**
     * Chuẩn hóa mã ca trực về 3 ca chuẩn (Sang, Chieu, Dem)
     */
    private function normalizeShiftCode(string $caTruc): string
    {
        $val = trim($caTruc);
        if ($val === 'Toi') return 'Chieu';
        return in_array($val, ['Sang', 'Chieu', 'Dem'], true) ? $val : 'Sang';
    }

    /**
     * Phân loại nhân sự vào 6 nhóm vị trí chuyên trách để chia ca cân bằng
     */
    private function classifyStaffGroup($nv): string
    {
        $vaiTro = (string) ($nv->vai_tro ?? '');
        $chucVu = (string) ($nv->chuc_vu ?? '');
        $maKhoa = (string) ($nv->ma_khoa ?? '');

        if ($vaiTro === 'BacSi' || $chucVu === 'BacSi') return 'BacSi';
        if ($vaiTro === 'DuocSi' || $chucVu === 'DuocSi') return 'DuocSi';
        if ($vaiTro === 'KeToan' || $chucVu === 'KeToan') return 'KeToan';
        if ($chucVu === 'KTV_CLS' || $maKhoa === 'KH003') return 'KTV';
        if ($chucVu === 'TiepDon' || $chucVu === 'TiepNhan') return 'TiepDon';
        return 'DieuDuong';
    }

    /**
     * Xác định phòng trực mặc định theo chức vụ / chuyên khoa / chuyên môn (Khớp 12 khoa & 20 phòng)
     */
    private function resolveDefaultRoomForStaff($nv, $allRooms): string
    {
        $chucVu = (string) ($nv->chuc_vu ?? '');
        $maKhoa = (string) ($nv->ma_khoa ?? '');
        $chuyenMon = mb_strtolower((string) ($nv->chuyen_mon ?? ''), 'UTF-8');

        if ($chucVu === 'BacSi') {
            $room = $allRooms->first(function ($r) use ($maKhoa) {
                return (string) $r->ma_khoa === $maKhoa && $r->loai_phong === 'PhongKhamBS';
            });
            return $room ? $room->ma_phong : 'PH002';
        }
        if ($chucVu === 'KeToan') return 'PH005';
        if ($chucVu === 'DuocSi') return 'PH006';
        if ($chucVu === 'KTV_CLS' || $maKhoa === 'KH003') {
            if (str_contains($chuyenMon, 'mri')) return 'PH019';
            if (str_contains($chuyenMon, 'ct')) return 'PH018';
            if (str_contains($chuyenMon, 'x-quang')) return 'PH016';
            if (str_contains($chuyenMon, 'siêu âm')) return 'PH017';
            if (str_contains($chuyenMon, 'nội soi') || str_contains($chuyenMon, 'điện tâm đồ')) return 'PH020';
            return 'PH004';
        }
        return 'PH001';
    }

    /**
     * 1. LẤY DỮ LIỆU TỔNG QUAN 6 PHÂN HỆ CHO TRANG ADMIN (BAO GỒM LỊCH LÀM VIỆC)
     */
    public function getOverviewData()
    {
        try {
            $ndList     = $this->safeGetTable('NGUOI_DUNG');
            $nvList     = $this->safeGetTable('NHAN_VIEN');
            $bnList     = $this->safeGetTable('BENH_NHAN');
            $khoaList   = $this->safeGetTable('KHOA');
            $phongList  = $this->safeGetTable('PHONG');
            $llvList    = $this->safeGetTable('LICH_LAM_VIEC');
            $lhList     = $this->safeGetTable('LICH_HEN_KHAM');
            $thuocList  = $this->safeGetTable('DANH_MUC_THUOC');
            $clsList    = $this->safeGetTable('DANH_MUC_CAN_LAM_SANG');
            $hsList     = $this->safeGetTable('HO_SO_KHAM_BENH');
            $hdList     = $this->safeGetTable('HOA_DON_VIEN_PHI');
            $aiChatList = $this->safeGetTable('PHIEN_TRO_CHUYEN_AI');

            $ndById    = $ndList->keyBy('ma_nguoi_dung');
            $nvById    = $nvList->keyBy('ma_nhan_vien');
            $nvByNdId  = $nvList->keyBy('ma_nguoi_dung');
            $bnById    = $bnList->keyBy('ma_benh_nhan');
            $bnByNdId  = $bnList->keyBy('ma_nguoi_dung');
            $khoaById  = $khoaList->keyBy('ma_khoa');
            $phongById = $phongList->keyBy('ma_phong');
            $hdByHsId  = $hdList->keyBy('ma_ho_so_kham');

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

            $rooms = $phongList->map(function ($p) use ($khoaById) {
                $khoa = isset($p->ma_khoa) ? $khoaById->get($p->ma_khoa) : null;
                $arr = (array) $p;
                $arr['ten_khoa'] = $khoa->ten_khoa ?? null;
                return $arr;
            })->values();

            $schedules = $llvList->map(function ($llv) use ($nvById, $ndById, $phongById, $khoaById) {
                $nv = isset($llv->ma_nhan_vien) ? $nvById->get($llv->ma_nhan_vien) : null;
                $nd = ($nv && isset($nv->ma_nguoi_dung)) ? $ndById->get($nv->ma_nguoi_dung) : null;
                $p  = isset($llv->ma_phong) ? $phongById->get($llv->ma_phong) : null;
                $k  = ($p && isset($p->ma_khoa)) ? $khoaById->get($p->ma_khoa) : null;

                return [
                    'ma_lich_lam'        => $llv->ma_lich_lam,
                    'ma_nhan_vien'       => $llv->ma_nhan_vien,
                    'ma_nguoi_dung'      => $nv->ma_nguoi_dung ?? null,
                    'chuc_vu'            => $nv->chuc_vu ?? null,
                    'ma_phong'           => $llv->ma_phong,
                    'ngay_lam_viec'      => $llv->ngay_lam_viec,
                    'ca_truc'            => $llv->ca_truc,
                    'so_luong_bn_toi_da' => $llv->so_luong_bn_toi_da ?? 35,
                    'ten_nhan_su'        => $nd->ho_ten ?? '',
                    'vai_tro'            => $nd->vai_tro ?? '',
                    'so_phong'           => $p->so_phong ?? 'P101',
                    'ten_phong'          => $p->ten_phong ?? '',
                    'ten_khoa'           => $k->ten_khoa ?? '',
                ];
            })->sortBy('ngay_lam_viec')->values();

            $clsServices = $clsList->map(function ($dm) use ($phongById) {
                $phong = isset($dm->ma_phong) ? $phongById->get($dm->ma_phong) : null;
                $arr = (array) $dm;
                $arr['so_phong']  = $phong->so_phong ?? 'P201';
                $arr['ten_phong'] = $phong->ten_phong ?? 'Phòng Cận Lâm Sàng';
                return $arr;
            })->values();

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
                    'stk_benh_vien'          => $hd->stk_benh_vien ?? '0041000888999 - Vietcombank (TTYT Phường Hải Châu)',
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
                'schedules'    => $schedules,
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
     * 2. THÊM / SỬA / KHÓA / XÓA NHÂN SỰ & TÀI KHOẢN
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
                        : $this->generateDateBasedCode('BENH_NHAN', 'ma_benh_nhan', 'BN');

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
                $defaultKhoa = DB::table('KHOA')->value('ma_khoa') ?: 'KH001';
                $maKhoa = $request->filled('ma_khoa') ? trim((string) $request->ma_khoa) : $defaultKhoa;
                $chucVu = $request->filled('chuc_vu')
                    ? trim((string) $request->chuc_vu)
                    : ($request->vai_tro === 'QuanTri'
                        ? 'QuanTriVien'
                        : ($request->vai_tro === 'NVYT'
                            ? ($maKhoa === 'KH003' ? 'KTV_CLS' : 'DieuDuong')
                            : $request->vai_tro));

                $existingNv = DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $userId)->first();
                if ($existingNv) {
                    DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $userId)->update($this->filterValidColumns('NHAN_VIEN', [
                        'ma_khoa' => $maKhoa,
                        'chuc_vu' => $chucVu
                    ]));
                } else {
                    $maNv = ($inputSubCode !== '' && !DB::table('NHAN_VIEN')->where('ma_nhan_vien', $inputSubCode)->exists())
                        ? $inputSubCode
                        : $this->generateDateBasedCode('NHAN_VIEN', 'ma_nhan_vien', 'NV');

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
            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi khi xóa: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 3. QUẢN LÝ KHOA & PHÒNG CHỨC NĂNG
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
     * 4. QUẢN LÝ DANH MỤC THUỐC & CẬN LÂM SÀNG
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
            $maDv = $inputCode !== '' ? $inputCode : $this->generateNextCode('DANH_MUC_CAN_LAM_SANG', 'ma_dich_vu_cls', 'DVCLS', 3);
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

    /**
     * 5. PHÂN CÔNG LỊCH LÀM VIỆC MA TRẬN 3 CA (CHUẨN NGHỈ BÙ RA TRỰC) & XEM LỊCH
     */
    public function toggleSingleShift(Request $request)
    {
        $maNhanVien  = $this->resolveMaNhanVien($request->ma_nhan_vien);
        $ngayLamViec = trim((string) $request->ngay_lam_viec);
        $caTruc      = $this->normalizeShiftCode((string) $request->ca_truc);
        $maPhong     = trim((string) ($request->ma_phong ?: 'PH001'));

        if (!$maNhanVien || $ngayLamViec === '') {
            return response()->json(['status' => 'error', 'message' => 'Dữ liệu ca trực không hợp lệ!'], 400);
        }

        $existing = DB::table('LICH_LAM_VIEC')
            ->where('ma_nhan_vien', $maNhanVien)
            ->where('ngay_lam_viec', $ngayLamViec)
            ->where('ca_truc', $caTruc)
            ->first();

        if ($existing && !$request->force_update_room) {
            DB::statement("SET FOREIGN_KEY_CHECKS = 0");
            DB::table('LICH_LAM_VIEC')->where('ma_lich_lam', $existing->ma_lich_lam)->delete();
            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            return response()->json(['status' => 'success', 'action' => 'removed']);
        } elseif ($existing && $request->force_update_room) {
            DB::table('LICH_LAM_VIEC')
                ->where('ma_lich_lam', $existing->ma_lich_lam)
                ->update(['ma_phong' => $maPhong]);
            return response()->json(['status' => 'success', 'action' => 'updated_room', 'ma_lich_lam' => $existing->ma_lich_lam]);
        }

        // Kiểm tra quy tắc nghỉ bù ra trực & không chồng ca ngày/đêm trước khi thêm mới
        $prevDay = Carbon::parse($ngayLamViec)->subDay()->format('Y-m-d');
        $nextDay = Carbon::parse($ngayLamViec)->addDay()->format('Y-m-d');

        $workedNightYesterday = DB::table('LICH_LAM_VIEC')
            ->where('ma_nhan_vien', $maNhanVien)
            ->where('ngay_lam_viec', $prevDay)
            ->where('ca_truc', 'Dem')
            ->exists();

        if ($workedNightYesterday) {
            return response()->json([
                'status'  => 'error',
                'message' => "Không thể xếp ca ngày {$ngayLamViec}! Nhân sự #{$maNhanVien} vừa trực Ca Đêm ngày {$prevDay} nên bắt buộc nghỉ bù ra trực."
            ], 400);
        }

        if (in_array($caTruc, ['Sang', 'Chieu'], true)) {
            $hasNightToday = DB::table('LICH_LAM_VIEC')
                ->where('ma_nhan_vien', $maNhanVien)
                ->where('ngay_lam_viec', $ngayLamViec)
                ->where('ca_truc', 'Dem')
                ->exists();

            if ($hasNightToday) {
                return response()->json([
                    'status'  => 'error',
                    'message' => "Không thể xếp Ca Sáng/Chiều cùng ngày với Ca Đêm ({$ngayLamViec}) cho nhân sự #{$maNhanVien}!"
                ], 400);
            }
        } else {
            $hasDayToday = DB::table('LICH_LAM_VIEC')
                ->where('ma_nhan_vien', $maNhanVien)
                ->where('ngay_lam_viec', $ngayLamViec)
                ->whereIn('ca_truc', ['Sang', 'Chieu'])
                ->exists();

            if ($hasDayToday) {
                return response()->json([
                    'status'  => 'error',
                    'message' => "Nhân sự #{$maNhanVien} đã có ca Sáng/Chiều ngày {$ngayLamViec}. Hãy tắt ca ngày trước khi xếp Trực Đêm!"
                ], 400);
            }

            $hasAnyTomorrow = DB::table('LICH_LAM_VIEC')
                ->where('ma_nhan_vien', $maNhanVien)
                ->where('ngay_lam_viec', $nextDay)
                ->exists();

            if ($hasAnyTomorrow) {
                return response()->json([
                    'status'  => 'error',
                    'message' => "Nhân sự #{$maNhanVien} đang có lịch làm việc ngày {$nextDay}. Hãy tắt lịch ngày {$nextDay} để đảm bảo nghỉ bù sau khi trực Đêm!"
                ], 400);
            }
        }

        $maLichLam = $this->generateNextCode('LICH_LAM_VIEC', 'ma_lich_lam', 'LLV', 3);
        DB::table('LICH_LAM_VIEC')->insert($this->filterValidColumns('LICH_LAM_VIEC', [
            'ma_lich_lam'        => $maLichLam,
            'ma_nhan_vien'       => $maNhanVien,
            'ma_phong'           => $maPhong,
            'ngay_lam_viec'      => $ngayLamViec,
            'ca_truc'            => $caTruc,
            'so_luong_bn_toi_da' => $caTruc === 'Sang' ? 35 : ($caTruc === 'Chieu' ? 30 : 25)
        ]));
        return response()->json(['status' => 'success', 'action' => 'added', 'ma_lich_lam' => $maLichLam]);
    }

    public function bulkAssignWeek(Request $request)
    {
        $staffUserIds = $request->staff_ids;
        $weekDates    = $request->week_dates;
        $pattern      = trim((string) $request->pattern);
        $staffRooms   = $request->staff_rooms ?? [];

        if (!is_array($staffUserIds) || empty($staffUserIds) || !is_array($weekDates)) {
            return response()->json(['status' => 'error', 'message' => 'Dữ liệu phân ca hàng loạt không hợp lệ!'], 400);
        }

        DB::beginTransaction();
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        try {
            $nvIds = [];
            $nvRoomMap = [];
            foreach ($staffUserIds as $uid) {
                $uidStr = trim((string) $uid);
                $nvId = $this->resolveMaNhanVien($uidStr, null);
                if ($nvId) {
                    $nvIds[] = $nvId;
                    $nvRoomMap[$nvId] = trim((string) ($staffRooms[$uidStr] ?? $staffRooms[$nvId] ?? 'PH001'));
                }
            }

            if (empty($nvIds)) {
                DB::statement("SET FOREIGN_KEY_CHECKS = 1");
                DB::rollBack();
                return response()->json(['status' => 'error', 'message' => 'Không tìm thấy mã nhân sự hợp lệ!'], 400);
            }

            if ($pattern === 'UPDATE_ROOM_ONLY') {
                foreach ($nvIds as $nvId) {
                    DB::table('LICH_LAM_VIEC')
                        ->where('ma_nhan_vien', $nvId)
                        ->whereIn('ngay_lam_viec', $weekDates)
                        ->update(['ma_phong' => $nvRoomMap[$nvId] ?? 'PH001']);
                }
                DB::statement("SET FOREIGN_KEY_CHECKS = 1");
                DB::commit();
                return response()->json(['status' => 'success', 'message' => 'Đã cập nhật phòng trực cho tuần đang chọn!']);
            }

            DB::table('LICH_LAM_VIEC')
                ->whereIn('ma_nhan_vien', $nvIds)
                ->whereIn('ngay_lam_viec', $weekDates)
                ->delete();

            $insertRows = [];
            if ($pattern !== 'CLEAR') {
                $nextSeq = $this->getMaxNumericSuffix('LICH_LAM_VIEC', 'ma_lich_lam');
                foreach ($nvIds as $nvIndex => $nvId) {
                    $roomId = $nvRoomMap[$nvId] ?? 'PH001';
                    $nightDay = $nvIndex % 7;
                    $restAfterNightDay = ($nightDay + 1) % 7;
                    $weeklyOffDay = ($nightDay + 4) % 7;

                    foreach ($weekDates as $dayIdx => $dateStr) {
                        $shiftsForDay = [];
                        if ($pattern === 'MORNING_T2_T7' && $dayIdx <= 5) {
                            $shiftsForDay = ['Sang'];
                        } elseif ($pattern === 'AFTERNOON_T2_T7' && $dayIdx <= 5) {
                            $shiftsForDay = ['Chieu'];
                        } elseif ($pattern === 'OFFICE_T2_T6' && $dayIdx <= 4) {
                            $shiftsForDay = ['Sang', 'Chieu'];
                        } elseif ($pattern === 'NIGHT_246' && in_array($dayIdx, [0, 2, 4], true)) {
                            $shiftsForDay = ['Dem'];
                        } elseif ($pattern === 'NIGHT_357' && in_array($dayIdx, [1, 3, 5], true)) {
                            $shiftsForDay = ['Dem'];
                        } elseif ($pattern === 'FULL_ROTATION') {
                            // 1 ca Đêm + 1 ngày nghỉ bù ngay hôm sau + 1 ngày nghỉ tuần + 4 ngày Hành chính
                            if ($dayIdx === $nightDay) {
                                $shiftsForDay = ['Dem'];
                            } elseif ($dayIdx === $restAfterNightDay || $dayIdx === $weeklyOffDay) {
                                $shiftsForDay = [];
                            } else {
                                $shiftsForDay = ['Sang', 'Chieu'];
                            }
                        }

                        foreach ($shiftsForDay as $sh) {
                            $nextSeq++;
                            $insertRows[] = [
                                'ma_lich_lam'        => 'LLV' . str_pad((string) $nextSeq, 3, '0', STR_PAD_LEFT),
                                'ma_nhan_vien'       => $nvId,
                                'ma_phong'           => $roomId,
                                'ngay_lam_viec'      => $dateStr,
                                'ca_truc'            => $sh,
                                'so_luong_bn_toi_da' => $sh === 'Sang' ? 35 : ($sh === 'Chieu' ? 30 : 25)
                            ];
                        }
                    }
                }

                foreach (array_chunk($insertRows, 200) as $chunk) {
                    DB::table('LICH_LAM_VIEC')->insert($chunk);
                }
            }

            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::commit();
            return response()->json([
                'status'  => 'success',
                'message' => 'Đã áp dụng phân ca hàng loạt hợp lý (' . count($insertRows) . ' ca trực, đảm bảo nghỉ bù sau ca Đêm)!'
            ]);
        } catch (\Throwable $e) {
            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 400);
        }
    }

    public function autoGenerateWeek(Request $request)
    {
        $weekDates = $request->week_dates;
        if (!is_array($weekDates) || count($weekDates) < 7) {
            return response()->json(['status' => 'error', 'message' => 'Thiếu danh sách 7 ngày trong tuần!'], 400);
        }

        DB::beginTransaction();
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        try {
            $allRooms = DB::table('PHONG')->get();
            $allNv = DB::table('NHAN_VIEN as nv')
                ->join('NGUOI_DUNG as nd', 'nv.ma_nguoi_dung', '=', 'nd.ma_nguoi_dung')
                ->whereIn('nd.vai_tro', ['BacSi', 'NVYT', 'KeToan', 'DuocSi'])
                ->where('nd.trang_thai', '!=', 'DaKhoa')
                ->orderBy('nv.ma_nhan_vien', 'asc')
                ->select('nv.*', 'nd.vai_tro')
                ->get();

            // Kiểm tra nhân sự đã trực Đêm Chủ Nhật tuần trước -> bắt buộc nghỉ bù Thứ Hai tuần này
            $prevSunday = Carbon::parse($weekDates[0])->subDay()->format('Y-m-d');
            $workedNightPrevSunday = DB::table('LICH_LAM_VIEC')
                ->where('ngay_lam_viec', $prevSunday)
                ->where('ca_truc', 'Dem')
                ->pluck('ma_nhan_vien')
                ->flip()
                ->all();

            DB::table('LICH_LAM_VIEC')->whereIn('ngay_lam_viec', $weekDates)->delete();

            // Chia nhân sự thành 6 nhóm chức danh độc lập (tách riêng Tiếp nhận & Đo sinh hiệu)
            $groups = [
                'BacSi'     => [],
                'TiepDon'   => [],
                'DieuDuong' => [],
                'KTV'       => [],
                'DuocSi'    => [],
                'KeToan'    => [],
            ];
            $roomByNv = [];
            foreach ($allNv as $nv) {
                $g = $this->classifyStaffGroup($nv);
                $groups[$g][] = $nv;
                $roomByNv[$nv->ma_nhan_vien] = $this->resolveDefaultRoomForStaff($nv, $allRooms);
            }

            $nextSeq = $this->getMaxNumericSuffix('LICH_LAM_VIEC', 'ma_lich_lam');
            $insertRows = [];

            foreach ($groups as $groupName => $members) {
                $totalMembers = count($members);
                if ($totalMembers === 0) continue;

                // Định mức trực Đêm mỗi ngày theo quy mô nhóm để luôn đủ người xoay tua nghỉ bù
                if ($groupName === 'BacSi') {
                    $nightQuota = min(4, max(1, intdiv($totalMembers, 5)));
                } elseif (in_array($groupName, ['TiepDon', 'DieuDuong', 'KTV'], true)) {
                    $nightQuota = ($totalMembers >= 4) ? min(2, intdiv($totalMembers, 4)) : (($totalMembers >= 3) ? 1 : 0);
                } else {
                    $nightQuota = ($totalMembers >= 3) ? 1 : 0;
                }

                $dayState = [];   // 'FREE' | 'NIGHT' | 'REST_AFTER_NIGHT' | 'DAY'
                $nightCount = [];
                $workDays = [];
                $memberOrder = [];

                foreach ($members as $idx => $nv) {
                    $id = $nv->ma_nhan_vien;
                    $memberOrder[$id] = $idx;
                    $nightCount[$id] = 0;
                    $workDays[$id] = 0;
                    $dayState[$id] = array_fill(0, 7, 'FREE');
                    if (isset($workedNightPrevSunday[$id])) {
                        $dayState[$id][0] = 'REST_AFTER_NIGHT';
                    }
                }

                // PHA 1: XẾP CA ĐÊM TRƯỚC (MỖI CA ĐÊM KHÓA LUÔN NGÀY HÔM SAU NGHỈ BÙ RA TRỰC)
                for ($dayIdx = 0; $dayIdx < 7; $dayIdx++) {
                    if ($nightQuota <= 0) break;

                    $candidates = [];
                    foreach ($members as $nv) {
                        $id = $nv->ma_nhan_vien;
                        if ($dayState[$id][$dayIdx] !== 'FREE') continue;
                        if ($dayIdx > 0 && $dayState[$id][$dayIdx - 1] === 'NIGHT') continue;
                        $candidates[] = $id;
                    }

                    usort($candidates, function ($a, $b) use ($nightCount, $dayState, $dayIdx, $memberOrder) {
                        if ($nightCount[$a] !== $nightCount[$b]) {
                            return $nightCount[$a] <=> $nightCount[$b];
                        }
                        $recentA = ($dayIdx >= 2 && $dayState[$a][$dayIdx - 2] === 'NIGHT') ? 1 : 0;
                        $recentB = ($dayIdx >= 2 && $dayState[$b][$dayIdx - 2] === 'NIGHT') ? 1 : 0;
                        if ($recentA !== $recentB) {
                            return $recentA <=> $recentB;
                        }
                        return (($memberOrder[$a] + $dayIdx) % 97) <=> (($memberOrder[$b] + $dayIdx) % 97);
                    });

                    $picked = array_slice($candidates, 0, $nightQuota);
                    foreach ($picked as $id) {
                        $dayState[$id][$dayIdx] = 'NIGHT';
                        $nightCount[$id]++;
                        $workDays[$id]++;

                        if ($dayIdx + 1 < 7) {
                            $dayState[$id][$dayIdx + 1] = 'REST_AFTER_NIGHT';
                        }

                        $nextSeq++;
                        $insertRows[] = [
                            'ma_lich_lam'        => 'LLV' . str_pad((string) $nextSeq, 3, '0', STR_PAD_LEFT),
                            'ma_nhan_vien'       => $id,
                            'ma_phong'           => $roomByNv[$id],
                            'ngay_lam_viec'      => $weekDates[$dayIdx],
                            'ca_truc'            => 'Dem',
                            'so_luong_bn_toi_da' => 25
                        ];
                    }
                }

                // PHA 2: XẾP CA BAN NGÀY (SÁNG + CHIỀU HÀNH CHÍNH) CHỈ CHO NGƯỜI ĐANG 'FREE'
                for ($dayIdx = 0; $dayIdx < 7; $dayIdx++) {
                    $freeMembers = [];
                    foreach ($members as $nv) {
                        $id = $nv->ma_nhan_vien;
                        if ($dayState[$id][$dayIdx] === 'FREE') {
                            $freeMembers[] = $id;
                        }
                    }

                    if (empty($freeMembers)) continue;

                    usort($freeMembers, function ($a, $b) use ($workDays, $memberOrder, $dayIdx) {
                        if ($workDays[$a] !== $workDays[$b]) {
                            return $workDays[$a] <=> $workDays[$b];
                        }
                        return (($memberOrder[$a] + $dayIdx) % 97) <=> (($memberOrder[$b] + $dayIdx) % 97);
                    });

                    if ($dayIdx <= 4) {
                        $underCap = array_values(array_filter($freeMembers, fn($id) => $workDays[$id] < 5));
                        $targetDayCount = max(min(2, count($freeMembers)), (int) ceil(count($freeMembers) * 0.8));
                        $chosenDay = array_slice(count($underCap) >= min(2, count($freeMembers)) ? $underCap : $freeMembers, 0, $targetDayCount);
                    } elseif ($dayIdx === 5) {
                        $underCap = array_values(array_filter($freeMembers, fn($id) => $workDays[$id] < 5));
                        $pool = count($underCap) > 0 ? $underCap : $freeMembers;
                        $targetDayCount = max(1, (int) ceil($totalMembers * 0.45));
                        $chosenDay = array_slice($pool, 0, min($targetDayCount, count($pool)));
                    } else {
                        $underCap = array_values(array_filter($freeMembers, fn($id) => $workDays[$id] < 5));
                        $pool = count($underCap) > 0 ? $underCap : $freeMembers;
                        $targetDayCount = max(1, (int) ceil($totalMembers * 0.3));
                        $chosenDay = array_slice($pool, 0, min($targetDayCount, count($pool)));
                    }

                    foreach ($chosenDay as $id) {
                        $dayState[$id][$dayIdx] = 'DAY';
                        $workDays[$id]++;

                        $nextSeq++;
                        $insertRows[] = [
                            'ma_lich_lam'        => 'LLV' . str_pad((string) $nextSeq, 3, '0', STR_PAD_LEFT),
                            'ma_nhan_vien'       => $id,
                            'ma_phong'           => $roomByNv[$id],
                            'ngay_lam_viec'      => $weekDates[$dayIdx],
                            'ca_truc'            => 'Sang',
                            'so_luong_bn_toi_da' => 35
                        ];

                        $needAfternoon = ($dayIdx <= 5) || (($memberOrder[$id] % 2) === 0);
                        if ($needAfternoon) {
                            $nextSeq++;
                            $insertRows[] = [
                                'ma_lich_lam'        => 'LLV' . str_pad((string) $nextSeq, 3, '0', STR_PAD_LEFT),
                                'ma_nhan_vien'       => $id,
                                'ma_phong'           => $roomByNv[$id],
                                'ngay_lam_viec'      => $weekDates[$dayIdx],
                                'ca_truc'            => 'Chieu',
                                'so_luong_bn_toi_da' => 30
                            ];
                        }
                    }
                }
            }

            foreach (array_chunk($insertRows, 250) as $chunk) {
                DB::table('LICH_LAM_VIEC')->insert($chunk);
            }

            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::commit();

            return response()->json([
                'status'  => 'success',
                'message' => 'Đã tự động xếp lịch chuẩn y tế cho ' . count($allNv) . ' nhân sự thuộc 6 nhóm chuyên trách (' . count($insertRows) . ' ca trực). Đảm bảo 100% nghỉ bù sau ca Đêm và không chồng ca ngày/đêm!'
            ]);
        } catch (\Throwable $e) {
            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 400);
        }
    }

    public function copyPreviousWeek(Request $request)
    {
        $targetDates = $request->week_dates;
        if (!is_array($targetDates) || empty($targetDates)) {
            return response()->json(['status' => 'error', 'message' => 'Thiếu danh sách ngày tuần đích!'], 400);
        }

        $prevDates = [];
        $dateMap = [];
        foreach ($targetDates as $dStr) {
            $prevStr = Carbon::parse($dStr)->subDays(7)->format('Y-m-d');
            $prevDates[] = $prevStr;
            $dateMap[$prevStr] = $dStr;
        }

        $prevSchedules = DB::table('LICH_LAM_VIEC')->whereIn('ngay_lam_viec', $prevDates)->get();
        if ($prevSchedules->isEmpty()) {
            return response()->json(['status' => 'error', 'message' => 'Tuần trước chưa có dữ liệu lịch trực!'], 400);
        }

        DB::beginTransaction();
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        try {
            DB::table('LICH_LAM_VIEC')->whereIn('ngay_lam_viec', $targetDates)->delete();
            $nextSeq = $this->getMaxNumericSuffix('LICH_LAM_VIEC', 'ma_lich_lam');

            $newRows = [];
            foreach ($prevSchedules as $ps) {
                $oldDate = substr((string) $ps->ngay_lam_viec, 0, 10);
                if (isset($dateMap[$oldDate])) {
                    $nextSeq++;
                    $newRows[] = [
                        'ma_lich_lam'        => 'LLV' . str_pad((string) $nextSeq, 3, '0', STR_PAD_LEFT),
                        'ma_nhan_vien'       => $ps->ma_nhan_vien,
                        'ma_phong'           => $ps->ma_phong,
                        'ngay_lam_viec'      => $dateMap[$oldDate],
                        'ca_truc'            => $this->normalizeShiftCode((string) $ps->ca_truc),
                        'so_luong_bn_toi_da' => $ps->so_luong_bn_toi_da ?? 35
                    ];
                }
            }

            foreach (array_chunk($newRows, 250) as $chunk) {
                DB::table('LICH_LAM_VIEC')->insert($chunk);
            }

            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::commit();

            return response()->json([
                'status'  => 'success',
                'message' => 'Đã sao chép ' . count($newRows) . ' ca trực từ tuần trước!'
            ]);
        } catch (\Throwable $e) {
            DB::statement("SET FOREIGN_KEY_CHECKS = 1");
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 400);
        }
    }

    public function saveSchedule(Request $request)
    {
        $maNhanVien = $this->resolveMaNhanVien($request->ma_nhan_vien);
        $ngayLam    = trim((string) $request->ngay_lam_viec);
        $caTruc     = $this->normalizeShiftCode((string) $request->ca_truc);
        $maPhong    = trim((string) ($request->ma_phong ?: 'PH001'));

        if (!$maNhanVien || $ngayLam === '') {
            return response()->json(['status' => 'error', 'message' => 'Thiếu thông tin nhân sự hoặc ngày làm việc!'], 400);
        }

        $existing = DB::table('LICH_LAM_VIEC')
            ->where('ma_nhan_vien', $maNhanVien)
            ->where('ngay_lam_viec', $ngayLam)
            ->where('ca_truc', $caTruc)
            ->first();

        if ($existing) {
            DB::table('LICH_LAM_VIEC')
                ->where('ma_lich_lam', $existing->ma_lich_lam)
                ->update($this->filterValidColumns('LICH_LAM_VIEC', [
                    'ma_phong'           => $maPhong,
                    'so_luong_bn_toi_da' => (int) ($request->so_luong_bn_toi_da ?: 35)
                ]));
        } else {
            $maLichLam = $this->generateNextCode('LICH_LAM_VIEC', 'ma_lich_lam', 'LLV', 3);
            DB::table('LICH_LAM_VIEC')->insert($this->filterValidColumns('LICH_LAM_VIEC', [
                'ma_lich_lam'        => $maLichLam,
                'ma_nhan_vien'       => $maNhanVien,
                'ma_phong'           => $maPhong,
                'ngay_lam_viec'      => $ngayLam,
                'ca_truc'            => $caTruc,
                'so_luong_bn_toi_da' => (int) ($request->so_luong_bn_toi_da ?: 35)
            ]));
        }

        return response()->json(['status' => 'success', 'message' => 'Đã lưu phân công lịch trực vào MySQL!']);
    }

    public function deleteSchedule($id)
    {
        $maLichLam = trim((string) $id);
        DB::statement("SET FOREIGN_KEY_CHECKS = 0");
        DB::table('LICH_LAM_VIEC')->where('ma_lich_lam', $maLichLam)->delete();
        DB::statement("SET FOREIGN_KEY_CHECKS = 1");
        return response()->json(['status' => 'success', 'message' => 'Đã xóa ca trực #' . $maLichLam . ' khỏi MySQL!']);
    }

    /**
     * API XEM LỊCH LÀM VIỆC CÁ NHÂN CHO NHÂN VIÊN Y TẾ, BÁC SĨ, KẾ TOÁN, DƯỢC SĨ
     */
    public function getStaffSchedules(string $idOrUserId)
    {
        try {
            $val = trim($idOrUserId);
            $staff = DB::table('NHAN_VIEN as nv')
                ->join('NGUOI_DUNG as nd', 'nv.ma_nguoi_dung', '=', 'nd.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv.ma_khoa', '=', 'k.ma_khoa')
                ->where('nv.ma_nhan_vien', $val)
                ->orWhere('nv.ma_nguoi_dung', $val)
                ->select(
                    'nv.ma_nhan_vien',
                    'nv.ma_nguoi_dung',
                    'nv.chuc_vu',
                    'nv.chuyen_mon',
                    'nd.ho_ten',
                    'nd.email',
                    'nd.vai_tro',
                    'k.ten_khoa'
                )
                ->first();

            if (!$staff) {
                return response()->json(['status' => 'success', 'staff' => null, 'schedules' => []], 200);
            }

            $schedules = DB::table('LICH_LAM_VIEC as llv')
                ->join('PHONG as p', 'llv.ma_phong', '=', 'p.ma_phong')
                ->leftJoin('KHOA as k', 'p.ma_khoa', '=', 'k.ma_khoa')
                ->where('llv.ma_nhan_vien', $staff->ma_nhan_vien)
                ->orderBy('llv.ngay_lam_viec', 'asc')
                ->orderByRaw("FIELD(llv.ca_truc, 'Sang', 'Chieu', 'Dem')")
                ->select('llv.*', 'p.so_phong', 'p.ten_phong', 'p.loai_phong', 'k.ten_khoa')
                ->get();

            $bookingCounts = DB::table('LICH_HEN_KHAM')
                ->where('trang_thai_hen', '!=', 'DaHuy')
                ->select('ma_lich_lam', DB::raw('COUNT(*) as total'))
                ->groupBy('ma_lich_lam')
                ->pluck('total', 'ma_lich_lam');

            foreach ($schedules as $s) {
                $s->so_lich_hen = (int) ($bookingCounts[$s->ma_lich_lam] ?? 0);
            }

            return response()->json([
                'status'    => 'success',
                'staff'     => $staff,
                'schedules' => $schedules
            ], 200);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * API DÙNG CHUNG CHO NVYT, BÁC SĨ, KẾ TOÁN, DƯỢC SĨ:
     * Trả về toàn bộ lịch trực tuần (LICH_LAM_VIEC) và danh sách nhân sự để hiển thị Bảng điều phối ca kíp
     */
    public function getWeeklyScheduleBoard()
    {
        try {
            $lichLamViecTuan = DB::table('LICH_LAM_VIEC as llv')
                ->join('NHAN_VIEN as nv', 'llv.ma_nhan_vien', '=', 'nv.ma_nhan_vien')
                ->join('NGUOI_DUNG as nd', 'nv.ma_nguoi_dung', '=', 'nd.ma_nguoi_dung')
                ->join('PHONG as p', 'llv.ma_phong', '=', 'p.ma_phong')
                ->leftJoin('KHOA as k', 'p.ma_khoa', '=', 'k.ma_khoa')
                ->orderBy('llv.ngay_lam_viec', 'asc')
                ->orderByRaw("FIELD(llv.ca_truc, 'Sang', 'Chieu', 'Dem')")
                ->select(
                    'llv.*',
                    'nv.ma_nguoi_dung',
                    'nv.chuc_vu',
                    'nv.chuyen_mon',
                    'nd.ho_ten as ten_nhan_su',
                    'nd.vai_tro',
                    'nd.so_dien_thoai',
                    'nd.email',
                    'p.so_phong',
                    'p.ten_phong',
                    'p.loai_phong',
                    'k.ma_khoa',
                    'k.ten_khoa'
                )
                ->get();

            $danhSachNhanSu = DB::table('NHAN_VIEN as nv')
                ->join('NGUOI_DUNG as nd', 'nv.ma_nguoi_dung', '=', 'nd.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv.ma_khoa', '=', 'k.ma_khoa')
                ->whereIn('nd.vai_tro', ['BacSi', 'NVYT', 'KeToan', 'DuocSi'])
                ->where('nd.trang_thai', '!=', 'DaKhoa')
                ->orderBy('nv.ma_nhan_vien', 'asc')
                ->select(
                    'nv.ma_nhan_vien',
                    'nd.ma_nguoi_dung',
                    'nd.ho_ten',
                    'nd.vai_tro',
                    'nv.chuc_vu',
                    'nv.chuyen_mon',
                    'k.ma_khoa',
                    'k.ten_khoa'
                )
                ->get();

            return response()->json([
                'status'             => 'success',
                'lich_lam_viec_tuan' => $lichLamViecTuan,
                'danh_sach_nhan_su'  => $danhSachNhanSu
            ], 200);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Lỗi tải bảng điều phối lịch trực: ' . $e->getMessage()
            ], 500);
        }
    }
}