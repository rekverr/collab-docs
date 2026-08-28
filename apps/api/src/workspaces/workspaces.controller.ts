import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  AcceptWorkspaceInvitationDto,
  AcceptedWorkspaceMembershipDto,
  CurrentUserWorkspaceInvitationDto,
  CreateWorkspaceDto,
  InviteWorkspaceMemberDto,
  PendingWorkspaceInvitationDto,
  UpdateWorkspaceDto,
  UpdateWorkspaceMemberRoleDto,
  UpdatedWorkspaceMembershipDto,
  WorkspaceDto,
  WorkspaceInvitationDto,
  WorkspaceMemberDto,
} from "./dto/workspace.dto";
import { WorkspacesService } from "./workspaces.service";

@ApiTags("workspaces")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
@ApiForbiddenResponse({ description: "The current role lacks the required capability" })
@ApiNotFoundResponse({ description: "Workspace, membership, or invitation not found" })
@UseGuards(AccessTokenGuard)
@Controller()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post("workspaces")
  @ApiOperation({ summary: "Create a workspace owned by the current user" })
  @ApiCreatedResponse({ description: "Workspace created", type: WorkspaceDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, input);
  }

  @Get("workspaces")
  @ApiOperation({ summary: "List workspaces visible to the current user" })
  @ApiOkResponse({ description: "Workspace memberships", type: [WorkspaceDto] })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.list(user.id);
  }

  @Get("workspaces/:workspaceId")
  @ApiOperation({ summary: "Get a workspace" })
  @ApiOkResponse({ type: WorkspaceDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ) {
    return this.workspaces.get(user.id, workspaceId);
  }

  @Patch("workspaces/:workspaceId")
  @ApiOperation({ summary: "Update workspace settings" })
  @ApiOkResponse({ type: WorkspaceDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() input: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(user.id, workspaceId, input);
  }

  @Get("workspaces/:workspaceId/members")
  @ApiOperation({ summary: "List workspace members" })
  @ApiOkResponse({ type: [WorkspaceMemberDto] })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ) {
    return this.workspaces.listMembers(user.id, workspaceId);
  }

  @Post("workspaces/:workspaceId/invitations")
  @ApiOperation({ summary: "Invite a user by email" })
  @ApiCreatedResponse({ type: WorkspaceInvitationDto })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() input: InviteWorkspaceMemberDto,
  ) {
    return this.workspaces.invite(user.id, workspaceId, input);
  }

  @Post("workspace-invitations/accept")
  @ApiOperation({ summary: "Accept an invitation for the current account" })
  @ApiCreatedResponse({ type: AcceptedWorkspaceMembershipDto })
  accept(@CurrentUser() user: AuthenticatedUser, @Body() input: AcceptWorkspaceInvitationDto) {
    return this.workspaces.accept(user, input.token);
  }

  @Get("workspace-invitations/pending")
  @ApiOperation({ summary: "List pending workspace invitations for the current email" })
  @ApiOkResponse({ type: [CurrentUserWorkspaceInvitationDto] })
  listMyInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.listPendingForUser(user);
  }

  @Get("workspaces/:workspaceId/invitations")
  @ApiOperation({ summary: "List pending invitations for workspace administrators" })
  @ApiOkResponse({ type: [PendingWorkspaceInvitationDto] })
  listWorkspaceInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ) {
    return this.workspaces.listPendingForWorkspace(user.id, workspaceId);
  }

  @Post("workspace-invitations/:invitationId/accept")
  @ApiOperation({ summary: "Accept a pending invitation belonging to the current email" })
  @ApiCreatedResponse({ type: AcceptedWorkspaceMembershipDto })
  acceptById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.workspaces.acceptById(user, invitationId);
  }

  @Post("workspace-invitations/:invitationId/decline")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Decline a pending invitation belonging to the current email" })
  @ApiNoContentResponse({ description: "Invitation declined" })
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    return this.workspaces.decline(user, invitationId);
  }

  @Patch("workspaces/:workspaceId/members/:userId")
  @ApiOperation({ summary: "Change a workspace member role" })
  @ApiOkResponse({ type: UpdatedWorkspaceMembershipDto })
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
    @Body() input: UpdateWorkspaceMemberRoleDto,
  ) {
    return this.workspaces.updateMemberRole(user.id, workspaceId, targetUserId, input.role);
  }

  @Delete("workspaces/:workspaceId/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a workspace member" })
  @ApiNoContentResponse({ description: "Member removed" })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    return this.workspaces.removeMember(user.id, workspaceId, targetUserId);
  }
}
