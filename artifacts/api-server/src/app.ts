import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Rate limit tercapai. Coba lagi nanti." },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/sso/login", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api", apiLimiter);

app.use("/api", router);

export default app;
