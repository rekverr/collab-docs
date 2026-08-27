import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CommentsService } from "./comments.service";
import {
  CommentDto,
  CommentThreadDto,
  CreateCommentDto,
  CreateReplyDto,
  MentionCandidateDto,
  ResolveCommentDto,
  UpdateCommentDto,
} from "./dto/comment.dto";

@ApiTags("comments")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
@ApiForbiddenResponse({ description: "Comment action is not permitted" })
@ApiNotFoundResponse({ description: "Document, comment, or thread not found" })
@UseGuards(AccessTokenGuard)
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post("documents/:documentId/comments")
  @ApiOperation({ summary: "Create a document or block comment" })
  @ApiCreatedResponse({ type: CommentDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.create(user.id, documentId, input);
  }

  @Get("documents/:documentId/comments")
  @ApiOperation({ summary: "List document comment threads" })
  @ApiOkResponse({ type: [CommentThreadDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<CommentThreadDto[]> {
    return this.comments.listThreads(user.id, documentId);
  }

  @Get("documents/:documentId/comment-mention-candidates")
  @ApiOperation({ summary: "List active workspace members available for mentions" })
  @ApiOkResponse({ type: [MentionCandidateDto] })
  mentionCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<MentionCandidateDto[]> {
    return this.comments.mentionCandidates(user.id, documentId);
  }

  @Post("comments/:commentId/replies")
  @ApiOperation({ summary: "Reply to a comment thread" })
  @ApiCreatedResponse({ type: CommentDto })
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Body() input: CreateReplyDto,
  ): Promise<CommentDto> {
    return this.comments.reply(user.id, commentId, input);
  }

  @Patch("comments/:commentId")
  @ApiOperation({ summary: "Edit an own comment" })
  @ApiOkResponse({ type: CommentDto })
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Body() input: UpdateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.edit(user.id, commentId, input);
  }

  @Delete("comments/:commentId")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete or redact an own comment" })
  @ApiNoContentResponse()
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("commentId", ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    await this.comments.delete(user.id, commentId);
  }

  @Patch("comments/:commentId/resolution")
  @ApiOperation({ summary: "Resolve or reopen a root comment thread" })
  @ApiOkResponse({ type: CommentDto })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Body() input: ResolveCommentDto,
  ): Promise<CommentDto> {
    return this.comments.setResolved(user.id, commentId, input.resolved);
  }
}
