import { BadRequestException } from '@nestjs/common';

export const PII_IN_MESSAGE = 'PII_IN_MESSAGE';

/**
 * Lớp chặn PII thứ tư (RULE 1), dành cho văn bản tự do người dùng gõ — nơi ba
 * lớp kia (schema không có cột, PiiGuardInterceptor, Excel import) không với tới.
 *
 * Cố tình chấp nhận CHẶN NHẦM: một mã lớp toàn số dài 9-12 ký tự sẽ bị từ chối.
 * Chặn nhầm thì người dùng viết lại một câu; lọt PII thì vi phạm quy định. Vì
 * vậy thông báo lỗi phải nói rõ loại bị chặn để họ biết sửa chỗ nào.
 *
 * Ngược lại, KHÔNG được chặn nhầm dữ liệu học vụ thường gặp (mã SV, mã lớp,
 * danh sách điểm) — nên dãy số CCCD chỉ tính khi các chữ số LIỀN NHAU, còn số
 * điện thoại đi qua bộ dò ba bước mô tả ngay dưới đây.
 */

/*
 * ---------------------------------------------------------------------------
 * BỘ DÒ SỐ ĐIỆN THOẠI — chuẩn hoá → gom cụm → quét theo nhóm chữ số
 * ---------------------------------------------------------------------------
 *
 * Hai vòng trước dò bằng MỘT regex đoán trước mọi hình dạng phân cách
 * (`(?:\+84|0)[\s./;-]?\d{2,4}…`). Cách đó thua về bản chất: danh sách ký tự
 * phân cách, kiểu chữ số và định dạng quốc tế là vô hạn, nên mỗi vòng vá lại lọt
 * một lớp mới (`0912_345_678`, `0912  345  678`, `0912,345,678`, chữ số
 * fullwidth, `84 912 345 678`, và lớp "che bóng tiền tố" `khoa 2026 0912 345
 * 678` — cụm số đứng trước bị regex nuốt tham lam khiến SĐT không bao giờ được
 * xét).
 *
 * Bộ dò hiện tại KHÔNG liệt kê phân cách nữa. Nó định nghĩa phân cách theo PHỦ
 * ĐỊNH (mọi thứ không phải chữ số và không phải chữ cái) rồi quét mọi cửa sổ
 * nhóm chữ số:
 *
 *   Bước 1 — normalizeDigits: NFKC, XOÁ HẲN mọi ký tự không chiếm chỗ hiển thị
 *            (`\p{M}`, `\p{Cf}`, `\p{Default_Ignorable_Code_Point}` — dấu thanh
 *            rời, variation selector, keycap, zero-width, bidi override, soft
 *            hyphen, Hangul filler), rồi đưa MỌI chữ số thập phân Unicode
 *            (`\p{Nd}`, không liệt kê dải) về ASCII. Bản chuẩn hoá này dùng cho
 *            CẢ BA bộ dò — hasPhone, EMAIL và ID_NUMBER — nên chèn một ký tự vô
 *            hình, gõ CCCD bằng chữ số Devanagari/Thái, hay gõ email bằng `＠`
 *            và `．` fullwidth đều không né được lớp nào. NFKC là thứ GẤP các
 *            biến thể fullwidth/compat về ASCII, tức là thứ BẮT được lối né chứ
 *            không phải thứ phá ngữ nghĩa token; và mọi thay đổi nó gây ra chỉ
 *            làm bộ dò chặn NHIỀU hơn — đúng chiều bất đối xứng chi phí.
 *   Bước 2 — collectDigitClusters: cắt chuỗi thành các *cụm*. Cụm = dãy *nhóm
 *            chữ số* (`\d+`) nối nhau bởi các *đoạn phân cách* dài tối đa 3 ký
 *            tự, không chứa xuống dòng. CHỈ chữ cái (`\p{L}`, kể cả chữ cái
 *            tiếng Việt có dấu) và xuống dòng CẮT ĐỨT cụm — dấu tổ hợp thì
 *            KHÔNG, vì bước 1 đã xoá chúng trước khi tới đây.
 *   Bước 3 — clusterLooksLikePhone: với MỌI vị trí nhóm bắt đầu `i` (đây là thứ
 *            diệt lớp che bóng tiền tố) và mọi `j >= i`, gộp chữ số rồi xét cấu
 *            trúc nhóm, tiền tố quốc gia + NSN, và luật số quốc tế.
 *
 * ĐỘ PHỨC TẠP TUYẾN TÍNH: bước 2 quét mỗi ký tự đúng một lần. Bước 3 có vòng
 * `j` dừng ngay khi tổng chữ số vượt MAX_PHONE_DIGITS (15), nên mỗi `i` chỉ chạy
 * tối đa 16 vòng; số nhóm không vượt quá độ dài chuỗi. Tổng chi phí O(16·n).
 * Không dùng regex có lượng từ lồng nhau ⇒ không có backtracking, không ReDoS.
 * Đo thực tế trên chuỗi đối kháng 60 000 ký tự: xem test "không ReDoS" và mục đo
 * trong `task-2-fix3-report.md` (tăng gấp đôi độ dài ⇒ thời gian tăng ~2×).
 *
 * ---------------------------------------------------------------------------
 * ĐÁNH ĐỔI ĐÃ CHỐT — đừng "sửa" nếu chưa đọc hết lý do
 * ---------------------------------------------------------------------------
 *
 * 1. MAX_SINGLE_DIGIT_GROUPS = 1 (ràng buộc cấu trúc nhóm) là thứ giữ cho BẢNG
 *    ĐIỂM không bị chặn. `diem 8.5 9.0 7.5 6.0 8.0 7.0 9.5 6.5 8.0 7.5` toàn
 *    nhóm 1 chữ số; nếu bỏ ràng buộc này thì cửa sổ bắt đầu từ một số `0` bất kỳ
 *    (`0 7 5 6 0 8 0 7 0 9` → NSN `756080709`) sẽ bị chặn nhầm — đã kiểm chứng.
 *    ĐỔI LẠI: số điện thoại gõ giãn từng chữ số (`0 9 1 2 3 4 5 6 7 8`,
 *    `0.9.1.2.3.4.5.6.7.8`, `+84 9 1 2 3 4 5 6 7 8`) sẽ LỌT. Đây là quyết định
 *    đã chốt, không phải lỗi bỏ quên: bảng điểm là văn bản hằng ngày của giảng
 *    viên, còn gõ giãn từng chữ số là hành vi né tránh có chủ đích mà lớp chặn
 *    này không đặt mục tiêu bắt.
 *
 * 2. Ngược chiều: một dãy nhóm 2 chữ số bắt đầu bằng `0` không phân biệt được
 *    với `09 12 34 56 78`, nên SẼ BỊ CHẶN NHẦM. Phạm vi thật RỘNG HƠN hai ví dụ
 *    `Tuan 05 08 09 10 11` / `Danh sach nhom: 01, 02, ... 08` từng được nêu:
 *    **MỌI danh sách từ BA mốc ngày dd/mm trở lên, viết liền nhau không có chữ
 *    xen giữa, đều bị chặn** — `Lich thi 07/09, 14/09, 21/09, 28/09` cho dãy
 *    nhóm `07 09 14 09 21`, tức NSN `790914092` (9 chữ số, đầu `7`), không có
 *    dấu hiệu cấu trúc nào tách nó khỏi một số điện thoại thật. Hai mốc thì vẫn
 *    lọt qua (`Nghi ngay 03/09 va 10/09` → null) vì chưa đủ 9 chữ số; chữ xen
 *    giữa cũng cứu (`Tuan 05, tuan 08, tuan 09, tuan 10` → null).
 *    Chốt theo bất đối xứng chi phí: chặn nhầm thì người dùng viết lại một câu,
 *    lọt PII thì vi phạm quy định. Có test khẳng định hành vi này để người sau
 *    biết đó là CỐ Ý — muốn nới thì phải đổi quyết định, không phải sửa mã.
 *
 * 3. Xuống dòng cắt đứt cụm, nên `0912\n345\n678` LỌT. Đổi lại, danh sách học vụ
 *    xuống dòng (`01\n02\n03…`) không bị nối thành một số điện thoại giả.
 *
 * 4. Chỉ chấp nhận NSN có chữ số đầu thuộc {2,3,5,7,8,9} (kế hoạch đánh số VN
 *    hiện hành: di động 03/05/07/08/09, cố định 02). Hệ quả: số 11 chữ số kiểu
 *    cũ đã bị khai tử năm 2018 (`0122 345 6789` → NSN `1223456789`) không còn ra
 *    nhãn "số điện thoại"; dạng viết liền vẫn bị ID_NUMBER chặn. Ràng buộc này
 *    là thứ cứu `Danh sach nhom: 01 02 03 04 05` (NSN `102030405`, đầu `1`).
 *
 * 5. Số điện thoại QUỐC TẾ KHÔNG có dấu `+` thì LỌT: `0049 176 12345678` (Đức),
 *    `001 202 555 0199` (Mỹ), `0081 90 1111 2222` (Nhật), `91 98765 43210`
 *    (Ấn Độ), `55 11 91234 5678` (Brazil), `86 138 0013 8000` (Trung Quốc),
 *    `8 916 123 45 67` (Nga). Lý do cấu trúc: không có `+` thì một dãy 8-15 chữ
 *    số CÓ PHÂN CÁCH không phân biệt được với mã số học vụ (`Ma ho so noi bo
 *    0234 5678 9012`) — nhận chúng là chặn nhầm cả một họ văn bản hằng ngày.
 *    Chỉ tiền tố quay số VN `0084` được xử lý riêng. Bù lại, dạng VIẾT LIỀN
 *    9-12 chữ số của chính các số đó vẫn bị `ID_NUMBER` chặn.
 *    Bổ sung vòng 5: số quốc tế CÓ dấu `+` nhưng tổng ĐÚNG 8 chữ số cũng lọt —
 *    xem lý do ở INTERNATIONAL_MIN_DIGITS. Không định dạng thật nào trong chín
 *    nước đã kiểm rơi vào đó.
 *
 * 6. Chữ cái cắt đứt cụm (bước 2), nên `0912a345678` và `0912<b>345</b>678`
 *    LỌT. Đây là mặt trái trực tiếp của thứ giữ cho `HE160123 HE160456` và mọi
 *    mã học vụ trộn chữ-số không bị nối thành số điện thoại giả.
 *    Giới hạn của đánh đổi này (sửa vòng 5): chỉ chữ cái NHÌN THẤY ĐƯỢC mới cắt
 *    cụm. Bốn chữ cái vô hình `U+115F U+1160 U+3164 U+FFA0` bị XOÁ ở bước 1 như
 *    mọi ký tự không chiếm chỗ khác — xem INVISIBLE_MARK_OR_FORMAT.
 *
 * 7. Đoạn phân cách dài quá MAX_SEPARATOR_LENGTH cắt cụm, nên `0912....345....678`
 *    (4 dấu chấm) LỌT. Nới hằng số này là quyết định của người điều phối chứ
 *    không phải sửa lỗi: nới thì mọi dãy số cách nhau bằng cụm dấu dài hơn sẽ
 *    bị nối lại, làm rộng thêm đúng họ chặn nhầm ở đánh đổi #2.
 *
 * 8. CCCD VIẾT CÁCH NHÓM mà KHÔNG kèm từ khoá căn cước thì VẪN LỌT:
 *    `Ma ho so noi bo 0234 5678 9012` lọt, và một CCCD thật gõ đúng hình dạng đó
 *    cũng lọt theo. Đây là lỗ ĐÃ BIẾT, ĐÃ ĐO, KHÔNG đóng được bằng hình dạng:
 *    `CCCD 0382 0300 1234` và `Ma ho so noi bo 0234 5678 9012` giống HỆT nhau về
 *    cấu trúc (ba nhóm bốn chữ số, một dấu cách, tổng 12) — chỉ khác GIÁ TRỊ chữ
 *    số. Ba luật hình dạng đã dựng và đo ở vòng 5 (xem docblock ID_NUMBER) đều
 *    chặn nhầm diện rộng: mã hồ sơ, mã đề, số phòng, số trang, và mọi SỐ TIỀN
 *    kiểu Việt (`Ngan sach khoa 1.000.000.000 dong`).
 *    Thứ vòng 6 đóng được là nửa CÓ TÍN HIỆU: `hasKeywordedIdCluster` chặn khi
 *    văn bản có TỪ KHOÁ căn cước (CCCD/CMND/căn cước/chứng minh nhân dân/chứng
 *    minh thư) VÀ có cụm chữ số tổng ID_MIN_DIGITS..ID_MAX_DIGITS. Nửa còn lại —
 *    CCCD cách nhóm, không từ khoá, không ngữ cảnh — nằm ngoài tầm của một bộ dò
 *    văn bản thuần và được chấp nhận có ý thức, không phải bỏ quên.
 */

