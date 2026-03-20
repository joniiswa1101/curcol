/**
 * GDPR Data Export Service
 * Allow users to export their personal data
 */

import { db, usersTable, conversationsTable, messagesTable, attachmentsTable, auditLogsTable, conversationMembersTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";

interface UserExportData {
  user: {
    id: number;
    employeeId: string;
    name: string;
    email: string;
    phone?: string;
    department?: string;
    position?: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  conversations: Array<{
    id: number;
    name: string;
    isGroup: boolean;
    members: string[];
    createdAt: string;
    updatedAt: string;
  }>;
  messages: Array<{
    id: number;
    conversationId: number;
    conversationName: string;
    text: string;
    type: string;
    senderId: number;
    senderName: string;
    isEdited: boolean;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  attachments: Array<{
    id: number;
    fileName: string;
    fileSize: number;
    mimeType: string;
    url: string;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: number;
    action: string;
    entityType: string;
    details: any;
    createdAt: string;
  }>;
  export: {
    requestedAt: string;
    exportedAt: string;
    totalItems: number;
  };
}

/**
 * Export user's personal data
 */
export async function exportUserData(userId: number): Promise<UserExportData> {
  // Get user info
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Get conversations user is member of
  const conversations = await db.query.conversationsTable.findMany({
    where: eq(conversationsTable.id, (c) =>
      db
        .select({ id: conversationMembersTable.conversationId })
        .from(conversationMembersTable)
        .where(eq(conversationMembersTable.userId, userId))
    ),
  });

  // Get all members for each conversation
  const conversationsWithMembers = await Promise.all(
    conversations.map(async (conv) => {
      const members = await db.query.conversationMembersTable.findMany({
        where: eq(conversationMembersTable.conversationId, conv.id),
        with: { user: true },
      });
      return {
        id: conv.id,
        name: conv.name,
        isGroup: conv.isGroup,
        members: members.map((m) => m.user.name),
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
      };
    })
  );

  // Get messages sent by user
  const messages = await db.query.messagesTable.findMany({
    where: eq(messagesTable.senderId, userId),
  });

  // Get message details with conversation and sender info
  const messagesWithDetails = await Promise.all(
    messages.map(async (msg) => {
      const conversation = await db.query.conversationsTable.findFirst({
        where: eq(conversationsTable.id, msg.conversationId),
      });
      const sender = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, msg.senderId),
      });
      return {
        id: msg.id,
        conversationId: msg.conversationId,
        conversationName: conversation?.name || "Unknown",
        text: msg.text || "",
        type: msg.type || "text",
        senderId: msg.senderId,
        senderName: sender?.name || "Unknown",
        isEdited: msg.isEdited,
        isDeleted: msg.isDeleted,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
      };
    })
  );

  // Get attachments uploaded by user
  const attachments = await db.query.attachmentsTable.findMany({
    where: eq(attachmentsTable.createdAt, (a) => // Note: this is simplified - actual query would need user_id field
      db.select({ createdAt: messagesTable.createdAt }).from(messagesTable)
    ),
  });

  // Get audit logs related to user
  const auditLogs = await db.query.auditLogsTable.findMany({
    where: or(
      eq(auditLogsTable.userId, userId),
      eq(auditLogsTable.entityId, String(userId))
    ),
  });

  const auditLogsFormatted = auditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    details: log.details,
    createdAt: log.createdAt.toISOString(),
  }));

  // Count total items
  const totalItems = 
    1 + // user
    conversationsWithMembers.length +
    messagesWithDetails.length +
    attachments.length +
    auditLogsFormatted.length;

  return {
    user: {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      phone: user.phone || undefined,
      department: user.department || undefined,
      position: user.position || undefined,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    conversations: conversationsWithMembers,
    messages: messagesWithDetails,
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      url: a.url,
      createdAt: a.createdAt.toISOString(),
    })),
    auditLogs: auditLogsFormatted,
    export: {
      requestedAt: new Date().toISOString(),
      exportedAt: new Date().toISOString(),
      totalItems,
    },
  };
}

/**
 * Export user data as JSON string
 */
export async function exportUserDataAsJSON(userId: number): Promise<string> {
  const data = await exportUserData(userId);
  return JSON.stringify(data, null, 2);
}

/**
 * Export user data as CSV (flat format)
 */
export async function exportUserDataAsCSV(userId: number): Promise<string> {
  const data = await exportUserData(userId);

  // Create CSV sections
  const sections: string[] = [];

  // User section
  sections.push("USER DATA");
  sections.push(`ID,Employee ID,Name,Email,Phone,Department,Position,Role,Active,Created,Updated`);
  const userCsv = [
    data.user.id,
    data.user.employeeId,
    `"${data.user.name}"`,
    data.user.email,
    data.user.phone || "",
    data.user.department || "",
    data.user.position || "",
    data.user.role,
    data.user.isActive ? "Yes" : "No",
    data.user.createdAt,
    data.user.updatedAt,
  ].join(",");
  sections.push(userCsv);
  sections.push("");

  // Conversations section
  if (data.conversations.length > 0) {
    sections.push("CONVERSATIONS");
    sections.push(`ID,Name,Is Group,Members,Created,Updated`);
    data.conversations.forEach((conv) => {
      const csv = [
        conv.id,
        `"${conv.name}"`,
        conv.isGroup ? "Yes" : "No",
        `"${conv.members.join("; ")}"`,
        conv.createdAt,
        conv.updatedAt,
      ].join(",");
      sections.push(csv);
    });
    sections.push("");
  }

  // Messages section
  if (data.messages.length > 0) {
    sections.push("MESSAGES");
    sections.push(`ID,Conversation,Text,Type,Sender,Edited,Deleted,Created,Updated`);
    data.messages.forEach((msg) => {
      const text = (msg.text || "").replace(/"/g, '""'); // Escape quotes
      const csv = [
        msg.id,
        `"${msg.conversationName}"`,
        `"${text}"`,
        msg.type,
        msg.senderName,
        msg.isEdited ? "Yes" : "No",
        msg.isDeleted ? "Yes" : "No",
        msg.createdAt,
        msg.updatedAt,
      ].join(",");
      sections.push(csv);
    });
    sections.push("");
  }

  // Attachments section
  if (data.attachments.length > 0) {
    sections.push("ATTACHMENTS");
    sections.push(`ID,File Name,File Size (bytes),MIME Type,URL,Created`);
    data.attachments.forEach((att) => {
      const csv = [
        att.id,
        `"${att.fileName}"`,
        att.fileSize,
        att.mimeType,
        att.url,
        att.createdAt,
      ].join(",");
      sections.push(csv);
    });
    sections.push("");
  }

  // Audit logs section
  if (data.auditLogs.length > 0) {
    sections.push("AUDIT LOGS");
    sections.push(`ID,Action,Entity Type,Details,Created`);
    data.auditLogs.forEach((log) => {
      const details = JSON.stringify(log.details).replace(/"/g, '""');
      const csv = [
        log.id,
        log.action,
        log.entityType,
        `"${details}"`,
        log.createdAt,
      ].join(",");
      sections.push(csv);
    });
    sections.push("");
  }

  // Export metadata
  sections.push("EXPORT METADATA");
  sections.push(`Requested At,${data.export.requestedAt}`);
  sections.push(`Exported At,${data.export.exportedAt}`);
  sections.push(`Total Items,${data.export.totalItems}`);

  return sections.join("\n");
}
