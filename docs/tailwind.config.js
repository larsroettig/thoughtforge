/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './_layouts/**/*.html',
    './_includes/**/*.html',
    './*.html',
    './*.md',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#0f0f11',
        surface: '#18181b',
        edge:    '#27272a',
        prose:   '#e4e4e7',
        muted:   '#71717a',
        accent:  '#6c5ce7',
        'accent-lite': '#a78bfa',
        ok:      '#10b981',
        code:    '#a3e635',
      },
      typography: ({ theme }) => ({
        tf: {
          css: {
            '--tw-prose-body':           theme('colors.muted'),
            '--tw-prose-headings':       theme('colors.prose'),
            '--tw-prose-lead':           theme('colors.muted'),
            '--tw-prose-links':          theme('colors.accent-lite'),
            '--tw-prose-bold':           theme('colors.prose'),
            '--tw-prose-counters':       theme('colors.muted'),
            '--tw-prose-bullets':        theme('colors.edge'),
            '--tw-prose-hr':             theme('colors.edge'),
            '--tw-prose-quotes':         theme('colors.muted'),
            '--tw-prose-quote-borders':  theme('colors.accent'),
            '--tw-prose-captions':       theme('colors.muted'),
            '--tw-prose-code':           theme('colors.code'),
            '--tw-prose-pre-code':       theme('colors.code'),
            '--tw-prose-pre-bg':         '#0d0d0f',
            '--tw-prose-th-borders':     theme('colors.edge'),
            '--tw-prose-td-borders':     theme('colors.edge'),
            'pre': {
              border: `1px solid ${theme('colors.edge')}`,
              borderRadius: '0.5rem',
            },
            'code::before': { content: '""' },
            'code::after':  { content: '""' },
            'code': {
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: `1px solid ${theme('colors.edge')}`,
              borderRadius: '4px',
              padding: '0.1em 0.35em',
              fontSize: '0.85em',
            },
            'thead th': {
              fontSize: '0.7rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderBottomColor: theme('colors.edge'),
            },
            'a': { textDecorationColor: theme('colors.accent-lite') },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
