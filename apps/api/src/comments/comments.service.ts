import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "../permissions/policy.service";
import { assertCanResolveComment, assertCommentOwner } from "./comment-rules";
import type {
  CommentDto,
  CommentThreadDto,
  CreateCommentDto,
  CreateReplyDto,
  MentionCandidateDto,
  UpdateCommentDto,
} from "./dto/comment.dto";
import { assertValidMentionTargets, parseMentionUserIds } from "./mentions";
import { mentionNotificationTargets, replyNotificationTargets } from "./notification-targets";

const authorSelect = { id: true, email: true, displayName: true } satisfies Prisma.UserSelect;
const commentSelect = {
  id: true,
  documentId: true,
  authorId: true,
  parentId: true,
  blockId: true,
  body: true,
  deletedAt: true,
  resolvedAt: true,
  author: { select: authorSelect },
  resolvedBy: { select: authorSelect },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CommentSelect;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  async create(userId: string, documentId: string, input: CreateCommentDto): Promise<CommentDto> {
    return this.prisma.$transaction(async (transaction) => {
      const document = await this.requireDocument(transaction, userId, documentId);
      if (input.blockId !== undefined) assertProjectionContainsBlock(document, input.blockId);
      const body = normalizedBody(input.body);
      const mentionedUserIds = parseMentionUserIds(body);
      await this.validateMentions(transaction, document.workspaceId, mentionedUserIds);
      const comment = await transaction.comment.create({
        data: {
          documentId,
          authorId: userId,
          blockId: input.blockId ?? null,
          body,
        },
        select: commentSelect,
      });
      await this.createMentionNotifications(
        transaction,
        document.workspaceId,
        documentId,
        comment.id,
        userId,
        mentionedUserIds,
      );
      return mapComment(comment);
    });
  }

  async reply(userId: string, commentId: string, input: CreateReplyDto): Promise<CommentDto> {
    return this.prisma.$transaction(async (transaction) => {
      const parent = await transaction.comment.findFirst({
        where: { id: commentId, parentId: null, deletedAt: null },
        select: { id: true, documentId: true, authorId: true },
      });
      if (parent === null) throw new NotFoundException("Comment thread not found");
      const document = await this.requireDocument(transaction, userId, parent.documentId);
      const body = normalizedBody(input.body);
      const mentionedUserIds = parseMentionUserIds(body);
      await this.validateMentions(transaction, document.workspaceId, mentionedUserIds);
      const reply = await transaction.comment.create({
        data: { documentId: parent.documentId, authorId: userId, parentId: parent.id, body },
        select: commentSelect,
      });
      await createNotifications(
        transaction,
        document.workspaceId,
        parent.documentId,
        reply.id,
        userId,
        replyNotificationTargets(userId, parent.authorId, mentionedUserIds),
      );
      return mapComment(reply);
    });
  }

  async listThreads(userId: string, documentId: string): Promise<CommentThreadDto[]> {
    await this.requireDocument(this.prisma, userId, documentId);
    const threads = await this.prisma.comment.findMany({
      where: { documentId, parentId: null },
      orderBy: { createdAt: "asc" },
      select: {
        ...commentSelect,
        replies: { orderBy: { createdAt: "asc" }, select: commentSelect },
      },
    });
    return threads.map((thread) => ({
      ...mapComment(thread),
      replies: thread.replies.map(mapComment),
    }));
  }

  async edit(userId: string, commentId: string, input: UpdateCommentDto): Promise<CommentDto> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.requireComment(transaction, commentId);
      await this.requireDocument(transaction, userId, existing.documentId);
      assertCommentOwner(userId, existing.authorId);
      if (existing.deletedAt !== null)
        throw new UnprocessableEntityException("Deleted comments cannot be edited");
      const body = normalizedBody(input.body);
      const mentionedUserIds = parseMentionUserIds(body);
      await this.validateMentions(transaction, existing.document.workspaceId, mentionedUserIds);
      const updated = await transaction.comment.update({
        where: { id: commentId },
        data: { body },
        select: commentSelect,
      });
      await this.createMentionNotifications(
        transaction,
        existing.document.workspaceId,
        existing.documentId,
        existing.id,
        userId,
        mentionedUserIds,
      );
      return mapComment(updated);
    });
  }

  async delete(userId: string, commentId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await this.requireComment(transaction, commentId);
      await this.requireDocument(transaction, userId, existing.documentId);
      assertCommentOwner(userId, existing.authorId);
      const replyCount = await transaction.comment.count({ where: { parentId: commentId } });
      if (replyCount === 0) await transaction.comment.delete({ where: { id: commentId } });
      else {
        await transaction.comment.update({
          where: { id: commentId },
          data: { body: "", deletedAt: new Date() },
        });
      }
    });
  }

  async setResolved(userId: string, commentId: string, resolved: boolean): Promise<CommentDto> {
    return this.prisma.$transaction(async (transaction) => {
      const comment = await this.requireComment(transaction, commentId);
      if (comment.deletedAt !== null)
        throw new UnprocessableEntityException("Deleted threads cannot be resolved");
      const access = await this.requireDocument(transaction, userId, comment.documentId);
      assertCanResolveComment(
        userId,
        comment.authorId,
        this.policy.hasCapability(access.role, "document.edit"),
        comment.parentId,
      );
      const updated = await transaction.comment.update({
        where: { id: commentId },
        data: resolved
          ? { resolvedAt: new Date(), resolvedById: userId }
          : { resolvedAt: null, resolvedById: null },
        select: commentSelect,
      });
      if (resolved && comment.authorId !== userId) {
        await createNotifications(
          transaction,
          access.workspaceId,
          comment.documentId,
          comment.id,
          userId,
          new Map([[comment.authorId, NotificationType.COMMENT_RESOLVED]]),
        );
      }
      return mapComment(updated);
    });
  }

  async mentionCandidates(userId: string, documentId: string): Promise<MentionCandidateDto[]> {
    const document = await this.requireDocument(this.prisma, userId, documentId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: document.workspaceId, user: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { user: { select: authorSelect } },
    });
    return members.map(({ user }) => user);
  }

  private async requireDocument(
    database: PrismaService | Prisma.TransactionClient,
    userId: string,
    documentId: string,
  ) {
    const document = await database.document.findFirst({
      where: { id: documentId, deletedAt: null, archivedAt: null },
      select: { id: true, workspaceId: true, contentProjection: true },
    });
    if (document === null) throw new NotFoundException("Document not found");
    const access = await this.policy.requireWorkspaceCapability(
      userId,
      document.workspaceId,
      "document.read",
      database,
    );
    return { ...document, role: access.role };
  }

  private async requireComment(database: Prisma.TransactionClient, commentId: string) {
    const comment = await database.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        documentId: true,
        authorId: true,
        parentId: true,
        deletedAt: true,
        document: { select: { workspaceId: true } },
      },
    });
    if (comment === null) throw new NotFoundException("Comment not found");
    return comment;
  }

  private async validateMentions(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    mentionedUserIds: readonly string[],
  ): Promise<void> {
    if (mentionedUserIds.length === 0) return;
    const members = await transaction.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { in: [...mentionedUserIds] },
        user: { deletedAt: null },
      },
      select: { userId: true },
    });
    assertValidMentionTargets(
      mentionedUserIds,
      members.map(({ userId }) => userId),
    );
  }

  private createMentionNotifications(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    documentId: string,
    commentId: string,
    actorId: string,
    mentionedUserIds: readonly string[],
  ): Promise<void> {
    return createNotifications(
      transaction,
      workspaceId,
      documentId,
      commentId,
      actorId,
      mentionNotificationTargets(actorId, mentionedUserIds),
    );
  }
}

