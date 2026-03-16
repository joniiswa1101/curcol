import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import cicoRouter from "./cico.js";
import conversationsRouter from "./conversations.js";
import messagesRouter from "./messages.js";
import messageActionsRouter from "./messageActions.js";
import announcementsRouter from "./announcements.js";
import auditRouter from "./audit.js";
import searchRouter from "./search.js";
import filesRouter from "./files.js";
import webhooksRouter from "./webhooks.js";

const router = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/cico", cicoRouter);
router.use("/conversations", conversationsRouter);
router.use("/conversations", messagesRouter);
router.use("/messages", messageActionsRouter);
router.use("/announcements", announcementsRouter);
router.use("/audit", auditRouter);
router.use("/messages/search", searchRouter);
router.use("/files", filesRouter);
router.use("/webhooks", webhooksRouter);

export default router;
