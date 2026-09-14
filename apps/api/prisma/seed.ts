/**
 * Seed dữ liệu demo cho FCare — idempotent (chạy lại không tạo trùng).
 * Mọi tài khoản demo dùng mật khẩu: Fcare@123
 *
 * LƯU Ý BẢO MẬT: tuyệt đối không seed CCCD/SĐT/email/địa chỉ — các trường này
 * không tồn tại trong schema theo tài liệu nghiệp vụ.
 */
import { AlertStatus, CareChannel, EnrollmentResult, EvaluationCriterion, PrismaClient, StudentStatus, TermSeason } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  CLASS_MAJOR_RULES,
  DEPARTMENT_ALIASES,
  DEPARTMENTS,
  MAJOR_ALIASES,
  MAJORS,
} from './seed-data';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Fcare@123';

const ROLES = [
  { key: 'ADMIN', name: 'Quản trị hệ thống' },
  { key: 'HEAD_OF_DEPT', name: 'Trưởng bộ môn' },
  { key: 'LECTURER', name: 'Giảng viên' },
  { key: 'TRAINING_OFFICER', name: 'Cán bộ Đào tạo' },
  { key: 'SA_OFFICER', name: 'Cán bộ CTSV' },
  { key: 'SA_HEAD', name: 'Trưởng phòng CTSV' },
];

const STAFF: Array<{
  staffCode: string;
  fullName: string;
  deptCode: string | null;
  roles: string[];
}> = [
  { staffCode: 'admin', fullName: 'Quản trị viên hệ thống', deptCode: null, roles: ['ADMIN'] },
  { staffCode: 'tbm.se', fullName: 'Trần Minh Quân', deptCode: 'CNTT', roles: ['HEAD_OF_DEPT'] },
  { staffCode: 'tbm.ai', fullName: 'Lê Thu Trang', deptCode: 'CNTT', roles: ['HEAD_OF_DEPT'] },
  { staffCode: 'gv.binh', fullName: 'Nguyễn Thanh Bình', deptCode: 'CNTT', roles: ['LECTURER'] },
  { staffCode: 'gv.chi', fullName: 'Phạm Kim Chi', deptCode: 'CNTT', roles: ['LECTURER'] },
  { staffCode: 'gv.dung', fullName: 'Đỗ Việt Dũng', deptCode: 'CNTT', roles: ['LECTURER'] },
  { staffCode: 'dt.hoa', fullName: 'Vũ Thị Hoa', deptCode: null, roles: ['TRAINING_OFFICER'] },
  { staffCode: 'ctsv.lan', fullName: 'Bùi Ngọc Lan', deptCode: null, roles: ['SA_OFFICER'] },
  { staffCode: 'ctsv.truong', fullName: 'Hoàng Văn Trường', deptCode: null, roles: ['SA_HEAD'] },
];

