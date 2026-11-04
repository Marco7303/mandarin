import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const globalDatabase = globalThis as unknown as { moriDatabase?: PrismaClient };

export function getDatabase() {
    if (globalDatabase.moriDatabase) return globalDatabase.moriDatabase;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('Cloud database is not configured.');
    // Reuse a small pool across warm serverless invocations and development reloads.
    const adapter = new PrismaPg({ connectionString, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
    globalDatabase.moriDatabase = new PrismaClient({ adapter });
    return globalDatabase.moriDatabase;
}
