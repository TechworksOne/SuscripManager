import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { auth } from "../middlewares/auth";

const router = Router();

/**
 * POST /auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email y password son requeridos" });
    }

    const [rows] = await pool.query<any[]>(
      "SELECT id, email, nombre, password_hash FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET no configurado" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
      },
    });
  } catch (err) {
    console.error("LOGIN_ERROR:", err);
    return res.status(500).json({ message: "Error interno en login" });
  }
});

/**
 * GET /auth/me
 */
router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const [rows] = await pool.query<any[]>(
      "SELECT id, email, nombre FROM usuarios WHERE id = ? LIMIT 1",
      [userId]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "Usuario no existe" });
    }

    return res.json({ user });
  } catch (err) {
    console.error("ME_ERROR:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

export default router;
