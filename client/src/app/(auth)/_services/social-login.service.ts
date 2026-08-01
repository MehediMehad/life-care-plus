"use server";

import { revalidatePath } from "next/cache";
import { setCookie } from "./token-handlers.service";
import { getDefaultDashboardRoute, UserRole } from "@/lib/auth/auth-utils";
import { getCookieOptions } from "@/lib/auth/cookie-config";
import jwt from "jsonwebtoken";

export const exchangeSocialCode = async (code: string) => {
  try {
    const BACKEND_API_URL =
      process.env.NEXT_PUBLIC_BASE_API_URL ||
      "http://localhost:5000/api/v1";

    const response = await fetch(
      `${BACKEND_API_URL}/auth/exchange-code`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      },
    );

    const result = await response.json();

    if (!result.success || !result.data) {
      return { success: false, message: "Code expired. Please login again." };
    }

    const { accessToken, refreshToken } = result.data;
    const cookieBase = getCookieOptions();

    await setCookie("accessToken", accessToken, {
      ...cookieBase,
      maxAge: 7 * 24 * 60 * 60,
    });

    await setCookie("isLoggedIn", "true", {
      ...cookieBase,
      httpOnly: false,
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    if (refreshToken) {
      await setCookie("refreshToken", refreshToken, {
        ...cookieBase,
        maxAge: 90 * 24 * 60 * 60,
      });
    }

    revalidatePath("/", "layout");

    const decoded = jwt.verify(
      accessToken,
      process.env.JWT_SECRET as string,
    ) as jwt.JwtPayload;
    const role = decoded.role as UserRole;
    const dashboard = getDefaultDashboardRoute(role);

    return { success: true, redirectTo: dashboard };
  } catch {
    return { success: false, message: "Something went wrong. Please login again." };
  }
};
