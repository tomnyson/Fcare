import type { Prisma } from '@prisma/client';
import type { RoleKey } from '@fcare/shared-types';
import type { AuthUser } from '../types/auth-user';

/** Giá trị chắc chắn không khớp id nào — người bị scope mà chưa có bộ môn thì không thấy gì. */
export const NO_DEPARTMENT = '__no_department__';

/** Các vai trò được xem dữ liệu sinh viên toàn trường. */
const UNSCOPED_ROLES: readonly RoleKey[] = [
  'ADMIN',
  'TRAINING_OFFICER',
  'SA_OFFICER',
  'SA_HEAD',
];

/** Giảng viên và trưởng bộ môn không được xem dữ liệu sinh viên toàn trường. */
export function isDeptScoped(user: AuthUser): boolean {
  return !user.roles.some((role) => UNSCOPED_ROLES.includes(role));
}

/**
 * Trưởng bộ môn quản lý cả bộ môn nên thấy toàn bộ sinh viên của bộ môn mình;
 * giảng viên thuần thì KHÔNG — họ chỉ thấy sinh viên các lớp học phần mình
 * đứng lớp (quyết định của chủ nhiệm hệ thống, xem [[fcare-security-constraints]]).
 */
export function seesWholeDepartment(user: AuthUser): boolean {
  return isDeptScoped(user) && user.roles.includes('HEAD_OF_DEPT');
}

/**
 * Điều kiện Prisma giới hạn theo bộ môn. Người dùng bị scope mà không có
 * bộ môn thì không thấy gì (filter theo giá trị không tồn tại).
 */
export function deptFilter(user: AuthUser): { departmentId?: string } {
  if (!isDeptScoped(user)) {
    return {};
  }
  return { departmentId: user.departmentId ?? NO_DEPARTMENT };
}

/**
 * Phạm vi sinh viên của người dùng bị scope:
 * - Giảng viên: CHỈ sinh viên đang học lớp học phần do mình phụ trách.
 * - Trưởng bộ môn: sinh viên bộ môn mình HOẶC sinh viên lớp mình phụ trách
 *   (TBM vẫn có thể dạy chéo lớp của bộ môn khác).
 *
 * Bọc trong `AND` là CỐ Ý: nơi gọi thường spread fragment này cạnh một `OR`
 * khác (vd: ô tìm kiếm trong `students.service.list`) — nếu trả `OR` trần thì
 * spread sau sẽ ghi đè `OR` của scope và mở toang dữ liệu toàn trường.
 */
export function studentScope(user: AuthUser): Prisma.StudentWhereInput {
  if (!isDeptScoped(user)) {
    return {};
  }
  const taught: Prisma.StudentWhereInput = {
    enrollments: { some: { classSection: { lecturerId: user.id } } },
  };
  if (!seesWholeDepartment(user)) {
    return { AND: [taught] };
  }
  return {
    AND: [
      {
        OR: [{ departmentId: user.departmentId ?? NO_DEPARTMENT }, taught],
      },
    ],
  };
}

/**
 * Phạm vi lớp học phần tương ứng: giảng viên chỉ thấy lớp mình đứng tên, trưởng
 * bộ môn thấy thêm lớp của môn thuộc bộ môn mình. `ClassSection` không có
 * `departmentId` nên phải đi vòng qua `Subject` (cùng cách statistics.service làm).
 */
export function sectionScope(user: AuthUser): Prisma.ClassSectionWhereInput {
  if (!isDeptScoped(user)) {
    return {};
  }
  if (!seesWholeDepartment(user)) {
    return { AND: [{ lecturerId: user.id }] };
  }
  return {
    AND: [
      {
        OR: [
          { subject: { departmentId: user.departmentId ?? NO_DEPARTMENT } },
          { lecturerId: user.id },
        ],
      },
    ],
  };
}

/** Chỉ cần `student.count` — nhận cả PrismaService lẫn transaction client. */
interface StudentCountClient {
  student: {
    count(args: { where: Prisma.StudentWhereInput }): Promise<number>;
  };
}

/**
 * Kiểm tra một sinh viên có nằm trong phạm vi của người dùng không. Dùng cho
 * các chỗ đã trót load bản ghi rồi mới so sánh — so `departmentId` bằng tay
 * không còn đủ từ khi phạm vi mở rộng theo lớp đang dạy.
 */
