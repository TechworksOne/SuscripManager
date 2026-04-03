import express from "express";
import cors from "cors";
import routes from "./routes";

const app = express();

// Middlewares base
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Rutas
app.use("/", routes);

export default app;
