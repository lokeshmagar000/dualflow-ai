/**
 * One shared Prisma client for the whole app.
 * In development, Next.js reloads code often, so we keep the client on globalThis
 * to avoid opening a new database connection on every reload.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
