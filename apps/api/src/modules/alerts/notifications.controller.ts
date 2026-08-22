import {
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { interval, map, merge, Observable } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { NotificationEventsService } from './notification-events.service';
import { NotificationsService } from './notifications.service';

/** Nhịp heartbeat giữ kết nối SSE sống qua proxy/load balancer. */
const SSE_HEARTBEAT_MS = 25_000;

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationEvents: NotificationEventsService,
  ) {}

  /** Realtime: đẩy thông báo mới qua Server-Sent Events (auth bằng cookie). */
  @Sse('stream')
  @SkipEnvelope()
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { at: Date.now() } })),
    );
    const notifications$ = this.notificationEvents.streamFor(user.id).pipe(
      map((event): MessageEvent => ({
        type: 'notification',
        data: event.payload,
      })),
    );
    return merge(heartbeat$, notifications$);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notificationsService.listMine(user.id, unread === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user.id);
  }
}
