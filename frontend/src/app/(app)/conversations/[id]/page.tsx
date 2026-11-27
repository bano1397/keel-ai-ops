"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common";
import { ConversationView } from "@/components/inbox/conversation-view";

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <PageHeader
        title={`Conversation #${id}`}
        description="Messages with the full agent trace behind every reply."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inbox">
              <ArrowLeft className="size-4" />
              Inbox
            </Link>
          </Button>
        }
      />
      <ConversationView id={Number(id)} />
    </div>
  );
}
