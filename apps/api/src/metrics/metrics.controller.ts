import { Controller, Get, Header } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { MetricsService } from "./metrics.service";

@ApiTags("operations")
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @ApiOperation({ summary: "Get Prometheus metrics" })
  @ApiProduces("text/plain")
  @ApiOkResponse({ description: "Prometheus text exposition" })
  getMetrics(): Promise<string> {
    return this.metrics.render();
  }
}
