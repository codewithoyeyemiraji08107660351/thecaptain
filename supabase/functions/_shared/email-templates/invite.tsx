/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been recruited to {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>📋 You've Been Recruited</Heading>
        <Text style={text}>
          You've been recruited to join{' '}
          <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>. Accept the invitation and deploy.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Accept &amp; Deploy
        </Button>
        <Text style={footer}>
          If you weren't expecting this recruitment, you can safely ignore this transmission.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Space Grotesk', Arial, sans-serif" }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(210, 20%, 92%)',
  backgroundColor: 'hsl(220, 20%, 7%)',
  padding: '16px 20px',
  borderRadius: '12px',
  margin: '0 0 20px',
}
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }
const link = { color: 'hsl(175, 85%, 40%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(175, 85%, 45%)',
  color: 'hsl(220, 20%, 7%)',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
