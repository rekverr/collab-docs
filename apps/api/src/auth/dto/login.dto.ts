import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "person@example.com" })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ format: "password" })
  @IsString()
  @MaxLength(128)
  password!: string;
}
