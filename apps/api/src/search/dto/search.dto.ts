import { Type } from "class-transformer";
import { IsInt, IsString, Length, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SearchDocumentsQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  query!: string;

  @ApiProperty({ default: 1, minimum: 1, maximum: 10_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @ApiProperty({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class SearchDocumentResultDto {
  @ApiProperty() documentId!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty({ nullable: true }) parentId!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) snippet!: string | null;
  @ApiProperty() rank!: number;
  @ApiProperty() updatedAt!: Date;
}

export class SearchDocumentsResponseDto {
  @ApiProperty({ type: [SearchDocumentResultDto] }) items!: SearchDocumentResultDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasMore!: boolean;
}