/**
 * Ký tự KHÔNG chiếm chỗ khi hiển thị: dấu tổ hợp (`\p{M}` — dấu thanh rời,
 * variation selector, keycap), ký tự định dạng (`\p{Cf}` — zero-width space /
 * joiner, word joiner, BOM, soft hyphen, bidi override) và ký tự mà bảng mã
 * tuyên bố là bỏ qua được khi hiển thị (`\p{Default_Ignorable_Code_Point}`).
 * Chèn MỘT ký tự loại này vào giữa dãy số là lối né rẻ nhất có thể, vì người đọc
 * vẫn thấy `0912345678`. Vì vậy chúng phải bị XOÁ HẲN chứ không được coi là ký
 * tự phân cách: xoá thì dãy số dính liền trở lại và cả `hasPhone` lẫn
 * `ID_NUMBER` đều bắt được.
 *
 * Lớp thứ ba KHÔNG thừa, dù nó phủ gần hết `\p{Cf}`. Đúng bốn điểm mã —
 * `U+115F` `U+1160` (Hangul jamo filler), `U+3164` `U+FFA0` (Hangul filler) —
 * vừa vô hình vừa mang category `Lo`, tức là `\p{L}`. Với hai lớp đầu chúng
 * KHÔNG bị xoá, mà tư cách chữ cái còn cho chúng quyền CẮT CỤM (bước 2): chèn
 * một ký tự vào giữa `0326889114` là cả `hasPhone` lẫn `ID_NUMBER` cùng bó tay
 * trong khi người đọc thấy dãy số nguyên vẹn. Quét vét cạn 1 112 063 điểm mã
 * (thẩm định vòng 4, §3) cho thấy đó là TẬP ĐẦY ĐỦ các ký tự vô hình lọt qua cả
 * hai lớp — nên chỗ vá đúng là ở đây, ở bước XOÁ, chứ không phải thêm ngoại lệ
 * vào `LETTER`.
 *
 * Định nghĩa bằng ba lớp Unicode, KHÔNG liệt kê điểm mã. Xuống dòng không thuộc
 * lớp nào trong ba lớp này (U+2028/U+2029 là Zl/Zp và bị loại khỏi
 * Default_Ignorable vì là White_Space; `\n`/`\r` là Cc) nên vẫn cắt cụm.
 */
