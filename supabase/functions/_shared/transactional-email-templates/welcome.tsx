import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PoliPulse'
const APP_URL = 'https://polipulseapp.com'

interface WelcomeProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Welcome, ${name}!` : `Welcome to ${SITE_NAME}!`}
        </Heading>
        <Text style={text}>
          Thanks for joining {SITE_NAME} — your home for transparent, evidence-based
          political insight. Take the quiz to see where you stand and how your
          representatives compare.
        </Text>
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button style={button} href={`${APP_URL}/quiz`}>Start the quiz</Button>
        </Section>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: `Welcome to ${SITE_NAME}`,
  displayName: 'Welcome',
  previewData: { name: 'Jane' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#171a3a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#444', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#171a3a',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 'bold',
  fontSize: '14px',
}
const footer = { fontSize: '13px', color: '#999', margin: '32px 0 0' }
