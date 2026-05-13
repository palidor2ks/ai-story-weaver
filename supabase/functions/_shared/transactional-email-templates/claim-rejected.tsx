import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PoliPulse'

interface Props {
  name?: string
  candidateName?: string
  reason?: string
}

const ClaimRejectedEmail = ({ name, candidateName, reason }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Update on your profile claim</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Update on your claim</Heading>
        <Text style={text}>
          {name ? `Hi ${name}, ` : 'Hi, '}we reviewed your claim
          {candidateName ? ` for ${candidateName}` : ''} on {SITE_NAME} and were unable
          to verify it at this time.
        </Text>
        {reason ? (
          <Text style={text}><strong>Reason:</strong> {reason}</Text>
        ) : null}
        <Text style={text}>
          You can re-submit a claim with additional verification details from your account.
        </Text>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ClaimRejectedEmail,
  subject: 'Update on your PoliPulse profile claim',
  displayName: 'Claim rejected',
  previewData: { name: 'Jane', candidateName: 'Jane Doe', reason: 'Could not verify identity documents.' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#171a3a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#444', lineHeight: '1.6', margin: '0 0 16px' }
const footer = { fontSize: '13px', color: '#999', margin: '32px 0 0' }