const INVISIBLE_MARK_OR_FORMAT =
  /[\p{M}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/** Mọi chữ số thập phân của mọi hệ chữ viết — không liệt kê dải nào. */
const UNICODE_DECIMAL_DIGIT = /\p{Nd}/gu;
const ONE_UNICODE_DECIMAL_DIGIT = /^\p{Nd}$/u;
/** Unicode định nghĩa một khối chữ số thập phân là đúng 10 điểm mã liên tiếp. */
const DECIMAL_BLOCK_SIZE = 10;

/** Chữ cái mọi hệ chữ — thứ DUY NHẤT (cùng xuống dòng) cắt đứt cụm chữ số. */
const LETTER = /\p{L}/u;
/** Xuống dòng — cũng cắt đứt cụm, kể cả U+2028/U+2029. */
const NEWLINE = /[\n\r\u2028\u2029]/;

/** Đoạn phân cách giữa hai nhóm chữ số dài tối đa 3 ký tự. */
const MAX_SEPARATOR_LENGTH = 3;
/** Số nhóm chỉ có 1 chữ số được phép trong một cửa sổ (xem đánh đổi #1). */
const MAX_SINGLE_DIGIT_GROUPS = 1;
/** Không số điện thoại nào trên thế giới dài quá 15 chữ số (ITU-T E.164). */
const MAX_PHONE_DIGITS = 15;
/** Số thuê bao quốc gia VN: 9 chữ số (di động/cố định hiện hành) hoặc 10. */
const NSN_MIN_DIGITS = 9;
const NSN_MAX_DIGITS = 10;
/** Chữ số đầu hợp lệ của NSN Việt Nam. */
const VN_NSN_LEAD_DIGITS = new Set(['2', '3', '5', '7', '8', '9']);
/**
 * Cận dưới E.164 cho số quốc tế có dấu `+` phía trước. Cận TRÊN không cần hằng
 * số riêng: vòng quét đã dừng ngay khi tổng chữ số vượt MAX_PHONE_DIGITS (15),
 * đúng bằng trần E.164.
 *
 * Đặt 9 chứ không phải 8 là quyết định đã đo: hạ về 8 mở thêm ba ca chặn nhầm
 * đời thường (`Diem cong +10 20 30 40`, `Ke hoach +2026 2027 se doi`,
 * `Bien do +25 30 35 40`) mà KHÔNG bắt thêm được số quốc tế thật nào — cả chín
 * định dạng đã kiểm (Đức, Mỹ, Nhật, Nga, Ấn, Brazil, Trung, Hàn, Pháp
 * `+33 6 12 34 56 78`) đều có từ 9 chữ số trở lên. Giá phải trả: số quốc tế có
 * tổng ĐÚNG 8 chữ số sẽ lọt.
 */
const INTERNATIONAL_MIN_DIGITS = 9;

/** `\S+` vế trái đòi ít nhất một ký tự trước `@`, nên `@` phải ở chỉ số >= 1. */
const EMAIL_LOCAL_MIN_AT_INDEX = 1;

/**
 * CCCD/CMND: 9-12 chữ số LIỀN NHAU — "8.5 9.0 7.5" không rơi vào đây.
 *
 * HỆ QUẢ ĐÃ BIẾT, ĐÃ ĐO, KHÔNG ĐÓNG ĐƯỢC BẰNG CẤU TRÚC: CCCD viết CÁCH NHÓM
 * đúng như in trên thẻ (`CCCD 038 203 001 234`, `CCCD 0382 0300 1234`,
 * `CMND 201 456 789`) LỌT qua cả lớp này lẫn bộ dò số điện thoại (11-12 chữ số
 * nằm ngoài cửa sổ NSN [9, 10] và không có `+` nên cửa sổ quốc tế không áp).
 *
 * Vòng 5 đã dựng và ĐO ba ứng viên nới lớp này sang "cụm chữ số" thay vì "chữ số
 * liền nhau"; cả ba đều bị bác vì sinh chặn nhầm diện rộng trên văn bản học vụ:
 *   - tổng 9-12 chữ số/cụm + cùng ràng buộc MAX_SINGLE_DIGIT_GROUPS: bắt cả ba
 *     ca CCCD nhưng làm ĐỎ 19/282 test và chặn nhầm 9/32 chuỗi học vụ tự sinh
 *     (`Ngan sach khoa 1.000.000.000 dong`, `Ma ho so noi bo 0234 5678 9012`,
 *     `Toa nha Alpha phong 0101 0102 0103`…);
 *   - siết thêm "mọi nhóm >= 3 chữ số, cách nhau đúng một dấu cách": vẫn chặn
 *     nhầm `Ma de 101 102 103 104`, `Phong 305 306 307 308`,
 *     `Doc giao trinh trang 102 135 210 245`, `Ma ho so noi bo 0234 5678 9012`;
 *   - siết tới "mọi nhóm ĐÚNG 3 chữ số": mất luôn `CCCD 0382 0300 1234` mà vẫn
 *     chặn nhầm ba chuỗi mã đề / phòng học / số trang ở trên.
 *
 * Lý do là cấu trúc chứ không phải thiếu công sức: `CCCD 0382 0300 1234` và
 * `Ma ho so noi bo 0234 5678 9012` GIỐNG HỆT nhau về hình dạng (ba nhóm bốn chữ
 * số, cách nhau một dấu cách, tổng 12) — chỉ khác GIÁ TRỊ chữ số. Không luật
 * hình dạng nào tách được chúng.
 *
 * VÒNG 6 đóng nửa CÓ TÍN HIỆU của lỗ này bằng `hasKeywordedIdCluster`: tín hiệu
 * lấy từ NGỮ CẢNH (từ khoá căn cước) chứ không từ hình dạng, nên không đụng tới
 * mã hồ sơ / số tiền. Nửa không từ khoá vẫn lọt — xem đánh đổi #8.
 */
const ID_NUMBER = /\d{9,12}/;
/**
 * Cận của cửa sổ "giống CCCD/CMND", giữ khớp với cặp lượng từ của `ID_NUMBER`
 * (`\d{9,12}`). `ID_NUMBER` đo chữ số LIỀN NHAU; `hasKeywordedIdCluster` đo TỔNG
 * chữ số của một CỬA SỔ nhóm trong cùng cụm. Dùng chung một cận để cùng một dãy
 * số không cho hai kết luận khác nhau tuỳ cách gõ cách nhóm.
 *
 * Cận TRÊN chỉ giới hạn từng cửa sổ, không giới hạn cả cụm: vòng quét thử mọi vị
 * trí bắt đầu nên một cụm dài hơn 12 chữ số vẫn bị bắt qua cửa sổ con 9-12 của
 * nó (`CCCD 038 203 001 2345` → cửa sổ `038 203 001` = 9). Đúng chiều mong muốn:
 * CCCD thật nằm gọn trong một cửa sổ như thế.
 */
const ID_MIN_DIGITS = 9;
const ID_MAX_DIGITS = 12;

/** Một cụm chữ số: các nhóm `\d+` nối nhau bằng đoạn phân cách ngắn. */
interface DigitCluster {
  readonly groups: readonly string[];
  /** Đoạn phân cách ngay TRƯỚC nhóm đầu tiên có chứa dấu `+` hay không. */
  readonly hasPlusPrefix: boolean;
}

function isAsciiDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isLetter(char: string): boolean {
  return LETTER.test(char);
}

function isNewline(char: string): boolean {
  return NEWLINE.test(char);
}

/**
 * Giá trị thập phân của MỘT chữ số Unicode bất kỳ, suy ra bằng CẤU TRÚC của
 * bảng mã thay vì bằng một bảng liệt kê — liệt kê là thứ đã làm hai vòng trước
 * thua, và một bảng dải chữ số sẽ luôn thiếu Devanagari, Bengali, Thái, Khmer,
 * Lào, Miến, N'Ko, Ol Chiki… hay bất cứ khối nào Unicode thêm về sau.
 *
 * Ràng buộc bảng mã được dùng ở đây: mỗi khối chữ số thập phân (`Nd`) là ĐÚNG 10
 * điểm mã liên tiếp bắt đầu từ chữ số 0 của khối đó. Suy ra một dãy `Nd` liên
 * tiếp bất kỳ luôn là các khối nguyên ghép lại, tức độ dài của nó là bội số của
 * 10 và mọi khối đều thẳng hàng theo mốc 10 tính từ đầu dãy. Vậy: lùi tới đầu
 * dãy `Nd` liên tiếp rồi lấy phần dư cho 10 là ra giá trị, luôn đúng kể cả với
 * các dãy ghép nhiều khối (U+1D7CE có 50 điểm mã liên tiếp — chỗ mà cách "lùi
 * tối đa 9 bước" cho kết quả SAI).
 *
 * Chi phí: mỗi ĐIỂM MÃ chỉ dò một lần rồi ghi nhớ, nên tổng chi phí vẫn tuyến
 * tính theo độ dài chuỗi; số bước lùi bị chặn bởi dãy `Nd` dài nhất của bảng mã
 * (một hằng số của Unicode, không phụ thuộc đầu vào).
 */
const decimalDigitValues = new Map<number, string>();

function decimalDigitValue(digit: string): string {
  const code = digit.codePointAt(0) ?? 0;
  const cached = decimalDigitValues.get(code);
  if (cached !== undefined) {
    return cached;
  }

  let blockRunStart = code;
  while (
    blockRunStart > 0 &&
    ONE_UNICODE_DECIMAL_DIGIT.test(String.fromCodePoint(blockRunStart - 1))
  ) {
    blockRunStart -= 1;
  }

  const value = String((code - blockRunStart) % DECIMAL_BLOCK_SIZE);
  decimalDigitValues.set(code, value);
  return value;
}

/**
 * Bước 1: xoá ký tự vô hình và đưa mọi kiểu chữ số về ASCII. Kết quả dùng cho
 * CẢ bộ dò số điện thoại LẪN `ID_NUMBER` — nếu chỉ dùng cho một trong hai thì
 * cái còn lại trở thành đường vòng miễn phí cho đúng những lối né này.
 */
function normalizeDigits(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE_MARK_OR_FORMAT, '')
    .replace(UNICODE_DECIMAL_DIGIT, decimalDigitValue);
}

