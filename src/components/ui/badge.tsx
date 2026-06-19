import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-1 focus:ring-ring select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/85",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-red-50 text-red-750 border-red-200/40 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30",
        outline: "text-foreground border-border bg-transparent",
        success:
          "border-transparent bg-emerald-50 text-emerald-700 border-emerald-200/40 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
        warning:
          "border-transparent bg-amber-50 text-amber-700 border-amber-200/40 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30",
        info:
          "border-transparent bg-blue-50 text-blue-700 border-blue-200/40 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30",
        purple:
          "border-transparent bg-indigo-50 text-indigo-700 border-indigo-200/40 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
