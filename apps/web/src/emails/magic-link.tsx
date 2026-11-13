import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface MagicLinkProps {
  link: string
  baseUrl: string
  minutes: number
}

const brand = '#2b7350'

/** The email behind "Email me a sign-in link". */
export default function MagicLink({ link, baseUrl, minutes }: MagicLinkProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your Misri sign-in link</Preview>
      <Body
        style={{
          background: '#fafafa',
          padding: '32px 0',
          fontFamily: 'sans-serif',
        }}
      >
        <Container
          style={{
            maxWidth: 560,
            margin: '0 auto',
            background: '#fff',
            border: '1px solid #e7e5e4',
            borderRadius: 8,
            padding: 32,
          }}
        >
          <Link
            href={baseUrl}
            style={{ color: brand, fontWeight: 700, fontSize: 18 }}
          >
            Misri
          </Link>
          <Text
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: '#0a0a0a',
              marginTop: 24,
            }}
          >
            Sign in to Misri
          </Text>
          <Text style={{ fontSize: 15, lineHeight: '24px', color: '#57534e' }}>
            Click the button to sign in. The link works once and expires in{' '}
            {minutes} minutes.
          </Text>
          <Section style={{ margin: '24px 0' }}>
            <Button
              href={link}
              style={{
                background: brand,
                color: '#fff',
                borderRadius: 6,
                padding: '12px 20px',
                fontSize: 15,
                fontWeight: 500,
              }}
            >
              Sign in to Misri
            </Button>
          </Section>
          <Text style={{ fontSize: 15, lineHeight: '24px', color: '#57534e' }}>
            If you didn&apos;t ask to sign in, ignore this email; nobody can
            sign in without this link.
          </Text>
          <Hr style={{ borderColor: '#e7e5e4', margin: '24px 0' }} />
          <Text style={{ fontSize: 13, color: '#a8a29e', margin: 0 }}>
            Button not working? Paste this link into your browser:
          </Text>
          <Link
            href={link}
            style={{ fontSize: 13, color: brand, wordBreak: 'break-all' }}
          >
            {link}
          </Link>
        </Container>
      </Body>
    </Html>
  )
}
