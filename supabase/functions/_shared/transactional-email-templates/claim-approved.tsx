import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PoliPulse'
const APP_URL = 'https://polipulseapp.com'

interface Props {
  name?: string
  candidateName?: string
}

const ClaimApprovedEmail = ({ name, candidateName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your profile claim has been approved</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your claim was approved</Heading>
        <Text style={text}>
          {name ? `Hi ${name}, ` : 'Hi, '}great news — your claim
          {candidateName ? ` for ${candidateName}` : ''} has been verified and approved.
          You now have access to your politician dashboard on {SITE_NAME}.
        </Text>
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button style={button} href={`${APP_URL}/politician`}>Open dashboard</Button>
        </Section>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ClaimApprovedEmail,
  subject: 'Your PoliPulse profile claim was approved',
  displayName: 'Claim approved',
  previewData: { name: 'Jane', candidateName: 'Jane Doe' },
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
