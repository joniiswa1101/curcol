import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";

const app: Express = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xContentTypeOptions: true,
  xDNSPrefetchControl: { allow: false },
  xDownloadOptions: { action: "noopen" },
  xFrameOptions: { action: "deny" },
  xPoweredBy: false,
}));

const allowedOrigins = [
  "https://curcol.link",
  "https://www.curcol.link",
  `https://${process.env.REPLIT_DEV_DOMAIN}`,
  `https://${process.env.REPLIT_DOMAINS}`,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin === o || origin.endsWith(".replit.dev") || origin.endsWith(".repl.co"))) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
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
