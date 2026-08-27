import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { AuthenticatedUser } from "../auth.types";

export class AuthenticatedUserDto implements AuthenticatedUser {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ description: "Short-lived JWT used as a Bearer access token" })
  accessToken!: string;

  @ApiProperty({ type: AuthenticatedUserDto })
  user!: AuthenticatedUserDto;
}
