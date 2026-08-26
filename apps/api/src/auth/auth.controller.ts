import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { AppEnvironment } from "../common/config/environment";
import { RuntimeEnvironment } from "../common/config/environment";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthService } from "./auth.service";
import type { AuthResult, AuthenticatedUser, ClientMetadata } from "./auth.types";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { LoginRateLimiter } from "./login-rate-limiter.service";

const refreshCookieName = "collab_docs_refresh";
interface PublicAuthResponse { accessToken: string; user: AuthenticatedUser }

@ApiTags("authentication")
@Controller("auth")
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly rateLimiter: LoginRateLimiter,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.secureCookies = config.getOrThrow("NODE_ENV", { infer: true }) === RuntimeEnvironment.Production;
  }

  @Post("register")
  @ApiOperation({ summary: "Register a user" })
  @ApiCreatedResponse({ description: "User registered; refresh session set as an HttpOnly cookie" })
  @ApiConflictResponse({ description: "Email already registered" })
  async register(@Body() dto: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<PublicAuthResponse> {
    return this.respond(await this.auth.register(dto, clientMetadata(request)), response);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Log in" })
  @ApiOkResponse({ description: "Authenticated; refresh session set as an HttpOnly cookie" })
  @ApiUnauthorizedResponse({ description: "Invalid credentials" })
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<PublicAuthResponse> {
    await this.rateLimiter.check(dto.email, request.ip ?? "unknown");
    return this.respond(await this.auth.login(dto, clientMetadata(request)), response);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate the refresh session" })
  @ApiOkResponse({ description: "Refresh session rotated" })
  @ApiUnauthorizedResponse({ description: "Missing, expired, revoked, or reused refresh session" })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<PublicAuthResponse> {
    return this.respond(await this.auth.refresh(readCookie(request, refreshCookieName), clientMetadata(request)), response);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current refresh session" })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(readCookie(request, refreshCookieName));
    response.clearCookie(refreshCookieName, { httpOnly: true, sameSite: "lax", secure: this.secureCookies, path: "/" });
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current user" })
  @ApiOkResponse({ description: "Current authenticated user" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
  currentUser(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser { return user; }

  private respond(result: AuthResult, response: Response): PublicAuthResponse {
    response.cookie(refreshCookieName, result.refreshToken, {
      httpOnly: true,
      maxAge: Math.max(0, result.refreshExpiresAt.getTime() - Date.now()),
      sameSite: "lax",
      secure: this.secureCookies,
      path: "/",
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}

function clientMetadata(request: Request): ClientMetadata {
  const userAgent = request.header("user-agent");
  return { ipAddress: request.ip, ...(userAgent === undefined ? {} : { userAgent: userAgent.slice(0, 512) }) };
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.header("cookie");
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}
