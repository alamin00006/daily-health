"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { usePrescriptionActions } from "@/features/prescription-queries";
import { isApiError } from "@/lib/api-client";
import type { StartPrescriptionRequest } from "@/shared-contracts/prescription.contract";

/** Opens this visit's / consultation's prescription (the existing one, or a new draft). */
export function StartPrescriptionButton({
  source,
  onOpened,
  size = "sm",
  variant = "outline",
}: {
  source: StartPrescriptionRequest;
  onOpened?: () => void;
  size?: "sm" | "md";
  variant?: "outline" | "primary" | "secondary";
}) {
  const router = useRouter();
  const toast = useToast();
  const { start } = usePrescriptionActions();
  return (
    <Button
      size={size}
      variant={variant}
      icon={FileText}
      loading={start.isPending}
      onClick={() =>
        start.mutate(source, {
          onSuccess: (p) => {
            onOpened?.();
            router.push(`/prescriptions/${p.id}`);
          },
          onError: (e) => toast(isApiError(e) ? e.userMessage : "খোলা যায়নি", "error"),
        })
      }
    >
      প্রেসক্রিপশন
    </Button>
  );
}
