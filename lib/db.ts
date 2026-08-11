import { PrismaClient } from "@prisma/client";

// Singleton so Next.js dev-mode hot reload doesn't exhaust MySQL connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
