import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { registerPushToken, unregisterPushToken } from "../lib/push-notifications.js";

const router = Router();

router.post("/register", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const { token, platform } = req.body;

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  await registerPushToken(currentUser.id, token, platform || "expo");
  console.log(`[Push] Token registered for userId=${currentUser.id}`);
  res.json({ success: true });
});

router.post("/unregister", requireAuth as any, async (req, res) => {
  const currentUser = (req as any).user;
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  await unregisterPushToken(currentUser.id, token);
  console.log(`[Push] Token unregistered for userId=${currentUser.id}`);
  res.json({ success: true });
});

export default router;
