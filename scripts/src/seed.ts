import {
  db, usersTable, cicoStatusTable, conversationsTable, conversationMembersTable,
  messagesTable, announcementsTable, auditLogsTable
} from "@workspace/db";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function seed() {
  console.log("Seeding database...");

  // Create users
  const users = await db.insert(usersTable).values([
    {
      employeeId: "EMP001",
      name: "Admin Sistem",
      email: "admin@curcol.id",
      password: hashPassword("EMP001"),
      department: "IT",
      position: "System Administrator",
      role: "admin",
      isActive: true,
    },
    {
      employeeId: "EMP002",
      name: "Budi Santoso",
      email: "budi@curcol.id",
      password: hashPassword("EMP002"),
      department: "HR",
      position: "HR Manager",
      role: "manager",
      isActive: true,
    },
    {
      employeeId: "EMP003",
      name: "Siti Rahayu",
      email: "siti@curcol.id",
      password: hashPassword("EMP003"),
      department: "Finance",
      position: "Financial Analyst",
      role: "employee",
      isActive: true,
    },
    {
      employeeId: "EMP004",
      name: "Andi Wijaya",
      email: "andi@curcol.id",
      password: hashPassword("EMP004"),
      department: "IT",
      position: "Software Developer",
      role: "employee",
      isActive: true,
    },
    {
      employeeId: "EMP005",
      name: "Dewi Kusuma",
      email: "dewi@curcol.id",
      password: hashPassword("EMP005"),
      department: "Marketing",
      position: "Marketing Specialist",
      role: "employee",
      isActive: true,
    },
    {
      employeeId: "EMP006",
      name: "Riko Pratama",
      email: "riko@curcol.id",
      password: hashPassword("EMP006"),
      department: "Operations",
      position: "Operations Lead",
      role: "manager",
      isActive: true,
    },
  ]).returning();

  console.log(`Created ${users.length} users`);

  // Seed CICO statuses
  const now = new Date();
  await db.insert(cicoStatusTable).values([
    { employeeId: "EMP001", status: "present", checkInTime: new Date(now.getTime() - 3*60*60*1000), location: "Office", updatedAt: now },
    { employeeId: "EMP002", status: "present", checkInTime: new Date(now.getTime() - 2*60*60*1000), location: "Office", updatedAt: now },
    { employeeId: "EMP003", status: "wfh", checkInTime: new Date(now.getTime() - 4*60*60*1000), location: "WFH", updatedAt: now },
    { employeeId: "EMP004", status: "break", checkInTime: new Date(now.getTime() - 5*60*60*1000), location: "Office", updatedAt: now },
    { employeeId: "EMP005", status: "absent", updatedAt: now },
    { employeeId: "EMP006", status: "present", checkInTime: new Date(now.getTime() - 1*60*60*1000), location: "Office", updatedAt: now },
  ]);

  console.log("Created CICO statuses");

  // Create a group conversation - General
  const [generalConv] = await db.insert(conversationsTable).values({
    type: "group",
    name: "General",
    description: "Percakapan umum seluruh karyawan",
    createdById: users[0].id,
    updatedAt: now,
  }).returning();

  await db.insert(conversationMembersTable).values(
    users.map(u => ({
      conversationId: generalConv.id,
      userId: u.id,
      role: u.id === users[0].id ? "admin" as const : "member" as const,
      joinedAt: now,
    }))
  );

  // Create IT team group
  const itUsers = users.filter(u => u.department === "IT");
  const [itConv] = await db.insert(conversationsTable).values({
    type: "group",
    name: "Tim IT",
    description: "Internal IT department channel",
    createdById: users[0].id,
    updatedAt: now,
  }).returning();

  await db.insert(conversationMembersTable).values(
    itUsers.map(u => ({
      conversationId: itConv.id,
      userId: u.id,
      role: u.id === users[0].id ? "admin" as const : "member" as const,
      joinedAt: now,
    }))
  );

  // Direct chat between EMP001 and EMP002
  const [directConv] = await db.insert(conversationsTable).values({
    type: "direct",
    createdById: users[0].id,
    updatedAt: now,
  }).returning();

  await db.insert(conversationMembersTable).values([
    { conversationId: directConv.id, userId: users[0].id, role: "member", joinedAt: now },
    { conversationId: directConv.id, userId: users[1].id, role: "member", joinedAt: now },
  ]);

  // Seed messages in General channel
  const generalMessages = [
    { senderId: users[0].id, content: "Selamat datang di CurCol! Platform komunikasi resmi karyawan kita. 🎉" },
    { senderId: users[1].id, content: "Terima kasih! Akhirnya ada platform chat yang terintegrasi CICO. Sangat membantu!" },
    { senderId: users[3].id, content: "Bagus sekali! Mudah-mudahan produktivitas tim kita semakin meningkat 💪" },
    { senderId: users[2].id, content: "Saya suka fitur status kehadiran-nya. Langsung tahu siapa yang sedang online atau tidak." },
    { senderId: users[4].id, content: "Ada yang tahu cara set Do Not Disturb? Kalau lagi fokus kerja bisa diganggu terus 😅" },
    { senderId: users[0].id, content: "Fitur DND akan segera hadir. Untuk sementara bisa mute notifikasi dari pengaturan profil." },
    { senderId: users[5].id, content: "Team, ada meeting standup jam 9 pagi ya. Jangan lupa hadir!" },
  ];

  const msgTimestamp = new Date(now.getTime() - 2*60*60*1000);
  for (let i = 0; i < generalMessages.length; i++) {
    const msgTime = new Date(msgTimestamp.getTime() + i * 5 * 60 * 1000);
    await db.insert(messagesTable).values({
      conversationId: generalConv.id,
      senderId: generalMessages[i].senderId,
      content: generalMessages[i].content,
      type: "text",
      createdAt: msgTime,
    });
  }

  // Direct chat messages
  await db.insert(messagesTable).values([
    {
      conversationId: directConv.id,
      senderId: users[0].id,
      content: "Halo Budi, ada waktu untuk review kebijakan baru dari IT Security?",
      type: "text",
      createdAt: new Date(now.getTime() - 30*60*1000),
    },
    {
      conversationId: directConv.id,
      senderId: users[1].id,
      content: "Tentu, saya sudah membaca draftnya. Ada beberapa poin yang perlu didiskusikan.",
      type: "text",
      createdAt: new Date(now.getTime() - 25*60*1000),
    },
    {
      conversationId: directConv.id,
      senderId: users[0].id,
      content: "Oke, kita meeting besok jam 10 ya.",
      type: "text",
      createdAt: new Date(now.getTime() - 20*60*1000),
    },
  ]);

  console.log("Created conversations and messages");

  // Announcements
  await db.insert(announcementsTable).values([
    {
      title: "Selamat Datang di CurCol!",
      content: "Dengan bangga kami memperkenalkan CurCol - platform komunikasi resmi karyawan yang terintegrasi dengan sistem CICO. Semua percakapan tercatat dan dapat diaudit sesuai kebijakan perusahaan.",
      authorId: users[1].id,
      isPinned: true,
      updatedAt: now,
    },
    {
      title: "Kebijakan Penggunaan Platform",
      content: "Harap diperhatikan bahwa semua percakapan di CurCol bersifat resmi dan dapat diaudit. Gunakan platform ini untuk keperluan pekerjaan. Dilarang menyebarkan informasi rahasia perusahaan kepada pihak yang tidak berwenang.",
      authorId: users[1].id,
      isPinned: false,
      updatedAt: now,
    },
    {
      title: "Meeting Town Hall Q1 2026",
      content: "Town Hall meeting akan dilaksanakan pada Jumat, 20 Maret 2026 pukul 14:00 WIB melalui CurCol Group 'All Hands'. Mohon kehadiran seluruh karyawan.",
      authorId: users[5].id,
      isPinned: false,
      updatedAt: now,
    },
  ]);

  // Audit logs
  for (const user of users) {
    await db.insert(auditLogsTable).values({
      userId: user.id,
      action: "login",
      entityType: "session",
      details: { source: "seed" } as any,
      createdAt: new Date(now.getTime() - Math.random() * 3600000),
    });
  }

  console.log("Created announcements and audit logs");
  console.log("\nSeed complete! Login credentials (SSO — password = Employee ID):");
  console.log("  Admin:    EMP001 / EMP001");
  console.log("  Manager:  EMP002 / EMP002");
  console.log("  Employee: EMP003 / EMP003");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
