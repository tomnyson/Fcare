import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/types/auth-user';

export type Action =
  | 'manage'
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'import'
  | 'export'
  | 'resolve'
  | 'review';

export type Subjects =
  | 'Student'
  | 'Evaluation'
  | 'CareLog'
  | 'Discussion'
  | 'Alert'
  | 'AttendanceAlert'
  | 'Notification'
  | 'MasterData'
  | 'Staff'
  | 'MailSettings'
  | 'Monitoring'
  | 'Statistics'
  | 'Excel'
  | 'Backup'
  | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

/**
 * Ma trận phân quyền theo QUY ĐỊNH CHUNG của tài liệu nghiệp vụ:
 * - Chỉ Trưởng bộ môn + Cán bộ Đào tạo + CTSV được import/export Excel.
 * - Giảng viên chỉ đánh giá/chăm sóc sinh viên bộ môn mình (scope ở tầng service).
 * - Quản trị người dùng chỉ dành cho ADMIN.
 */
@Injectable()
export class AbilityFactory {
  createForUser(user: AuthUser): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    for (const role of user.roles) {
      switch (role) {
        case 'ADMIN':
          can('manage', 'all');
          break;
        case 'HEAD_OF_DEPT':
          can('read', [
            'Student',
            'Evaluation',
            'CareLog',
            'Alert',
            'MasterData',
            'Statistics',
          ]);
          can(
            ['create', 'update'],
            ['Student', 'Evaluation', 'CareLog', 'Alert'],
          );
          can('resolve', 'Alert');
          can(['import', 'export'], 'Excel');
          can(['read', 'create'], 'Discussion');
          break;
        case 'LECTURER':
          can('read', [
            'Student',
            'Evaluation',
            'CareLog',
            'Alert',
            'MasterData',
            'Statistics',
          ]);
          can(['create', 'update'], ['Evaluation', 'CareLog', 'Alert']);
          can(['read', 'create'], 'Discussion');
          break;
        case 'TRAINING_OFFICER':
          can('read', [
            'Student',
            'Evaluation',
            'CareLog',
            'Alert',
            'Statistics',
          ]);
          can(['create', 'update'], 'Student');
          can('manage', 'MasterData');
          can('resolve', 'Alert');
          // Bước 2 FLOW 2: Đào tạo nhập điểm danh nên được chạy lại rà soát tay.
          can('review', 'AttendanceAlert');
          can(['import', 'export'], 'Excel');
          can(['read', 'create'], 'Discussion');
          break;
        case 'SA_OFFICER':
          can('read', [
            'Student',
            'CareLog',
            'Alert',
            'MasterData',
            'Statistics',
          ]);
          can('create', 'CareLog');
          can(['import', 'export'], 'Excel');
          can(['read', 'create'], 'Discussion');
          break;
        case 'SA_HEAD':
          can('read', [
            'Student',
            'Evaluation',
            'CareLog',
            'Alert',
            'MasterData',
            'Statistics',
          ]);
          can('create', 'CareLog');
          can('resolve', 'Alert');
          can(['import', 'export'], 'Excel');
          can(['read', 'create'], 'Discussion');
          break;
      }
    }

    return build();
  }
}
