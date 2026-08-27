import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  CreateDocumentVersionDto,
  DocumentVersionDto,
  DocumentVersionPreviewDto,
  RestoreDocumentVersionResultDto,
} from "./dto/version.dto";
import { VersionsService } from "./versions.service";

@ApiTags("document-versions")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
@ApiForbiddenResponse({ description: "Document write capability required for create or restore" })
@ApiNotFoundResponse({ description: "Document or version not found" })
@UseGuards(AccessTokenGuard)
@Controller("documents/:documentId/versions")
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  @Post()
  @ApiOperation({ summary: "Create a user-visible version from the current durable Yjs state" })
  @ApiCreatedResponse({ type: DocumentVersionDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: CreateDocumentVersionDto,
  ): Promise<DocumentVersionDto> {
    return this.versions.create(user.id, documentId, input);
  }

  @Get()
  @ApiOperation({ summary: "List user-visible document versions" })
  @ApiOkResponse({ type: [DocumentVersionDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<DocumentVersionDto[]> {
    return this.versions.list(user.id, documentId);
  }

  @Get(":versionId")
  @ApiOperation({ summary: "Preview a normalized projection of a document version" })
  @ApiOkResponse({ type: DocumentVersionPreviewDto })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ): Promise<DocumentVersionPreviewDto> {
    return this.versions.preview(user.id, documentId, versionId);
  }

  @Post(":versionId/restore")
  @ApiOperation({ summary: "Restore a version as a new current CRDT state and history entry" })
  @ApiOkResponse({ type: RestoreDocumentVersionResultDto })
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ): Promise<RestoreDocumentVersionResultDto> {
    return this.versions.restore(user.id, documentId, versionId);
  }
}
