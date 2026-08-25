import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "person@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 12, format: "password" })
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/, {
    message: "password must be 12-128 characters and include upper-case, lower-case, and numeric characters",
  })
  password!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
