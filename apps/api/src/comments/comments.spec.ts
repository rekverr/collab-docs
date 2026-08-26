import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { assertCanResolveComment, assertCommentOwner } from "./comment-rules";
import { assertValidMentionTargets, parseMentionUserIds } from "./mentions";
import { mentionNotificationTargets, replyNotificationTargets } from "./notification-targets";

const aliceId = "11111111-1111-4111-8111-111111111111";
const bobId = "22222222-2222-4222-8222-222222222222";
const outsiderId = "33333333-3333-4333-8333-333333333333";

describe("comment mentions and authorization", () => {
  it("parses and deduplicates structured mentions", () => {
    const body = `Hi @[Alice](${aliceId}) and @[Alice again](${aliceId}).`;
    assert.deepEqual(parseMentionUserIds(body), [aliceId]);
  });

  it("rejects mentions outside the workspace", () => {
    assert.throws(
      () => assertValidMentionTargets([aliceId, outsiderId], [aliceId]),
      BadRequestException,
    );
  });

  it("allows only an author to edit or delete a comment", () => {
    assert.doesNotThrow(() => assertCommentOwner(aliceId, aliceId));
    assert.throws(() => assertCommentOwner(bobId, aliceId), ForbiddenException);
  });

  it("allows the thread author or a document editor to resolve a root thread", () => {
    assert.doesNotThrow(() => assertCanResolveComment(aliceId, aliceId, false, null));
    assert.doesNotThrow(() => assertCanResolveComment(bobId, aliceId, true, null));
    assert.throws(() => assertCanResolveComment(bobId, aliceId, false, null), ForbiddenException);
    assert.throws(
      () => assertCanResolveComment(aliceId, aliceId, true, bobId),
      UnprocessableEntityException,
    );
  });

  it("deduplicates recipients, excludes the actor, and prioritizes mentions", () => {
    assert.deepEqual(
      [...mentionNotificationTargets(aliceId, [aliceId, bobId, bobId])],
      [[bobId, NotificationType.MENTION]],
    );
    assert.deepEqual(
      [...replyNotificationTargets(aliceId, bobId, [aliceId, bobId])],
      [[bobId, NotificationType.MENTION]],
    );
  });
});
