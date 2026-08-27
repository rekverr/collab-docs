import { WorkspaceRole } from "@prisma/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

export class CreateWorkspaceDto {
  @ApiProperty({ example: "Acme Docs" })
  @IsString()
  @Length(1, 160)
  name!: string;

  @ApiProperty({ example: "acme-docs" })
  @IsString()
  @Length(3, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must contain lowercase letters, numbers, and single hyphens",
  })
  slug!: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ example: "Acme Knowledge Base" })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;
}

export class InviteWorkspaceMemberDto {
  @ApiProperty({ example: "teammate@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.EDITOR })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}

export class UpdateWorkspaceMemberRoleDto {
  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.VIEWER })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}

export class AcceptWorkspaceInvitationDto {
  @ApiProperty({ description: "Raw invitation token delivered to the invitee" })
  @IsString()
  @Length(40, 200)
  token!: string;
}

export class WorkspaceDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ format: "uuid" }) ownerId!: string;
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class WorkspaceMemberUserDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

export class WorkspaceMemberDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
  @ApiProperty({ type: WorkspaceMemberUserDto }) user!: WorkspaceMemberUserDto;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class WorkspaceInvitationDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) workspaceId!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
  @ApiProperty() status!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ description: "Returned only once so it can be delivered to the invitee" })
  token!: string;
}

export class AcceptedWorkspaceMembershipDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) workspaceId!: string;
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
  @ApiProperty() createdAt!: Date;
}

export class UpdatedWorkspaceMembershipDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) workspaceId!: string;
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
  @ApiProperty() updatedAt!: Date;
}
