"use server";

import { redirect } from "next/navigation";
import { deleteCookie, getCookie } from "./token-handlers.service";

import { revalidatePath } from "next/cache";

export const logoutUser = async () => {
  // ১. কুকি থেকে রিফ্রেশ টোকেনটি নিচ্ছি
  const refreshToken = await getCookie("refreshToken");

  // ২. যদি টোকেন থাকে, তবে ব্যাকএন্ডে রিকোয়েস্ট পাঠিয়ে সেটি Blacklist করে দিচ্ছি
  if (refreshToken) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_API_URL}/auth/logout`, {
        method: "POST",
        headers: {
          // ব্যাকএন্ড যেহেতু কুকি থেকে টোকেন খোঁজে, তাই আমরা হেডারে কুকি পাঠিয়ে দিচ্ছি
          Cookie: `refreshToken=${refreshToken}`,
        },
      });
    } catch (error) {
      console.error("Failed to blacklist token in backend:", error);
    }
  }

  // ৩. এরপর আগের মতোই ব্রাউজার থেকে লোকালি কুকি মুছে ফেলছি
  await deleteCookie("accessToken");
  await deleteCookie("isLoggedIn");
  await deleteCookie("refreshToken");

  // ৪. লগিন পেজে পাঠিয়ে দিচ্ছি
  revalidatePath('/', 'layout');
  redirect("/login?loggedOut=true");
};
