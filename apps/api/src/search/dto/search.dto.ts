import { Type } from "class-transformer";
import { IsInt, IsString, Length, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SearchDocumentsQueryDto {
  @IsString()
  @Length(1, 200)
  query!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

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
