import { BadRequestException, type PipeTransform } from "@nestjs/common";

export class PublicSlugPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== "string" || !/^[a-z0-9-]{1,160}$/.test(value)) {
      throw new BadRequestException("Invalid public document slug");
    }
    return value;
  }
}
