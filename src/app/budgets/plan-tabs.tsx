"use client";

import { PiggyBank, Target } from "lucide-react";
import { GoalsClient } from "@/app/goals/goals-client";
import type { GoalPageData } from "@/app/goals/types";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { BudgetsClient } from "./budgets-client";
import type { BudgetPageData } from "./types";

export function PlanTabs({
  budgets,
  goals,
  initialView,
}: {
  budgets: BudgetPageData;
  goals: GoalPageData;
  initialView: "budgets" | "goals";
}) {
  return (
    <Tabs className="space-y-5" defaultValue={initialView}>
      <TabsList className="grid w-full max-w-sm grid-cols-2">
        <TabsTrigger className="gap-2" value="budgets">
          <PiggyBank className="size-4" aria-hidden="true" />
          예산
        </TabsTrigger>
        <TabsTrigger className="gap-2" value="goals">
          <Target className="size-4" aria-hidden="true" />
          저축 목표
        </TabsTrigger>
      </TabsList>

      <TabsContent value="budgets">
        <BudgetsClient {...budgets} />
      </TabsContent>
      <TabsContent value="goals">
        <GoalsClient {...goals} />
      </TabsContent>
    </Tabs>
  );
}
