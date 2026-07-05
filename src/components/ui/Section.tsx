import type { ReactNode } from 'react'

export function Section({
  title,
  icon,
  aside,
  flush,
  children,
}: {
  title: string
  icon: ReactNode
  aside?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className={flush ? 'section flush' : 'section'}>
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
        {aside && <span className="section-aside">{aside}</span>}
      </header>
      {children}
    </section>
  )
}
