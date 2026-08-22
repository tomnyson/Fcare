/**
 * Danh mục thật trích từ hai file nguồn (xem spec §2.4).
 * Tách khỏi seed.ts để test được mà không cần kết nối DB.
 */

export const DEPARTMENTS: Array<{ code: string; name: string }> = [
  { code: 'CNTT', name: 'Công nghệ thông tin' },
  { code: 'COBAN', name: 'Cơ bản' },
  { code: 'NGONNGU', name: 'Ngôn ngữ' },
  { code: 'TMDT', name: 'Thương mại điện tử' },
  { code: 'KINHTE', name: 'Kinh tế' },
  { code: 'TKDH', name: 'Thiết kế đồ hoạ' },
  { code: 'UDPM', name: 'Ứng dụng phần mềm' },
  { code: 'DLNHKS', name: 'Du lịch — Nhà hàng — Khách sạn' },
  { code: 'CODIEN', name: 'Cơ điện' },
  { code: 'KBEAUTY', name: 'K-Beauty' },
  { code: 'QHDN', name: 'Quan hệ doanh nghiệp' },
  { code: 'GDQP', name: 'Giáo dục quốc phòng' },
];

export const MAJORS: Array<{ code: string; name: string; deptCode: string }> = [
  { code: 'LTAI', name: 'Lập trình trí tuệ nhân tạo', deptCode: 'CNTT' },
  { code: 'LTWE', name: 'Lập trình web', deptCode: 'CNTT' },
  { code: 'PTPM', name: 'Phát triển phần mềm', deptCode: 'CNTT' },
  { code: 'LTGA', name: 'Lập trình game', deptCode: 'CNTT' },
  { code: 'UDPM', name: 'Ứng dụng phần mềm', deptCode: 'UDPM' },
  { code: 'TKDH', name: 'Thiết kế đồ hoạ', deptCode: 'TKDH' },
  { code: 'DIGI', name: 'Digital Marketing', deptCode: 'TMDT' },
  { code: 'TTSK', name: 'Tổ chức sự kiện', deptCode: 'TMDT' },
  { code: 'MASA', name: 'Marketing & Sales', deptCode: 'TMDT' },
  { code: 'LOGI', name: 'Logistics', deptCode: 'KINHTE' },
];

/**
 * Hai file nguồn dùng hai hệ mã khác nhau cho cùng một bộ môn, nên seed cả hai
 * dạng. `THUC-TAP-TN` CỐ Ý không có ở đây — file nguồn không có bộ môn đối ứng,
 * nó phải nổi lên ở bản xem trước để admin ánh xạ tay (spec §8 rủi ro 3).
 */
export const DEPARTMENT_ALIASES: Array<{ alias: string; deptCode: string }> = [
  // Dạng viết hoa gạch nối của sheet "Lịch tool"
  { alias: 'CONG-NGHE-THONG-TIN', deptCode: 'CNTT' },
  { alias: 'CO-BAN', deptCode: 'COBAN' },
  { alias: 'NGON-NGU', deptCode: 'NGONNGU' },
  { alias: 'THUONG-MAI-DIEN-TU', deptCode: 'TMDT' },
  { alias: 'KINH-TE', deptCode: 'KINHTE' },
  { alias: 'THIET-KE-DO-HOA', deptCode: 'TKDH' },
  { alias: 'UNG-DUNG-PHAN-MEM', deptCode: 'UDPM' },
  // Nhãn tiếng Việt có dấu của sheet "3.1.Môn-BM"
  { alias: 'CNTT', deptCode: 'CNTT' },
  { alias: 'Cơ bản', deptCode: 'COBAN' },
  { alias: 'Ngôn ngữ', deptCode: 'NGONNGU' },
  { alias: 'TMĐT', deptCode: 'TMDT' },
  { alias: 'Kinh tế', deptCode: 'KINHTE' },
  { alias: 'TKĐH', deptCode: 'TKDH' },
  { alias: 'UDPM', deptCode: 'UDPM' },
  { alias: 'DLNHKS', deptCode: 'DLNHKS' },
  { alias: 'Cơ Điện', deptCode: 'CODIEN' },
  { alias: 'Kbeauty', deptCode: 'KBEAUTY' },
  { alias: 'QHDN', deptCode: 'QHDN' },
  { alias: 'GDQP', deptCode: 'GDQP' },
];

/**
 * Trích từ cột `Ngành` của sheet `BL1+BL2`, đối chiếu với tiền tố mã lớp.
 * LƯU Ý: "UDPM" vừa là mã ngành vừa là mã bộ môn — hai không gian tên khác nhau,
 * không được dùng chung bảng tra.
 */
export const CLASS_MAJOR_RULES: Array<{ classPrefix: string; majorCode: string }> = [
  { classPrefix: 'AI', majorCode: 'LTAI' },
  { classPrefix: 'WD', majorCode: 'LTWE' },
  { classPrefix: 'SD', majorCode: 'PTPM' },
  { classPrefix: 'GA', majorCode: 'LTGA' },
  { classPrefix: 'SA', majorCode: 'UDPM' },
  { classPrefix: 'GD', majorCode: 'TKDH' },
  { classPrefix: 'DM', majorCode: 'DIGI' },
  { classPrefix: 'MC', majorCode: 'TTSK' },
  { classPrefix: 'MS', majorCode: 'MASA' },
  { classPrefix: 'LO', majorCode: 'LOGI' },
];
