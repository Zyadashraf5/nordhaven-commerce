import { ApiProperty } from '@nestjs/swagger';

export class NotificationResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public kind!: string;

  @ApiProperty({ type: String })
  public subject!: string;

  @ApiProperty({ type: String })
  public body!: string;

  @ApiProperty({ type: 'string', enum: ['PENDING', 'DELIVERED', 'FAILED', 'SKIPPED'] })
  public status!: string;

  @ApiProperty({ type: String, nullable: true })
  public provider!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public failureReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class NotificationsResponse {
  @ApiProperty({ type: [NotificationResponse] })
  public notifications!: NotificationResponse[];
}

export function toNotificationResponse(record: {
  readonly id: string;
  readonly kind: string;
  readonly subject: string;
  readonly body: string;
  readonly status: string;
  readonly provider: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
}): NotificationResponse {
  return {
    id: record.id,
    kind: record.kind,
    subject: record.subject,
    body: record.body,
    status: record.status,
    provider: record.provider,
    failureReason: record.failureReason,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toNotificationsResponse(
  records: readonly {
    readonly id: string;
    readonly kind: string;
    readonly subject: string;
    readonly body: string;
    readonly status: string;
    readonly provider: string | null;
    readonly failureReason: string | null;
    readonly createdAt: Date;
  }[],
): NotificationsResponse {
  return { notifications: records.map(toNotificationResponse) };
}
