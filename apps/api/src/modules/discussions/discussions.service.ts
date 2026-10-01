import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  extractMentions,
  RECALLED_MESSAGE_TEXT,
  stripFormatting,
  type ExtractedMentions,
  type RoleKey,
} from '@fcare/shared-types';
import { isStudentInScope, studentScope } from '../../common/utils/dept-scope';
import { assertNoPii } from '../../common/utils/pii-text';
import type { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import type { CreateMessageDto, ListMessagesQuery } from './dto/discussion.dto';

const DEFAULT_LIMIT = 30;
const NOTIFICATION_BODY_LIMIT = 120;

/** Người gửi hiện lên trong danh sách; chỉ mã + tên, tuyệt đối không PII (RULE 1). */
const AUTHOR_SELECT = {
  select: { id: true, staffCode: true, fullName: true },
} as const;

/** Cột cần để kiểm phạm vi của từng người nhận. */
const SCOPE_STAFF_SELECT = {
  id: true,
  staffCode: true,
  fullName: true,
  departmentId: true,
  roles: { select: { role: { select: { key: true } } } },
} as const;

type ScopeStaffRow = {
  id: string;
  staffCode: string;
  fullName: string;
  departmentId: string | null;
  roles: { role: { key: string } }[];
};

/** Người nhắc được — chỉ mã + tên (RULE 1). */
export interface Mentionable {
  id: string;
  staffCode: string;
  fullName: string;
}

const MESSAGE_SELECT = {
  id: true,
  body: true,
  deletedAt: true,
  createdAt: true,
  author: AUTHOR_SELECT,
} as const;

/**
 * Luồng trao đổi nội bộ về MỘT sinh viên.
 *
 * Không có bảng thread/participant: `studentId` là định danh luồng, và cửa thật
 * không phải CASL mà là phạm vi — mọi thao tác đều đi qua `studentScope(user)`
 * trước. Ngoài phạm vi luôn trả 404 (không bao giờ 403): 403 sẽ xác nhận sinh
 * viên đó tồn tại, chính là thứ RULE 2 muốn giấu.
 */
@Injectable()
export class DiscussionsService {
  private readonly logger = new Logger(DiscussionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  /** Cửa phạm vi dùng chung; trả về sinh viên để dựng nội dung thông báo. */
  private async requireStudent(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user) },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        departmentId: true,
      },
    });
    if (!student) {
      throw new NotFoundException(
        'Không tìm thấy sinh viên trong phạm vi quản lý của bạn.',
      );
    }
    return student;
  }

  /**
   * Trang tin, cuộn ngược theo `before`, nhưng trả về TĂNG DẦN cho UI hội thoại.
   * Kèm mốc đã đọc của người gọi để web đếm được tin chưa đọc mà không cần
   * thêm một lượt gọi API nữa.
   */
  async list(user: AuthUser, studentId: string, query: ListMessagesQuery) {
    await this.requireStudent(user, studentId);
    const [rows, read] = await Promise.all([
      this.prisma.discussionMessage.findMany({
        where: {
          studentId,
          ...(query.before
            ? { createdAt: { lt: new Date(query.before) } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? DEFAULT_LIMIT,
        select: MESSAGE_SELECT,
      }),
      this.prisma.discussionRead.findUnique({
        where: { studentId_staffId: { studentId, staffId: user.id } },
        select: { lastReadAt: true },
      }),
    ]);
    return {
      messages: rows.reverse().map((row) => this.maskRecalled(row)),
      lastReadAt: read?.lastReadAt ?? null,
    };
  }

  async create(user: AuthUser, studentId: string, dto: CreateMessageDto) {
    const student = await this.requireStudent(user, studentId);
    assertNoPii(dto.body);

    // LOW-C: lệnh này nằm ngoài mọi try/catch thì `PrismaClientValidationError`
    // (in cả đối số gọi hàm, kèm `body`) đi thẳng tới `LoggerErrorInterceptor`
    // và pino ghi cả `message` lẫn `stack` → nội dung tin vào log. Bắt tại chỗ,
    // ném lại một lỗi sạch; client vẫn nhận đúng 500 + đúng câu chữ mà
    // `HttpExceptionFilter` vẫn trả cho lỗi không xác định.
    const message = await this.createMessage(studentId, user.id, dto.body);

    // Tin đã commit ở trên: từ đây trở đi KHÔNG được để lỗi thành 500, nếu
    // không người dùng tưởng gửi hụt rồi bấm lại và luồng có tin trùng. Bọc cả
    // phần tính người nhận (participantsExcept/recipientsInScope, 3+N truy
    // vấn) lẫn phần deliver — lỗi ở bất kỳ bước nào cũng chỉ log.
    try {
      await this.fanOut(user, student, message.id, dto.body);
    } catch (error) {
      // KHÔNG log `error.message`: `PrismaClientValidationError` in cả đối số
      // gọi hàm, kể cả trường `body` đang mang nội dung người dùng gõ — và
      // `PiiGuardInterceptor` chỉ lọc theo tên khoá trên response, không với
      // tới log. Tên lỗi + id tin là đủ để lần ra bản ghi mà chẩn đoán.
      this.logger.warn(
        `Không gửi được thông báo trao đổi ${message.id}; lỗi ${this.errorName(error)} (nội dung lỗi được lược bỏ để không vọng lại nội dung tin nhắn)`,
      );
    }
    return message;
  }

  /**
   * Người nhắc tên nhận thông báo "X nhắc đến bạn…"; người tham gia còn lại
   * nhận thông báo chung. Mỗi người tối đa một thông báo, không gửi cho tác giả.
   * Tất cả cùng lọc qua `recipientsInScope` MỘT lượt (RULE 2).
   */
  private async fanOut(
    user: AuthUser,
    student: { id: string; studentCode: string; departmentId: string },
    messageId: string,
    body: string,
  ): Promise<void> {
    const mentions = extractMentions(body);
    const [participants, mentioned] = await Promise.all([
      this.participantsExcept(student.id, user.id),
      this.mentionedIds(student, mentions, user.id),
    ]);
    const inScope = new Set(
      await this.recipientsInScope(student.id, [
        ...new Set([...participants, ...mentioned]),
      ]),
    );
    const mentionIds = mentioned.filter((id) => inScope.has(id));
    const mentionSet = new Set(mentionIds);
    const generalIds = participants.filter(
      (id) => inScope.has(id) && !mentionSet.has(id),
    );
    if (mentionIds.length + generalIds.length === 0) {
      return;
    }
    if (await this.wasRecalled(messageId)) {
      return;
    }
    const preview = `${user.fullName}: ${this.preview(stripFormatting(body))}`;
    const source = {
      kind: 'discussion' as const,
      discussionMessageId: messageId,
      targetUrl: `/students/${student.id}?tab=discussion`,
    };
    if (mentionIds.length > 0) {
      await this.notifications.deliver({
        recipientIds: mentionIds,
        title: `${user.fullName} nhắc đến bạn trong trao đổi về SV ${student.studentCode}`,
        body: preview,
        source,
      });
    }
    if (generalIds.length > 0) {
      await this.notifications.deliver({
        recipientIds: generalIds,
        title: `Trao đổi mới về SV ${student.studentCode}`,
        body: preview,
        source,
      });
    }
  }

  /** Id người được nhắc (chưa lọc phạm vi), đã bỏ tác giả. */
  private async mentionedIds(
    student: { id: string; departmentId: string },
    mentions: ExtractedMentions,
    authorId: string,
  ): Promise<string[]> {
    const [related, byCode] = await Promise.all([
      mentions.all ? this.relatedStaffIds(student) : Promise.resolve([]),
      this.staffIdsByCode(mentions.staffCodes),
    ]);
    return [...new Set([...related, ...byCode])].filter(
      (id) => id !== authorId,
    );
  }

  private async staffIdsByCode(codes: string[]): Promise<string[]> {
    if (codes.length === 0) {
      return [];
    }
    const rows = await this.prisma.staff.findMany({
      where: {
        isActive: true,
        OR: codes.map((code) => ({
          staffCode: { equals: code, mode: 'insensitive' as const },
        })),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Nhóm `@all`: GV đang dạy SV (enrollment còn IN_PROGRESS) + người đã tham
   * gia luồng + TBM của bộ môn SV. Chưa lọc phạm vi — nơi gọi lọc.
   */
  private async relatedStaffIds(student: {
    id: string;
    departmentId: string;
  }): Promise<string[]> {
    const [sections, participants, heads] = await Promise.all([
      this.prisma.classSection.findMany({
        where: {
          lecturerId: { not: null },
          enrollments: {
            some: { studentId: student.id, result: 'IN_PROGRESS' },
          },
        },
        distinct: ['lecturerId'],
        select: { lecturerId: true },
      }),
      this.participantsExcept(student.id, ''),
      this.prisma.staff.findMany({
        where: {
          isActive: true,
          departmentId: student.departmentId,
          roles: { some: { role: { key: 'HEAD_OF_DEPT' } } },
        },
        select: { id: true },
      }),
    ]);
    const lecturers = sections
      .map((row) => row.lecturerId)
      .filter((id): id is string => id !== null);
    return [
      ...new Set([...lecturers, ...participants, ...heads.map((h) => h.id)]),
    ];
  }

  /** Danh sách gợi ý khi gõ `@` — cùng nhóm với `@all`, đã lọc phạm vi. */
  async mentionables(
    user: AuthUser,
    studentId: string,
  ): Promise<Mentionable[]> {
    const student = await this.requireStudent(user, studentId);
    const ids = (await this.relatedStaffIds(student)).filter(
      (id) => id !== user.id,
    );
    const rows = await this.staffInScope(studentId, ids);
    return rows
      .map(({ id, staffCode, fullName }) => ({ id, staffCode, fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }

  /**
   * Ghi tin và làm sạch lỗi trước khi nó rời khỏi service.
   *
   * Không đính `cause`: `HttpException` giữ nguyên `cause` và
   * `LoggerErrorInterceptor` đưa cả chuỗi lỗi cho pino serializer.
   */
  private async createMessage(
    studentId: string,
    authorId: string,
    body: string,
  ) {
    try {
      return await this.prisma.discussionMessage.create({
        data: { studentId, authorId, body },
        select: MESSAGE_SELECT,
      });
    } catch (error) {
      this.logger.warn(
        `Không ghi được tin trao đổi của SV ${studentId}; lỗi ${this.errorName(error)} (nội dung lỗi được lược bỏ để không vọng lại nội dung tin nhắn)`,
      );
      throw new InternalServerErrorException(
        'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      );
    }
  }

  /**
   * MED-B: tin đã COMMIT trước khi fan-out (3+N truy vấn). Tác giả thu hồi
   * trong cửa sổ đó thì `remove` không tẩy được dòng `Notification` nào (chưa
   * tồn tại), rồi `deliver` mới ghi chúng — nguyên văn, và không còn đường nào
   * tẩy nữa. Đọc lại ngay trước khi ghi thu cửa sổ về khoảng cách giữa hai
   * lệnh này thay vì cả quãng fan-out. Không tìm thấy tin (đã bị xoá cứng theo
   * sinh viên) cũng là "đừng gửi".
   */
  private async wasRecalled(messageId: string): Promise<boolean> {
    const fresh = await this.prisma.discussionMessage.findUnique({
      where: { id: messageId },
      select: { deletedAt: true },
    });
    if (!fresh) {
      return true;
    }
    return fresh.deletedAt !== null;
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'không xác định';
  }

  /** Thu hồi mềm. Chỉ tác giả — kể cả ADMIN cũng không sửa lời người khác. */
  async remove(user: AuthUser, messageId: string) {
    const message = await this.prisma.discussionMessage.findUnique({
      where: { id: messageId },
      select: { id: true, studentId: true, authorId: true, deletedAt: true },
    });
    if (!message) {
      throw new NotFoundException('Không tìm thấy tin nhắn.');
    }
    // Kiểm tra phạm vi TRƯỚC khi lộ ra rằng tin nhắn này của người khác.
    await this.requireStudent(user, message.studentId);
    if (message.authorId !== user.id) {
      throw new ForbiddenException(
        'Chỉ tác giả mới thu hồi được tin nhắn này.',
      );
    }
    // `create` đã chép 120 ký tự đầu nội dung sang `Notification.body`. Xoá
    // mềm mỗi `DiscussionMessage` thì thu hồi chỉ là hiệu ứng thị giác: người
    // nhận vẫn đọc nguyên câu đó trong chuông báo. Hai lệnh đi CÙNG một giao
    // dịch để không có trạng thái "tin đã thu hồi nhưng thông báo còn nội
    // dung"; giữ lại bản ghi (không xoá) để trạng thái đã đọc còn nguyên.
    const [updated] = await this.prisma.$transaction([
      this.prisma.discussionMessage.update({
        where: { id: messageId },
        data: { deletedAt: message.deletedAt ?? new Date() },
        select: MESSAGE_SELECT,
      }),
      this.prisma.notification.updateMany({
        where: { discussionMessageId: messageId },
        data: { body: RECALLED_MESSAGE_TEXT },
      }),
    ]);
    return this.maskRecalled(updated);
  }

  async markRead(user: AuthUser, studentId: string) {
    await this.requireStudent(user, studentId);
    const lastReadAt = new Date();
    await this.prisma.discussionRead.upsert({
      where: { studentId_staffId: { studentId, staffId: user.id } },
      create: { studentId, staffId: user.id, lastReadAt },
      update: { lastReadAt },
    });
    return { lastReadAt };
  }

  /**
   * Số LUỒNG đang có tin chưa đọc — chỉ tính luồng người này đã tham gia
   * (có mốc đã đọc), khớp với quy tắc người nhận thông báo ở §4.6 của spec.
   */
  async unreadCount(user: AuthUser) {
    const reads = await this.prisma.discussionRead.findMany({
      where: { staffId: user.id },
      select: { studentId: true, lastReadAt: true },
    });
    if (reads.length === 0) {
      return { count: 0 };
    }
    const threads = await this.prisma.discussionMessage.groupBy({
      by: ['studentId'],
      where: {
        // RULE 2: mốc đã đọc có thể còn sót lại của sinh viên đã rớt khỏi
        // phạm vi (GV hết dạy lớp đó) — không lọc lại thì badge đếm cả tin
        // ngoài phạm vi, và người dùng bấm vào cũng không xoá được (markRead
        // qua requireStudent sẽ trả 404 cho chính sinh viên đó).
        student: studentScope(user),
        deletedAt: null,
        authorId: { not: user.id },
        OR: reads.map((read) => ({
          studentId: read.studentId,
          createdAt: { gt: read.lastReadAt },
        })),
      },
      _count: { _all: true },
    });
    return { count: threads.length };
  }

  /**
   * Lọc lại người nhận theo phạm vi CỦA TỪNG NGƯỜI tại thời điểm gửi (RULE 2).
   *
   * `participantsExcept` chỉ nói ai từng tham gia luồng; phạm vi thì đổi theo
   * kỳ (giảng viên hết dạy lớp có sinh viên đó là rớt khỏi phạm vi). Thông báo
   * mang mã sinh viên + 120 ký tự nội dung và đẩy thẳng qua SSE, nên nếu không
   * lọc lại ở đây thì nội dung học vụ lộ ngay ở thông báo dù `list` trả 404.
   *
   * Chống N+1: một truy vấn `staff` cho cả danh sách; `isStudentInScope` thoát
   * sớm không tốn truy vấn với vai trò toàn trường, phần còn lại chạy song song.
   */
  private async recipientsInScope(
    studentId: string,
    staffIds: string[],
  ): Promise<string[]> {
    const rows = await this.staffInScope(studentId, staffIds);
    return rows.map((row) => row.id);
  }

  private async staffInScope(
    studentId: string,
    staffIds: string[],
  ): Promise<ScopeStaffRow[]> {
    if (staffIds.length === 0) {
      return [];
    }
    const staff = await this.prisma.staff.findMany({
      // Nhân sự đã nghỉ việc (isActive=false) không nhận thông báo — tài
      // khoản đó không còn đăng nhập được nữa, giữ lại chỉ rò thêm dữ liệu.
      where: { id: { in: staffIds }, isActive: true },
      select: SCOPE_STAFF_SELECT,
    });
    const checked = await Promise.all(
      staff.map(async (row) => {
        const inScope = await isStudentInScope(
          this.prisma,
          this.asScopeUser(row),
          studentId,
        );
        return inScope ? row : null;
      }),
    );
    return checked.filter((row): row is ScopeStaffRow => row !== null);
  }

  /**
   * Dựng `AuthUser` tối thiểu cho helper phạm vi. `consented` /
   * `mustChangePassword` không tham gia tính phạm vi (chỉ là cửa đăng nhập của
   * chính người đó) nên đặt giá trị trung tính; vai trò + bộ môn + id mới là
   * thứ `studentScope` dùng.
   */
  private asScopeUser(row: ScopeStaffRow): AuthUser {
    return {
      id: row.id,
      staffCode: row.staffCode,
      fullName: row.fullName,
      roles: row.roles.map((entry) => entry.role.key as RoleKey),
      departmentId: row.departmentId,
      consented: true,
      mustChangePassword: false,
    };
  }

  /**
   * Tin đã thu hồi thì KHÔNG trả nội dung nữa — giấu ở tầng render là vô nghĩa
   * khi mở tab Network hoặc gọi thẳng API là đọc được. Giữ nguyên hình dạng
   * JSON (id, deletedAt, author…) để web vẫn vẽ được dòng "đã thu hồi".
   */
  private maskRecalled<T extends { body: string; deletedAt: Date | null }>(
    message: T,
  ): Omit<T, 'body'> & { body: string | null } {
    return message.deletedAt === null ? message : { ...message, body: null };
  }

  /**
   * Người nhận thông báo = người đã tham gia luồng (từng gửi tin chưa thu hồi,
   * hoặc đã mở luồng), trừ chính người gửi. Người trong phạm vi nhưng chưa bao
   * giờ mở luồng thì KHÔNG nhận — nếu không, mỗi tin sẽ dội cho cả phòng CTSV.
   */
  private async participantsExcept(
    studentId: string,
    authorId: string,
  ): Promise<string[]> {
    const [authors, readers] = await Promise.all([
      this.prisma.discussionMessage.findMany({
        where: { studentId, deletedAt: null, authorId: { not: authorId } },
        distinct: ['authorId'],
        select: { authorId: true },
      }),
      this.prisma.discussionRead.findMany({
        where: { studentId, staffId: { not: authorId } },
        select: { staffId: true },
      }),
    ]);
    return [
      ...new Set([
        ...authors.map((row) => row.authorId),
        ...readers.map((row) => row.staffId),
      ]),
    ];
  }

  private preview(body: string): string {
    return body.length > NOTIFICATION_BODY_LIMIT
      ? `${body.slice(0, NOTIFICATION_BODY_LIMIT)}…`
      : body;
  }
}