/**
 * Đoạn phân cách đứng ngay trước nhóm chữ số đầu tiên có chứa `+` không.
 * Quét ngược tối đa MAX_SEPARATOR_LENGTH ký tự, dừng ở chữ cái/xuống dòng —
 * nhờ vậy `+ 84 …` và `(+84) …` vẫn được coi là có dấu `+`.
 *
 * KHÔNG cần chặn ở chữ số: hàm chỉ được gọi tại điểm bắt đầu một cụm MỚI, và
 * một chữ số nằm trong khoảng lùi <= MAX_SEPARATOR_LENGTH mà không bị chữ cái /
 * xuống dòng chắn trước thì chính đoạn ở giữa đã là một đoạn phân cách hợp lệ,
 * tức cụm đã phải bắt đầu từ chữ số đó chứ không phải ở đây. Nhánh
 * `isAsciiDigit` từng đứng đây là bất khả đạt (đột biến Z26: 0 test đỏ,
 * 0/400 000 khác biệt khi fuzz đối chiếu).
 */
function separatorBeforeHasPlus(text: string, digitStart: number): boolean {
  for (let offset = 1; offset <= MAX_SEPARATOR_LENGTH; offset += 1) {
    const position = digitStart - offset;
    if (position < 0) {
      return false;
    }
    const char = text[position];
    if (isLetter(char) || isNewline(char)) {
      return false;
    }
    if (char === '+') {
      return true;
    }
  }
  return false;
}