type CommentRecord = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function mapComment(comment: CommentRecord): CommentDto {
  return {
    id: comment.id,
    documentId: comment.documentId,
    parentId: comment.parentId,
    blockId: comment.blockId,
    body: comment.deletedAt === null ? comment.body : "Deleted comment",
    deleted: comment.deletedAt !== null,
    resolvedAt: comment.resolvedAt,
    resolvedBy: comment.resolvedBy,
    author: comment.author,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

function normalizedBody(value: string): string {
  const body = value.replace(/\u0000/g, "").trim();
  if (body === "") throw new BadRequestException("Comment body cannot be empty");
  return body;
}

function assertProjectionContainsBlock(
  document: { contentProjection: Prisma.JsonValue | null },
  blockId: string,
): void {
  const projection = document.contentProjection;
  if (!isRecord(projection))
    throw new UnprocessableEntityException("Document blocks are not ready");
  const blocks: unknown = Reflect.get(projection, "blocks");
  if (!Array.isArray(blocks))
    throw new UnprocessableEntityException("Document blocks are not ready");
  const exists = blocks.some((block) => isRecord(block) && Reflect.get(block, "id") === blockId);
  if (!exists) throw new UnprocessableEntityException("Comment block no longer exists");
}

async function createNotifications(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  documentId: string,
  commentId: string,
  actorId: string,
  notifications: ReadonlyMap<string, NotificationType>,
): Promise<void> {
  if (notifications.size === 0) return;
  await transaction.notification.createMany({
    data: [...notifications].map(([recipientId, type]) => ({
      recipientId,
      actorId,
      workspaceId,
      documentId,
      commentId,
      type,
    })),
    skipDuplicates: true,
  });
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
