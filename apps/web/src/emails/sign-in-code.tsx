// Plain elements and inline styles, like magic-link.tsx.

export interface SignInCodeProps {
  code: string
  baseUrl: string
  minutes: number
}

const brand = '#2b7350'

/** The email behind signing in to the Misri app: a 6-digit code. */
export default function SignInCode({
  code,
  baseUrl,
  minutes,
}: SignInCodeProps) {
  const text = { fontSize: 15, lineHeight: '24px', color: '#57534e' }
  return (
    <html lang="en">
      <head>
        <meta content="text/html; charset=UTF-8" httpEquiv="Content-Type" />
      </head>
      <body
        style={{
          background: '#fafafa',
          padding: '32px 0',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          Your Misri sign-in code is {code}
        </div>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            maxWidth: 560,
            margin: '0 auto',
            background: '#fff',
            border: '1px solid #e7e5e4',
            borderRadius: 8,
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: 32 }}>
                <a
                  href={baseUrl}
                  style={{
                    color: brand,
                    fontWeight: 700,
                    fontSize: 18,
                    textDecoration: 'none',
                  }}
                >
                  Misri
                </a>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: '#0a0a0a',
                    marginTop: 24,
                  }}
                >
                  Your sign-in code
                </p>
                <p style={text}>
                  Type this code in the Misri app. It works once and expires in{' '}
                  {minutes} minutes.
                </p>
                <p
                  style={{
                    margin: '24px 0',
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: 8,
                    color: '#0a0a0a',
                  }}
                >
                  {code}
                </p>
                <p style={text}>
                  If you didn&apos;t ask to sign in, ignore this email; nobody
                  can sign in without this code.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
