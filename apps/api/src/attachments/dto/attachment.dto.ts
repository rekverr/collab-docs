import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { maximumAttachmentSizeBytes } from "../attachment-rules";

export class RequestAttachmentUploadDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: "image/png" })
  @IsString()
  @MaxLength(255)
  mimeType!: string;

  @ApiProperty({ maximum: maximumAttachmentSizeBytes })
  @IsInt()
  @Min(1)
  @Max(maximumAttachmentSizeBytes)
  sizeBytes!: number;
}

export class AttachmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
}

export class AttachmentUploadDto {
  @ApiProperty({ type: AttachmentDto }) attachment!: AttachmentDto;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() requiredHeaders!: Record<string, string>;
}

export class AttachmentDownloadDto {
  @ApiProperty() url!: string;
  @ApiProperty() expiresAt!: Date;
}
