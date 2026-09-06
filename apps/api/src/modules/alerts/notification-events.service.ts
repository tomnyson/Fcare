import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';

export interface NotificationEvent {
  recipientId: string;
  payload: {
    id: string;
    alertId: string | null;
    analysisVersionId?: string | null;
    discussionMessageId?: string | null;
    targetUrl?: string | null;
    title: string;
    body: string;
    createdAt: Date;
  };
}

/**
 * Kênh pub/sub in-process cho SSE: mỗi kết nối /notifications/stream
 * lọc sự kiện theo recipientId của chính mình.
 */
@Injectable()
export class NotificationEventsService {
  private readonly events$ = new Subject<NotificationEvent>();

  emit(event: NotificationEvent): void {
    this.events$.next(event);
  }

  streamFor(staffId: string): Observable<NotificationEvent> {
    return this.events$
      .asObservable()
      .pipe(filter((event) => event.recipientId === staffId));
  }
}
