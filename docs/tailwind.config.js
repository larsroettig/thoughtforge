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
        bg:      '#000000',
        surface: '#0d0d0d',
        edge:    '#1c1c1e',
        prose:   '#f5f5f7',
        muted:   '#86868b',
        accent:  '#7c3aed',
        'accent-lite': '#a78bfa',
        ok:      '#30d158',
        code:    '#94e2a0',
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
            '--tw-prose-bullets':        '#3a3a3c',
            '--tw-prose-hr':             theme('colors.edge'),
            '--tw-prose-quotes':         theme('colors.muted'),
            '--tw-prose-quote-borders':  theme('colors.accent'),
            '--tw-prose-captions':       theme('colors.muted'),
            '--tw-prose-code':           theme('colors.code'),
            '--tw-prose-pre-code':       theme('colors.code'),
            '--tw-prose-pre-bg':         '#0a0a0a',
            '--tw-prose-th-borders':     theme('colors.edge'),
            '--tw-prose-td-borders':     theme('colors.edge'),
            'pre': {
              border: `1px solid ${theme('colors.edge')}`,
              borderRadius: '0.625rem',
            },
            'code::before': { content: '""' },
            'code::after':  { content: '""' },
            'code': {
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: `1px solid ${theme('colors.edge')}`,
              borderRadius: '4px',
              padding: '0.1em 0.35em',
              fontSize: '0.85em',
            },
            'thead th': {
              fontSize: '0.7rem',
              letterSpacing: '0.07em',
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