/**
 * Bước 2: cắt chuỗi đã chuẩn hoá thành các cụm chữ số. Mỗi ký tự được đọc đúng
 * một lần nên bước này tuyến tính theo độ dài chuỗi.
 */
function collectDigitClusters(text: string): DigitCluster[] {
  const clusters: DigitCluster[] = [];
  let index = 0;

  while (index < text.length) {
    if (!isAsciiDigit(text[index])) {
      index += 1;
      continue;
    }

    const groups: string[] = [];
    const hasPlusPrefix = separatorBeforeHasPlus(text, index);
    let cursor = index;

    for (;;) {
      const groupStart = cursor;
      while (cursor < text.length && isAsciiDigit(text[cursor])) {
        cursor += 1;
      }
      groups.push(text.slice(groupStart, cursor));

      let separatorEnd = cursor;
      while (
        separatorEnd < text.length &&
        !isAsciiDigit(text[separatorEnd]) &&
        !isLetter(text[separatorEnd])
      ) {
        separatorEnd += 1;
      }
      const separator = text.slice(cursor, separatorEnd);
      const continuesWithDigit =
        separatorEnd < text.length && isAsciiDigit(text[separatorEnd]);

      // Không cần xét `separator.length === 0`: vòng gom nhóm phía trên đã ăn hết
      // chữ số liền nhau, nên đoạn phân cách rỗng chỉ xảy ra khi `text[cursor]`
      // không phải chữ số — lúc đó `continuesWithDigit` đã false (đột biến Z31).
      if (
        !continuesWithDigit ||
        separator.length > MAX_SEPARATOR_LENGTH ||
        NEWLINE.test(separator)
      ) {
        break;
      }
      cursor = separatorEnd;
    }

    clusters.push({ groups, hasPlusPrefix });
    index = cursor;
  }

  return clusters;
}

