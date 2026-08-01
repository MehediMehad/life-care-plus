"use client";

import { UserInfo } from "@/app/(auth)/_types/user.type";
import { LayoutDashboard, Menu } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthToken } from "@/hooks/useAuthToken";
import UserDropdown from "@/components/layout/dashboard/UserDropdown";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import AISearchDialog from "@/app/(dashboard)/admin/dashboard/doctors-management/_components/AISearchDialog";

interface MobileMenuProps {
  navItems: Array<{ href: string; label: string }>;
  hasAccessToken: boolean;
  userInfo?: UserInfo | null;
  dashboardRoute?: string;
}

const MobileMenu = ({
  navItems,
  hasAccessToken,
  userInfo,
  dashboardRoute,
}: MobileMenuProps) => {
  const router = useRouter();
  const clientHasToken = useAuthToken();

  useEffect(() => {
    if (clientHasToken && !userInfo) {
      router.refresh();
    }
  }, [clientHasToken, userInfo, router]);

  const hasToken = clientHasToken || hasAccessToken;
  const currentUserInfo = hasToken ? userInfo : null;

  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[300px] sm:w-[400px] p-4">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <nav className="flex flex-col space-y-4 mt-8">
            {navItems.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-lg font-medium"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t pt-4 flex flex-col space-y-4">
              {/* <div className="flex justify-center w-full">
                <AISearchDialog />
              </div> */}
              {hasToken && !currentUserInfo ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-muted"></div>
              ) : hasToken && currentUserInfo ? (
                <>
                  <Link
                    href={dashboardRoute || "/"}
                    className="text-lg font-medium"
                  >
                    <Button className="w-full gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Button>
                  </Link>
                  <div className="flex justify-center">
                    <UserDropdown userInfo={currentUserInfo} />
                  </div>
                </>
              ) : (
                <Link href="/login" className="text-lg font-medium">
                  <Button size="lg" className="w-full">
                    Login
                  </Button>
                </Link>
              )}
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileMenu;
