import { BadRequestException } from "@nestjs/common";

const mentionPattern =
  /@\[[^\]\n]{1,120}\]\(([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\)/gi;

export function parseMentionUserIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(mentionPattern)) {
    const userId = match[1];
    if (userId !== undefined) ids.add(userId.toLowerCase());
  }
  return [...ids];
}

export function assertValidMentionTargets(
  mentionedUserIds: readonly string[],
  validUserIds: readonly string[],
): void {
  const valid = new Set(validUserIds);
  if (mentionedUserIds.some((userId) => !valid.has(userId))) {
    throw new BadRequestException("Mentions must target active members of this workspace");
  }
}
