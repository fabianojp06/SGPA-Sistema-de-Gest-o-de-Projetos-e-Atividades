import { headers } from "next/headers";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret não configurado", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Cabeçalhos svix ausentes", { status: 400 });
  }

  const body = await req.text();
  const webhook = new Webhook(secret);

  let event: WebhookEvent;
  try {
    event = webhook.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
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
