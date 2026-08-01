/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import {
  getDefaultDashboardRoute,
  isValidRedirectForRole,
  UserRole,
} from "@/lib/auth/auth-utils";
import { getCookieOptions } from "@/lib/auth/cookie-config";
import { serverFetch } from "@/services/http";
import { zodValidator } from "@/lib/utils/zod-validator";
import { loginValidationZodSchema } from "@/app/(auth)/_validations/auth.validation";
import { parse } from "cookie";
import jwt, { JwtPayload } from "jsonwebtoken";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setCookie } from "./token-handlers.service";

export const loginUser = async (
  _currentState: any,
  formData: any,
): Promise<any> => {
  try {
    const redirectTo = formData.get("redirect") || null;
    let accessTokenObject: null | any = null;
    let refreshTokenObject: null | any = null;
    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
    };

    if (zodValidator(payload, loginValidationZodSchema).success === false) {
      return zodValidator(payload, loginValidationZodSchema);
    }

    const validatedPayload = zodValidator(
      payload,
      loginValidationZodSchema,
    ).data;

    const res = await serverFetch.post("/auth/login", {
      body: JSON.stringify(validatedPayload),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await res.json();

    const setCookieHeaders = res.headers.getSetCookie();

    if (setCookieHeaders && setCookieHeaders.length > 0) {
      setCookieHeaders.forEach((cookie: string) => {
        const parsedCookie = parse(cookie);

        if (parsedCookie["accessToken"]) {
          accessTokenObject = parsedCookie;
        }
        if (parsedCookie["refreshToken"]) {
          refreshTokenObject = parsedCookie;
        }
      });
    } else {
      throw new Error("No Set-Cookie header found");
    }

    if (!accessTokenObject) {
      throw new Error("Tokens not found in cookies");
    }

    if (!refreshTokenObject) {
      throw new Error("Tokens not found in cookies");
    }

    const cookieBase = getCookieOptions();
    await setCookie("accessToken", accessTokenObject.accessToken, {
      ...cookieBase,
      maxAge: parseInt(accessTokenObject["Max-Age"]) || 1000 * 60 * 60,
      path: accessTokenObject.Path || "/",
      sameSite: accessTokenObject["SameSite"] || cookieBase.sameSite,
    });

    // Client-side readable cookie to detect auth state
    await setCookie("isLoggedIn", "true", {
      ...cookieBase,
      httpOnly: false,
      maxAge: parseInt(accessTokenObject["Max-Age"]) || 1000 * 60 * 60,
      path: "/",
    });

    await setCookie("refreshToken", refreshTokenObject.refreshToken, {
      ...cookieBase,
      maxAge:
        parseInt(refreshTokenObject["Max-Age"]) || 1000 * 60 * 60 * 24 * 90,
      path: refreshTokenObject.Path || "/",
      sameSite: refreshTokenObject["SameSite"] || cookieBase.sameSite,
    });
    const verifiedToken: JwtPayload | string = jwt.verify(
      accessTokenObject.accessToken,
      process.env.JWT_SECRET as string,
    );

    if (typeof verifiedToken === "string") {
      throw new Error("Invalid token");
    }

    const userRole: UserRole = verifiedToken.role;

    if (!result.success) {
      throw new Error(result.message || "Login failed");
    }

    if (redirectTo && result.data.needPasswordChange) {
      const requestedPath =
        redirectTo.toString() || getDefaultDashboardRoute(userRole);

      revalidatePath("/", "layout");

      if (isValidRedirectForRole(requestedPath, userRole)) {
        redirect(`/reset-password?redirect=${requestedPath}`);
      } else {
        const defaultPath = getDefaultDashboardRoute(userRole);
        redirect(`/reset-password?redirect=${defaultPath}`);
      }
    }

    if (result.data.needPasswordChange) {
      revalidatePath("/", "layout");
      redirect("/reset-password");
    }

    revalidatePath("/", "layout");

    if (redirectTo) {
      const requestedPath = redirectTo.toString();
      if (isValidRedirectForRole(requestedPath, userRole)) {
        redirect(`${requestedPath}?loggedIn=true`);
      } else {
        redirect(`${getDefaultDashboardRoute(userRole)}?loggedIn=true`);
      }
    } else {
      redirect(`${getDefaultDashboardRoute(userRole)}?loggedIn=true`);
    }
  } catch (error: any) {
    // Re-throw NEXT_REDIRECT errors so Next.js can handle them
    if (error?.digest?.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.log(error);
    return {
      success: false,
      message: `${process.env.NODE_ENV === "development" ? error.message : "Login Failed. You might have entered incorrect email or password."}`,
    };
  }
};
