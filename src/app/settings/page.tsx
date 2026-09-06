"use client";

import { DatabaseIcon, Loader2 } from "lucide-react";
import { useRequireRole } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  const { isAllowed, isLoading: isAuthLoading } = useRequireRole("admin");

  if (isAuthLoading || !isAllowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description="System configuration." />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DatabaseIcon className="size-5 text-primary" />
            <CardTitle>Database</CardTitle>
          </div>
          <CardDescription>
            This system stores all data in a Neon PostgreSQL database. Backups and point-in-time
            recovery are managed automatically by Neon — see your Neon project dashboard.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