/**
 * Bóc tiền tố quốc gia để lấy số thuê bao quốc gia (NSN). Trả `null` khi dãy
 * chữ số không có dạng số Việt Nam.
 */
function withoutVietnamCountryCode(digits: string): string {
  const nsn = digits.slice(2);
  return nsn.startsWith('0') ? nsn.slice(1) : nsn;
}

function nationalSignificantNumber(digits: string): string | null {
  if (digits.startsWith('0084')) {
    return digits.slice(4);
  }
  // Không cần điều kiện độ dài ở đây: dãy mở đầu bằng `84` mà ngắn hơn 11 chữ số
  // cho NSN <= 8 chữ số, đã bị cửa sổ [9, 10] loại — y hệt kết quả cũ (trả null
  // rồi bị loại). Đột biến Z13 hạ `>= 11` xuống `>= 10` không quan sát được.
  // Vì thế dấu `+` cũng không còn nói được điều gì ở nhánh này.
  if (digits.startsWith('84')) {
    return withoutVietnamCountryCode(digits);
  }
  if (digits.startsWith('0')) {
    let start = 0;
    while (start < digits.length && digits[start] === '0') {
      start += 1;
    }
    const withoutLeadingZeros = digits.slice(start);
    // `000084912345678`: nhánh `0084` ở trên không khớp vì dãy mở đầu bằng bốn
    // số 0. Sau khi bỏ hết số 0 dẫn đầu thì mã nước 84 mới lộ ra; không xét lại
    // ở đây thì dãy vẫn bị chặn nhưng ra nhãn CCCD, tức chỉ sai chỗ cho người
    // dùng. Điều kiện dài >= 11 ở ĐÂY thì KHÔNG thừa (khác nhánh `84` phía
    // trên): bỏ nó đi thì `000841234567` mất chín chữ số `841234567` — dãy vẫn
    // hợp lệ theo cửa sổ NSN — nên phải giữ.
    return withoutLeadingZeros.startsWith('84') &&
      withoutLeadingZeros.length >= 11
      ? withoutVietnamCountryCode(withoutLeadingZeros)
      : withoutLeadingZeros;
  }
  return null;
}

function looksLikeVietnamesePhone(digits: string): boolean {
  const nsn = nationalSignificantNumber(digits);
  if (nsn === null) {
    return false;
  }
  return (
    nsn.length >= NSN_MIN_DIGITS &&
    nsn.length <= NSN_MAX_DIGITS &&
    VN_NSN_LEAD_DIGITS.has(nsn[0])
  );
}

/**
 * Bước 3: thử MỌI vị trí nhóm bắt đầu. Thử từ mọi `i` là thứ diệt lớp "che bóng
 * tiền tố": `khoa 2026 0912 345 678` phải xét được cả cửa sổ bắt đầu từ `0912`,
 * không chỉ cửa sổ tham lam bắt đầu từ `2026`.
 */
function clusterLooksLikePhone(cluster: DigitCluster): boolean {
  const { groups, hasPlusPrefix } = cluster;

  for (let start = 0; start < groups.length; start += 1) {
    // Dấu `+` chỉ đứng trước nhóm ĐẦU TIÊN của cụm, nên nó chỉ nói được điều gì
    // về cửa sổ bắt đầu tại nhóm đó. Áp cho mọi cửa sổ thì `Diem cong +10 20 30
    // 40` bị đọc thành số quốc tế — dấu `+` cách nhóm `20 30 40` bằng cả một
    // nhóm số khác mà vẫn "bảo lãnh" cho nó.
    const windowHasPlus = hasPlusPrefix && start === 0;
    let digits = '';
    let singleDigitGroups = 0;

    for (let end = start; end < groups.length; end += 1) {
      const group = groups[end];
      if (group.length === 1) {
        singleDigitGroups += 1;
        if (singleDigitGroups > MAX_SINGLE_DIGIT_GROUPS) {
          break;
        }
      }

      digits += group;
      if (digits.length > MAX_PHONE_DIGITS) {
        break;
      }

      if (looksLikeVietnamesePhone(digits)) {
        return true;
      }
      // Cận trên của cửa sổ quốc tế chính là `MAX_PHONE_DIGITS` đã kiểm ngay
      // phía trên, nên không xét lại lần nữa (đột biến Z32).
      if (windowHasPlus && digits.length >= INTERNATIONAL_MIN_DIGITS) {
        return true;
      }
    }
  }

  return false;
}

