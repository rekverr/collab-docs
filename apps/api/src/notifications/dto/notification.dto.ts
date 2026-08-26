import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class NotificationActorDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiPropertyOptional({ nullable: true }) workspaceId!: string | null;
  @ApiPropertyOptional({ nullable: true }) workspaceName!: string | null;
  @ApiPropertyOptional({ nullable: true }) documentId!: string | null;
  @ApiPropertyOptional({ nullable: true }) documentTitle!: string | null;
  @ApiPropertyOptional({ nullable: true }) commentId!: string | null;
  @ApiPropertyOptional({ type: NotificationActorDto, nullable: true })
  actor!: NotificationActorDto | null;
  @ApiPropertyOptional({ nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
