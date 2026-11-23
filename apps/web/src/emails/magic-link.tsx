// Plain elements and inline styles, which every mail client reads; the
// @react-email/components packages were withdrawn from npm.

export interface MagicLinkProps {
  link: string
  baseUrl: string
  minutes: number
}

const brand = '#2b7350'

/** The email behind "Email me a sign-in link". */
export default function MagicLink({ link, baseUrl, minutes }: MagicLinkProps) {
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
        {/* the inbox preview line, hidden in the email itself */}
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>
          Your Misri sign-in link
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
                  Sign in to Misri
                </p>
                <p style={text}>
                  Click the button to sign in. The link works once and expires
                  in {minutes} minutes.
                </p>
                <p style={{ margin: '24px 0' }}>
                  <a
                    href={link}
                    style={{
                      display: 'inline-block',
                      background: brand,
                      color: '#fff',
                      borderRadius: 6,
                      padding: '12px 20px',
                      fontSize: 15,
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    Sign in to Misri
                  </a>
                </p>
                <p style={text}>
                  If you didn&apos;t ask to sign in, ignore this email; nobody
                  can sign in without this link.
                </p>
                <hr
                  style={{
                    border: 'none',
                    borderTop: '1px solid #e7e5e4',
                    margin: '24px 0',
                  }}
                />
                <p style={{ fontSize: 13, color: '#a8a29e', margin: 0 }}>
                  Button not working? Paste this link into your browser:
                </p>
                <a
                  href={link}
                  style={{ fontSize: 13, color: brand, wordBreak: 'break-all' }}
                >
                  {link}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
