"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = React.useContext(TabsContext);

  if (!context) {
    throw new Error("Tabs components must be used inside <Tabs>.");
  }

  return context;
}

function Tabs({
  className,
  defaultValue,
  onValueChange,
  value,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange"> & {
  defaultValue: string;
  onValueChange?: (value: string) => void;
  value?: string;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      setInternalValue(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue }}>
      <div className={cn("flex flex-col gap-4", className)} {...props} />
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex h-10 w-fit items-center gap-1 rounded-full bg-secondary p-1 text-secondary-foreground",
        className,
      )}
      role="tablist"
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  value,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const context = useTabsContext();
  const isSelected = context.value === value;

  return (
    <button
      aria-selected={isSelected}
      className={cn(
        "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:pointer-events-none disabled:opacity-50",
        isSelected
          ? "bg-primary text-primary-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]"
          : "text-secondary-foreground/70 hover:text-secondary-foreground",
        className,
      )}
      onClick={() => context.setValue(value)}
      role="tab"
      type="button"
      {...props}
    />
  );
}

function TabsContent({
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const context = useTabsContext();

  if (context.value !== value) {
    return null;
  }

  return (
    <div
      className={cn("outline-none", className)}
      role="tabpanel"
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
