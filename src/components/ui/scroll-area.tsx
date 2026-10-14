import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '#/lib/utils.ts'

function ScrollArea({
  className,
  children,
  viewportProps,
  horizontal = false,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  /** Passed to the scrolling element itself (id, data attributes, classes). */
  viewportProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport> &
    Record<`data-${string}`, string>
  /** Also scroll sideways, with its own bar. */
  horizontal?: boolean
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type="scroll"
      scrollHideDelay={700}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        {...viewportProps}
        className={cn(
          // Radix wraps content in `display: table`, which lets wide children
          // stretch the page; block keeps them to the viewport's width.
          'size-full rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>div]:!block',
          viewportProps?.className,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      {horizontal && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-opacity duration-300 select-none data-[state=hidden]:opacity-0',
        orientation === 'vertical' &&
          'h-full w-2 border-l border-l-transparent',
        orientation === 'horizontal' &&
          'h-2 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
