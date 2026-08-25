import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AcceptWorkspaceInvitationDto, CreateWorkspaceDto, InviteWorkspaceMemberDto, UpdateWorkspaceDto, UpdateWorkspaceMemberRoleDto } from "./dto/workspace.dto";
import { WorkspacesService } from "./workspaces.service";

@ApiTags("workspaces")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post("workspaces")
  @ApiOperation({ summary: "Create a workspace owned by the current user" })
  @ApiCreatedResponse({ description: "Workspace created" })
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, input);
  }

  @Get("workspaces")
  @ApiOperation({ summary: "List workspaces visible to the current user" })
  @ApiOkResponse({ description: "Workspace memberships" })
  list(@CurrentUser() user: AuthenticatedUser) { return this.workspaces.list(user.id); }

  @Get("workspaces/:workspaceId")
  @ApiOperation({ summary: "Get a workspace" })
  get(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.get(user.id, workspaceId);
  }

  @Patch("workspaces/:workspaceId")
  @ApiOperation({ summary: "Update workspace settings" })
  update(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string, @Body() input: UpdateWorkspaceDto) {
    return this.workspaces.update(user.id, workspaceId, input);
  }

  @Get("workspaces/:workspaceId/members")
  @ApiOperation({ summary: "List workspace members" })
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.listMembers(user.id, workspaceId);
  }

  @Post("workspaces/:workspaceId/invitations")
  @ApiOperation({ summary: "Invite a user by email" })
  invite(@CurrentUser() user: AuthenticatedUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string, @Body() input: InviteWorkspaceMemberDto) {
    return this.workspaces.invite(user.id, workspaceId, input);
  }

  @Post("workspace-invitations/accept")
  @ApiOperation({ summary: "Accept an invitation for the current account" })
  accept(@CurrentUser() user: AuthenticatedUser, @Body() input: AcceptWorkspaceInvitationDto) {
    return this.workspaces.accept(user, input.token);
  }

  @Patch("workspaces/:workspaceId/members/:userId")
  @ApiOperation({ summary: "Change a workspace member role" })
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
    @Body() input: UpdateWorkspaceMemberRoleDto,
  ) { return this.workspaces.updateMemberRole(user.id, workspaceId, targetUserId, input.role); }

  @Delete("workspaces/:workspaceId/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a workspace member" })
  @ApiNoContentResponse({ description: "Member removed" })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
  ): Promise<void> { return this.workspaces.removeMember(user.id, workspaceId, targetUserId); }
}
