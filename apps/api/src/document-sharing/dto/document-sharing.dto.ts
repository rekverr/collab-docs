import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentAccessMode } from "@prisma/client";
import { IsBoolean, IsEnum, IsISO8601, IsOptional, Matches } from "class-validator";

export class SetPublicationDto {
  @ApiProperty() @IsBoolean() published!: boolean;
}

export class CreateShareLinkDto {
  @ApiProperty({ enum: DocumentAccessMode })
  @IsEnum(DocumentAccessMode)
  accessMode!: DocumentAccessMode;

  @ApiPropertyOptional({ nullable: true, description: "ISO-8601 timestamp in the future" })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;
}

export class ResolveShareLinkDto {
  @ApiProperty()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}

export class ShareLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DocumentAccessMode }) accessMode!: DocumentAccessMode;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) revokedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, description: "Available only after create/regenerate" })
  url!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class DocumentSharingStateDto {
  @ApiProperty() documentId!: string;
  @ApiProperty() published!: boolean;
  @ApiPropertyOptional({ nullable: true }) publicSlug!: string | null;
  @ApiPropertyOptional({ nullable: true }) publicUrl!: string | null;
  @ApiProperty({ type: [ShareLinkDto] }) links!: ShareLinkDto[];
}

export class SharedDocumentDto {
  @ApiProperty() documentId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: DocumentAccessMode }) accessMode!: DocumentAccessMode;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional() contentProjection!: unknown;
}

export class PublishedDocumentDto {
  @ApiProperty() documentId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() publicSlug!: string;
  @ApiPropertyOptional() contentProjection!: unknown;
  @ApiProperty() projectionUpdatedAt!: Date | null;
}
