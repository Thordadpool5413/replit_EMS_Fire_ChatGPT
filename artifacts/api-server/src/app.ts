import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { apiReadinessHandler } from "./routes/health";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

// The API artifact's preview/startup probe requests `/`; keep that request healthy
// while the versioned application endpoints remain under `/api`.
app.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

// The artifact service's /api base path is also probed during startup.
app.get("/api", apiReadinessHandler);

app.use("/api", router);

export default app;
