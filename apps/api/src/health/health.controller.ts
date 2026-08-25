import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService, type HealthResponse } from "./health.service";

@ApiTags("operations")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Check API dependencies" })
  @ApiOkResponse({ description: "PostgreSQL and Redis are reachable" })
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
