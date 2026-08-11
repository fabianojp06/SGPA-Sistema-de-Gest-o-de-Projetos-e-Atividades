import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req, {
      signingSecret: process.env.CLERK_WEBHOOK_SECRET,
    });
  } catch {
    return new Response("Assinatura inválida", { status: 400 });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url } = event.data;
    const email = email_addresses[0]?.email_address;

    if (email) {
      await prisma.user.upsert({
        where: { clerkId: id },
        update: {
          name: `${first_name ?? ""} ${last_name ?? ""}`.trim() || email,
          email,
          avatarUrl: image_url,
        },
        create: {
          clerkId: id,
          name: `${first_name ?? ""} ${last_name ?? ""}`.trim() || email,
          email,
          avatarUrl: image_url,
        },
      });
    }
  }

  if (event.type === "user.deleted" && event.data.id) {
    await prisma.user.updateMany({
      where: { clerkId: event.data.id },
      data: { deletedAt: new Date() },
    });
  }

  return new Response("ok", { status: 200 });
}
