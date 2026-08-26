import { revalidatePath, revalidateTag } from "next/cache";
import { handlePublicRevalidationRequest } from "../../../../lib/public-documents/public-revalidation";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handlePublicRevalidationRequest(request, {
    secret: process.env.REVALIDATION_SECRET,
    revalidatePath,
    revalidateTag,
  });
}
