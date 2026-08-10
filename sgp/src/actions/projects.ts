"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { logAudit } from "@/actions/audit";
import { revalidatePath } from "next/cache";

const projectSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  area: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export async function createProject(input: z.infer<typeof projectSchema>) {
  try {
    const user = await requireDbUser();
    const data = projectSchema.parse(input);

    const project = await prisma.project.create({ data });

    await logAudit({
      userId: user.id,
      action: "create",
      entity: "Project",
      entityId: project.id,
      after: project,
    });

    revalidatePath("/dashboard/projetos");
    return { success: true as const, project };
  } catch {
    return { success: false as const, error: "Não foi possível criar o projeto" };
  }
}
