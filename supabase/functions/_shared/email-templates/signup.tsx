/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {siteName} — confirm your email to get started</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to PoliPulse</Heading>
        <Text style={text}>
          Thanks for signing up. Confirm your email to activate your account
          and start exploring evidence-based political insight.
        </Text>
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button style={button} href={confirmationUrl}>
            Confirm email
          </Button>
        </Section>
        <Text style={text}>
          Once confirmed, take the quiz to see where you stand and how your
          representatives compare.
        </Text>
        <Text style={footer}>
          If you didn't create a PoliPulse account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#171a3a',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#444',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const button = {
  backgroundColor: '#171a3a',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999', margin: '32px 0 0' }
