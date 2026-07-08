"use client";

import {
  Bot,
  KeyRound,
  LinkIcon,
  Tags,
  UserRoundPlus,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const settingsTabs = [
  {
    description: "함께 쓰는 사람을 확인해요.",
    icon: UserRoundPlus,
    label: "부부 멤버",
    value: "members",
  },
  {
    description: "지출과 수입을 묶어 봐요.",
    icon: Tags,
    label: "카테고리",
    value: "categories",
  },
  {
    description: "카드값이 빠져나갈 계좌를 정해요.",
    icon: WalletCards,
    label: "계좌 기본값",
    value: "accounts",
  },
  {
    description: "iPhone 단축어로 거래를 저장해요.",
    icon: LinkIcon,
    label: "iOS Shortcuts webhook",
    value: "shortcuts",
  },
  {
    description: "AI 소비 조언에 필요한 설정이에요.",
    icon: Bot,
    label: "AI 조언 설정",
    value: "ai",
  },
  {
    description: "서버 작업과 단축어에 쓰는 비밀값이에요.",
    icon: KeyRound,
    label: "비밀키",
    value: "secrets",
  },
] as const;

function SettingPanel({
  action,
  children,
  description,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InfoList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 text-sm text-muted-foreground">
      {items.map((item) => (
        <li className="rounded-md border bg-muted/20 px-4 py-3" key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function SettingsClient() {
  return (
    <Tabs
      className="grid gap-4 lg:grid-cols-[280px_1fr]"
      defaultValue="members"
    >
      <TabsList className="h-auto w-full flex-col items-stretch gap-1 rounded-lg border bg-card p-1 text-left text-foreground shadow-sm">
        {settingsTabs.map((item) => {
          const Icon = item.icon;

          return (
            <TabsTrigger
              className="group h-auto w-full justify-start gap-3 rounded-md px-3 py-3 text-left text-foreground/80 hover:bg-muted/45 hover:text-foreground aria-selected:text-primary-foreground"
              key={item.value}
              value={item.value}
            >
              <Icon
                className="size-4 shrink-0 text-foreground/70 group-aria-selected:text-primary-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground group-aria-selected:text-primary-foreground">
                  {item.label}
                </span>
                <span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground group-aria-selected:text-primary-foreground/75">
                  {item.description}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="members">
        <SettingPanel
          description="초대와 권한 관리는 다음 버전에서 연결할게요."
          title="부부 멤버"
        >
          <InfoList
            items={[
              "데이터는 가계부별로 따로 보관돼요.",
              "멤버만 계좌, 거래, 반복비를 볼 수 있어요.",
              "새 멤버 초대 화면은 준비 중이에요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="categories">
        <SettingPanel
          description="모바일 입력과 대시보드 차트에서 함께 써요."
          title="카테고리"
        >
          <InfoList
            items={[
              "모바일 입력이나 단축어로 새 카테고리를 만들 수 있어요.",
              "같은 가계부 안에서는 같은 이름의 카테고리를 중복으로 만들지 않아요.",
              "카테고리 관리 화면은 다음 단계에서 추가할게요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="accounts">
        <SettingPanel
          action={
            <Button asChild variant="outline">
              <Link href="/accounts">
                <WalletCards className="size-4" aria-hidden="true" />
                계좌 보러 가기
              </Link>
            </Button>
          }
          description="카드값이 빠져나갈 계좌와 순서를 정해요."
          title="계좌 기본값"
        >
          <InfoList
            items={[
              "계좌와 카드는 계좌 화면에서 추가하고 고칠 수 있어요.",
              "카드는 카드값이 빠져나갈 계좌를 고를 수 있어요.",
              "숨긴 계좌는 새 거래 입력 목록에서 빠져요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="shortcuts">
        <SettingPanel
          description="iPhone에서 거래를 빠르게 보내는 설정이에요."
          title="iOS 단축어"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">POST</Badge>
              <Badge variant="outline">/api/shortcuts/transactions</Badge>
            </div>
            <InfoList
              items={[
                "Vercel의 SHORTCUTS_WEBHOOK_SECRET과 단축어의 shortcut_secret을 같게 넣어주세요.",
                "요청에는 household_id, user_id, amount, type, account가 필요해요.",
                "새 카테고리 이름이 오면 자동으로 만들어요.",
              ]}
            />
          </div>
        </SettingPanel>
      </TabsContent>

      <TabsContent value="ai">
        <SettingPanel
          description="AI에는 요약 데이터만 보내요."
          title="AI 조언 설정"
        >
          <InfoList
            items={[
              "Vercel에 OPENAI_API_KEY를 넣으면 AI 조언을 만들 수 있어요.",
              "OPENAI_MODEL 기본값은 gpt-4o-mini예요.",
              "AI 조언은 투자, 대출, 세금, 법률 조언을 하지 않아요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>

      <TabsContent value="secrets">
        <SettingPanel
          description="서버 작업에 필요한 비밀값이에요."
          title="비밀키"
        >
          <InfoList
            items={[
              "JOB_SECRET은 반복 거래를 직접 만들 때 써요.",
              "SHORTCUTS_WEBHOOK_SECRET과 JOB_SECRET은 서로 다르게 두는 편이 안전해요.",
              "비밀키는 GitHub에 올리지 말고 Vercel 환경변수에만 저장해요.",
            ]}
          />
        </SettingPanel>
      </TabsContent>
    </Tabs>
  );
}
