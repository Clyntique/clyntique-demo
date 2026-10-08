// Development-only seed: creates the two fictional demo users.
// Safe to run repeatedly (upsert by email). Run with: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed demo users when NODE_ENV=production.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

// Development-only passwords, documented in README.md. Not real credentials.
const DEMO_USERS: { name: string; email: string; password: string; role: Role }[] = [
  {
    name: "Clyntique Team",
    email: "team@clyntique.demo",
    password: "clyntique-team-dev",
    role: "TEAM",
  },
  {
    name: "Alex Morgan",
    email: "client@clyntique.demo",
    password: "clyntique-client-dev",
    role: "CLIENT",
  },
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  for (const { password, ...user } of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
    console.log(`Seeded ${user.role} user ${user.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
