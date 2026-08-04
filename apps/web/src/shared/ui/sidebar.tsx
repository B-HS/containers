'use client'

import { createContext, useContext, useEffect, useState, type ComponentProps, type CSSProperties, type FC, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { PanelLeftIcon } from 'lucide-react'
import { Slot } from 'radix-ui'

import { useIsMobile } from '@shared/hooks/use-mobile'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Separator } from '@shared/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@shared/ui/sheet'
import { Skeleton } from '@shared/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_MOBILE = '18rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'
const SKELETON_MIN_WIDTH_PERCENT = 50
const SKELETON_WIDTH_RANGE_PERCENT = 40

type SidebarContextValue = {
    state: 'expanded' | 'collapsed'
    open: boolean
    setOpen: (open: boolean) => void
    openMobile: boolean
    setOpenMobile: (open: boolean) => void
    isMobile: boolean
    toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

const useSidebar = () => {
    const context = useContext(SidebarContext)
    if (!context) throw new Error('useSidebar must be used within a SidebarProvider.')

    return context
}

type SidebarProviderProps = ComponentProps<'div'> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

const SidebarProvider: FC<SidebarProviderProps> = ({
    defaultOpen = true,
    open: openProp,
    onOpenChange: setOpenProp,
    className,
    style,
    children,
    ...props
}) => {
    const [openMobile, setOpenMobile] = useState(false)
    const [internalOpen, setInternalOpen] = useState(defaultOpen)

    const isMobile = useIsMobile()
    const open = openProp ?? internalOpen

    const setOpen = (value: boolean | ((current: boolean) => boolean)) => {
        const nextOpen = typeof value === 'function' ? value(open) : value
        if (setOpenProp) setOpenProp(nextOpen)
        else setInternalOpen(nextOpen)

        document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE_SECONDS}`
    }

    const toggleSidebar = () => (isMobile ? setOpenMobile((current) => !current) : setOpen((current) => !current))

    const state = open ? 'expanded' : 'collapsed'

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                toggleSidebar()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [toggleSidebar])

    return (
        <SidebarContext.Provider value={{ state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }}>
            <TooltipProvider delayDuration={0}>
                <div
                    data-slot="sidebar-wrapper"
                    style={{ '--sidebar-width': SIDEBAR_WIDTH, '--sidebar-width-icon': SIDEBAR_WIDTH_ICON, ...style } as CSSProperties}
                    className={cn('group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar', className)}
                    {...props}
                >
                    {children}
                </div>
            </TooltipProvider>
        </SidebarContext.Provider>
    )
}

type SidebarProps = ComponentProps<'div'> & {
    side?: 'left' | 'right'
    variant?: 'sidebar' | 'floating' | 'inset'
    collapsible?: 'offcanvas' | 'icon' | 'none'
}

const Sidebar: FC<SidebarProps> = ({ side = 'left', variant = 'sidebar', collapsible = 'offcanvas', className, children, ...props }) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

    if (collapsible === 'none')
        return (
            <div
                data-slot="sidebar"
                className={cn('flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground', className)}
                {...props}
            >
                {children}
            </div>
        )

    if (isMobile)
        return (
            <Sheet open={openMobile} onOpenChange={setOpenMobile}>
                <SheetContent
                    data-sidebar="sidebar"
                    data-slot="sidebar"
                    data-mobile="true"
                    className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
                    style={{ '--sidebar-width': SIDEBAR_WIDTH_MOBILE } as CSSProperties}
                    side={side}
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Sidebar</SheetTitle>
                        <SheetDescription>Displays the mobile sidebar.</SheetDescription>
                    </SheetHeader>
                    <div className={cn('flex h-full w-full flex-col', className)} {...props}>
                        {children}
                    </div>
                </SheetContent>
            </Sheet>
        )

    return (
        <div
            className="group peer hidden text-sidebar-foreground md:block"
            data-state={state}
            data-collapsible={state === 'collapsed' ? collapsible : ''}
            data-variant={variant}
            data-side={side}
            data-slot="sidebar"
        >
            <div
                data-slot="sidebar-gap"
                className={cn(
                    'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
                    'group-data-[collapsible=offcanvas]:w-0',
                    'group-data-[side=right]:rotate-180',
                    variant === 'floating' || variant === 'inset'
                        ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
                        : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
                )}
            />
            <div
                data-slot="sidebar-container"
                className={cn(
                    'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
                    side === 'left'
                        ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
                        : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
                    variant === 'floating' || variant === 'inset'
                        ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
                        : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
                    className,
                )}
                {...props}
            >
                <div data-sidebar="sidebar" data-slot="sidebar-inner" className="flex h-full w-full flex-col bg-sidebar">
                    {children}
                </div>
            </div>
        </div>
    )
}

const SidebarTrigger: FC<ComponentProps<typeof Button>> = ({ className, onClick, ...props }) => {
    const { toggleSidebar } = useSidebar()

    return (
        <Button
            data-sidebar="trigger"
            data-slot="sidebar-trigger"
            variant="ghost"
            className={cn('size-7 px-0', className)}
            onClick={(event) => {
                onClick?.(event)
                toggleSidebar()
            }}
            {...props}
        >
            <PanelLeftIcon className="size-4" />
            <span className="sr-only">Toggle Sidebar</span>
        </Button>
    )
}

const SidebarRail: FC<ComponentProps<'button'>> = ({ className, ...props }) => {
    const { toggleSidebar } = useSidebar()

    return (
        <button
            data-sidebar="rail"
            data-slot="sidebar-rail"
            aria-label="Toggle Sidebar"
            tabIndex={-1}
            onClick={toggleSidebar}
            title="Toggle Sidebar"
            className={cn(
                'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-overlay-strong sm:flex',
                'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
                '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
                'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
                '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
                '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
                className,
            )}
            {...props}
        />
    )
}

const SidebarInset: FC<ComponentProps<'main'>> = ({ className, ...props }) => (
    <main
        data-slot="sidebar-inset"
        className={cn(
            'relative flex w-full flex-1 flex-col bg-background',
            'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
            className,
        )}
        {...props}
    />
)

const SidebarInput: FC<ComponentProps<typeof Input>> = ({ className, ...props }) => (
    <Input data-slot="sidebar-input" data-sidebar="input" className={cn('h-8 w-full bg-overlay-subtle', className)} {...props} />
)

const SidebarHeader: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="sidebar-header" data-sidebar="header" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
)

const SidebarFooter: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="sidebar-footer" data-sidebar="footer" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
)

const SidebarSeparator: FC<ComponentProps<typeof Separator>> = ({ className, ...props }) => (
    <Separator data-slot="sidebar-separator" data-sidebar="separator" className={cn('mx-2 w-auto bg-overlay-subtle', className)} {...props} />
)

const SidebarContent: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div
        data-slot="sidebar-content"
        data-sidebar="content"
        className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden', className)}
        {...props}
    />
)

const SidebarGroup: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="sidebar-group" data-sidebar="group" className={cn('relative flex w-full min-w-0 flex-col p-2', className)} {...props} />
)

const SidebarGroupLabel: FC<ComponentProps<'div'> & { asChild?: boolean }> = ({ className, asChild = false, ...props }) => {
    const Comp = asChild ? Slot.Root : 'div'

    return (
        <Comp
            data-slot="sidebar-group-label"
            data-sidebar="group-label"
            className={cn(
                'flex h-8 shrink-0 items-center px-2 text-xs font-medium text-sidebar-foreground/60 outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 [&>svg]:size-4 [&>svg]:shrink-0',
                'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
                className,
            )}
            {...props}
        />
    )
}

const SidebarGroupAction: FC<ComponentProps<'button'> & { asChild?: boolean }> = ({ className, asChild = false, ...props }) => {
    const Comp = asChild ? Slot.Root : 'button'

    return (
        <Comp
            data-slot="sidebar-group-action"
            data-sidebar="group-action"
            className={cn(
                'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center p-0 text-sidebar-foreground outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 [&>svg]:size-4 [&>svg]:shrink-0',
                'after:absolute after:-inset-2 md:after:hidden',
                'group-data-[collapsible=icon]:hidden',
                className,
            )}
            {...props}
        />
    )
}

const SidebarGroupContent: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div data-slot="sidebar-group-content" data-sidebar="group-content" className={cn('w-full text-sm', className)} {...props} />
)

const SidebarMenu: FC<ComponentProps<'ul'>> = ({ className, ...props }) => (
    <ul data-slot="sidebar-menu" data-sidebar="menu" className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
)

const SidebarMenuItem: FC<ComponentProps<'li'>> = ({ className, ...props }) => (
    <li data-slot="sidebar-menu-item" data-sidebar="menu-item" className={cn('group/menu-item relative', className)} {...props} />
)

const sidebarMenuButtonVariants = cva(
    'peer/menu-button flex w-full items-center gap-2 overflow-hidden p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-overlay-active data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'hover:bg-overlay-hover hover:text-sidebar-accent-foreground active:bg-overlay-active',
                subtle: 'bg-overlay-subtle hover:bg-overlay-hover hover:text-sidebar-accent-foreground',
            },
            size: {
                default: 'h-8 text-sm',
                sm: 'h-7 text-xs',
                lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
)

type SidebarMenuButtonProps = ComponentProps<'button'> &
    VariantProps<typeof sidebarMenuButtonVariants> & {
        asChild?: boolean
        isActive?: boolean
        tooltip?: string | ComponentProps<typeof TooltipContent>
    }

const SidebarMenuButton: FC<SidebarMenuButtonProps> = ({
    asChild = false,
    isActive = false,
    variant = 'default',
    size = 'default',
    tooltip,
    className,
    ...props
}) => {
    const { isMobile, state } = useSidebar()
    const Comp = asChild ? Slot.Root : 'button'

    const button = (
        <Comp
            data-slot="sidebar-menu-button"
            data-sidebar="menu-button"
            data-size={size}
            data-active={isActive}
            className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
            {...props}
        />
    )

    if (!tooltip) return button

    const tooltipProps = typeof tooltip === 'string' ? { children: tooltip as ReactNode } : tooltip

    return (
        <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" align="center" hidden={state !== 'collapsed' || isMobile} {...tooltipProps} />
        </Tooltip>
    )
}

type SidebarMenuActionProps = ComponentProps<'button'> & {
    asChild?: boolean
    showOnHover?: boolean
}

const SidebarMenuAction: FC<SidebarMenuActionProps> = ({ className, asChild = false, showOnHover = false, ...props }) => {
    const Comp = asChild ? Slot.Root : 'button'

    return (
        <Comp
            data-slot="sidebar-menu-action"
            data-sidebar="menu-action"
            className={cn(
                'absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center p-0 text-sidebar-foreground outline-hidden transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-overlay-hover hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 [&>svg]:size-4 [&>svg]:shrink-0',
                'after:absolute after:-inset-2 md:after:hidden',
                'peer-data-[size=sm]/menu-button:top-1',
                'peer-data-[size=default]/menu-button:top-1.5',
                'peer-data-[size=lg]/menu-button:top-2.5',
                'group-data-[collapsible=icon]:hidden',
                showOnHover &&
                    'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0',
                className,
            )}
            {...props}
        />
    )
}

const SidebarMenuBadge: FC<ComponentProps<'div'>> = ({ className, ...props }) => (
    <div
        data-slot="sidebar-menu-badge"
        data-sidebar="menu-badge"
        className={cn(
            'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none',
            'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
            'peer-data-[size=sm]/menu-button:top-1',
            'peer-data-[size=default]/menu-button:top-1.5',
            'peer-data-[size=lg]/menu-button:top-2.5',
            'group-data-[collapsible=icon]:hidden',
            className,
        )}
        {...props}
    />
)

const SidebarMenuSkeleton: FC<ComponentProps<'div'> & { showIcon?: boolean }> = ({ className, showIcon = false, ...props }) => {
    const [width] = useState(() => `${Math.floor(Math.random() * SKELETON_WIDTH_RANGE_PERCENT) + SKELETON_MIN_WIDTH_PERCENT}%`)

    return (
        <div data-slot="sidebar-menu-skeleton" data-sidebar="menu-skeleton" className={cn('flex h-8 items-center gap-2 px-2', className)} {...props}>
            {showIcon && <Skeleton className="size-4" data-sidebar="menu-skeleton-icon" />}
            <Skeleton
                className="h-4 max-w-(--skeleton-width) flex-1"
                data-sidebar="menu-skeleton-text"
                style={{ '--skeleton-width': width } as CSSProperties}
            />
        </div>
    )
}

const SidebarMenuSub: FC<ComponentProps<'ul'>> = ({ className, ...props }) => (
    <ul
        data-slot="sidebar-menu-sub"
        data-sidebar="menu-sub"
        className={cn('mx-3.5 flex min-w-0 flex-col gap-1 bg-overlay-subtle px-2.5 py-0.5', 'group-data-[collapsible=icon]:hidden', className)}
        {...props}
    />
)

const SidebarMenuSubItem: FC<ComponentProps<'li'>> = ({ className, ...props }) => (
    <li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" className={cn('group/menu-sub-item relative', className)} {...props} />
)

type SidebarMenuSubButtonProps = ComponentProps<'a'> & {
    asChild?: boolean
    size?: 'sm' | 'md'
    isActive?: boolean
}

const SidebarMenuSubButton: FC<SidebarMenuSubButtonProps> = ({ asChild = false, size = 'md', isActive = false, className, ...props }) => {
    const Comp = asChild ? Slot.Root : 'a'

    return (
        <Comp
            data-slot="sidebar-menu-sub-button"
            data-sidebar="menu-sub-button"
            data-size={size}
            data-active={isActive}
            className={cn(
                'flex h-7 min-w-0 items-center gap-2 overflow-hidden px-2 text-sidebar-foreground outline-hidden hover:bg-overlay-hover hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 active:bg-overlay-active aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
                'data-[active=true]:bg-overlay-active data-[active=true]:text-sidebar-accent-foreground',
                size === 'sm' && 'text-xs',
                size === 'md' && 'text-sm',
                'group-data-[collapsible=icon]:hidden',
                className,
            )}
            {...props}
        />
    )
}

export {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInput,
    SidebarInset,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSkeleton,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarRail,
    SidebarSeparator,
    SidebarTrigger,
    sidebarMenuButtonVariants,
    useSidebar,
}
