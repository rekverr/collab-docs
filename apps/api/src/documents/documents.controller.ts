import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { CreateDocumentDto, DocumentMetadataDto, DocumentTreeNodeDto, MoveDocumentDto, ReorderDocumentsDto, UpdateDocumentMetadataDto } from "./dto/document.dto";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post("workspaces/:workspaceId/documents")
  @ApiOperation({ summary: "Create a root or nested document" })
  @ApiCreatedResponse({ type: DocumentMetadataDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() input: CreateDocumentDto,
  ): Promise<DocumentMetadataDto> { return this.documents.create(user.id, workspaceId, input); }

  @Get("documents/:documentId")
  @ApiOperation({ summary: "Get active document metadata" })
  @ApiOkResponse({ type: DocumentMetadataDto })
  get(@CurrentUser() user: AuthenticatedUser, @Param("documentId", ParseUUIDPipe) documentId: string): Promise<DocumentMetadataDto> {
    return this.documents.get(user.id, documentId);
  }

  @Get("workspaces/:workspaceId/documents/tree")
  @ApiOperation({ summary: "Get the ordered active document tree" })
  @ApiOkResponse({ type: [DocumentTreeNodeDto] })
  tree(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string): Promise<DocumentTreeNodeDto[]> {
    return this.documents.tree(user.id, workspaceId);
  }

  @Patch("documents/:documentId")
  @ApiOperation({ summary: "Rename or update document metadata" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: UpdateDocumentMetadataDto,
  ): Promise<DocumentMetadataDto> { return this.documents.update(user.id, documentId, input); }

  @Post("documents/:documentId/move")
  @ApiOperation({ summary: "Move a document to a parent and deterministic sibling position" })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: MoveDocumentDto,
  ): Promise<DocumentMetadataDto> { return this.documents.move(user.id, documentId, input); }

  @Post("workspaces/:workspaceId/documents/reorder")
  @ApiOperation({ summary: "Set the exact order of one active sibling set" })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() input: ReorderDocumentsDto,
  ): Promise<DocumentMetadataDto[]> { return this.documents.reorder(user.id, workspaceId, input); }

  @Post("documents/:documentId/archive")
  @ApiOperation({ summary: "Archive a document" })
  archive(@CurrentUser() user: AuthenticatedUser, @Param("documentId", ParseUUIDPipe) documentId: string): Promise<DocumentMetadataDto> {
    return this.documents.archive(user.id, documentId);
  }

  @Delete("documents/:documentId")
  @ApiOperation({ summary: "Soft-delete a document" })
  delete(@CurrentUser() user: AuthenticatedUser, @Param("documentId", ParseUUIDPipe) documentId: string): Promise<DocumentMetadataDto> {
    return this.documents.delete(user.id, documentId);
  }

  @Post("documents/:documentId/restore")
  @ApiOperation({ summary: "Restore an archived or soft-deleted document" })
  restore(@CurrentUser() user: AuthenticatedUser, @Param("documentId", ParseUUIDPipe) documentId: string): Promise<DocumentMetadataDto> {
    return this.documents.restore(user.id, documentId);
  }
}
