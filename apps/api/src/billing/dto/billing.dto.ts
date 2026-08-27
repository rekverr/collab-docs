import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString, Length } from "class-validator";

export class ChangePlanDto {
  @ApiProperty({ enum: Plan })
  @IsEnum(Plan)
  plan!: Plan;
}

export class MockBillingWebhookDto extends ChangePlanDto {
  @ApiProperty()
  @IsString()
  @Length(3, 255)
  eventId!: string;

  @ApiPropertyOptional({ default: "customer.subscription.updated" })
  @IsOptional()
  @IsIn(["customer.subscription.updated"])
  eventType = "customer.subscription.updated";
}

export class BillingResourceUsageDto {
  @ApiProperty() used!: number;
  @ApiProperty() limit!: number;
}

export class BillingStorageUsageDto {
  @ApiProperty() usedBytes!: string;
  @ApiProperty() limitBytes!: string;
}

export class SubscriptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty({ enum: Plan }) plan!: Plan;
  @ApiProperty({ enum: SubscriptionStatus }) status!: SubscriptionStatus;
  @ApiProperty({ type: BillingResourceUsageDto }) members!: BillingResourceUsageDto;
  @ApiProperty({ type: BillingResourceUsageDto }) documents!: BillingResourceUsageDto;
  @ApiProperty({ type: BillingStorageUsageDto }) storage!: BillingStorageUsageDto;
  @ApiProperty({ nullable: true }) currentPeriodStart!: Date | null;
  @ApiProperty({ nullable: true }) currentPeriodEnd!: Date | null;
  @ApiProperty() updatedAt!: Date;
}

export class ChangePlanResultDto {
  @ApiProperty() checkoutId!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() applied!: boolean;
  @ApiProperty({ type: SubscriptionDto }) subscription!: SubscriptionDto;
}

export class MockWebhookResultDto {
  @ApiProperty() eventId!: string;
  @ApiProperty() applied!: boolean;
  @ApiProperty({ type: SubscriptionDto }) subscription!: SubscriptionDto;
}
