import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { DiscussionsService } from './discussions.service';
import { CreateMessageDto, ListMessagesQuery } from './dto/discussion.dto';

/**
 * CASL chỉ là cửa ngoài (role nào được dùng tính năng); cửa thật là phạm vi
 * sinh viên, do service kiểm — xem `DiscussionsService.requireStudent`.
 */
@ApiTags('discussions')
@Controller('discussions')
@CheckPolicies((ability: AppAbility) => ability.can('read', 'Discussion'))
export class DiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.discussions.unreadCount(user);
  }

  @Get(':studentId/messages')
  list(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: ListMessagesQuery,
  ) {
    return this.discussions.list(user, studentId, query);
  }

  @Post(':studentId/messages')
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Discussion'))
  create(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.discussions.create(user, studentId, dto);
  }

  @Post(':studentId/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.discussions.markRead(user, studentId);
  }

  @Delete('messages/:id')
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Discussion'))
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discussions.remove(user, id);
  }
}
