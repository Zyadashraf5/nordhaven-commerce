import { ApiProperty } from '@nestjs/swagger';

/**
 * The provider event intake's projections.
 *
 * The body is the **provider's own** format, so it is documented as a free-form object rather than
 * as a platform schema: a provider's vocabulary must not become a core domain model. The response
 * names only the platform's own outcome.
 */

export class ProviderWebhookBody {
  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description:
      'The provider’s own event body. Its shape is the provider’s, not the platform’s, and the platform maps it into its own vocabulary after verifying it.',
  })
  public body!: Record<string, unknown>;
}

export class ProviderWebhookResponse {
  @ApiProperty({ type: Boolean })
  public received!: boolean;

  @ApiProperty({
    type: String,
    enum: ['APPLIED', 'DUPLICATE', 'REJECTED', 'UNKNOWN_ORDER'],
    description: 'What the platform did with the event.',
  })
  public outcome!: string;
}