export async function isStudentInScope(
  prisma: StudentCountClient,
  user: AuthUser,
  studentId: string,
): Promise<boolean> {
  if (!isDeptScoped(user)) {
    return true;
  }
  const count = await prisma.student.count({
    where: { id: studentId, ...studentScope(user) },
  });
  return count > 0;
}

/**
 * Phạm vi giảng viên cho bảng thống kê theo giáo viên.
 *
 * Cố ý CHẶT hơn `sectionScope`: giảng viên thuần chỉ thấy đúng dòng của chính
 * mình, để bảng số liệu không biến thành bảng xếp hạng đồng nghiệp. Trưởng bộ
 * môn và các vai trò toàn trường vẫn cần so sánh giữa các giảng viên nên được
 * nhìn rộng — đây là công việc quản lý của họ.
 */
export function lecturerStatsScope(user: AuthUser): Prisma.StaffWhereInput {
  if (!isDeptScoped(user)) {
    return {};
  }
  if (seesWholeDepartment(user)) {
    return { departmentId: user.departmentId ?? NO_DEPARTMENT };
  }
  return { id: user.id };
}

/** Giảng viên thuần (không phải TBM, không có vai trò toàn trường). */
export function isPureLecturer(user: AuthUser): boolean {
  return isDeptScoped(user) && !seesWholeDepartment(user);
}

/**
 * Lớp học phần "thuộc bộ môn" là lớp của MÔN do bộ môn quản — không xét bộ môn
 * của sinh viên, vì GV bộ môn Cơ bản dạy SV của mọi ngành.
 */
function ownDepartmentSections(user: AuthUser): Prisma.ClassSectionWhereInput {
  return {
    lecturerId: user.id,
    subject: { departmentId: user.departmentId ?? NO_DEPARTMENT },
  };
}

/**
 * Phạm vi sinh viên cho màn THỐNG KÊ: giảng viên thuần chỉ thấy số liệu của
 * bộ môn mình — SV học lớp mình dạy của môn thuộc bộ môn mình. Lớp dạy chéo
 * môn bộ môn khác vẫn chăm sóc được (`studentScope`) nhưng không lên thống kê.
 * Luôn CHẶT hơn hoặc bằng `studentScope`, không bao giờ rộng hơn.
 */
export function statsStudentScope(user: AuthUser): Prisma.StudentWhereInput {
  if (!isPureLecturer(user)) {
    return studentScope(user);
  }
  return {
    AND: [
      { enrollments: { some: { classSection: ownDepartmentSections(user) } } },
    ],
  };
}

/**
 * Như `studentScope` nhưng nhánh "lớp mình dạy" phải khớp CÙNG một lượt đăng ký
 * với `enrollment` (vd. `{ classSection: { term } }`). Ghép `studentScope` với
 * một `enrollments.some` riêng thì hai điều kiện rời nhau: SV giảng viên dạy kỳ
 * trước, nay học lớp người khác trong kỳ này, vẫn bị đếm vào "SV kỳ này".
 * Nhánh bộ môn của TBM không đổi — người gọi tự thêm điều kiện đăng ký nếu cần.
 */
export function studentScopeWithin(
  user: AuthUser,
  enrollment: Prisma.EnrollmentWhereInput,
): Prisma.StudentWhereInput {
  if (!isDeptScoped(user)) {
    return {};
  }
  const taught: Prisma.StudentWhereInput = {
    enrollments: {
      some: { AND: [enrollment, { classSection: { lecturerId: user.id } }] },
    },
  };
  if (!seesWholeDepartment(user)) {
    return { AND: [taught] };
  }
  return {
    AND: [
      { OR: [{ departmentId: user.departmentId ?? NO_DEPARTMENT }, taught] },
    ],
  };
}

/** Như `statsStudentScope` cho lớp học phần: lớp mình dạy của môn thuộc bộ môn mình. */
export function statsSectionScope(
  user: AuthUser,
): Prisma.ClassSectionWhereInput {
  if (!isPureLecturer(user)) {
    return sectionScope(user);
  }
  return { AND: [ownDepartmentSections(user)] };
}
