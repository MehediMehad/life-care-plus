"use client";
import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { exchangeSocialCode } from "../_services/social-login.service";

const SocialLoginHandler = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isProcessed = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (code && !isProcessed.current) {
      isProcessed.current = true;
      window.history.replaceState(null, "", pathname);

      exchangeSocialCode(code).then((result) => {
        if (result.success && result.redirectTo) {
          toast.success("Successfully logged in!");
          router.replace(result.redirectTo);
          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          toast.error(result.message || "Login failed. Please try again.");
          router.replace("/login");
        }
      });
    } else if (error && !isProcessed.current) {
      isProcessed.current = true;
      window.history.replaceState(null, "", pathname);
      toast.error("Login failed! Please try again.");
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  return null;
};

export default SocialLoginHandler;
