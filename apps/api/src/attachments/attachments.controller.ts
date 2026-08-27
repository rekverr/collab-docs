import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { AttachmentsService } from "./attachments.service";
import {
  AttachmentDownloadDto,
  AttachmentDto,
  AttachmentUploadDto,
  RequestAttachmentUploadDto,
} from "./dto/attachment.dto";

@ApiTags("attachments")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
@ApiForbiddenResponse({ description: "Document or attachment capability required" })
@ApiNotFoundResponse({ description: "Document or attachment not found" })
@UseGuards(AccessTokenGuard)
@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post("documents/:documentId/attachments/upload-requests")
  @ApiOperation({ summary: "Reserve quota and request a direct S3 upload URL" })
  @ApiCreatedResponse({ type: AttachmentUploadDto })
  requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: RequestAttachmentUploadDto,
  ): Promise<AttachmentUploadDto> {
    return this.attachments.requestUpload(user.id, documentId, input);
  }

  @Post("attachments/:attachmentId/finalize")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify a direct upload and register the attachment" })
  @ApiOkResponse({ type: AttachmentDto })
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attachmentId", ParseUUIDPipe) attachmentId: string,
  ): Promise<AttachmentDto> {
    return this.attachments.finalize(user.id, attachmentId);
  }

  @Get("attachments/:attachmentId/download")
  @ApiOperation({ summary: "Request a short-lived authorized attachment URL" })
  @ApiOkResponse({ type: AttachmentDownloadDto })
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attachmentId", ParseUUIDPipe) attachmentId: string,
  ): Promise<AttachmentDownloadDto> {
    return this.attachments.download(user.id, attachmentId);
  }

  @Delete("attachments/:attachmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an attachment and release workspace storage" })
  @ApiNoContentResponse()
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attachmentId", ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    return this.attachments.delete(user.id, attachmentId);
  }
}
