"use client";

import { useAuthToken } from "@/hooks/useAuthToken";
import { UserInfo } from "@/app/(auth)/_types/user.type";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import UserDropdown from "@/components/layout/dashboard/UserDropdown";
import { Button } from "@/components/ui/button";

interface NavbarAuthButtonsProps {
  initialHasToken: boolean;
  initialUserInfo: UserInfo | null;
  initialDashboardRoute: string;
}

export default function NavbarAuthButtons({
  initialHasToken,
  initialUserInfo,
  initialDashboardRoute,
}: NavbarAuthButtonsProps) {
  const router = useRouter();
  // Detect client-side auth state changes on navigation
  const clientHasToken = useAuthToken();

  useEffect(() => {
    if (clientHasToken && !initialUserInfo) {
      router.refresh();
    }
  }, [clientHasToken, initialUserInfo, router]);

  // Use client token state if available, otherwise fall back to server state
  const hasToken = clientHasToken || initialHasToken;
  const userInfo = hasToken ? initialUserInfo : null;
  const dashboardRoute = initialDashboardRoute;

  if (hasToken && !userInfo) {
    return <div className="h-10 w-24 animate-pulse rounded-md bg-muted"></div>;
  }

  if (hasToken && userInfo) {
    return (
      <>
        <Link href={dashboardRoute}>
          <Button variant="outline" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <UserDropdown userInfo={userInfo} />
      </>
    );
  }

  return (
    <Link href="/login">
      <Button size="lg">Login</Button>
    </Link>
  );
}
