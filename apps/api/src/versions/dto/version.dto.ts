import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class CreateDocumentVersionDto {
  @ApiPropertyOptional({ description: "Optional label; defaults to the current document title" })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;
}

export class DocumentVersionAuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

export class DocumentVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: "Durable CRDT sequence represented by this version" })
  sourceSequence!: string;
  @ApiPropertyOptional({ nullable: true }) restoredFromVersionId!: string | null;
  @ApiPropertyOptional({ type: DocumentVersionAuthorDto, nullable: true })
  author!: DocumentVersionAuthorDto | null;
  @ApiProperty() createdAt!: Date;
}

export class DocumentVersionPreviewDto extends DocumentVersionDto {
  @ApiProperty({ type: "object", additionalProperties: true })
  contentProjection!: object;
}

export class RestoreDocumentVersionResultDto {
  @ApiProperty({ type: DocumentVersionDto }) version!: DocumentVersionDto;
  @ApiProperty({ description: "Whether active collaboration rooms were asked to reconnect" })
  collaborationReloadRequested!: boolean;
}
