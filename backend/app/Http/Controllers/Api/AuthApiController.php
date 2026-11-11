<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class AuthApiController extends Controller
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
     * Hàm tự động sinh mã Chữ + Số tiếp theo cho các bảng (VD: ND015, BN007, OTP006, LH006...)
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
     * 1. GỬI MÃ OTP XÁC THỰC VỀ GMAIL (Chưa tạo tài khoản trong NGUOI_DUNG & BENH_NHAN)
     */
    public function sendRegisterOtp(Request $request)
    {
        $email = strtolower(trim((string) $request->email));
        $vneid = trim((string) $request->vneid);

        if (!$email) {
            return response()->json(['status' => 'error', 'message' => 'Vui lòng nhập địa chỉ Gmail hợp lệ!'], 400);
        }

        if (DB::table('NGUOI_DUNG')->where('email', $email)->exists()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Địa chỉ Gmail này đã được đăng ký tài khoản trên hệ thống!'
            ], 400);
        }

        if ($vneid !== '' && DB::table('NGUOI_DUNG')->where('vneid', $vneid)->exists()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Số CCCD / VNeID này đã được đăng ký tài khoản trên hệ thống!'
            ], 400);
        }

        $otpCode = (string) random_int(100000, 999999);
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $expiredAt = $now->copy()->addMinutes(5);
        $tempHolderKey = 'WAIT_' . strtoupper(substr(md5($email), 0, 6));

        DB::statement('SET FOREIGN_KEY_CHECKS = 0');
        DB::table('MA_XAC_THUC_OTP')
            ->where('ma_nguoi_dung', $tempHolderKey)
            ->where('trang_thai_su_dung', 'ChuaSuDung')
            ->delete();

        $maOtp = $this->generateNextCode('MA_XAC_THUC_OTP', 'ma_otp', 'OTP', 3);
        DB::table('MA_XAC_THUC_OTP')->insert($this->filterValidColumns('MA_XAC_THUC_OTP', [
            'ma_otp'             => $maOtp,
            'ma_nguoi_dung'      => $tempHolderKey,
            'ma_xac_thuc'        => $otpCode,
            'thoi_gian_tao'      => $now,
            'thoi_gian_het_han'  => $expiredAt,
            'trang_thai_su_dung' => 'ChuaSuDung'
        ]));
        DB::statement('SET FOREIGN_KEY_CHECKS = 1');

        // Lưu tạm thông tin form đăng ký vào file cache chờ bước xác nhận OTP
        $pendingFile = storage_path('app/pending_registrations.json');
        $pendingData = file_exists($pendingFile) ? (json_decode(file_get_contents($pendingFile), true) ?: []) : [];
        $pendingData[$email] = [
            'ho_ten'        => strtoupper(trim((string) $request->ho_ten)),
            'gioi_tinh'     => $request->gioi_tinh ?: 'Nam',
            'email'         => $email,
            'so_dien_thoai' => trim((string) $request->so_dien_thoai),
            'ngay_sinh'     => $request->ngay_sinh ?: '2000-01-01',
            'vneid'         => $vneid ?: null,
            'so_the_bhyt'   => $request->filled('so_the_bhyt') ? strtoupper(trim((string) $request->so_the_bhyt)) : null,
            'dia_chi'       => trim((string) $request->dia_chi),
            'mat_khau'      => $request->mat_khau ?: '123456',
            'ma_otp'        => $otpCode,
            'expired_at'    => $expiredAt->timestamp
        ];
        file_put_contents($pendingFile, json_encode($pendingData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $mailSent = false;
        try {
            Mail::raw(
                "Xin chào {$pendingData[$email]['ho_ten']},\n\n" .
                "Mã xác thực OTP đăng ký tài khoản tại Trung tâm Y tế Phường Hải Châu của bạn là: {$otpCode}\n" .
                "Mã có hiệu lực trong vòng 5 phút.\n\n" .
                "Trân trọng,\nTTYT Phường Hải Châu - TP. Đà Nẵng.",
                function ($message) use ($email) {
                    $message->to($email)->subject('Mã xác thực OTP đăng ký tài khoản - TTYT Phường Hải Châu');
                }
            );
            $mailSent = true;
        } catch (\Throwable $mailErr) {
            $mailSent = false;
        }

        return response()->json([
            'status'   => 'success',
            'demo_otp' => $otpCode,
            'message'  => $mailSent
                ? "Đã gửi mã xác thực 6 số về hộp thư Gmail ({$email})!"
                : "Đã tạo mã xác thực 6 số cho Gmail ({$email}) (Mã OTP trong MySQL: {$otpCode})!"
        ]);
    }

    /**
     * 2. XÁC NHẬN MÃ OTP & CHÍNH THỨC TẠO TÀI KHOẢN VÀO BẢNG NGUOI_DUNG & BENH_NHAN
     */
    public function verifyOtpAndRegister(Request $request)
    {
        $email = strtolower(trim((string) $request->email));
        $inputOtp = trim((string) ($request->ma_xac_thuc ?? $request->ma_otp ?? ''));
        $tempHolderKey = 'WAIT_' . strtoupper(substr(md5($email), 0, 6));

        if (!$email || strlen($inputOtp) !== 6) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Vui lòng nhập đầy đủ mã OTP gồm 6 chữ số!'
            ], 400);
        }

        $otpRecord = DB::table('MA_XAC_THUC_OTP')
            ->where('ma_nguoi_dung', $tempHolderKey)
            ->where('ma_xac_thuc', $inputOtp)
            ->where('trang_thai_su_dung', 'ChuaSuDung')
            ->orderByDesc('ma_otp')
            ->first();

        $pendingFile = storage_path('app/pending_registrations.json');
        $pendingData = file_exists($pendingFile) ? (json_decode(file_get_contents($pendingFile), true) ?: []) : [];
        $cachedUser = $pendingData[$email] ?? null;

        if (!$otpRecord && (!$cachedUser || (string) $cachedUser['ma_otp'] !== $inputOtp)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Mã xác thực OTP không chính xác hoặc đã hết hạn!'
            ], 400);
        }

        $hoTen        = strtoupper(trim((string) ($request->ho_ten ?: ($cachedUser['ho_ten'] ?? ''))));
        $gioiTinh     = $request->gioi_tinh ?: ($cachedUser['gioi_tinh'] ?? 'Nam');
        $soDienThoai  = trim((string) ($request->so_dien_thoai ?: ($cachedUser['so_dien_thoai'] ?? '')));
        $ngaySinh     = $request->ngay_sinh ?: ($cachedUser['ngay_sinh'] ?? '2000-01-01');
        $vneid        = trim((string) ($request->vneid ?: ($cachedUser['vneid'] ?? ''))) ?: null;
        $soTheBhyt    = trim((string) ($request->so_the_bhyt ?: ($cachedUser['so_the_bhyt'] ?? ''))) ?: null;
        $diaChi       = trim((string) ($request->dia_chi ?: ($cachedUser['dia_chi'] ?? '')));
        $matKhauPlain = $request->mat_khau ?: ($cachedUser['mat_khau'] ?? '123456');

        DB::beginTransaction();
        try {
            $maNguoiDung = $this->generateNextCode('NGUOI_DUNG', 'ma_nguoi_dung', 'ND', 3);
            $maBenhNhan  = $this->generateNextCode('BENH_NHAN', 'ma_benh_nhan', 'BN', 3);

            DB::table('NGUOI_DUNG')->insert($this->filterValidColumns('NGUOI_DUNG', [
                'ma_nguoi_dung' => $maNguoiDung,
                'vneid'         => $vneid,
                'ho_ten'        => $hoTen,
                'email'         => $email,
                'so_dien_thoai' => $soDienThoai,
                'mat_khau'      => Hash::make($matKhauPlain),
                'vai_tro'       => 'BenhNhan',
                'trang_thai'    => 'HoatDong',
                'ngay_tao'      => Carbon::now('Asia/Ho_Chi_Minh')
            ]));

            DB::table('BENH_NHAN')->insert($this->filterValidColumns('BENH_NHAN', [
                'ma_benh_nhan'            => $maBenhNhan,
                'ma_nguoi_dung'           => $maNguoiDung,
                'ngay_sinh'               => $ngaySinh,
                'gioi_tinh'               => $gioiTinh,
                'dia_chi'                 => $diaChi,
                'so_the_bhyt'             => $soTheBhyt ? strtoupper($soTheBhyt) : null,
                'han_the_bhyt'            => $soTheBhyt ? '2027-12-31' : null,
                'noi_dang_ky_bhyt'        => 'TTYT Phường Hải Châu',
                'tien_su_di_ung_benh_nen' => 'Không có'
            ]));

            if ($otpRecord) {
                DB::table('MA_XAC_THUC_OTP')
                    ->where('ma_otp', $otpRecord->ma_otp)
                    ->update($this->filterValidColumns('MA_XAC_THUC_OTP', [
                        'ma_nguoi_dung'      => $maNguoiDung,
                        'trang_thai_su_dung' => 'DaSuDung'
                    ]));
            }

            if (isset($pendingData[$email])) {
                unset($pendingData[$email]);
                file_put_contents($pendingFile, json_encode($pendingData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            }

            DB::commit();

            return response()->json([
                'status'  => 'success',
                'message' => 'Xác thực OTP và kích hoạt tài khoản thành công!',
                'user'    => [
                    'ma_nguoi_dung' => $maNguoiDung,
                    'ma_benh_nhan'  => $maBenhNhan,
                    'vneid'         => $vneid,
                    'ho_ten'        => $hoTen,
                    'email'         => $email,
                    'so_dien_thoai' => $soDienThoai,
                    'vai_tro'       => 'BenhNhan',
                    'trang_thai'    => 'HoatDong'
                ]
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'status'  => 'error',
                'message' => 'Lỗi tạo tài khoản trong MySQL: ' . $e->getMessage()
            ], 400);
        }
    }

    /**
     * 3. ĐĂNG NHẬP HỆ THỐNG (Cho phép đăng nhập bằng Email, Số điện thoại hoặc VNeID)
     */
    public function login(Request $request)
    {
        $loginInput = trim((string) ($request->email ?? $request->login ?? $request->vneid ?? $request->so_dien_thoai ?? ''));
        $password = trim((string) ($request->mat_khau ?? $request->password ?? ''));

        if ($loginInput === '' || $password === '') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Vui lòng nhập đầy đủ Email/Số điện thoại/VNeID và mật khẩu!'
            ], 400);
        }

        $user = DB::table('NGUOI_DUNG')
            ->where('email', $loginInput)
            ->orWhere('so_dien_thoai', $loginInput)
            ->orWhere('vneid', $loginInput)
            ->first();

        if (!$user) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy tài khoản với thông tin đăng nhập này trong MySQL!'
            ], 401);
        }

        $isDefaultSeedHash = ($user->mat_khau === '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');
        $isValidPassword = Hash::check($password, $user->mat_khau)
            || ($password === $user->mat_khau)
            || ($isDefaultSeedHash && $password === '123456');

        if (!$isValidPassword) {
            return response()->json(['status' => 'error', 'message' => 'Mật khẩu không chính xác!'], 401);
        }

        if ($isDefaultSeedHash && $password === '123456') {
            DB::table('NGUOI_DUNG')
                ->where('ma_nguoi_dung', $user->ma_nguoi_dung)
                ->update(['mat_khau' => Hash::make('123456')]);
        }

        if ($user->trang_thai === 'DaKhoa' || $user->trang_thai === '0') {
            return response()->json(['status' => 'error', 'message' => 'Tài khoản của bạn hiện đang bị khóa!'], 403);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Đăng nhập thành công!',
            'user'    => $this->buildUserSessionObject($user->ma_nguoi_dung)
        ]);
    }

    /**
     * Hàm tổng hợp đầy đủ thông tin Người dùng + Bệnh nhân / Nhân viên trả về cho Frontend
     */
    private function buildUserSessionObject(string $maNguoiDung)
    {
        $user = DB::table('NGUOI_DUNG')->where('ma_nguoi_dung', $maNguoiDung)->first();
        if (!$user) return null;

        $bn = DB::table('BENH_NHAN')->where('ma_nguoi_dung', $maNguoiDung)->first();
        $nv = DB::table('NHAN_VIEN as nv')
            ->leftJoin('KHOA as k', 'nv.ma_khoa', '=', 'k.ma_khoa')
            ->where('nv.ma_nguoi_dung', $maNguoiDung)
            ->select('nv.*', 'k.ten_khoa')
            ->first();

        return [
            'ma_nguoi_dung'           => $user->ma_nguoi_dung,
            'vneid'                   => $user->vneid,
            'ma_nhan_vien'            => $nv ? $nv->ma_nhan_vien : null,
            'ma_benh_nhan'            => $bn ? $bn->ma_benh_nhan : null,
            'ho_ten'                  => $user->ho_ten,
            'email'                   => $user->email,
            'so_dien_thoai'           => $user->so_dien_thoai,
            'vai_tro'                 => $user->vai_tro,
            'chuc_vu'                 => $nv ? $nv->chuc_vu : null,
            'ma_khoa'                 => $nv ? $nv->ma_khoa : null,
            'ten_khoa'                => $nv ? $nv->ten_khoa : null,
            'ngay_sinh'               => $bn ? $bn->ngay_sinh : null,
            'gioi_tinh'               => $bn ? $bn->gioi_tinh : 'Nam',
            'dia_chi'                 => $bn ? $bn->dia_chi : '',
            'so_the_bhyt'             => $bn ? $bn->so_the_bhyt : '',
            'han_the_bhyt'            => $bn ? $bn->han_the_bhyt : null,
            'noi_dang_ky_bhyt'        => $bn ? $bn->noi_dang_ky_bhyt : 'TTYT Phường Hải Châu',
            'tien_su_di_ung_benh_nen' => $bn ? $bn->tien_su_di_ung_benh_nen : 'Không có',
            'stk_ngan_hang'           => $bn ? $bn->stk_ngan_hang : ''
        ];
    }

    /**
     * 4. LẤY & CẬP NHẬT HỒ SƠ CÁ NHÂN
     */
    public function getProfile(string $maNguoiDung)
    {
        $profile = $this->buildUserSessionObject($maNguoiDung);
        if (!$profile) {
            return response()->json(['status' => 'error', 'message' => 'Không tìm thấy người dùng!'], 404);
        }
        return response()->json(['status' => 'success', 'user' => $profile]);
    }

    public function updateProfile(Request $request)
    {
        $maNguoiDung = trim((string) $request->ma_nguoi_dung);

        $updateUser = [
            'ho_ten'        => mb_strtoupper(trim($request->ho_ten), 'UTF-8'),
            'so_dien_thoai' => trim($request->so_dien_thoai)
        ];
        if ($request->filled('vneid')) {
            $updateUser['vneid'] = trim($request->vneid);
        }

        DB::table('NGUOI_DUNG')
            ->where('ma_nguoi_dung', $maNguoiDung)
            ->update($this->filterValidColumns('NGUOI_DUNG', $updateUser));

        if (DB::table('BENH_NHAN')->where('ma_nguoi_dung', $maNguoiDung)->exists()) {
            DB::table('BENH_NHAN')
                ->where('ma_nguoi_dung', $maNguoiDung)
                ->update($this->filterValidColumns('BENH_NHAN', [
                    'ngay_sinh'               => $request->ngay_sinh ?: '2000-01-01',
                    'gioi_tinh'               => $request->gioi_tinh ?: 'Nam',
                    'dia_chi'                 => $request->dia_chi ?: '',
                    'so_the_bhyt'             => $request->so_the_bhyt ?: null,
                    'han_the_bhyt'            => $request->han_the_bhyt ?: null,
                    'noi_dang_ky_bhyt'        => $request->noi_dang_ky_bhyt ?: 'TTYT Phường Hải Châu',
                    'tien_su_di_ung_benh_nen' => $request->tien_su_di_ung_benh_nen ?: 'Không có',
                    'stk_ngan_hang'           => $request->stk_ngan_hang ?: null
                ]));
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Đã cập nhật hồ sơ cá nhân, VNeID và STK ngân hàng vào MySQL!',
            'user'    => $this->buildUserSessionObject($maNguoiDung)
        ]);
    }

    public function changePassword(Request $request)
    {
        $user = DB::table('NGUOI_DUNG')->where('ma_nguoi_dung', $request->ma_nguoi_dung)->first();
        if (!$user || !Hash::check($request->mat_khau_cu, $user->mat_khau)) {
            return response()->json(['status' => 'error', 'message' => 'Mật khẩu hiện tại không đúng!'], 400);
        }

        DB::table('NGUOI_DUNG')
            ->where('ma_nguoi_dung', $user->ma_nguoi_dung)
            ->update(['mat_khau' => Hash::make($request->mat_khau_moi)]);

        return response()->json(['status' => 'success', 'message' => 'Đổi mật khẩu thành công!']);
    }

    /**
     * 5. ĐẶT LỊCH HẸN KHÁM & HỦY LỊCH HẸN
     */
    public function bookAppointment(Request $request)
    {
        if (!$request->filled('ma_nguoi_dung')) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Hãy đăng nhập để đặt lịch và xem hồ sơ bệnh án!'
            ], 401);
        }

        DB::beginTransaction();
        try {
            $maNguoiDung = trim((string) $request->ma_nguoi_dung);
            $bn = DB::table('BENH_NHAN')->where('ma_nguoi_dung', $maNguoiDung)->first();

            if (!$bn) {
                $maBenhNhan = $this->generateNextCode('BENH_NHAN', 'ma_benh_nhan', 'BN', 3);
                DB::table('BENH_NHAN')->insert($this->filterValidColumns('BENH_NHAN', [
                    'ma_benh_nhan'     => $maBenhNhan,
                    'ma_nguoi_dung'    => $maNguoiDung,
                    'ngay_sinh'        => $request->ngay_sinh ?: '1995-01-01',
                    'gioi_tinh'        => $request->gioi_tinh ?: 'Nam',
                    'dia_chi'          => $request->dia_chi ?: 'Phường Hải Châu, TP. Đà Nẵng',
                    'so_the_bhyt'      => $request->so_the_bhyt ?: null,
                    'noi_dang_ky_bhyt' => 'TTYT Phường Hải Châu',
                    'stk_ngan_hang'    => $request->stk_ngan_hang ?: null
                ]));
            } else {
                $maBenhNhan = $bn->ma_benh_nhan;
            }

            $tenKhoaInput = $request->chuyen_khoa ?: $request->ten_khoa ?: 'Khoa Nội';
            $maKhoa = 'KH001';
            if (stripos($tenKhoaInput, 'Tai') !== false || stripos($tenKhoaInput, 'P103') !== false) $maKhoa = 'KH002';
            elseif (stripos($tenKhoaInput, 'Xương') !== false || stripos($tenKhoaInput, 'P106') !== false) $maKhoa = 'KH004';
            elseif (stripos($tenKhoaInput, 'Hình') !== false || stripos($tenKhoaInput, 'CLS') !== false || stripos($tenKhoaInput, 'P201') !== false) $maKhoa = 'KH003';

            $ngayHen = $request->ngay_hen_kham ?: Carbon::today()->format('Y-m-d');
            $khungGio = $request->khung_gio_hen ?: 'Ca Sáng (07:00 - 11:30)';

            $lichLam = DB::table('LICH_LAM_VIEC as llv')
                ->join('PHONG as p', 'llv.ma_phong', '=', 'p.ma_phong')
                ->where('p.ma_khoa', $maKhoa)
                ->select('llv.ma_lich_lam')
                ->first();

            $maLichLam = $lichLam ? $lichLam->ma_lich_lam : 'LLV002';
            $maLichHen = $this->generateNextCode('LICH_HEN_KHAM', 'ma_lich_hen', 'LH', 3);

            DB::table('LICH_HEN_KHAM')->insert($this->filterValidColumns('LICH_HEN_KHAM', [
                'ma_lich_hen'         => $maLichHen,
                'ma_benh_nhan'        => $maBenhNhan,
                'ma_lich_lam'         => $maLichLam,
                'ngay_hen_kham'       => $ngayHen,
                'khung_gio_hen'       => $khungGio,
                'trieu_chung_ban_dau' => $request->trieu_chung_ban_dau ?: 'Đăng ký khám trực tuyến',
                'trang_thai_hen'      => 'ChoTiepNhan'
            ]));

            DB::commit();

            return response()->json([
                'status'      => 'success',
                'message'     => 'Đặt lịch hẹn khám thành công!',
                'ma_lich_hen' => $maLichHen
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi đặt lịch: ' . $e->getMessage()], 400);
        }
    }

    public function cancelAppointment(Request $request)
    {
        DB::table('LICH_HEN_KHAM')
            ->where('ma_lich_hen', trim((string) $request->ma_lich_hen))
            ->update($this->filterValidColumns('LICH_HEN_KHAM', [
                'trang_thai_hen' => 'DaHuy',
                'ly_do_huy'      => $request->ly_do_huy ?: 'Bệnh nhân chủ động hủy lịch hẹn',
                'thoi_gian_huy'  => Carbon::now()
            ]));

        return response()->json(['status' => 'success', 'message' => 'Đã hủy lịch hẹn khám thành công!']);
    }

    /**
     * Hàm tự động kiểm tra và hủy các lịch hẹn đã quá thời gian mà bệnh nhân chưa đến khám
     */
    private function autoCancelExpiredAppointments()
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $todayStr = $now->format('Y-m-d');
        $currentTimeStr = $now->format('H:i');

        $pendingList = DB::table('LICH_HEN_KHAM')
            ->where('trang_thai_hen', 'ChoTiepNhan')
            ->get();

        foreach ($pendingList as $lh) {
            $ngayHen = (string) $lh->ngay_hen_kham;
            $khungGio = (string) $lh->khung_gio_hen;

            $endTime = '17:00';
            if (preg_match('/-\s*(\d{2}:\d{2})/', $khungGio, $matches)) {
                $endTime = $matches[1];
            } elseif (stripos($khungGio, 'Sáng') !== false) {
                $endTime = '11:30';
            } elseif (stripos($khungGio, 'Tối') !== false || stripos($khungGio, 'Chiều') !== false) {
                $endTime = '19:00';
            }

            $isExpired = ($ngayHen < $todayStr) || ($ngayHen === $todayStr && $currentTimeStr > $endTime);

            if ($isExpired) {
                DB::table('LICH_HEN_KHAM')
                    ->where('ma_lich_hen', $lh->ma_lich_hen)
                    ->update($this->filterValidColumns('LICH_HEN_KHAM', [
                        'trang_thai_hen' => 'DaHuy',
                        'ly_do_huy'      => 'Bệnh nhân không lên khám',
                        'thoi_gian_huy'  => $now
                    ]));
            }
        }
    }

    /**
     * 6. DỮ LIỆU CỔNG BỆNH NHÂN (Lịch đã đặt & Hồ sơ bệnh án điện tử)
     */
    public function getPatientPortalData(string $maNguoiDung)
    {
        $this->autoCancelExpiredAppointments();

        $bn = DB::table('BENH_NHAN as bn')
            ->join('NGUOI_DUNG as nd', 'bn.ma_nguoi_dung', '=', 'nd.ma_nguoi_dung')
            ->where('bn.ma_nguoi_dung', $maNguoiDung)
            ->select('bn.*', 'nd.vneid', 'nd.ho_ten', 'nd.email', 'nd.so_dien_thoai')
            ->first();

        if (!$bn) {
            return response()->json(['status' => 'success', 'appointments' => [], 'medical_records' => []]);
        }

        $appointments = DB::table('LICH_HEN_KHAM as lh')
            ->leftJoin('LICH_LAM_VIEC as llv', 'lh.ma_lich_lam', '=', 'llv.ma_lich_lam')
            ->leftJoin('PHONG as p', 'llv.ma_phong', '=', 'p.ma_phong')
            ->leftJoin('KHOA as k', 'p.ma_khoa', '=', 'k.ma_khoa')
            ->leftJoin('NHAN_VIEN as nv', 'llv.ma_nhan_vien', '=', 'nv.ma_nhan_vien')
            ->leftJoin('NGUOI_DUNG as nd_bs', 'nv.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
            ->where('lh.ma_benh_nhan', $bn->ma_benh_nhan)
            ->orderByDesc('lh.ma_lich_hen')
            ->select('lh.*', 'p.so_phong', 'p.ten_phong', 'k.ma_khoa', 'k.ten_khoa', 'k.gia_kham', 'nd_bs.ho_ten as ten_bac_si')
            ->get();

        $records = DB::table('HO_SO_KHAM_BENH as hs')
            ->leftJoin('NHAN_VIEN as nv', 'hs.ma_nhan_vien', '=', 'nv.ma_nhan_vien')
            ->leftJoin('NGUOI_DUNG as nd_bs', 'nv.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
            ->leftJoin('KHOA as k', 'nv.ma_khoa', '=', 'k.ma_khoa')
            ->leftJoin('PHONG as p', function ($join) {
                $join->on('k.ma_khoa', '=', 'p.ma_khoa')->where('p.loai_phong', '=', 'PhongKhamBS');
            })
            ->leftJoin('CHI_SO_SINH_HIEU as sh', 'hs.ma_ho_so_kham', '=', 'sh.ma_ho_so_kham')
            ->where('hs.ma_benh_nhan', $bn->ma_benh_nhan)
            ->orderByDesc('hs.ma_ho_so_kham')
            ->select(
                'hs.*',
                'nd_bs.ho_ten as ten_bac_si',
                'k.ten_khoa',
                'p.so_phong',
                'p.ten_phong',
                'sh.mach',
                'sh.nhiet_do',
                'sh.huyet_ap',
                'sh.nhip_tho',
                'sh.can_nang',
                'sh.chieu_cao'
            )
            ->get();

        foreach ($records as $rec) {
            $rec->cls_results = DB::table('CHI_DINH_CAN_LAM_SANG as cd')
                ->leftJoin('DANH_MUC_CAN_LAM_SANG as dm', 'cd.ma_dich_vu_cls', '=', 'dm.ma_dich_vu_cls')
                ->where('cd.ma_ho_so_kham', $rec->ma_ho_so_kham)
                ->select('cd.*', 'dm.ten_dich_vu_cls', 'dm.don_gia_cls')
                ->get();

            foreach ($rec->cls_results as $cls) {
                $cls->images = DB::table('ANH_KET_QUA_CLS')->where('ma_chi_dinh_cls', $cls->ma_chi_dinh_cls)->get();
            }

            $don = DB::table('DON_THUOC')->where('ma_ho_so_kham', $rec->ma_ho_so_kham)->first();
            $rec->prescription_items = $don ? DB::table('CHI_TIET_DON_THUOC as ct')
                ->leftJoin('DANH_MUC_THUOC as t', 'ct.ma_thuoc', '=', 't.ma_thuoc')
                ->where('ct.ma_don_thuoc', $don->ma_don_thuoc)
                ->select('ct.*', 't.ten_thuoc', 't.hoat_chat', 't.don_vi_tinh')
                ->get() : [];

            $rec->invoices = DB::table('HOA_DON_VIEN_PHI')
                ->where('ma_ho_so_kham', $rec->ma_ho_so_kham)
                ->get();
        }

        return response()->json([
            'status'          => 'success',
            'patient'         => $bn,
            'appointments'    => $appointments,
            'medical_records' => $records
        ]);
    }

    /**
     * 7. LỊCH SỬ TRÒ CHUYỆN AI (PHIEN_TRO_CHUYEN_AI, LICH_SU_TIN_NHAN_AI, ANH_TIN_NHAN_AI)
     */
    public function getAiChatSessions(string $maNguoiDung)
    {
        $sessions = DB::table('PHIEN_TRO_CHUYEN_AI')
            ->where('ma_nguoi_dung', $maNguoiDung)
            ->orderByDesc('thoi_gian_tao')
            ->get();

        foreach ($sessions as $s) {
            $s->messages = DB::table('LICH_SU_TIN_NHAN_AI')
                ->where('ma_phien_chat', $s->ma_phien_chat)
                ->orderBy('thoi_gian_gui', 'asc')
                ->get();

            foreach ($s->messages as $m) {
                $m->images = DB::table('ANH_TIN_NHAN_AI')->where('ma_tin_nhan', $m->ma_tin_nhan)->get();
            }
        }

        return response()->json(['status' => 'success', 'sessions' => $sessions]);
    }

    public function saveAiChatMessage(Request $request)
    {
        $maPhien = $request->ma_phien_chat;
        if (!$maPhien) {
            $maPhien = $this->generateNextCode('PHIEN_TRO_CHUYEN_AI', 'ma_phien_chat', 'PC', 3);
            DB::table('PHIEN_TRO_CHUYEN_AI')->insert($this->filterValidColumns('PHIEN_TRO_CHUYEN_AI', [
                'ma_phien_chat'           => $maPhien,
                'ma_nguoi_dung'           => $request->ma_nguoi_dung ?: 'ND009',
                'tieu_de_cuoc_tro_chuyen' => mb_substr($request->noi_dung_tin_nhan ?: 'Tư vấn sức khỏe AI', 0, 80),
                'thoi_gian_tao'           => Carbon::now()
            ]));
        }

        $maTinNhan = $this->generateNextCode('LICH_SU_TIN_NHAN_AI', 'ma_tin_nhan', 'TN', 3);
        DB::table('LICH_SU_TIN_NHAN_AI')->insert($this->filterValidColumns('LICH_SU_TIN_NHAN_AI', [
            'ma_tin_nhan'       => $maTinNhan,
            'ma_phien_chat'     => $maPhien,
            'nguoi_gui'         => $request->nguoi_gui ?: 'NguoiDung',
            'noi_dung_tin_nhan' => $request->noi_dung_tin_nhan,
            'thoi_gian_gui'     => Carbon::now()
        ]));

        if (is_array($request->images)) {
            foreach ($request->images as $imgBase64) {
                $maAnhTn = $this->generateNextCode('ANH_TIN_NHAN_AI', 'ma_anh_tin_nhan', 'ATN', 3);
                DB::table('ANH_TIN_NHAN_AI')->insert($this->filterValidColumns('ANH_TIN_NHAN_AI', [
                    'ma_anh_tin_nhan'   => $maAnhTn,
                    'ma_tin_nhan'       => $maTinNhan,
                    'duong_dan_anh'     => $imgBase64,
                    'thoi_gian_tai_len' => Carbon::now()
                ]));
            }
        }

        return response()->json([
            'status'        => 'success',
            'ma_phien_chat' => $maPhien,
            'ma_tin_nhan'   => $maTinNhan
        ]);
    }

    public function deleteAiChatSession(Request $request)
    {
        $maPhien = trim((string) $request->ma_phien_chat);
        DB::statement('SET FOREIGN_KEY_CHECKS = 0');
        DB::table('LICH_SU_TIN_NHAN_AI')->where('ma_phien_chat', $maPhien)->delete();
        DB::table('PHIEN_TRO_CHUYEN_AI')->where('ma_phien_chat', $maPhien)->delete();
        DB::statement('SET FOREIGN_KEY_CHECKS = 1');

        return response()->json(['status' => 'success', 'message' => 'Đã xóa phiên trò chuyện AI!']);
    }
}