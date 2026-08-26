import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateCommentDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ description: "Stable editor block ID; omit for a document comment" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._:-]{1,160}$/)
  blockId?: string;
}

export class CreateReplyDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class UpdateCommentDto extends CreateReplyDto {}

export class ResolveCommentDto {
  @ApiProperty() @IsBoolean() resolved!: boolean;
}

export class CommentAuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

export class CommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiPropertyOptional({ nullable: true }) parentId!: string | null;
  @ApiPropertyOptional({ nullable: true }) blockId!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty() deleted!: boolean;
  @ApiPropertyOptional({ nullable: true }) resolvedAt!: Date | null;
  @ApiPropertyOptional({ type: CommentAuthorDto, nullable: true })
  resolvedBy!: CommentAuthorDto | null;
  @ApiProperty({ type: CommentAuthorDto }) author!: CommentAuthorDto;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CommentThreadDto extends CommentDto {
  @ApiProperty({ type: [CommentDto] }) replies!: CommentDto[];
}

export class MentionCandidateDto extends CommentAuthorDto {}
