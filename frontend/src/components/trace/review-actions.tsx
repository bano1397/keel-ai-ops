"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { MessageStatus, ReviewRequest } from "@/lib/types";

export function ReviewActions({ messageId, content, onDone }: { messageId: number; content: string; onDone?: (status: MessageStatus, content: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function submit(body: ReviewRequest) {
    setBusy(true);
    try {
      await api(`/api/messages/${messageId}/review`, { body });
      const status: MessageStatus = body.action === "approve" ? "sent" : body.action === "edit" ? "edited" : "rejected";
      toast.success(body.action === "approve" ? "Reply approved and sent" : body.action === "edit" ? "Edited reply sent" : "Reply rejected");
      onDone?.(status, body.corrected ?? content);
      setEditing(false);
      setRejecting(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} aria-label="Edited reply" />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !draft.trim()} onClick={() => submit({ action: "edit", corrected: draft })}>
            Send edited reply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => submit({ action: "approve" })} data-testid="approve-reply">
          <Check className="size-4" />
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Edit
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)} className="text-destructive hover:text-destructive">
          <X className="size-4" />
          Reject
        </Button>
      </div>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this reply</DialogTitle>
            <DialogDescription>The reason is saved as feedback and used to improve the agent prompt.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Missed the hygiene exclusion for opened bedding" rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => submit({ action: "reject", reason })}>
              Reject reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
