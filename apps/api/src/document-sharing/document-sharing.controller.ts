import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { DocumentSharingService } from "./document-sharing.service";
import {
  CreateShareLinkDto,
  DocumentSharingStateDto,
  PublishedDocumentDto,
  ResolveShareLinkDto,
  SetPublicationDto,
  SharedDocumentDto,
  ShareLinkDto,
} from "./dto/document-sharing.dto";
import { ShareLinkRateLimiter } from "./share-link-rate-limiter.service";

@ApiTags("document-sharing")
@Controller()
export class DocumentSharingController {
  constructor(
    private readonly sharing: DocumentSharingService,
    private readonly rateLimiter: ShareLinkRateLimiter,
  ) {}

  @Get("documents/:documentId/sharing")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get publication and share-link state" })
  @ApiOkResponse({ type: DocumentSharingStateDto })
  state(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<DocumentSharingStateDto> {
    return this.sharing.state(user.id, documentId);
  }

  @Post("documents/:documentId/publication")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Publish or unpublish a document" })
  @ApiOkResponse({ type: DocumentSharingStateDto })
  setPublication(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: SetPublicationDto,
  ): Promise<DocumentSharingStateDto> {
    return this.sharing.setPublication(user.id, documentId, input.published);
  }

  @Post("documents/:documentId/share-links")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a view-only or editable document share link" })
  @ApiCreatedResponse({ type: ShareLinkDto })
  async createLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: CreateShareLinkDto,
  ): Promise<ShareLinkDto> {
    await this.rateLimiter.check(user.id, documentId);
    return this.sharing.createLink(user.id, documentId, input);
  }

  @Delete("document-share-links/:linkId")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Revoke a document share link" })
  @ApiOkResponse({ type: ShareLinkDto })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("linkId", ParseUUIDPipe) linkId: string,
  ): Promise<ShareLinkDto> {
    return this.sharing.revokeLink(user.id, linkId);
  }

  @Post("document-share-links/:linkId/regenerate")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Revoke a share token and issue a replacement" })
  @ApiCreatedResponse({ type: ShareLinkDto })
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("linkId", ParseUUIDPipe) linkId: string,
  ): Promise<ShareLinkDto> {
    await this.rateLimiter.check(user.id, linkId);
    return this.sharing.regenerateLink(user.id, linkId);
  }

  @Post("shares/resolve")
  @ApiOperation({ summary: "Resolve an active document share token without workspace data" })
  @ApiOkResponse({ type: SharedDocumentDto })
  resolveShare(@Body() input: ResolveShareLinkDto): Promise<SharedDocumentDto> {
    return this.sharing.resolveShare(input.token);
  }

  @Get("public-documents/:publicSlug")
  @ApiOperation({ summary: "Resolve a currently published document projection" })
  @ApiOkResponse({ type: PublishedDocumentDto })
  resolvePublished(@Param("publicSlug") publicSlug: string): Promise<PublishedDocumentDto> {
    return this.sharing.resolvePublished(publicSlug);
  }

  @Get("public-documents/:publicSlug/attachments/:attachmentId")
  @ApiOperation({ summary: "Redirect a published attachment to short-lived object storage" })
  async publicAttachment(
    @Param("publicSlug") publicSlug: string,
    @Param("attachmentId", ParseUUIDPipe) attachmentId: string,
    @Res() response: Response,
  ): Promise<void> {
    response.redirect(302, await this.sharing.publicAttachmentUrl(publicSlug, attachmentId));
  }
}
