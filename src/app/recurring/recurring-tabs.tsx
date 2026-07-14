"use client";

import { CalendarClock, CalendarRange } from "lucide-react";
import { InstallmentsClient } from "@/app/installments/installments-client";
import type { InstallmentPageData } from "@/app/installments/types";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { RecurringClient } from "./recurring-client";
import type { RecurringPageData } from "./types";

export function RecurringTabs({
  recurring,
  installments,
  initialView,
}: {
  recurring: RecurringPageData;
  installments: InstallmentPageData;
  initialView: "recurring" | "installments";
}) {
  return (
    <Tabs className="space-y-5" defaultValue={initialView}>
      <TabsList className="grid w-full max-w-sm grid-cols-2">
        <TabsTrigger className="gap-2" value="recurring">
          <CalendarClock className="size-4" aria-hidden="true" />
          구독·고정비
        </TabsTrigger>
        <TabsTrigger className="gap-2" value="installments">
          <CalendarRange className="size-4" aria-hidden="true" />
          할부
        </TabsTrigger>
      </TabsList>

      <TabsContent value="recurring">
        <RecurringClient {...recurring} />
      </TabsContent>
      <TabsContent value="installments">
        <InstallmentsClient {...installments} />
      </TabsContent>
    </Tabs>
  );
}
