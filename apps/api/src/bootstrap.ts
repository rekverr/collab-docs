import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import type { AppEnvironment } from "./common/config/environment";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { JsonLogger } from "./common/logging/json-logger.service";

export interface CreateApiApplicationOptions {
  enableShutdownHooks?: boolean;
  enableSwagger?: boolean;
}

export async function createApiApplication(
  options: CreateApiApplicationOptions = {},
): Promise<INestApplication> {
  const bootstrapLogger = new JsonLogger();
  const app = await NestFactory.create(AppModule, { logger: bootstrapLogger });
  const logger = app.get(JsonLogger);

  app.useLogger(logger);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      whitelist: true,
    }),
  );
  app.useGlobalFilters(app.get(AllExceptionsFilter));

  if (options.enableShutdownHooks === true) app.enableShutdownHooks();
  if (options.enableSwagger !== false) {
    const openApiConfig = new DocumentBuilder()
      .setTitle("Collab Docs API")
      .setDescription("REST API for Collab Docs")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openApiConfig));
  }

  return app;
}

export async function startApi(): Promise<void> {
  const app = await createApiApplication({ enableShutdownHooks: true });
  const logger = app.get(JsonLogger);
  const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  const port = config.getOrThrow("API_PORT", { infer: true });

  await app.listen(port, "0.0.0.0");
  logger.event("info", "api_listening", { port });
}
