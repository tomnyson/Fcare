import { BadRequestException } from '@nestjs/common';
import { assertNoPii, detectPii, PII_IN_MESSAGE } from './pii-text';

describe('detectPii — bắt đúng PII bị cấm (RULE 1)', () => {
  it.each([
    ['số điện thoại liền', 'Gọi cho phụ huynh 0912345678 nhé'],
    ['số điện thoại có dấu cách', 'SĐT: 0912 345 678'],
    ['số điện thoại có dấu chấm', 'liên hệ 091.234.5678'],
    ['số điện thoại có gạch', 'gọi 0912-345-678'],
    ['số điện thoại +84', 'Zalo +84 912 345 678'],
    ['số điện thoại có ngoặc mã vùng', '(028) 3823 4567'],
    ['số điện thoại có ngoặc không cách', '(028)38234567'],
    ['số điện thoại có ngoặc và chấm', 'Hotline (024) 3.868.4567'],
    ['số điện thoại có ngoặc trong câu', 'lien he qua so (0912) 345 678'],
    ['email', 'gửi mail cho sv.nguyen@fpt.edu.vn'],
    ['CCCD 12 số', 'CCCD 001203004567 của em ấy'],
    ['CMND 9 số', 'CMND 123456789'],
  ])('chặn %s', (_label, text) => {
    expect(detectPii(text)).not.toBeNull();
  });
});

