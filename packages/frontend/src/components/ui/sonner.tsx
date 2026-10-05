"use client"

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { Toaster as Sonner } from "sonner"

import { useThemeStore } from "@/stores/themeStore"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // Pass the already-resolved theme: sonner's own "system" mode would read
  // prefers-color-scheme and ignore an explicit user override.
  const theme = useThemeStore((s) => s.resolved)

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-card group-[.toaster]:rounded-md",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full",
          cancelButton:
            "group-[.toast]:bg-secondary group-[.toast]:text-muted-foreground group-[.toast]:rounded-full",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
