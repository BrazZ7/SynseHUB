import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, initials } from '@/lib/utils'

type StudentAvatarProps = {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: 'size-8 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-16 text-base',
} as const

export function StudentAvatar({ name, avatarUrl, size = 'md', className }: StudentAvatarProps) {
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