describe('detectPii — KHÔNG bắt nhầm dữ liệu học vụ hợp lệ', () => {
  it.each([
    ['mã sinh viên', 'Sinh viên HE160123 vắng nhiều buổi'],
    ['mã lớp hành chính', 'Lớp SE1901 kỳ SU25 điểm kém'],
    ['mã lớp học phần', 'Lớp học phần PRF192-SU25-01 cần theo sát'],
    ['danh sách điểm', 'Điểm quá trình: 8.5 9.0 7.5 6.0 8.0'],
    ['điểm và số buổi', 'Nghỉ 3 buổi, điểm 4.5, cần cảnh báo mức 2'],
    ['năm học', 'Từ 2024 đến 2026 em ấy học lại 2 môn'],
    ['tỷ lệ', 'Tỷ lệ qua môn 72.5% trong kỳ SU25'],
    ['mã học kỳ', 'Học kỳ SU25 và FA24 đều có sinh viên cảnh báo'],
    ['GPA', 'GPA hiện tại 3.21'],
    ['khoảng điểm', 'tu 5.0 den 8.5'],
    ['số tín chỉ', 'Môn này 3 tín chỉ, đăng ký lại kỳ SU25'],
    ['số buổi vắng', 'Sinh viên vắng 5 buổi trong kỳ FA24'],
    ['mã lớp học phần có ngoặc', 'Lớp SE1901 (nhom 2) can theo doi'],
    [
      'câu bình thường có ngoặc chứa số',
      'sinh vien vang 3 buoi (tuan 5) can nhac nho',
    ],
  ])('cho qua %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

describe('assertNoPii', () => {
  it('nội dung sạch thì không ném lỗi', () => {
    expect(() => assertNoPii('Em này nghỉ nhiều, TBM xem giúp.')).not.toThrow();
  });

  it('ném BadRequest kèm mã nghiệp vụ PII_IN_MESSAGE', () => {
    try {
      assertNoPii('SĐT phụ huynh 0912345678');
      fail('assertNoPii phải ném lỗi');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        code: string;
        message: string;
      };
      expect(body.code).toBe(PII_IN_MESSAGE);
      expect(body.message).toContain('số điện thoại');
    }
  });
});

/**
 * Danh sách A của review vòng 2: mọi biến thể ngoặc/phân cách phải ra ĐÚNG nhãn
 * 'số điện thoại' — ra nhãn CCCD cũng là sai, vì thông báo lỗi sẽ chỉ nhầm chỗ.
 */
describe('detectPii — biến thể số điện thoại phải ra đúng nhãn (danh sách A)', () => {
  it.each([
    ['ngoặc mã vùng có cách', '(028) 3823 4567'],
    ['ngoặc mã vùng không cách', '(028)38234567'],
    ['ngoặc kèm dấu chấm', 'Hotline (024) 3.868.4567'],
    ['ngoặc giữa câu', 'lien he qua so (0912) 345 678'],
    ['+84 kèm ngoặc mã vùng', '+84 (28) 3823 4567'],
    ['+84 kèm số 0 trong ngoặc', '+84 (0)28 3823 4567'],
    ['phân cách sổ chéo', '024/3868 4567'],
    ['ngoặc vuông', '[028] 3823 4567'],
    ['phân cách chấm phẩy', 'SĐT: 0912;345;678'],
    ['ngoặc lồng hai lớp', 'Hotline ((028)) 3823 4567'],
    ['di động có cách giữa câu', 'goi minh 0912 345 678 nhe'],
    ['di động liền', '0912345678'],
    ['+84 liền', '+84912345678'],
    ['+84 có cách', '+84 912 345 678'],
    ['di động có chấm', '0912.345.678'],
    ['di động có gạch', '0912-345-678'],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });
});

/**
 * Danh sách B: ràng buộc cứng ngang danh sách A — chặn nhầm văn bản học vụ
 * bình thường sẽ khiến giảng viên không gửi được tin.
 */
describe('detectPii — văn bản học vụ không được chặn (danh sách B)', () => {
  it.each([
    ['số buổi vắng bằng 0', 'sinh vien vang 0 buoi'],
    ['điểm chuyên cần lẻ', 'diem chuyen can 0.5'],
    ['GPA kèm mã kỳ', 'GPA 3.21 sau ky SU25'],
    ['khoảng điểm', 'tu 5.0 den 8.5'],
    ['nhóm và tuần trong ngoặc', 'nhom 2 (tuan 5)'],
    ['mã lớp kèm nhóm trong ngoặc', 'SE1901 (nhom 2)'],
    ['mức tăng điểm', 'tang 0.25 diem'],
    ['danh sách điểm không dấu', 'diem cac bai: 8.5 9.0 7.5 6.0 8.0'],
    ['thống kê lớp', 'lop SE1901 co 32 sinh vien, 4 ban duoi 5.0'],
    ['số buổi vắng theo tuần', 'em nay vang 3 buoi tuan 2 va 2 buoi tuan 5'],
    [
      'điểm hai kỳ kèm ngoặc',
      'ky SU25 (mon PRF192) diem 7.5, ky FA25 (mon PRO192) diem 8.0',
    ],
    ['hai mã sinh viên', 'MSSV HE160123 va HE160456 deu vang'],
  ])('cho qua %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

/**
 * Regex chỉ dùng lượng từ có cận trên nên phải chạy tuyến tính; test này là
 * hàng rào chống ReDoS nếu sau này ai đó nới một lượng từ thành `+`/`*`.
 */
describe('detectPii — không ReDoS trên chuỗi đối kháng dài', () => {
  it.each([
    ['toàn số 0', '0'.repeat(3000)],
    ['số 0 xen dấu chấm', '0.'.repeat(1500)],
    ['số 0 xen ngoặc đóng', '0)'.repeat(1500)],
    ['một số 0 rồi 3000 ngoặc đóng', `0${')'.repeat(3000)}`],
  ])('xử lý %s dưới 100ms', (_label, text) => {
    const startedAt = Date.now();
    detectPii(text);
    expect(Date.now() - startedAt).toBeLessThan(100);
  });
});

/**
 * ---------------------------------------------------------------------------
 * VÒNG 3 — bộ dò viết lại (chuẩn hoá → gom cụm → quét theo nhóm chữ số)
 * ---------------------------------------------------------------------------
 * Danh sách C trở đi lấy nguyên từ `task-2-fix2-review.md`: mọi ca `LỌT` của
 * vòng 2 phải ra ĐÚNG nhãn 'số điện thoại', mọi chuỗi học vụ phải tiếp tục
 * `null`. Ra nhãn CCCD cũng tính là sai vì thông báo lỗi sẽ chỉ nhầm chỗ.
 */
describe('detectPii — C1: phân cách lạ, khoảng trắng thừa, chữ số phi ASCII', () => {
  it.each([
    ['gạch dưới (A01)', '0912_345_678'],
    ['dấu chấm giữa U+00B7 (A02)', '0912·345·678'],
    ['en dash (A03)', '0912–345–678'],
    ['em dash (A04)', '0912—345—678'],
    ['sổ đứng (A05)', '0912|345|678'],
    ['sổ chéo ngược (A06)', '0912\\345\\678'],
    ['dấu phẩy (A07)', '0912,345,678'],
    ['fraction slash U+2044 (A46)', '0912⁄345⁄678'],
    ['tab (A08)', '0912\t345\t678'],
    ['nbsp (A12)', '0912 345 678'],
    ['hai dấu cách giữa câu (E01)', 'SDT me em la 0912  345  678 nhe'],
    ['gạch có cách hai bên (E02)', 'SDT 0912 - 345 - 678'],
    ['chấm có cách hai bên (E03)', 'SDT 0912 . 345 . 678'],
    ['gạch dính trái (E04)', '0912- 345- 678'],
    ['gạch dính phải (E05)', '0912 -345 -678'],
    ['ba dấu cách (E06)', '0912   345678'],
    ['hai dấu cách (A09)', '0912  345  678'],
    ['chấm có cách (A49)', '0912 . 345 . 678'],
    ['zero-width space (A11)', '0912​345678'],
    // Một ký tự vô hình đơn lẻ vẫn lọt vào đoạn phân cách nên vô hại; bốn ký tự
    // thì vượt MAX_SEPARATOR_LENGTH — chỉ bước xoá ký tự bề rộng bằng không mới
    // cứu được ca này.
    ['bốn zero-width space liên tiếp', `0912${'\u200B'.repeat(4)}345678`],
    ['bốn BOM liên tiếp', `0912${'\uFEFF'.repeat(4)}345678`],
    [
      'zero-width joiner xen kẽ',
      `0912${'\u200D'.repeat(4)}345${'\u200C'.repeat(4)}678`,
    ],
    ['chữ số fullwidth (A13)', '０９１２３４５６７８'],
    ['chữ số Ả Rập-Ấn (A14)', '٠٩١٢٣٤٥٦٧٨'],
    ['chữ số Ả Rập-Ấn mở rộng', '۰۹۱۲۳۴۵۶۷۸'],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });
});

describe('detectPii — C2: mã nước 84 ở mọi hình dạng', () => {
  it.each([
    ['84 kèm chấm (A15)', '84.912.345.678'],
    ['84 kèm gạch (A16)', '84-912-345-678'],
    ['84 kèm cách (A17)', '84 912 345 678'],
    ['0084 tách nhóm (A20)', '0084 912 345 678'],
    ['dấu + tách rời (A23)', '+ 84 912 345 678'],
    ['84 trong ngoặc (A24)', '(84) 912 345 678'],
    ['+84 kèm gạch dưới (A45)', '+84_912_345_678'],
    ['84 viết liền (A18)', '84912345678'],
    ['0084 viết liền (A19)', '0084912345678'],
    ['+84 kèm gạch (A21)', '+84-912-345-678'],
    ['+84 kèm chấm (A22)', '+84.912.345.678'],
    ['84 rồi 0 rồi số (2I)', '840912345678'],
    ['+84 rồi 0912 (2I)', '+84 0912 345 678'],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });
});

describe('detectPii — C3: nhóm 2 chữ số và che bóng tiền tố', () => {
  it.each([
    ['năm nhóm hai chữ số (A28)', '09 12 34 56 78'],
    ['năm nhóm hai chữ số kèm chấm (A29)', '09.12.34.56.78'],
    ['năm học đứng ngay trước (F01)', '2026 0912 345 678'],
    ['câu tiếng Việt tự nhiên (F02)', 'khoa 2026 0912 345 678 la so cua me'],
    ['năm 2020 đứng trước (F04)', 'nam 2020 0912 345 678'],
    ['mã bốn chữ số đứng trước (F05)', 'ma 1024 0912 345 678'],
    ['năm học rồi số có chấm (F10)', '2026 0912.345.678'],
    ['tuần rồi số cố định (F11)', 'tuan 30 028 3823 4567'],
    ['điểm đứng trước (F03)', 'diem 8.0 0912 345 678'],
    ['nhóm đứng trước (F06)', 'nhom 10 0912 345 678'],
    ['số nhà đứng trước (F07)', 'so nha 20 0912 345 678'],
    ['phòng đứng trước (F08)', 'phong 305 0912 345 678'],
    ['năm học rồi số liền (F09)', '2026 0912345678'],
    ['điểm rồi số rồi câu (F12)', 'diem 9.0 0912 345 678 goi gap'],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });
});

/**
 * RULE 1 cấm "số điện thoại", KHÔNG giới hạn ở số Việt Nam. Dấu `+` đứng trước
 * một dãy 8-15 chữ số gần như không xuất hiện trong văn bản học vụ.
 */
describe('detectPii — C4: số điện thoại quốc tế ngoài Việt Nam', () => {
  it.each([
    ['Mỹ (D06)', 'Bo em o My: +1 202 555 0143'],
    ['Singapore (D07)', 'Lien he +65 9123 4567'],
    ['Nhật (D08)', 'Lien he +81 90 1234 5678'],
    ['Hàn (D09)', 'Lien he +82 10 1234 5678'],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });
});

describe('detectPii — C5: các ca vòng 2 đã chặn đúng vẫn phải chặn đúng', () => {
  it.each([
    ['dính liền chữ', 'sdt0912345678'],
    ['sau tel:', 'tel:0912345678'],
    ['mã vùng Đà Nẵng tách chữ số đầu', '(0236) 3 888 999'],
    ['cuối câu có dấu chấm', 'Goi cho me em: 0912 345 678.'],
    ['cả số trong ngoặc', 'Lien he (0912345678) gap'],
    ['cố định viết liền', '02838234567'],
    ['cố định tách nhóm', '0283 823 4567'],
    ['+84 kèm mã vùng', '+84 28 3823 4567'],
    ['di động tách 3-3-4', '091 234 5678'],
    ['trộn gạch và chấm', '0912-345.678'],
    ['sau nhãn SDT:', 'SDT:0912345678'],
    ['trước dấu phẩy', 'goi 0912345678, gap lam'],
    ['trước ngoặc Zalo', '0912 345 678 (Zalo)'],
    ['trong link markdown', '[0912 345 678](tel:+84912345678)'],
    ['hai số trong một câu', 'me 0912345678, bo 0987654321'],
    ['đầu số 084', '0847123456'],
    ['đầu số 084 tách nhóm', '084 712 3456'],
    ['hai số 0 đứng đầu', '00912345678'],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });
});

/**
 * 47 chuỗi học vụ của review vòng 2 (danh sách B spec + 35 ca tự nghĩ + 12 hình
 * dạng ngoặc ở mục 4). Chặn nhầm ở đây khiến giảng viên không gửi được tin.
 * NGOẠI LỆ CỐ Ý: B13 nằm ở describe "đánh đổi đã chốt" bên dưới.
 */
describe('detectPii — D: chuỗi học vụ của review vòng 2 phải tiếp tục null', () => {
  it.each([
    ['B01', 'Han nop bai la 06/09/2026, cac em luu y'],
    ['B02', 'Lich thi tu 06/09/2026 den 10/09/2026'],
    ['B03', 'Buoi bu vao 01-09 va 15-09'],
    ['B04', 'Slot 1 hoc 07:30 - 09:45, slot 2 hoc 10:00 - 12:15'],
    ['B05', 'Deadline 23:59 ngay 30/09/2026'],
    ['B06', 'Lop chuyen sang phong 305 toa Alpha tu tuan 5'],
    ['B07', 'Theo QD so 1234/QD-DHFPT ngay 06/09/2026'],
    ['B08', 'Hoc phi ky nay 4.500.000 dong, da dong 2.000.000'],
    ['B09', 'Ngan sach khoa 1.000.000.000 dong cho ky SU25'],
    ['B10', 'Doc giao trinh trang 102-135 va 210-245'],
    ['B11', 'Diem thanh phan 10% + 30% + 60% = 100%'],
    ['B12', 'Mon nay 45/60 tiet da hoan thanh'],
    ['B14', 'Nhom 01 02 03 04 05 deu nop du bai'],
    ['B15', 'Diem: 0.5; 7.0; 8.5; 9.0'],
    ['B16', 'Diem qua trinh (0.5) va diem thi (9.0) deu thap'],
    ['B17', 'Lop hoc phan PRF192-SU25-01 va PRO192-SU25-02'],
    ['B18', 'Lop SE1901 (nhom 02) phong 305 tiet 1234'],
    ['B19', 'Ma de 0123, thoi gian lam bai 90 phut'],
    ['B20', 'Em nay 0 diem qua trinh, 0 diem thi, 0 buoi di hoc'],
    ['B21', 'Ty le chuyen can 0.75 nen roi vao canh bao muc 2'],
    ['B22', 'Lop co 40 SV, 12 ban duoi 5.0, 3 ban 0 diem, 5 ban tren 8.0'],
    ['B23', 'Khoa 2021 den 2025 co 4 dot canh bao'],
    ['B24', 'Thoi khoa bieu 2-4-6, phong 0305, slot 1'],
    ['B25', 'HE160123 HE160456 HE160789 deu vang 3 buoi'],
    ['B26', 'Diem: 8.5 9.0 7.5 6.0 8.0 7.0 9.5 6.5 8.0 7.5'],
    ['B27', 'Vang 3 buoi tuan 2, 2 buoi tuan 5, 1 buoi tuan 9'],
    ['B28', 'PRF192 3 tin chi, PRO192 3 tin chi, MAE101 3 tin chi'],
    ['B29', 'Xem muc (1) (2) (3) (4) trong quy che dao tao'],
    ['B30', 'Diem tu 5.0 den 6.4 xep loai trung binh'],
    ['B31', 'Hop luc 14:00 ngay 06/09/2026 tai phong 502'],
    ['B32', 'Ma dinh danh noi bo 0123 4567 (khong phai CCCD)'],
    ['B33', 'Nhom 1 (8.5) nhom 2 (9.0) nhom 3 (7.5) nhom 4 (6.0)'],
    ['B34', 'Nop 03 bai truoc 17:00 ngay 12/09'],
    ['B35', 'Diem danh 0/10 buoi, ty le 0%'],
    ['C01 — vòng 2 chặn nhầm, nay hết', 'nhom 0 (12) (3456) (789)'],
    ['C02 — vòng 2 chặn nhầm, nay hết', 'Cac ma lop (0123) (4567) (89)'],
    ['C03', 'Cac phong hoc (0301) (0302) (0303)'],
    ['C04', 'Phong (305) (306) (307) (308)'],
    ['C05', 'nhom 0 (8.5) (9.0) (7.5)'],
    ['C06 — vòng 2 chặn nhầm, nay hết', 'Ma hop dong 0123.4567.89'],
    ['C07 — vòng 2 chặn nhầm, nay hết', 'ID noi bo 0123-4567-89'],
    ['C08', 'Diem 10 ban: 8 9 10 7 6 8 9 10 7 6'],
    ['C10', '(tuan 01) (tuan 02) (tuan 03) (tuan 04)'],
    [
      'C11 — vòng 2 chặn nhầm, nay hết',
      'Theo [1] va [2] trong tai lieu 0123 4567 89',
    ],
    ['C12', 'sinh vien 0 nop (1234) (5678) (90)'],
    ['danh sách nhóm xuống dòng', '01\n02\n03\n04\n05\n06\n07\n08'],
  ])('cho qua %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

/**
 * ĐÁNH ĐỔI ĐÃ CHỐT — các test dưới đây khẳng định hành vi CỐ Ý, không phải mô tả
 * lỗi đang chờ sửa. Đọc docblock trong `pii-text.ts` trước khi đổi bất kỳ dòng
 * nào ở đây; đổi một trong số chúng đồng nghĩa với đổi một quyết định thiết kế.
 */
describe('detectPii — đánh đổi đã chốt (hành vi cố ý, đừng "sửa" tại đây)', () => {
  it.each([
    [
      'dãy nhóm 2 chữ số bắt đầu bằng 0 — không phân biệt được với 09 12 34 56 78',
      'Tuan 05 08 09 10 11',
    ],
    [
      'B13 cùng hình dạng, cửa sổ 02..06 cho NSN 203040506',
      'Danh sach nhom: 01, 02, 03, 04, 05, 06, 07, 08',
    ],
  ])('CHẶN NHẦM có chủ đích: %s', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });

  it.each([
    ['gõ giãn từng chữ số', '0 9 1 2 3 4 5 6 7 8'],
    ['gõ giãn từng chữ số kèm chấm', '0.9.1.2.3.4.5.6.7.8'],
    ['gõ giãn từng chữ số sau +84', '+84 9 1 2 3 4 5 6 7 8'],
    [
      'viết chữ số bằng chữ',
      'so cua me: khong chin mot hai ba bon nam sau bay tam',
    ],
    ['trộn chữ và số', 'so 09 mot hai 345678'],
    ['xuống dòng giữa các nhóm', '0912\n345\n678'],
  ])('LỌT có chủ đích: %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });

  it.each([
    ['chữ O thay số 0 nên không còn là dãy bắt đầu bằng 0', 'O912345678'],
    ['số 11 chữ số kiểu cũ (0122) có NSN bắt đầu bằng 1', '01223456789'],
  ])('vẫn bị chặn nhưng ra nhãn CCCD: %s', (_label, text) => {
    expect(detectPii(text)).toBe('dãy số giống CCCD/CMND');
  });

  it('số 11 chữ số kiểu cũ tách nhóm thì lọt (đầu số 0122 đã khai tử 2018)', () => {
    expect(detectPii('0122 345 6789')).toBeNull();
  });
});

/**
 * GHIM CỬA SỔ NSN. Vòng 2 đột biến `NSN_MIN_DIGITS` 9→7 mà 60/60 test vẫn xanh —
 * tức bộ test không bảo vệ phía chặn nhầm. Mỗi chuỗi dưới đây có NSN nằm SÁT
 * ngoài cửa sổ [9, 10] hoặc có chữ số đầu ngoài {2,3,5,7,8,9}; nới một cận hay
 * bỏ ràng buộc chữ số đầu là lập tức đỏ.
 */
describe('detectPii — ghim cửa sổ NSN [9, 10] và chữ số đầu {2,3,5,7,8,9}', () => {
  it.each([
    ['NSN 7 chữ số — giết đột biến min 9→7', 'Ma dinh danh noi bo 0923 4567'],
    [
      'NSN 8 chữ số — giết đột biến min 9→7 và 9→8',
      'Ma tai lieu noi bo 0923 45678',
    ],
    [
      'NSN 11 chữ số — giết đột biến max 10→11 và 10→12',
      'Ma ho so noi bo 0234 5678 9012',
    ],
    [
      'NSN 12 chữ số — giết đột biến max 10→12',
      'Ma ho so noi bo 0234 5678 9012 3',
    ],
  ])('cho qua %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });

  it.each([
    ['NSN 9 chữ số bắt đầu bằng 1', 'Nhom 01 02 03 04 05 deu nop du bai'],
    ['NSN 9 chữ số bắt đầu bằng 1 (dạng mã)', 'Ma noi bo 0123 4567 89'],
    ['NSN 9 chữ số bắt đầu bằng 4', 'Ma noi bo 0456 7890 12'],
    ['NSN 10 chữ số bắt đầu bằng 6', 'Ma noi bo 0612 3456 7890'],
  ])('cho qua %s — giết đột biến bỏ ràng buộc chữ số đầu', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

/**
 * Bộ dò mới không dùng regex có lượng từ lồng nhau; chi phí là O(16·n). Test này
 * nhân đôi độ dài chuỗi đối kháng để chặn mọi thay đổi đưa lại hành vi bậc hai,
 * kể cả trên đường EMAIL (chuỗi chỉ có `@` và không có khoảng trắng).
 */
describe('detectPii — tuyến tính trên chuỗi đối kháng rất dài', () => {
  it.each([
    ['30 000 số 0 rồi SĐT', `${'0'.repeat(30000)} 0912345678`],
    ['60 000 số 0 xen chấm', '0.'.repeat(30000)],
    ['60 000 ký tự phân cách xen số', '0/;.-'.repeat(12000)],
    ['30 000 chữ a rồi một @', `${'a'.repeat(30000)}@`],
    ['30 000 dấu @ không khoảng trắng', '@'.repeat(30000)],
  ])('xử lý %s dưới 100ms', (_label, text) => {
    const startedAt = Date.now();
    detectPii(text);
    expect(Date.now() - startedAt).toBeLessThan(100);
  });
});

describe('detectPii — email vẫn giữ nguyên ngữ nghĩa của /\\S+@\\S+\\.\\S+/', () => {
  it.each([
    ['email thường', 'gui mail cho sv.nguyen@fpt.edu.vn'],
    ['hai dấu @ liền nhau', 'ten@@domain.com'],
    ['dấu @ mở đầu chuỗi', '@a@b.c'],
  ])('chặn %s', (_label, text) => {
    expect(detectPii(text)).toBe('địa chỉ email');
  });

  it.each([
    ['không có dấu chấm sau @', 'khong co cham a@bcd'],
    ['dấu chấm ở cuối token', 'a@b.'],
    ['không có ký tự trước @', 'chi co @b.c thoi'],
  ])('cho qua %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});
/**
 * ---------------------------------------------------------------------------
 * VÒNG 4 — bịt các lỗ người thẩm định vòng 3 tìm ra
 * ---------------------------------------------------------------------------
 * Nguồn: `task-2-fix3-review.md`. Mỗi ca `LỌT` / `CHẶN NHẦM` / `SAI NHÃN` trong
 * hai bảng lớn của báo cáo đó đều có mặt dưới đây, hoặc ở nhóm khẳng định hành
 * vi ĐÚNG (đã sửa), hoặc ở nhóm khẳng định ĐÁNH ĐỔI CỐ Ý (không sửa, có lý do
 * cấu trúc ghi trong docblock của `pii-text.ts`).
 *
 * Ký tự vô hình được dựng bằng escape `\u…` chứ không dán trực tiếp: dán vào là
 * lần review sau không nhìn thấy chúng và tưởng test trùng nhau.
 */
const COMBINING_ACUTE = '́';
const VARIATION_SELECTOR = '️';
const COMBINING_KEYCAP = '⃣';
const ZERO_WIDTH_SPACE = '​';

describe('detectPii — G1: chữ số của MỌI hệ chữ viết, không chỉ Ả Rập-Ấn', () => {
  it.each([
    ['Devanagari (P41)', '०९१२३४५६७८'],
    ['Bengali (P42)', '০৯১২৩৪৫৬৭৮'],
    ['Thái (P43)', '๐๙๑๒๓๔๕๖๗๘'],
    ['Miến Điện (P44)', '၀၉၁၂၃၄၅၆၇၈'],
    ['Khmer (P45)', '០៩១២៣៤៥៦៧៨'],
    ['Lào (P46)', '໐໙໑໒໓໔໕໖໗໘'],
    ['Devanagari trong câu', 'So cua me la ०९१२ ३४५ ६७८ nhe thay'],
    ['trộn Thái và ASCII', '๐๙12 345 678'],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });

  it('CCCD gõ bằng chữ số Devanagari cũng bị chặn', () => {
    expect(detectPii('CCCD ०३८२०३००१२३४')).toBe('dãy số giống CCCD/CMND');
  });

  it('khối chữ số nằm GIỮA một dãy Nd liên tiếp vẫn ra đúng giá trị', () => {
    // U+116D0..U+116E3 là hai khối chữ số nối liền nhau (20 điểm mã liên tiếp).
    // Cách "lùi tối đa 9 bước rồi lấy hiệu" cho giá trị SAI ở khối thứ hai vì
    // nó không bao giờ chạm tới ranh giới thật; lùi tới đầu dãy rồi lấy phần dư
    // cho 10 thì đúng cho mọi khối. Đây là ca duy nhất phân biệt hai cách làm.
    const secondBlockDigit = (value: number) =>
      String.fromCodePoint(0x116da + value);
    const phone = [0, 9, 1, 2, 3, 4, 5, 6, 7, 8].map(secondBlockDigit).join('');
    expect(detectPii(phone)).toBe('số điện thoại');
  });

  it('chuẩn hoá chữ số không phụ thuộc bảng liệt kê dải nào', () => {
    // Nếu ai đó thay cách suy giá trị bằng một bảng dải cứng, khối chữ số hiếm
    // nào không có trong bảng sẽ lọt ngay. Ol Chiki và N'Ko gần như chắc chắn
    // không nằm trong bảng liệt kê nào viết bằng tay.
    expect(detectPii('᱐᱙᱑᱒᱓᱔᱕᱖᱗᱘')).toBe('số điện thoại');
    expect(detectPii('߀߉߁߂߃߄߅߆߇߈')).toBe('số điện thoại');
  });
});

describe('detectPii — G2: ký tự vô hình bị XOÁ, không được coi là phân cách', () => {
  it.each([
    ['dấu thanh rời U+0301 (P53)', `0912${COMBINING_ACUTE}345678`],
    ['variation selector U+FE0F (P54)', `0912${VARIATION_SELECTOR}345678`],
    ['combining keycap U+20E3 (P61)', `0912${COMBINING_KEYCAP}345678`],
  ])('chặn %s và gắn nhãn số điện thoại', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });

  it('bốn dấu tổ hợp liên tiếp vẫn bị chặn — chứng minh là XOÁ chứ không phải phân cách', () => {
    // Nếu `\p{M}` chỉ được coi là ký tự phân cách thì bốn ký tự đã vượt
    // MAX_SEPARATOR_LENGTH và cụm bị cắt. Chỉ việc xoá hẳn mới cứu được ca này.
    expect(detectPii(`0912${COMBINING_ACUTE.repeat(4)}345678`)).toBe(
      'số điện thoại',
    );
  });

  it('dấu tổ hợp rải khắp dãy số vẫn bị chặn', () => {
    const scattered = '0912345678'
      .split('')
      .join(VARIATION_SELECTOR + COMBINING_ACUTE);
    expect(detectPii(scattered)).toBe('số điện thoại');
  });

  it('chữ tiếng Việt tổ hợp vẫn CẮT cụm (xoá dấu thanh không làm mất chữ cái)', () => {
    // 'sô' viết dạng tổ hợp: chữ cái nền vẫn là \p{L} nên vẫn cắt cụm như thường.
    const decomposed = `0912 vá 345 678`;
    expect(detectPii(decomposed)).toBeNull();
    expect(detectPii('Sinh viến HE160123 vắng nhiều buỏi')).toBeNull();
  });
});

describe('detectPii — G3: CCCD/CMND cũng đi qua bước chuẩn hoá', () => {
  it.each([
    ['ASCII (đối chứng)', 'CCCD 038203001234'],
    ['fullwidth', 'CCCD ０３８２０３００１２３４'],
    ['Ả Rập-Ấn', 'CCCD ٠٣٨٢٠٣٠٠١٢٣٤'],
    ['chèn zero-width space', `CCCD 038203${ZERO_WIDTH_SPACE}001234`],
    ['chèn dấu thanh rời', `CCCD 038203${COMBINING_ACUTE}001234`],
    ['chèn variation selector', `CCCD 038203${VARIATION_SELECTOR}001234`],
    ['CMND 9 số chèn zero-width', `CMND 1234${ZERO_WIDTH_SPACE}56789`],
  ])('chặn %s và gắn nhãn CCCD', (_label, text) => {
    expect(detectPii(text)).toBe('dãy số giống CCCD/CMND');
  });
});

/**
 * Dấu `+` chỉ đứng trước nhóm ĐẦU TIÊN của cụm nên chỉ được bảo lãnh cho cửa sổ
 * bắt đầu tại nhóm đó. Ba test đầu ghim ba nhánh biên của `separatorBeforeHasPlus`
 * (đột biến M10/M11/M12 của báo cáo thẩm định sống sót vì không nhánh nào có test).
 */
describe('detectPii — G4: phạm vi hiệu lực của dấu +', () => {
  it('dấu + cách nhóm đầu đúng MAX_SEPARATOR_LENGTH ký tự vẫn tính (ghim M10)', () => {
    expect(detectPii('(+) 123456789')).toBe('số điện thoại');
  });

  /**
   * VÒNG 5 — ba test dưới đây ghim bằng NHÃN chứ không bằng `null`. Lý do: cận
   * dưới quốc tế nay là 9 chữ số (mục D), mà 9 chữ số cũng là cận dưới của
   * `ID_NUMBER`, nên một cụm 9 chữ số không có `+` bảo lãnh sẽ rơi xuống bộ dò
   * CCCD thay vì lọt hẳn. Phân biệt 'số điện thoại' với 'dãy số giống CCCD/CMND'
   * vẫn tách đúng hai nhánh của `separatorBeforeHasPlus` — thậm chí chặt hơn
   * `toBeNull()` vì nó khẳng định luôn nhãn đúng.
   */
  it('dấu + cách nhóm đầu quá MAX_SEPARATOR_LENGTH ký tự thì không tính', () => {
    expect(detectPii('(+ ) 123456789')).toBe('dãy số giống CCCD/CMND');
  });

  it('xuống dòng giữa + và dãy số thì + không tính (ghim M11)', () => {
    expect(detectPii('+\n123456789')).toBe('dãy số giống CCCD/CMND');
    // Đối chứng: cùng dãy số, phân cách là dấu cách thường thì `+` có hiệu lực.
    expect(detectPii('+ 123456789')).toBe('số điện thoại');
  });

  it('chữ cái giữa + và dãy số thì + không tính (ghim M12)', () => {
    expect(detectPii('+a123456789')).toBe('dãy số giống CCCD/CMND');
    expect(detectPii('+123456789')).toBe('số điện thoại');
  });

  /**
   * Test này TRƯỚC vòng 5 mang tên 'chữ số giữa + và dãy số thì + không tính' và
   * tuyên bố ghim nhánh `isAsciiDigit` của `separatorBeforeHasPlus`. Nó XANH cả
   * khi xoá hẳn nhánh đó (thẩm định vòng 4, §7.3): nó xanh nhờ chữ `nhom` cắt
   * cụm, không phải nhờ chữ số. Nhánh ấy bất khả đạt và đã bị xoá ở vòng 5; test
   * được đặt lại tên và viết lại để ghim đúng thứ nó thật sự nói: dấu `+` chỉ
   * được đọc ở đoạn phân cách đứng TRƯỚC NHÓM ĐẦU TIÊN của cụm.
   */
  it('dấu + nằm giữa cụm (không đứng trước nhóm đầu) thì không bảo lãnh', () => {
    // Đứng trước nhóm đầu: có bảo lãnh, cụm 9 chữ số thành số quốc tế.
    expect(detectPii('+7 12345678')).toBe('số điện thoại');
    // Cùng chín chữ số ấy, `+` lùi vào giữa cụm: không còn bảo lãnh. Đỏ ngay nếu
    // ai đó tính lại `hasPlusPrefix` cho từng nhóm thay vì cho nhóm đầu.
    expect(detectPii('7 +12345678')).toBeNull();
    // Và chữ cái cắt cụm nên `+` ở cụm trước không với sang cụm sau được.
    expect(detectPii('Ma 8 +7 nhom 12345678')).toBeNull();
  });

  it.each([
    [
      'dấu + xa cửa sổ khớp — nhiều nhóm 1 chữ số',
      'Diem +8 9 10 11 12 13 14 15',
    ],
    [
      'dấu + xa cửa sổ khớp — hai nhóm 1 chữ số đầu',
      'Ty le +5 8 1234 5678 9012',
    ],
  ])('không chặn nhầm %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

/**
 * Cửa sổ số quốc tế [9, 15] phải được ghim ở CẢ HAI CẬN, giống cách cửa sổ NSN
 * [9, 10] đã được ghim. Đột biến M16 (9→5) và M03 (trần 15 nới một bậc) sống sót
 * ở vòng 3 vì hằng số chỉ được kiểm chứng bằng phép "bỏ hẳn luật".
 *
 * VÒNG 5 — cận dưới đổi 8 → 9 (mục D của brief). Lý do: E.164 quy định số quốc
 * tế gồm mã nước (1–3 chữ số) + số thuê bao, thực tế không có tuyến nào tổng
 * cộng chỉ 8 chữ số; ngưỡng 8 chỉ mua thêm chặn nhầm. Đo lại tại chỗ: 9/9 định
 * dạng SĐT quốc tế thật vẫn bị chặn, 3/4 ca chặn nhầm họ `+` được gỡ.
 */
describe('detectPii — G5: ghim hai cận của cửa sổ số quốc tế [9, 15]', () => {
  it.each([
    ['5 chữ số — giết đột biến min 9→5', 'Ma +12345 nhe'],
    ['6 chữ số', 'Ma +123456 nhe'],
    ['7 chữ số — giết đột biến min 9→7', 'Ma +1234567 nhe'],
    [
      '8 chữ số — giết đột biến min 9→8 (cận dưới cũ của vòng 4)',
      'Ma +12345678 nhe',
    ],
  ])('cho qua %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });

  it('đúng 9 chữ số thì chặn — cận dưới', () => {
    expect(detectPii('Ma +123456789 nhe')).toBe('số điện thoại');
  });

  it('đúng 15 chữ số thì chặn — cận trên (giết đột biến trần 15)', () => {
    expect(detectPii('+123456789012345')).toBe('số điện thoại');
  });

  it('16 chữ số thì không còn là số điện thoại', () => {
    expect(detectPii('+1234567890123456')).toBe('dãy số giống CCCD/CMND');
  });
});

/**
 * MỤC D VÒNG 5 — hệ quả hai chiều của việc nâng cận dưới 8 → 9, đo tại chỗ.
 * Nhóm 1 là thứ được gỡ; nhóm 2 là thứ CỐ Ý không gỡ (đánh đổi mới, ghi ở
 * docblock `INTERNATIONAL_MIN_DIGITS`) — đừng "sửa" bằng cách hạ ngưỡng xuống.
 */
describe('detectPii — mục D: nâng cận dưới quốc tế lên 9 chữ số', () => {
  it.each([
    ['Ấn Độ', 'Bo em dang o An Do +91 98765 43210'],
    ['Đức', 'Lien he +49 176 12345678'],
    ['Mỹ', 'Bo em o My: +1 202 555 0199'],
    ['Nhật', 'Goi +81 90 1111 2222'],
    ['Nga', 'Goi +7 916 123 45 67'],
    ['Brazil', 'Whatsapp +55 11 91234 5678'],
    ['Trung Quốc', 'Wechat +86 138 0013 8000'],
    ['Hàn Quốc', 'Lien he +82 10 1234 5678'],
    ['Pháp', 'Lien he +33 6 12 34 56 78'],
  ])('vẫn CHẶN số quốc tế thật: %s', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });

  it.each([
    ['điểm cộng (8 chữ số)', 'Diem cong +10 20 30 40'],
    ['khoảng năm (8 chữ số)', 'Ke hoach +2026 2027 se doi'],
    ['biên độ (8 chữ số)', 'Bien do +25 30 35 40'],
  ])('hết chặn nhầm học vụ: %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });

  /**
   * ĐÁNH ĐỔI MỚI VÒNG 5, CỐ Ý GIỮ: chuỗi này có 12 chữ số nên nằm trong cửa sổ
   * [9, 15] và vẫn bị chặn. Nới thêm (ví dụ đòi nhóm đầu ≥ 2 chữ số hay tổng ≥
   * 10) sẽ làm lọt số Pháp `+33 6 12 34 56 78` — mã nước một chữ số là hợp lệ.
   * Chi phí là một câu bị chặn nhầm; lợi ích là không thủng RULE 1.
   */
  it('vẫn chặn nhầm dãy tăng trưởng sau dấu + — đánh đổi đã ghi nhận', () => {
    expect(detectPii('Tang +12 15 18 20 25 30')).toBe('số điện thoại');
  });
});

describe('detectPii — G6: nhãn đúng cho dãy nhiều số 0 dẫn đầu mã nước', () => {
  it('000084… ra nhãn số điện thoại chứ không phải CCCD (P78)', () => {
    expect(detectPii('Goi 000084912345678')).toBe('số điện thoại');
  });

  it('0084… và 00… vẫn giữ nguyên nhãn cũ', () => {
    expect(detectPii('0084912345678')).toBe('số điện thoại');
    expect(detectPii('00912345678')).toBe('số điện thoại');
  });
});

describe('detectPii — G7: biên tìm dấu chấm của bộ dò email (ghim M23)', () => {
  it('dấu chấm ngay sau @ không phải email', () => {
    expect(detectPii('ten a@.bcd')).toBeNull();
  });

  it('dấu chấm cách @ một ký tự thì là email', () => {
    expect(detectPii('ten a@b.cd')).toBe('địa chỉ email');
  });
});

/**
 * ĐÁNH ĐỔI ĐÃ CHỐT VÒNG 4 — xem đánh đổi #5, #6, #7 trong docblock của
 * `pii-text.ts`. Các test này khẳng định hành vi CỐ Ý; đổi chúng là đổi một
 * quyết định thiết kế, không phải sửa lỗi.
 */
describe('detectPii — đánh đổi #5: số quốc tế KHÔNG có dấu + thì lọt', () => {
  it.each([
    ['Ấn Độ (P02)', 'Bo em dang o An Do 91 98765 43210'],
    ['Đức qua tiền tố 00 (P04)', 'Lien he 0049 176 12345678'],
    ['Mỹ qua tiền tố 00 (P05)', 'Goi 001 202 555 0199'],
    ['Nhật qua tiền tố 00 (P06)', 'Goi 0081 90 1111 2222'],
    ['Nga đầu số 8 nội địa (P08)', 'Goi 8 916 123 45 67'],
    ['Brazil (P10)', 'Whatsapp 55 11 91234 5678'],
    ['Trung Quốc (P14)', 'Wechat 86 138 0013 8000'],
  ])('LỌT có chủ đích: %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });

  it('nhưng cùng số đó viết liền thì ID_NUMBER vẫn chặn', () => {
    expect(detectPii('Lien he 004917612345678')).toBe('dãy số giống CCCD/CMND');
    expect(detectPii('Wechat 8613800138000')).toBe('dãy số giống CCCD/CMND');
  });

  it('và số quốc tế CÓ dấu + thì vẫn chặn — đây là ranh giới của đánh đổi', () => {
    expect(detectPii('Bo em dang o An Do +91 98765 43210')).toBe(
      'số điện thoại',
    );
    expect(detectPii('Lien he +49 176 12345678')).toBe('số điện thoại');
  });
});

describe('detectPii — đánh đổi #6 và #7: chữ cái và phân cách dài cắt cụm', () => {
  it.each([
    ['chữ cái vô nghĩa xen giữa (P55)', '0912a345678'],
    ['thẻ HTML xen giữa (P60)', '0912<b>345</b>678'],
    ['phân cách 4 dấu chấm (P58)', '0912....345....678'],
    ['xuống dòng ở một chỗ (P56)', '0912 345\n678'],
  ])('LỌT có chủ đích: %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });

  it('phân cách đúng 3 ký tự vẫn chặn — ranh giới của đánh đổi #7', () => {
    expect(detectPii('0912...345...678')).toBe('số điện thoại');
  });
});

/**
 * PHẠM VI THẬT của đánh đổi #2, đo lại ở §3.1 báo cáo thẩm định vòng 3: KHÔNG
 * chỉ `Tuan 05 08 09 10 11` mà là MỌI danh sách từ ba mốc ngày dd/mm trở lên.
 * Các test này tồn tại để người sau đọc docblock không đánh giá thấp chi phí và
 * không "sửa" nhầm — muốn nới thì phải đổi quyết định thiết kế.
 */
describe('detectPii — đánh đổi #2: danh sách ngày dd/mm từ ba mốc trở lên bị chặn', () => {
  it.each([
    ['ba mốc có dấu phẩy', 'Nghi ngay 03/09, 10/09, 17/09'],
    ['bốn mốc lịch thi', 'Lich thi 07/09, 14/09, 21/09, 28/09'],
    ['bốn mốc cách nhau bằng dấu cách', 'Buoi hoc 05/09 12/09 19/09 26/09'],
    ['bốn mốc nối bằng gạch', 'Deadline 08/09 - 09/09 - 10/09 - 11/09'],
    ['năm mốc', 'Cac moc 01/10 08/10 15/10 22/10 29/10'],
    ['ngày lễ trong năm', 'Ngay le 30/04 01/05 02/09 20/11'],
    ['danh sách buổi hai chữ số', 'Diem danh buoi 02, 03, 04, 05, 06'],
    ['danh sách slot hai chữ số', 'Slot 03 04 05 06 07 08'],
    ['H14 danh sách ngày vắng', 'Vang cac ngay 03/09, 10/09, 17/09, 24/09'],
    [
      'H38 danh sách ngày nghỉ lễ',
      'Cac ngay 01/09 02/09 03/09 04/09 05/09 nghi le',
    ],
    ['H47 dãy mã đề trong ngoặc', 'De (01) (02) (03) (04) (05) (06) (07)'],
  ])('CHẶN NHẦM có chủ đích: %s', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });

  it.each([
    ['hai mốc thì chưa đủ chữ số', 'Nghi ngay 03/09 va 10/09'],
    ['chữ xen giữa cắt cụm', 'Tuan 05, tuan 08, tuan 09, tuan 10, tuan 11'],
    ['ngày đầy đủ có năm', 'Han nop bai la 06/09/2026, cac em luu y'],
  ])('nhưng vẫn cho qua %s — đây là ngưỡng của đánh đổi', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

describe('detectPii — chuẩn hoá chữ số không phá tính tuyến tính', () => {
  it.each([
    ['30 000 chữ số Devanagari', '०९'.repeat(15000)],
    ['30 000 dấu tổ hợp xen chữ số', `7${COMBINING_ACUTE}`.repeat(15000)],
    ['30 000 chữ số Thái xen phân cách', '๐๙.'.repeat(10000)],
  ])('xử lý %s dưới 100ms', (_label, text) => {
    const startedAt = Date.now();
    detectPii(text);
    expect(Date.now() - startedAt).toBeLessThan(100);
  });
});

/**
 * ---------------------------------------------------------------------------
 * VÒNG 5 — bịt CRITICAL-1, ghim ba đột biến còn sống, ghi nhận giới hạn của B
 * ---------------------------------------------------------------------------
 * Nguồn: `task-2-fix5-brief.md` và bảng ca đối kháng của `task-2-rereview4-report.md`.
 * Ký tự vô hình LUÔN viết bằng escape `\u…`: dán trực tiếp là lần review sau
 * không nhìn thấy chúng và tưởng các test trùng nhau.
 */

/** Bốn "chữ cái" Unicode hoàn toàn vô hình — general category Lo, không phải Cf. */
const HANGUL_CHOSEONG_FILLER = '\u115F';
const HANGUL_JUNGSEONG_FILLER = '\u1160';
const HANGUL_FILLER = '\u3164';
const HALFWIDTH_HANGUL_FILLER = '\uFFA0';
const LINE_SEPARATOR = '\u2028';
const PARAGRAPH_SEPARATOR = '\u2029';

/**
 * H1 (CRITICAL-1 của vòng 4). Bốn điểm mã trên là `\p{L}` nên `LETTER` coi chúng
 * là chữ cái và CẮT cụm chữ số — trong khi mắt người không thấy gì cả. Người gửi
 * chỉ cần chèn một ký tự vô hình vào giữa số CCCD là qua được cả ba bộ dò.
 * Quét vét cạn 1.112.063 điểm mã ở vòng 4 cho đúng bốn ca này, không hơn.
 *
 * Bản vá đặt ở BƯỚC XOÁ (`\p{Default_Ignorable_Code_Point}` trong
 * `INVISIBLE_MARK_OR_FORMAT`), không phải ở `LETTER`: xoá thì bốn ký tự liên
 * tiếp cũng vô hại, còn coi là phân cách thì bốn ký tự đã vượt
 * MAX_SEPARATOR_LENGTH và cụm lại bị cắt — test thứ ba dưới đây phân biệt đúng
 * hai cách làm đó.
 */
describe('detectPii — H1 (CRITICAL-1): chữ cái vô hình bị XOÁ chứ không cắt cụm', () => {
  const INVISIBLE_LETTERS: ReadonlyArray<readonly [string, string]> = [
    ['U+115F HANGUL CHOSEONG FILLER', HANGUL_CHOSEONG_FILLER],
    ['U+1160 HANGUL JUNGSEONG FILLER', HANGUL_JUNGSEONG_FILLER],
    ['U+3164 HANGUL FILLER', HANGUL_FILLER],
    ['U+FFA0 HALFWIDTH HANGUL FILLER', HALFWIDTH_HANGUL_FILLER],
  ];

  it.each(INVISIBLE_LETTERS)(
    'CCCD chèn %s vẫn bị chặn',
    (_label, invisible) => {
      expect(detectPii(`CCCD 038203${invisible}001234`)).toBe(
        'dãy số giống CCCD/CMND',
      );
    },
  );

  it.each(INVISIBLE_LETTERS)(
    'số điện thoại chèn %s vẫn bị chặn',
    (_label, invisible) => {
      expect(detectPii(`SDT 0912${invisible}345678`)).toBe('số điện thoại');
    },
  );

  it('bốn ký tự vô hình liên tiếp vẫn bị chặn — chứng minh là XOÁ chứ không phải phân cách', () => {
    // Nếu bản vá chỉ hạ bốn ký tự này xuống hàng "phân cách" thì độ dài 4 đã
    // vượt MAX_SEPARATOR_LENGTH = 3 và cụm bị cắt làm đôi ⇒ test đỏ.
    expect(detectPii(`0912${HANGUL_FILLER.repeat(4)}345678`)).toBe(
      'số điện thoại',
    );
    expect(
      detectPii(
        `0912${HANGUL_CHOSEONG_FILLER}${HANGUL_JUNGSEONG_FILLER}${HANGUL_FILLER}${HALFWIDTH_HANGUL_FILLER}345678`,
      ),
    ).toBe('số điện thoại');
  });

  it('chữ Hangul NHÌN THẤY ĐƯỢC thì vẫn cắt cụm như mọi chữ cái khác', () => {
    // Ranh giới của bản vá: chỉ ký tự Default_Ignorable mới bị xoá. Chữ thật —
    // kể cả cùng khối Hangul — vẫn cắt cụm theo đánh đổi #6.
    expect(detectPii('0912가345678')).toBeNull();
  });
});

/**
 * H2 (mục C / HIGH-1). `hasEmail` trước vòng 5 chạy trên chuỗi GỐC, trong khi
 * hai bộ dò còn lại chạy trên chuỗi đã chuẩn hoá. Hệ quả: mọi biến thể fullwidth
 * hay ký tự tương đương của `@` và `.` đều lọt (B81/B82/B86). NFKC gộp `＠`
 * U+FF20, `﹫` U+FE6B về `@`; `．` U+FF0E, `﹒` U+FE52, `․` U+2024 về `.`.
 */
describe('detectPii — H2 (mục C): email đi qua bước chuẩn hoá như hai bộ dò kia', () => {
  it.each([
    ['@ fullwidth (B81)', 'Mail nguyenvana＠fpt.edu.vn'],
    ['dấu chấm fullwidth (B82)', 'Mail nguyenvana@fpt．edu．vn'],
    ['cả hai fullwidth (B86)', 'Mail nguyenvana＠fpt．edu．vn'],
    ['biến thể small form', 'Mail nguyenvana﹫fpt﹒edu﹒vn'],
    ['one dot leader U+2024', 'Mail nguyenvana@fpt․edu․vn'],
  ])('chặn %s', (_label, text) => {
    expect(detectPii(text)).toBe('địa chỉ email');
  });

  it('ngữ nghĩa của bộ dò email không đổi, chỉ đầu vào đổi', () => {
    // Vẫn đúng luật cũ: phải có ký tự trước @, và phải có dấu chấm SAU @ cách
    // ít nhất một ký tự. Chuẩn hoá không nới lỏng điều kiện nào.
    expect(detectPii('ten a﹫b﹒c')).toBe('địa chỉ email');
    expect(detectPii('ten a＠bcd')).toBeNull();
    expect(detectPii('ten a＠．bcd')).toBeNull();
  });
});

/**
 * H3 (mục E — đột biến Z28). `clusterLooksLikePhone` quét MỌI vị trí bắt đầu `i`
 * chứ không chỉ nhóm đầu, để chống che bóng tiền tố. Vòng 4 không có test nào
 * đỏ khi rút vòng lặp lại còn `i = 0`: mọi ca che bóng sẵn có đều để số thật ở
 * nhóm đầu. Chuỗi dưới đây là ca thật của chat nội bộ — số nằm sau một mã khoá.
 */
describe('detectPii — H3: số điện thoại nằm sau nhóm chữ số khác vẫn bị bắt', () => {
  it.each([
    ['sau năm khoá', 'Khoa 2026 lien he 0912 345 678'],
    ['sau mã lớp toàn số', '2026 2027 0912345678'],
    ['sau số buổi', 'Vang 3 buoi, goi 0912 345 678 nhac nho'],
  ])('chặn %s', (_label, text) => {
    expect(detectPii(text)).toBe('số điện thoại');
  });

  it('đối chứng: cùng dãy số đứng một mình vẫn chặn', () => {
    expect(detectPii('0912 345 678')).toBe('số điện thoại');
  });
});

/**
 * H4 (mục E — đột biến Z23). Bước chuẩn hoá phải là NFKC, không phải NFC. NFC
 * KHÔNG gộp chữ số vòng tròn `⓪①②…`, chữ số mũ `³`, hay chữ số fullwidth về
 * chữ số thường; đổi sang NFC là ba chuỗi dưới đây lọt hết. Vòng 4 không có test
 * nào phân biệt hai dạng chuẩn hoá này (mọi ca chữ số ngoại lai đều đi qua nhánh
 * `\p{Nd}` chứ không qua NFKC).
 */
describe('detectPii — H4: bước chuẩn hoá phải là NFKC chứ không phải NFC', () => {
  it('chữ số vòng tròn (không phải \\p{Nd}, chỉ NFKC mới gộp)', () => {
    expect(detectPii('so ⓪③②⑥⑧⑧⑨①①④')).toBe('số điện thoại');
    expect(detectPii('CCCD ⑨⑧⑦⑥⑤④③②①')).toBe('dãy số giống CCCD/CMND');
  });

  it('chữ số mũ trộn giữa dãy ASCII', () => {
    expect(detectPii('so 0³26889114')).toBe('số điện thoại');
  });
});

/**
 * H5 (mục E — đột biến Z20). `NEWLINE` gồm cả U+2028 LINE SEPARATOR và U+2029
 * PARAGRAPH SEPARATOR. Bỏ hai điểm mã này khỏi lớp ký tự thì chúng tụt xuống
 * hàng "phân cách thường" và nối lại cụm bị cắt ⇒ chuỗi đầu tiên hoá số điện
 * thoại. Đây là quyết định CỐ Ý (đánh đổi #6: xuống dòng cắt cụm) nên phải có
 * test giữ.
 */
describe('detectPii — H5: U+2028/U+2029 cắt cụm y như \\n', () => {
  it.each([
    ['U+2028', LINE_SEPARATOR],
    ['U+2029', PARAGRAPH_SEPARATOR],
  ])('%s cắt cụm nên dãy số bị chia đôi và lọt', (_label, separator) => {
    expect(detectPii(`0912${separator}345${separator}678`)).toBeNull();
  });

  it('đối chứng: thay bằng dấu cách thường thì chặn', () => {
    expect(detectPii('0912 345 678')).toBe('số điện thoại');
  });
});

/**
 * H6 (mục B — CRITICAL-2, KHÔNG đóng được). CCCD/CMND viết cách nhóm
 * (`CCCD 038 203 001 234`) vẫn LỌT sau vòng 5. Đây không phải sơ suất mà là kết
 * quả đo: mọi luật hình dạng đủ rộng để bắt ba ca CCCD ấy đều chặn nhầm văn bản
 * học vụ thật, vì hai lớp chuỗi TRÙNG NHAU HOÀN TOÀN về hình dạng —
 * `CCCD 0382 0300 1234` và `Ma ho so noi bo 0234 5678 9012` đều là ba nhóm bốn
 * chữ số cách nhau đúng một dấu cách, tổng 12 chữ số; chỉ khác GIÁ TRỊ chữ số.
 * Chi tiết ba biến thể đã thử và số ca chặn nhầm của từng biến thể: xem docblock
 * của `ID_NUMBER` trong `pii-text.ts`.
 *
 * Các test dưới đây KHÔNG ghim lỗ hổng; chúng ghim LÝ DO không đóng được BẰNG
 * HÌNH DẠNG. Ai định đóng mục B bằng luật hình dạng sẽ thấy chúng đỏ trước.
 *
 * VÒNG 6: nửa CÓ TỪ KHOÁ của mục B đã đóng (xem khối H7 ở cuối file). Tám chuỗi
 * dưới đây vẫn phải null vì chúng KHÔNG chứa từ khoá căn cước — đó chính là thứ
 * làm cổng vòng 6 an toàn, nên chúng ở lại nguyên vẹn.
 */
describe('detectPii — H6 (mục B): văn bản học vụ trùng hình dạng với CCCD cách nhóm', () => {
  it.each([
    [
      'ba nhóm 4 chữ số — trùng hình dạng CCCD 12 số',
      'Ma ho so noi bo 0234 5678 9012',
    ],
    ['ba nhóm 4 chữ số, có số 0 dẫn đầu', 'Ma noi bo 0612 3456 7890'],
    [
      'bốn nhóm 3 chữ số — trùng hình dạng CCCD viết 3-3-3-3',
      'Ma de 101 102 103 104 phat cho bon phong',
    ],
    ['bốn nhóm 3 chữ số kiểu số phòng', 'Phong 305 306 307 308 deu con trong'],
    ['bốn nhóm 3 chữ số kiểu số trang', 'Doc giao trinh trang 102 135 210 245'],
    [
      'bốn nhóm 4 chữ số kiểu năm sinh',
      'Sinh vien sinh nam 2005 2006 2007 deu thuoc K18',
    ],
    [
      'ba nhóm 4 chữ số kiểu chỉ tiêu',
      'Chi tieu tuyen sinh 2026: 1200 1300 1400 cho ba nganh',
    ],
    [
      'ba nhóm 4 chữ số kiểu số phòng có 0 dẫn đầu',
      'Toa nha Alpha phong 0101 0102 0103',
    ],
  ])('KHÔNG được chặn: %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });

  it('CCCD viết LIỀN thì vẫn chặn — ranh giới thật của bộ dò', () => {
    expect(detectPii('CCCD 038203001234')).toBe('dãy số giống CCCD/CMND');
    expect(detectPii('CMND 201456789')).toBe('dãy số giống CCCD/CMND');
  });
});

/*
 * H7 (vòng 6) — CỔNG TỪ KHOÁ: đóng nửa CÓ TÍN HIỆU của mục B.
 *
 * Luật: bản ĐÃ CHUẨN HOÁ chứa một từ khoá căn cước VÀ có cửa sổ nhóm chữ số tổng
 * 9-12 ⇒ nhãn 'dãy số giống CCCD/CMND'. Ba mặt được ghim tách bạch dưới đây:
 *   (a) từ khoá + cụm 9-12 chữ số cách nhóm  ⇒ CHẶN;
 *   (b) từ khoá, không có dãy số             ⇒ LỌT;
 *   (c) dãy số, không có từ khoá             ⇒ LỌT (ranh giới CỐ Ý, xem #8).
 */
describe('detectPii — H7 (a): từ khoá căn cước + cụm 9-12 chữ số thì CHẶN', () => {
  it.each([
    ['CCCD in 3-3-3-3 đúng như trên thẻ', 'CCCD 038 203 001 234'],
    ['CCCD in 4-4-4', 'CCCD 0382 0300 1234'],
    ['CMND 9 chữ số 3-3-3', 'CMND 201 456 789'],
    ['từ khoá viết thường', 'cccd 038 203 001 234'],
    ['từ khoá nằm giữa câu', 'So CCCD cua em la 038 203 001 234 nhe'],
    ['dấu chấm làm phân cách', 'CMND 201.456.789'],
    ['gạch nối làm phân cách', 'CCCD: 0382-0300-1234'],
  ])('%s', (_label, text) => {
    expect(detectPii(text)).toBe('dãy số giống CCCD/CMND');
  });

  it('từ khoá có dấu và không dấu đều khớp (gấp dấu tiếng Việt)', () => {
    expect(detectPii('Căn cước 038 203 001 234')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('can cuoc 038 203 001 234')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('CĂN CƯỚC 038 203 001 234')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('Chứng minh nhân dân 201 456 789')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('chung minh nhan dan 201 456 789')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('Chứng minh thư 201 456 789')).toBe(
      'dãy số giống CCCD/CMND',
    );
  });

  it('cụm dài hơn 12 chữ số vẫn bị bắt qua cửa sổ con 9-12', () => {
    expect(detectPii('CCCD 038 203 001 2345')).toBe('dãy số giống CCCD/CMND');
  });
});

/*
 * Khớp từ khoá PHẢI chạy trên bản đã chuẩn hoá. Bốn ca dưới đây là lý do: bỏ
 * bước chuẩn hoá khỏi phần khớp từ khoá thì cả bốn LỌT sạch trong khi người đọc
 * vẫn thấy đúng chữ "CCCD". Đây là test diệt đột biến, không phải test trang trí.
 */
describe('detectPii — H7 (a2): từ khoá bị nguỵ trang vẫn khớp', () => {
  const ZERO_WIDTH_SPACE = '\u200B';
  const SOFT_HYPHEN = '\u00AD';
  const HANGUL_FILLER = '\u3164';

  it('từ khoá fullwidth (chỉ NFKC gấp về ASCII)', () => {
    expect(detectPii('ＣＣＣＤ 038 203 001 234')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('ｃｍｎｄ 201 456 789')).toBe('dãy số giống CCCD/CMND');
  });

  it('ký tự vô hình chèn giữa từ khoá (chỉ bước XOÁ bỏ được)', () => {
    expect(detectPii(`CC${ZERO_WIDTH_SPACE}CD 038 203 001 234`)).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii(`CM${SOFT_HYPHEN}ND 201 456 789`)).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii(`CC${HANGUL_FILLER}CD 038 203 001 234`)).toBe(
      'dãy số giống CCCD/CMND',
    );
  });

  it('dấu tổ hợp chèn vào chữ cái của từ khoá', () => {
    expect(detectPii('ĆCCD 038 203 001 234')).toBe('dãy số giống CCCD/CMND');
  });
});

describe('detectPii — H7 (b): từ khoá KHÔNG kèm dãy số thì LỌT', () => {
  it.each([
    ['câu nhắc nộp giấy tờ', 'Sinh vien chua nop CCCD'],
    ['có dấu', 'Sinh viên chưa nộp CCCD'],
    ['kèm mốc ngày ngắn', 'Nhac cac em bo sung CCCD truoc 30/09'],
    ['kèm số phòng', 'Phong CTSV nhan CCCD tai phong 305 tang 3'],
    ['kèm sĩ số', 'Lop SE1701 con 5 em thieu CCCD'],
    ['kèm tỉ lệ', 'Ket qua: 45/50 em da nop CCCD'],
    ['từ khoá dạng đầy đủ', 'Danh sach thieu chung minh nhan dan: 12 em'],
    ['dãy số dưới cận dưới', 'CCCD 038 203'],
    ['tổng 8 chữ số', 'CMND 2014 5678'],
  ])('KHÔNG được chặn: %s', (_label, text) => {
    expect(detectPii(text)).toBeNull();
  });
});

/*
 * (c) RANH GIỚI CỐ Ý — đọc kỹ trước khi "sửa".
 *
 * Cổng vòng 6 gác bằng TỪ KHOÁ chứ không bằng hình dạng. Hệ quả trực tiếp: một
 * CCCD viết cách nhóm mà KHÔNG có từ khoá đi kèm thì VẪN LỌT. Đây KHÔNG phải lỗi
 * bỏ quên — xem đánh đổi #8 trong `pii-text.ts`: `CCCD 0382 0300 1234` và
 * `Ma ho so noi bo 0234 5678 9012` giống hệt nhau về hình dạng, và ba luật hình
 * dạng đã đo ở vòng 5 đều kéo theo mã hồ sơ, mã đề, số phòng, số trang và MỌI
 * số tiền kiểu Việt. Muốn đóng nốt nửa này thì phải đổi QUYẾT ĐỊNH (chấp nhận
 * chặn nhầm cả họ văn bản đó), không phải sửa mã.
 */
describe('detectPii — H7 (c): dãy số KHÔNG kèm từ khoá vẫn LỌT (cố ý)', () => {
  it('mã hồ sơ nội bộ trùng hình dạng CCCD 12 số vẫn lọt', () => {
    expect(detectPii('Ma ho so noi bo 0234 5678 9012')).toBeNull();
  });

  it('cùng dãy số đó, THÊM từ khoá vào thì chặn — khác biệt duy nhất là từ khoá', () => {
    expect(detectPii('Ma ho so noi bo 0234 5678 9012')).toBeNull();
    expect(detectPii('CCCD 0234 5678 9012')).toBe('dãy số giống CCCD/CMND');
  });

  it('số tiền kiểu Việt vẫn lọt', () => {
    expect(detectPii('Ngan sach khoa 1.000.000.000 dong')).toBeNull();
  });
});

/*
 * Ranh giới của TẬP TỪ KHOÁ. Ba ca dưới đây giải thích vì sao tập chỉ có năm
 * mục: nới thêm là kéo văn bản học vụ hằng ngày vào cổng.
 */
describe('detectPii — H7 (d): ranh giới của tập từ khoá', () => {
  it('"chứng minh" TRẦN không phải từ khoá (là động từ trong văn bản học vụ)', () => {
    expect(detectPii('Chung minh bat dang thuc 123 456 789')).toBeNull();
    expect(detectPii('Chứng minh bài toán 201 456 789')).toBeNull();
  });

  it('"cmt" không phải từ khoá (trùng với "comment" trong tin nhắn nội bộ)', () => {
    expect(detectPii('cmt cua em o day 201 456 789')).toBeNull();
  });

  it('biến thể chứa từ khoá gốc thì khớp sẵn, không cần liệt kê riêng', () => {
    expect(detectPii('So CCCD: 038 203 001 234')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('Can cuoc cong dan 038 203 001 234')).toBe(
      'dãy số giống CCCD/CMND',
    );
    expect(detectPii('Giay CMND so 201 456 789')).toBe(
      'dãy số giống CCCD/CMND',
    );
  });

  it('cổng dùng chung MAX_SINGLE_DIGIT_GROUPS nên gõ giãn từng chữ số vẫn lọt (đánh đổi #1)', () => {
    expect(detectPii('CCCD 1 2 3 4 5 6 7 8 9')).toBeNull();
  });

  /*
   * Cận TRÊN của cổng phải bằng cận trên của `ID_NUMBER` (12). Hai chuỗi dưới
   * đây là chỗ DUY NHẤT phân biệt được 12 với một cận lỏng hơn: cửa sổ nhảy
   * thẳng từ 8 chữ số lên 13/15 mà không có nhóm nào đủ 9 chữ số liền nhau, nên
   * `ID_NUMBER` cũng không bắt. Nới ID_MAX_DIGITS lên 15 là chặn cả chúng.
   */
  it('cửa sổ vượt cận trên 12 chữ số thì lọt — cùng cận với ID_NUMBER', () => {
    expect(detectPii('CCCD 12345678 12345')).toBeNull();
    expect(detectPii('CCCD 12345678 1234567')).toBeNull();
  });
});
