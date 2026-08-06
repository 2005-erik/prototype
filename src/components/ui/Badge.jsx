import { cn } from '../../lib/utils'

const TONES = {
  gray: 'bg-slate-500/15 text-slate-300',
  blue: 'bg-[#ecc371]/15 text-[#ecc371]',
  teal: 'bg-[#2bbaac]/15 text-[#2bbaac]',
  green: 'bg-green-500/15 text-green-300',
  amber: 'bg-amber-500/15 text-amber-300',
  red: 'bg-red-500/15 text-red-300',
  orange: 'bg-orange-500/15 text-orange-300',
}

// tone — предустановленная палитра; style/className — для произвольного цвета
export default function Badge({ tone = 'gray', className, style, children }) {
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
