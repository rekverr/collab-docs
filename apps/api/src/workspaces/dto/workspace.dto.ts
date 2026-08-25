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
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "slug must contain lowercase letters, numbers, and single hyphens" })
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
