import { plainToInstance, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Length,
  Matches,
  Min,
  validateSync,
} from "class-validator";

export enum RuntimeEnvironment {
  Development = "development",
  Test = "test",
  Production = "production",
}

const httpUrlOptions = {
  protocols: ["http", "https"],
  require_protocol: true,
  require_tld: false,
};

export class AppEnvironment {
  @IsEnum(RuntimeEnvironment)
  NODE_ENV!: RuntimeEnvironment;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  API_PORT!: number;

  @IsUrl({ protocols: ["postgresql"], require_protocol: true, require_tld: false })
  DATABASE_URL!: string;

  @IsUrl({ protocols: ["redis", "rediss"], require_protocol: true, require_tld: false })
  REDIS_URL!: string;

  @IsString()
  @Length(32, 512)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @Length(32, 512)
  JWT_REFRESH_SECRET!: string;

  @Matches(/^\d+[smhd]$/)
  JWT_ACCESS_TTL!: string;

  @Matches(/^\d+[smhd]$/)
  JWT_REFRESH_TTL!: string;

  @IsUrl(httpUrlOptions)
  S3_ENDPOINT!: string;

  @IsUrl(httpUrlOptions)
  S3_PUBLIC_ENDPOINT!: string;

  @IsString()
  @Length(3, 255)
  S3_ACCESS_KEY!: string;

  @IsString()
  @Length(8, 512)
  S3_SECRET_KEY!: string;

  @IsString()
  @Length(3, 63)
  S3_BUCKET!: string;

  @IsString()
  @Length(2, 64)
  S3_REGION!: string;

  @IsUrl(httpUrlOptions)
  WEB_URL!: string;

  @IsUrl(httpUrlOptions)
  INTERNAL_WEB_URL!: string;

  @IsUrl(httpUrlOptions)
  API_URL!: string;

  @IsUrl(httpUrlOptions)
  INTERNAL_API_URL!: string;

  @IsUrl({ protocols: ["ws", "wss"], require_protocol: true, require_tld: false })
  COLLAB_URL!: string;

  @IsString()
  @Length(32, 512)
  REVALIDATION_SECRET!: string;
}

export function validateEnvironment(values: Record<string, unknown>): AppEnvironment {
  const environment = plainToInstance(
    AppEnvironment,
    {
      NODE_ENV: RuntimeEnvironment.Development,
      API_PORT: 3001,
      ...values,
      INTERNAL_WEB_URL: values.INTERNAL_WEB_URL ?? values.WEB_URL,
      S3_PUBLIC_ENDPOINT: values.S3_PUBLIC_ENDPOINT ?? values.S3_ENDPOINT,
    },
    { enableImplicitConversion: true },
  );
  const errors = validateSync(environment, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    const invalidKeys = errors
      .map((error) => error.property)
      .sort()
      .join(", ");
    throw new Error(`Environment validation failed for: ${invalidKeys}`);
  }

  return environment;
}