const GIVEN_NAMES = [
  'An', 'Bảo', 'Cường', 'Dương', 'Giang', 'Hà', 'Hải', 'Khánh',
  'Linh', 'Minh', 'Nam', 'Ngọc', 'Phong', 'Quỳnh', 'Sơn', 'Thảo',
  'Trung', 'Tuấn', 'Uyên', 'Vy', 'Xuân', 'Yến', 'Đạt', 'Hùng',
];
const FAMILY_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ===== Vai trò =====
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name },
      create: role,
    });
  }
  const roleByKey = new Map(
    (await prisma.role.findMany()).map((role) => [role.key, role.id]),
  );

  // ===== Bộ môn / ngành / môn học =====
  for (const department of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: department.code },
      update: { name: department.name },
      create: department,
    });
  }
  const deptByCode = new Map(
    (await prisma.department.findMany()).map((dept) => [dept.code, dept.id]),
  );

  // ===== Ngành học =====
  for (const major of MAJORS) {
    const department = await prisma.department.findUniqueOrThrow({
      where: { code: major.deptCode },
    });
    await prisma.major.upsert({
      where: { code: major.code },
      update: { name: major.name, departmentId: department.id },
      create: {
        code: major.code,
        name: major.name,
        departmentId: department.id,
      },
    });
  }

  // ===== Alias bộ môn =====
  for (const entry of DEPARTMENT_ALIASES) {
    const department = await prisma.department.findUniqueOrThrow({
      where: { code: entry.deptCode },
    });
    await prisma.departmentAlias.upsert({
      where: { alias: entry.alias },
      update: { departmentId: department.id },
      create: { alias: entry.alias, departmentId: department.id },
    });
  }

  // ===== Alias ngành =====
  for (const entry of MAJOR_ALIASES) {
    const major = await prisma.major.findUniqueOrThrow({
      where: { code: entry.majorCode },
    });
    await prisma.majorAlias.upsert({
      where: { alias: entry.alias },
      update: { majorId: major.id },
      create: { alias: entry.alias, majorId: major.id },
    });
  }

  // ===== Quy tắc lớp → ngành =====
  for (const rule of CLASS_MAJOR_RULES) {
    const major = await prisma.major.findUniqueOrThrow({
      where: { code: rule.majorCode },
    });
    await prisma.classMajorRule.upsert({
      where: { classPrefix: rule.classPrefix },
      update: { majorId: major.id },
      create: { classPrefix: rule.classPrefix, majorId: major.id },
    });
  }

  const majorByCode = new Map((await prisma.major.findMany()).map((major) => [major.code, major]));

  const subjects = [
    { code: 'PRF192', name: 'Programming Fundamentals', credits: 3, deptCode: 'CNTT' },
    { code: 'PRO192', name: 'Object-Oriented Programming', credits: 3, deptCode: 'CNTT' },
    { code: 'DBI202', name: 'Database Systems', credits: 3, deptCode: 'CNTT' },
    { code: 'AIL303', name: 'Machine Learning', credits: 3, deptCode: 'CNTT' },
    { code: 'DGD201', name: 'Visual Design Tools', credits: 3, deptCode: 'TKDH' },
  ];
  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: { name: subject.name, credits: subject.credits },
      create: {
        code: subject.code,
        name: subject.name,
        credits: subject.credits,
        departmentId: deptByCode.get(subject.deptCode)!,
      },
    });
  }
  const subjectByCode = new Map(
    (await prisma.subject.findMany()).map((subject) => [subject.code, subject.id]),
  );

  // ===== Nhân sự =====
  for (const member of STAFF) {
    const staff = await prisma.staff.upsert({
      where: { staffCode: member.staffCode },
      update: { fullName: member.fullName },
      create: {
        staffCode: member.staffCode,
        fullName: member.fullName,
        departmentId: member.deptCode ? deptByCode.get(member.deptCode) : undefined,
        passwordHash,
      },
    });
    for (const roleKey of member.roles) {
      await prisma.staffRole.upsert({
        where: { staffId_roleId: { staffId: staff.id, roleId: roleByKey.get(roleKey)! } },
        update: {},
        create: { staffId: staff.id, roleId: roleByKey.get(roleKey)! },
      });
    }
  }
  const staffByCode = new Map(
    (await prisma.staff.findMany()).map((staff) => [staff.staffCode, staff]),
  );

  // ===== Sinh viên =====
  const studentPlans = [
    { prefix: 'SE19', majorCode: 'PTPM', classCode: 'SE1901', count: 8 },
    { prefix: 'SE19', majorCode: 'PTPM', classCode: 'SE1902', count: 8, offset: 8 },
    { prefix: 'AI19', majorCode: 'LTAI', classCode: 'AI1901', count: 6 },
    { prefix: 'GD19', majorCode: 'TKDH', classCode: 'GD1901', count: 2 },
  ];

  let nameIndex = 0;
  for (const plan of studentPlans) {
    const major = majorByCode.get(plan.majorCode)!;
    for (let i = 0; i < plan.count; i += 1) {
      const sequence = (plan.offset ?? 0) + i + 1;
      const studentCode = `${plan.prefix}${String(sequence).padStart(4, '0')}`;
      const fullName = `${FAMILY_NAMES[nameIndex % FAMILY_NAMES.length]} Văn ${GIVEN_NAMES[nameIndex % GIVEN_NAMES.length]}`;
      nameIndex += 1;
      const status =
        sequence % 11 === 0 ? StudentStatus.WARNED : StudentStatus.STUDYING;

      await prisma.student.upsert({
        where: { studentCode },
        update: { classCode: plan.classCode },
        create: {
          studentCode,
          fullName,
          dateOfBirth: new Date(2005, (sequence % 12), (sequence % 27) + 1),
          gender: sequence % 3 === 0 ? 'Nữ' : 'Nam',
          majorId: major.id,
          departmentId: major.departmentId,
          cohort: 'K19',
          classCode: plan.classCode,
          status,
        },
      });
    }
  }
  const students = await prisma.student.findMany({ orderBy: { studentCode: 'asc' } });

  // ===== Lớp học phần + điểm =====
  const sections = [
    { code: 'PRF192-SE1901-SU25', subjectCode: 'PRF192', lecturer: 'gv.binh', term: 'SU25', classCode: 'SE1901' },
    { code: 'DBI202-SE1901-SU25', subjectCode: 'DBI202', lecturer: 'gv.chi', term: 'SU25', classCode: 'SE1901' },
    { code: 'PRO192-SE1902-SU25', subjectCode: 'PRO192', lecturer: 'gv.binh', term: 'SU25', classCode: 'SE1902' },
    { code: 'AIL303-AI1901-SU25', subjectCode: 'AIL303', lecturer: 'gv.dung', term: 'SU25', classCode: 'AI1901' },
  ];

  for (const sectionPlan of sections) {
    const section = await prisma.classSection.upsert({
      where: { code_term: { code: sectionPlan.code, term: sectionPlan.term } },
      update: {},
      create: {
        code: sectionPlan.code,
        subjectId: subjectByCode.get(sectionPlan.subjectCode)!,
        lecturerId: staffByCode.get(sectionPlan.lecturer)!.id,
        term: sectionPlan.term,
      },
    });

    const classStudents = students.filter((student) => student.classCode === sectionPlan.classCode);
    for (const [index, student] of classStudents.entries()) {
      // Điểm deterministic: vài sinh viên trượt / bị cấm thi để thống kê có dữ liệu.
      const base = ((index * 7) % 6) + 4; // 4..9
      const isExamBanned = index % 7 === 6;
      const totalScore = isExamBanned ? 0 : Math.min(10, base + (index % 2));
      const result = isExamBanned || totalScore < 5 ? EnrollmentResult.FAIL : EnrollmentResult.PASS;

      await prisma.enrollment.upsert({
        where: {
          studentId_classSectionId: { studentId: student.id, classSectionId: section.id },
        },
        update: {},
        create: {
          studentId: student.id,
          classSectionId: section.id,
          attendanceRate: isExamBanned ? 45 : 80 + (index % 20),
          midtermScore: base,
          finalScore: isExamBanned ? null : Math.min(10, base + 1),
          totalScore,
          isExamBanned,
          result,
        },
      });
    }
  }

  // ===== Đánh giá / chăm sóc / cảnh báo demo (chỉ tạo khi chưa có) =====
  const gvBinh = staffByCode.get('gv.binh')!;
  const tbmSe = staffByCode.get('tbm.se')!;
  const dtHoa = staffByCode.get('dt.hoa')!;
  const ctsvLan = staffByCode.get('ctsv.lan')!;
  const ctsvTruong = staffByCode.get('ctsv.truong')!;
  const seStudents = students.filter((student) => student.classCode === 'SE1901');
  const evaluationCount = await prisma.evaluation.count();

  if (evaluationCount === 0 && seStudents.length >= 3) {
    const [first, second, third] = seStudents;

    // Nhận xét gắn với lớp học phần gv.binh đang dạy lớp SE1901.
    const prfSection = await prisma.classSection.findUniqueOrThrow({
      where: { code_term: { code: 'PRF192-SE1901-SU25', term: 'SU25' } },
    });

    const evaluationPlans = [
      {
        studentId: first!.id,
        academicScore: 8, attitudeScore: 9, absentSessions: 0,
        criteria: [] as EvaluationCriterion[],
        note: 'Học tốt, tích cực phát biểu.',
      },
      {
        studentId: second!.id,
        academicScore: 4, attitudeScore: 5, absentSessions: 2,
        criteria: [EvaluationCriterion.P_PART_TIME_JOB],
        note: 'Hổng kiến thức nền, cần kèm thêm.',
      },
      {
        studentId: third!.id,
        academicScore: 3, attitudeScore: 4, absentSessions: 3,
        criteria: [
          EvaluationCriterion.P_OTHER_ACTIVITIES,
          EvaluationCriterion.H_EXAM_BAN_RISK,
        ],
        note: 'Nghỉ nhiều buổi liên tiếp, có dấu hiệu chán học.',
      },
    ];

    for (const plan of evaluationPlans) {
      const { criteria, ...rest } = plan;
      await prisma.evaluation.create({
        data: {
          ...rest,
          lecturerId: gvBinh.id,
          classSectionId: prfSection.id,
          term: 'SU25',
          criteria: { create: criteria.map((criterion) => ({ criterion })) },
        },
      });
    }

    await prisma.careLog.createMany({
      data: [
        {
          studentId: second!.id, staffId: gvBinh.id, channel: CareChannel.IN_PERSON,
          content: 'Gặp trao đổi sau giờ học về kết quả giữa kỳ thấp.',
          outcome: 'Sinh viên cam kết tham gia lớp phụ đạo.',
          nextAction: 'Theo dõi điểm danh 2 tuần tới.',
        },
        {
          studentId: third!.id, staffId: ctsvLan.id, channel: CareChannel.ONLINE,
          content: 'Liên hệ qua kênh nội bộ vì nghỉ học 3 buổi liên tiếp.',
          outcome: 'Sinh viên phản hồi đang gặp khó khăn tài chính.',
          nextAction: 'Chuyển thông tin học bổng hỗ trợ.',
        },
      ],
    });

    // Cảnh báo mức 2: báo Trưởng bộ môn.
    const alertL2 = await prisma.alert.create({
      data: {
        studentId: second!.id, raisedById: gvBinh.id, level: 2,
        reason: 'Điểm giữa kỳ dưới trung bình, vắng 2 buổi.',
      },
    });
    await prisma.notification.create({
      data: {
        recipientId: tbmSe.id, alertId: alertL2.id,
        title: `Cảnh báo Trung bình — ${second!.fullName} (${second!.studentCode})`,
        body: 'Điểm giữa kỳ dưới trung bình, vắng 2 buổi.',
      },
    });

    // Cảnh báo mức 4: báo TBM + Đào tạo + CTSV + giảng viên đang dạy.
    const criticalReason =
      'Sinh viên nghỉ học liên tục 3 tuần, mất liên lạc với lớp, điểm danh 0% ở cả hai môn, nguy cơ thôi học rất cao — cần can thiệp khẩn cấp.';
    const alertL4 = await prisma.alert.create({
      data: {
        studentId: third!.id, raisedById: gvBinh.id, level: 4,
        reason: criticalReason, status: AlertStatus.ACKNOWLEDGED,
      },
    });
    await prisma.notification.createMany({
      data: [tbmSe.id, dtHoa.id, ctsvLan.id, ctsvTruong.id].map((recipientId) => ({
        recipientId,
        alertId: alertL4.id,
        title: `Cảnh báo Khẩn cấp — ${third!.fullName} (${third!.studentCode})`,
        body: criticalReason,
      })),
    });
  }

  // ===== Danh mục Học kỳ =====
  const defaultTerms = [
    {
      code: 'SP25',
      name: 'Spring 2025',
      season: TermSeason.SPRING,
      year: 2025,
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2025-04-30T23:59:59.999Z'),
      isCurrentOverride: false,
    },
    {
      code: 'SU25',
      name: 'Summer 2025',
      season: TermSeason.SUMMER,
      year: 2025,
      startDate: new Date('2025-05-01T00:00:00.000Z'),
      endDate: new Date('2025-08-31T23:59:59.999Z'),
      isCurrentOverride: true,
    },
    {
      code: 'FA25',
      name: 'Fall 2025',
      season: TermSeason.FALL,
      year: 2025,
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2025-12-31T23:59:59.999Z'),
      isCurrentOverride: false,
    },
    {
      code: 'SP26',
      name: 'Spring 2026',
      season: TermSeason.SPRING,
      year: 2026,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-04-30T23:59:59.999Z'),
      isCurrentOverride: false,
    },
    {
      code: 'SU26',
      name: 'Summer 2026',
      season: TermSeason.SUMMER,
      year: 2026,
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: new Date('2026-08-31T23:59:59.999Z'),
      isCurrentOverride: false,
    },
    {
      code: 'FA26',
      name: 'Fall 2026',
      season: TermSeason.FALL,
      year: 2026,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      isCurrentOverride: false,
    },
  ];

  for (const term of defaultTerms) {
    await prisma.term.upsert({
      where: { code: term.code },
      update: {},
      create: term,
    });
  }

  const counts = {
    roles: await prisma.role.count(),
    terms: await prisma.term.count(),
    departments: await prisma.department.count(),
    staff: await prisma.staff.count(),
    students: await prisma.student.count(),
    classSections: await prisma.classSection.count(),
    enrollments: await prisma.enrollment.count(),
    alerts: await prisma.alert.count(),
  };
  console.log('Seed hoàn tất:', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