function hasPhone(normalized: string): boolean {
  return collectDigitClusters(normalized).some(clusterLooksLikePhone);
}

/**
 * Dò email TUYẾN TÍNH, thay cho regex `/\S+@\S+\.\S+/` vốn có `\S+` hai đầu và
 * backtracking bậc hai (đo được 6.6 ms ở trần 2000 ký tự của body tin nhắn,
 * 1.4 s ở 30 000 ký tự — và mẹo chặn sớm `text.includes('@')` KHÔNG xoá được chi
 * phí đó, nó chỉ dời điều kiện kích hoạt sang "có ít nhất một `@`").
 *
 * Ngữ nghĩa giữ nguyên tuyệt đối so với `/\S+@\S+\.\S+/`: cắt chuỗi theo khoảng
 * trắng, trong mỗi token tìm dấu `@` đầu tiên có ít nhất một ký tự đứng trước
 * (tương đương `\S+` vế trái), rồi tìm một dấu `.` cách `@` ít nhất một ký tự và
 * không phải ký tự cuối token (tương đương `\S+\.\S+` vế phải). Dùng dấu `@`
 * đầu tiên là tối ưu: mọi dấu `.` hợp lệ với một `@` đứng sau đều hợp lệ với nó.
 * Nhờ vậy `ten@@domain.com` vẫn bị bắt.
 *
 * Ghi chú lệch nhẹ so với brief: brief đề nghị loại các `@` có ký tự liền trước
 * cũng là `@`. Bỏ điều kiện đó mới đúng bằng ngữ nghĩa cũ (`@@b.c` regex cũ có
 * bắt), và chỉ khiến bộ dò chặn NHIỀU hơn — đúng chiều bất đối xứng chi phí.
 *
 * CHẠY TRÊN CHUỖI ĐÃ CHUẨN HOÁ, không phải chuỗi gốc. Hai vòng trước làm ngược
 * lại với lý do "NFKC có thể đổi ngữ nghĩa token (ligature, fullwidth `＠`)" —
 * lập luận đó sai chiều: NFKC gấp `＠`→`@` và `．`/`﹒`/`․`→`.` chính là thứ BẮT
 * được lối né, và `nguyenvana＠fpt．edu．vn` lọt sạch chừng nào bộ dò còn đọc
 * chuỗi gốc. Bước chuẩn hoá chỉ xoá ký tự vô hình và gấp biến thể tương thích
 * về ASCII, tức mọi thay đổi nó gây ra đều làm bộ dò chặn NHIỀU hơn.
 */
function hasEmail(text: string): boolean {
  for (const token of text.split(/\s+/)) {
    const atIndex = token.indexOf('@', EMAIL_LOCAL_MIN_AT_INDEX);
    if (atIndex === -1) {
      continue;
    }
    const dotIndex = token.indexOf('.', atIndex + 2);
    if (dotIndex !== -1 && dotIndex <= token.length - 2) {
      return true;
    }
  }
  return false;
}

/**
 * Dấu tổ hợp — dùng để GẤP DẤU tiếng Việt trước khi so từ khoá.
 *
 * Không dùng lại INVISIBLE_MARK_OR_FORMAT được: nó có cờ `g` và mang trạng thái
 * `lastIndex`, và quan trọng hơn là nó chạy SAU `NFKC` (dạng dựng sẵn), nên tới
 * lúc đó `ă` `ứ` đã là MỘT điểm mã và không còn dấu tổ hợp nào để xoá. Muốn gấp
 * dấu thì phải NFD (tách ra) rồi mới xoá — đúng thứ tự ngược lại.
 */
const COMBINING_MARK = /\p{M}/gu;

/**
 * Từ khoá căn cước, viết thường và ĐÃ GẤP DẤU (so bằng `foldForKeywordMatch`).
 * Nhờ vậy một mục trong bảng này phủ cả `CCCD`/`cccd`/`Ｃｃｃｄ`,
 * `căn cước`/`CĂN CƯỚC`/`can cuoc`, và mọi cách trộn hoa thường / có dấu.
 *
 * Chọn tập này chứ không rộng hơn:
 *   - `so can cuoc`, `can cuoc cong dan`, `so cccd`, `giay cmnd` KHÔNG cần liệt
 *     kê: chúng CHỨA `can cuoc` / `cccd` / `cmnd` nên đã khớp bằng substring.
 *   - `chung minh thu` (chứng minh thư) là tên gọi dân dã của cùng giấy tờ, thêm
 *     vào vì rủi ro bằng 0: cổng còn đòi thêm cụm 9-12 chữ số mới chặn.
 *   - `chung minh` TRẦN thì KHÔNG thêm: trong văn bản học vụ nó là động từ
 *     ("chứng minh bất đẳng thức", "chứng minh bài toán"), khớp trần sẽ kéo cả
 *     họ đó vào cổng.
 *   - `cmt` (viết tắt của chứng minh thư) KHÔNG thêm: trong tin nhắn nội bộ nó
 *     trùng với "comment", và ba chữ cái này còn nằm lọt trong nhiều từ khác.
 *   - Hộ chiếu / passport KHÔNG thêm: nhãn trả về là "dãy số giống CCCD/CMND",
 *     mở sang giấy tờ khác là đổi phạm vi, phải do người điều phối quyết.
 */
const ID_KEYWORDS: readonly string[] = [
  'cccd',
  'cmnd',
  'can cuoc',
  'chung minh nhan dan',
  'chung minh thu',
];

