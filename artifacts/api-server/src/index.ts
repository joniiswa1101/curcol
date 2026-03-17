import { createServer } from "http";
import app from "./app.js";
import { initWebSocket } from "./lib/websocket.js";
import { db, usersTable, cicoStatusTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function ensureSeeded() {
  try {
    const [existingUser] = await db.select().from(usersTable).limit(1);
    if (existingUser) {
      console.log("✅ Database already seeded, skipping...");
      return;
    }

    console.log("🌱 Seeding database with initial data...");
    const now = new Date();
    
    const users = await db.insert(usersTable).values([
      {
        employeeId: "EMP001",
        name: "Admin Sistem",
        email: "admin@corpchat.id",
        password: hashPassword("EMP001"),
        department: "IT",
        position: "System Administrator",
        role: "admin",
        isActive: true,
      },
      {
        employeeId: "EMP002",
        name: "Budi Santoso",
        email: "budi@corpchat.id",
        password: hashPassword("EMP002"),
        department: "HR",
        position: "HR Manager",
        role: "manager",
        isActive: true,
      },
      {
        employeeId: "EMP003",
        name: "Siti Rahayu",
        email: "siti@corpchat.id",
        password: hashPassword("EMP003"),
        department: "Finance",
        position: "Financial Analyst",
        role: "employee",
        isActive: true,
      },
      {
        employeeId: "EMP004",
        name: "Andi Wijaya",
        email: "andi@corpchat.id",
        password: hashPassword("EMP004"),
        department: "IT",
        position: "Software Developer",
        role: "employee",
        isActive: true,
      },
      {
        employeeId: "EMP005",
        name: "Dewi Kusuma",
        email: "dewi@corpchat.id",
        password: hashPassword("EMP005"),
        department: "Marketing",
        position: "Marketing Specialist",
        role: "employee",
        isActive: true,
      },
      {
        employeeId: "EMP006",
        name: "Riko Pratama",
        email: "riko@corpchat.id",
        password: hashPassword("EMP006"),
        department: "Operations",
        position: "Operations Lead",
        role: "manager",
        isActive: true,
      },
    ]).returning();

    await db.insert(cicoStatusTable).values([
      { employeeId: "EMP001", status: "present", checkInTime: new Date(now.getTime() - 3*60*60*1000), location: "Office", updatedAt: now },
      { employeeId: "EMP002", status: "present", checkInTime: new Date(now.getTime() - 2*60*60*1000), location: "Office", updatedAt: now },
      { employeeId: "EMP003", status: "wfh", checkInTime: new Date(now.getTime() - 4*60*60*1000), location: "WFH", updatedAt: now },
      { employeeId: "EMP004", status: "break", checkInTime: new Date(now.getTime() - 5*60*60*1000), location: "Office", updatedAt: now },
      { employeeId: "EMP005", status: "absent", updatedAt: now },
      { employeeId: "EMP006", status: "present", checkInTime: new Date(now.getTime() - 1*60*60*1000), location: "Office", updatedAt: now },
    ]);

    console.log(`✅ Seeded ${users.length} users and CICO statuses`);
  } catch (err) {
    console.error("⚠️ Seed check failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const httpServer = createServer(app);
initWebSocket(httpServer);

// Seed database before starting server
ensureSeeded().then(() => {
  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}).catch(err => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
