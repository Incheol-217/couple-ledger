"use client";

import { Landmark, TrendingUp } from "lucide-react";
import { DebtsClient } from "@/app/debts/debts-client";
import type { DebtsPageData } from "@/app/debts/types";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { InvestClient } from "./invest-client";
import type { InvestPageData } from "./types";

export function WealthTabs({
  invest,
  debts,
  initialView,
}: {
  invest: InvestPageData;
  debts: DebtsPageData;
  initialView: "assets" | "debts";
}) {
  return (
    <Tabs className="space-y-5" defaultValue={initialView}>
      <TabsList className="grid w-full max-w-sm grid-cols-2">
        <TabsTrigger className="gap-2" value="assets">
          <TrendingUp className="size-4" aria-hidden="true" />
          자산
        </TabsTrigger>
        <TabsTrigger className="gap-2" value="debts">
          <Landmark className="size-4" aria-hidden="true" />
          부채
        </TabsTrigger>
      </TabsList>

      <TabsContent value="assets">
        <InvestClient {...invest} />
      </TabsContent>
      <TabsContent value="debts">
        <DebtsClient {...debts} />
      </TabsContent>
    </Tabs>
  );
}