/**
 * Gấp một chuỗi ĐÃ CHUẨN HOÁ về dạng so từ khoá: bỏ dấu tiếng Việt và viết
 * thường. NFD tách `ứ` thành `u` + dấu, `COMBINING_MARK` xoá phần dấu.
 *
 * Đầu vào BẮT BUỘC là bản đã qua `normalizeDigits`. Chạy trên chuỗi gốc thì
 * `ＣＣＣＤ` (fullwidth, chỉ NFKC mới gấp về ASCII) và `CC<ZWSP>CD` (ký tự vô
 * hình, chỉ bước xoá mới bỏ) đều đi vòng qua cổng — cùng đúng những lối né mà
 * bước chuẩn hoá sinh ra để bịt.
 */
function foldForKeywordMatch(normalized: string): string {
  return normalized.normalize('NFD').replace(COMBINING_MARK, '').toLowerCase();
}

function hasIdKeyword(normalized: string): boolean {
  const folded = foldForKeywordMatch(normalized);
  return ID_KEYWORDS.some((keyword) => folded.includes(keyword));
}

/**
 * Cổng từ khoá (vòng 6): TỪ KHOÁ căn cước VÀ một cửa sổ nhóm chữ số có tổng
 * ID_MIN_DIGITS..ID_MAX_DIGITS ⇒ chặn. Đây là thứ bắt được CCCD viết cách nhóm
 * (`CCCD 038 203 001 234`, `CCCD 0382 0300 1234`, `CMND 201 456 789`) mà
 * `ID_NUMBER` — vốn chỉ đo chữ số liền nhau — không với tới.
 *
 * Vì sao gác bằng TỪ KHOÁ chứ không bằng hình dạng: xem đánh đổi #8. Tín hiệu
 * ngữ cảnh không đụng tới `Ma ho so noi bo 0234 5678 9012` hay
 * `Ngan sach khoa 1.000.000.000 dong` — đó là lý do cổng này sinh 0 chặn nhầm
 * trên toàn bộ 80 chuỗi học vụ đối chứng, trong khi cả ba luật hình dạng đã đo
 * đều chặn nhầm từ 5 tới 13 chuỗi.
 *
 * Dùng lại NGUYÊN bộ máy của bước 2/3 (cụm, cửa sổ nhóm, MAX_SINGLE_DIGIT_GROUPS)
 * chứ không tự cắt chuỗi: mọi lối né đã bịt cho số điện thoại (phân cách lạ, ký
 * tự vô hình, chữ số phi ASCII) tự động áp cho cổng này. Giữ
 * MAX_SINGLE_DIGIT_GROUPS để cùng một câu không cho hai kết luận khác nhau; hệ
 * quả là `CCCD 1 2 3 4 5 6 7 8 9` (gõ giãn từng chữ số) lọt, đúng như đánh đổi
 * #1 đã chốt cho số điện thoại.
 *
 * Chi phí vẫn tuyến tính: `foldForKeywordMatch` quét chuỗi một lần, năm phép
 * `includes` là tìm chuỗi con tuyến tính, và vòng quét nhóm dừng ngay khi tổng
 * vượt ID_MAX_DIGITS nên mỗi vị trí bắt đầu chỉ chạy tối đa 13 vòng.
 */
function hasKeywordedIdCluster(normalized: string): boolean {
  if (!hasIdKeyword(normalized)) {
    return false;
  }
  for (const cluster of collectDigitClusters(normalized)) {
    const { groups } = cluster;
    for (let start = 0; start < groups.length; start += 1) {
      let digits = 0;
      let singleDigitGroups = 0;
      for (let end = start; end < groups.length; end += 1) {
        const group = groups[end];
        if (group.length === 1) {
          singleDigitGroups += 1;
          if (singleDigitGroups > MAX_SINGLE_DIGIT_GROUPS) {
            break;
          }
        }
        digits += group.length;
        if (digits > ID_MAX_DIGITS) {
          break;
        }
        if (digits >= ID_MIN_DIGITS) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Trả nhãn loại PII tìm thấy, hoặc null nếu nội dung sạch. */
export function detectPii(text: string): string | null {
  // Chuẩn hoá MỘT lần rồi dùng cho CẢ BA bộ dò. `ID_NUMBER` chạy trên chuỗi gốc
  // thì `CCCD ０３８２０３００１２３４` và `CCCD 038203<ZWSP>001234` lọt sạch; bộ dò
  // email chạy trên chuỗi gốc thì `nguyenvana＠fpt．edu．vn` lọt sạch — đều là
  // những lối né mà bước 1 sinh ra để bịt.
  const normalized = normalizeDigits(text);
  if (hasPhone(normalized)) {
    return 'số điện thoại';
  }
  if (hasEmail(normalized)) {
    return 'địa chỉ email';
  }
  if (ID_NUMBER.test(normalized) || hasKeywordedIdCluster(normalized)) {
    return 'dãy số giống CCCD/CMND';
  }
  return null;
}

/** Ném BadRequest kèm mã nghiệp vụ khi nội dung chứa PII bị cấm. */
export function assertNoPii(text: string): void {
  const found = detectPii(text);
  if (!found) {
    return;
  }
  throw new BadRequestException({
    code: PII_IN_MESSAGE,
    message:
      `Nội dung có vẻ chứa ${found}. Theo quy định bảo mật, hệ thống không lưu ` +
      'số điện thoại, email, CCCD/CMND hay địa chỉ. Vui lòng bỏ thông tin đó rồi gửi lại.',
  });
}
