import { PrismaClient } from "@prisma/client";
import {
  shouldFilter,
  shouldFilterViaProfile,
  withLiveFilter,
  withLiveProfileFilter,
} from "./softDelete";

// Snapshots are write-once (PRD §6): editing birth data creates a new version
// row, never an UPDATE. This client-level guard makes the rule structural —
// snapshot rows can only be created here, and only deleted by the DB-level
// cascade when their profile is hard-deleted.
const WRITE_ONCE_MODELS = new Set([
  "AstroSnapshot",
  "NumeroSnapshot",
  "HebrewSnapshot",
]);
const BLOCKED_OPERATIONS = new Set([
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

function buildClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (WRITE_ONCE_MODELS.has(model) && BLOCKED_OPERATIONS.has(operation)) {
            throw new Error(
              `${model} is write-once: ${operation} is forbidden; create a new snapshot version instead`,
            );
          }
          // Soft delete (lib/softDelete.ts): profiles and journal entries in
          // the Trash are invisible to every ordinary query — only a caller
          // that names `deletedAt` itself (the Trash service) sees them.
          type Args = { where?: Record<string, unknown> } & Record<string, unknown>;
          let next = args as Args;
          if (shouldFilter(model, operation)) next = withLiveFilter(next);
          // Snapshots and notes of a trashed profile are hidden too, via the
          // relation, so the ephemeral reads that query them by profileId
          // 404 like the profile view does.
          if (shouldFilterViaProfile(model, operation)) {
            next = withLiveProfileFilter(next);
          }
          return query(next as typeof args);
        },
      },
    },
  });
}

// Singleton so Next.js dev-mode hot reload doesn't exhaust MySQL connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof buildClient>;
};

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
