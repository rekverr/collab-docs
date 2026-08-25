import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length } from "class-validator";

export class CreateDocumentDto {
  @ApiPropertyOptional({ default: "Untitled" })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateDocumentMetadataDto {
  @ApiProperty({ example: "Project brief" })
  @IsString()
  @Length(1, 500)
  title!: string;
}

export class MoveDocumentDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: "Null moves the document to the workspace root" })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ type: String, description: "Place immediately before this destination sibling" })
  @IsOptional()
  @IsUUID()
  beforeDocumentId?: string;
}

export class ReorderDocumentsDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiProperty({ type: [String], description: "All active sibling IDs in their desired order" })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  orderedDocumentIds!: string[];
}

export class DocumentMetadataDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiPropertyOptional({ nullable: true }) parentId!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty() sortKey!: string;
  @ApiProperty() publicationState!: string;
  @ApiPropertyOptional({ nullable: true }) archivedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) deletedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class DocumentTreeNodeDto extends DocumentMetadataDto {
  @ApiProperty({ type: () => [DocumentTreeNodeDto] }) children!: DocumentTreeNodeDto[];
}
