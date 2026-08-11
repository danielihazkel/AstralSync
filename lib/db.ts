import { PrismaClient } from "@prisma/client";

// Snapshots are write-once (PRD §6): editing birth data creates a new version
// row, never an UPDATE. This client-level guard makes the rule structural —
// snapshot rows can only be created here, and only deleted by the DB-level
// cascade when their profile is hard-deleted.
const WRITE_ONCE_MODELS = new Set(["AstroSnapshot", "NumeroSnapshot"]);
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
          return query(args);
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
