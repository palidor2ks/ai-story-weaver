-- Add missing questions from spreadsheet

-- Electoral Reform
INSERT INTO questions (id, topic_id, text) VALUES
('erm4', 'electoral-reform', 'Do you support stricter voter ID laws?')
ON CONFLICT (id) DO NOTHING;

-- Criminal Justice
INSERT INTO questions (id, topic_id, text) VALUES
('cj20', 'criminal-justice', 'Do you support the judicial doctrine of "qualified immunity" for police officers?'),
('cj19', 'criminal-justice', 'Do you support the use of predictive policing algorithms to forecast criminal activity?'),
('cj11', 'criminal-justice', 'Should "three-strikes" laws, which mandate life sentences for a third felony conviction, be repealed?')
ON CONFLICT (id) DO NOTHING;

-- Social Issues
INSERT INTO questions (id, topic_id, text) VALUES
('social13', 'social-issues', 'Do you support the legalization of prostitution?'),
('social15', 'social-issues', 'Should "hate speech" be protected by the First Amendment?'),
('social24', 'social-issues', 'Should "In God We Trust" be removed from U.S. currency?')
ON CONFLICT (id) DO NOTHING;

-- Environment
INSERT INTO questions (id, topic_id, text) VALUES
('env3', 'environment', 'Do you support the practice of hydraulic fracturing ("fracking") for oil and natural gas?')
ON CONFLICT (id) DO NOTHING;

-- Foreign Policy
INSERT INTO questions (id, topic_id, text) VALUES
('fp26', 'foreign-policy', 'Do you support the use of military drones for targeted killings of suspected terrorists in foreign countries?')
ON CONFLICT (id) DO NOTHING;

-- Economy
INSERT INTO questions (id, topic_id, text) VALUES
('eco12', 'economy', 'How should cryptocurrencies like Bitcoin be regulated?'),
('eco8', 'economy', 'How should the Social Security system be reformed for the future?')
ON CONFLICT (id) DO NOTHING;

-- Israel/Palestine
INSERT INTO questions (id, topic_id, text) VALUES
('ip5', 'israel-palestine', 'How should the U.S. address Israeli settlements in the West Bank?')
ON CONFLICT (id) DO NOTHING;

-- Now add all the answer options for these questions

-- erm4 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('erm4-far-left', 'erm4', 'No—IDs can suppress turnout; expand access instead.', -10, 1),
('erm4-center-left', 'erm4', 'Oppose strict ID; ensure access with automatic/same‑day registration.', -5, 2),
('erm4-center', 'erm4', 'Support ID if free, universal, and paired with easy registration/vote‑by‑mail.', 0, 3),
('erm4-center-right', 'erm4', 'Yes—photo ID to protect election integrity.', 5, 4),
('erm4-far-right', 'erm4', 'Strong voter ID and strict verification.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj20 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj20-far-left', 'cj20', 'No—end qualified immunity and strengthen civil remedies.', -10, 1),
('cj20-center-left', 'cj20', 'Reform/limit to allow accountability for rights violations.', -5, 2),
('cj20-center', 'cj20', 'Narrow and clarify doctrine; ensure officer training/insurance.', 0, 3),
('cj20-center-right', 'cj20', 'Support qualified immunity with clearer standards.', 5, 4),
('cj20-far-right', 'cj20', 'Strongly support qualified immunity.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social13 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social13-far-left', 'social13', 'Yes—decriminalize and protect worker health/safety.', -10, 1),
('social13-center-left', 'social13', 'Consider decriminalization with strong anti‑trafficking measures.', -5, 2),
('social13-center', 'social13', 'Pilot decriminalization models; rigorous safeguards.', 0, 3),
('social13-center-right', 'social13', 'Oppose legalization; focus on combating trafficking and exploitation.', 5, 4),
('social13-far-right', 'social13', 'Oppose; enforce moral and public order laws.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- env3 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('env3-far-left', 'env3', 'No—ban fracking.', -10, 1),
('env3-center-left', 'env3', 'Phase down and regulate strictly; protect water/communities.', -5, 2),
('env3-center', 'env3', 'Allow where safe with methane controls; transition over time.', 0, 3),
('env3-center-right', 'env3', 'Yes—support domestic production with state oversight.', 5, 4),
('env3-far-right', 'env3', 'Strongly support fracking and deregulation.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- fp26 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('fp26-far-left', 'fp26', 'Oppose; violates sovereignty/civilian safety; use law enforcement.', -10, 1),
('fp26-center-left', 'fp26', 'Use only with strict rules, oversight, and minimal civilian risk.', -5, 2),
('fp26-center', 'fp26', 'Allow for imminent threats with transparent oversight and reporting.', 0, 3),
('fp26-center-right', 'fp26', 'Support as an effective counterterror tool with rules of engagement.', 5, 4),
('fp26-far-right', 'fp26', 'Support robust use against enemies abroad.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj19 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj19-far-left', 'cj19', 'No—bias and civil liberties risks outweigh benefits.', -10, 1),
('cj19-center-left', 'cj19', 'Skeptical—strict transparency/audits if used at all.', -5, 2),
('cj19-center', 'cj19', 'Pilot under independent audits, publish error rates, strict oversight.', 0, 3),
('cj19-center-right', 'cj19', 'Allow limited use with accountability; focus on crime reduction.', 5, 4),
('cj19-far-right', 'cj19', 'Support tools for policing; local control.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco12 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco12-far-left', 'eco12', 'Strong consumer protections, anti‑fraud, and climate standards.', -10, 1),
('eco12-center-left', 'eco12', 'Clear federal rules for investor protection and innovation.', -5, 2),
('eco12-center', 'eco12', 'Risk‑based rules; define commodities/securities; prevent systemic risk.', 0, 3),
('eco12-center-right', 'eco12', 'Light‑touch rules to promote innovation and competitiveness.', 5, 4),
('eco12-far-right', 'eco12', 'Minimal new federal rules; focus on fraud only.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- eco8 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('eco8-far-left', 'eco8', 'Increase benefits and revenue from high earners; protect COLA.', -10, 1),
('eco8-center-left', 'eco8', 'Protect benefits; raise revenue and close gaps fairly.', -5, 2),
('eco8-center', 'eco8', 'Blend revenue, retirement age tweaks, and targeted benefit changes cautiously.', 0, 3),
('eco8-center-right', 'eco8', 'Preserve for current seniors; reform for future (private savings, indexing).', 5, 4),
('eco8-far-right', 'eco8', 'Move toward private savings; limit federal role.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- ip5 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('ip5-far-left', 'ip5', 'Oppose settlements and pressure for a freeze/rollback.', -10, 1),
('ip5-center-left', 'ip5', 'Oppose expansion; use diplomacy to advance two states.', -5, 2),
('ip5-center', 'ip5', 'Press for mutual steps (freeze + security measures) to restart talks.', 0, 3),
('ip5-center-right', 'ip5', 'Avoid public pressure; support direct negotiations.', 5, 4),
('ip5-far-right', 'ip5', 'Back Israeli sovereignty; settlements are Israeli decision.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social15 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social15-far-left', 'social15', 'Regulate harassment/threats; protect civil rights; no censorship of viewpoints.', -10, 1),
('social15-center-left', 'social15', 'Protect speech but enforce anti‑harassment/threat laws; promote counterspeech.', -5, 2),
('social15-center', 'social15', 'Uphold free speech; narrowly punish true threats/incitement.', 0, 3),
('social15-center-right', 'social15', 'Yes—protect speech, combat violence separately.', 5, 4),
('social15-far-right', 'social15', 'Yes—no federal hate‑speech restrictions.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social24 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social24-far-left', 'social24', 'Yes—use secular motto; maintain church‑state separation.', -10, 1),
('social24-center-left', 'social24', 'Open to debate; prioritize inclusion and neutrality.', -5, 2),
('social24-center', 'social24', 'No change absent strong consensus; focus on bigger issues.', 0, 3),
('social24-center-right', 'social24', 'No—keep the national motto.', 5, 4),
('social24-far-right', 'social24', 'No—affirm traditional motto.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- cj11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cj11-far-left', 'cj11', 'Yes—replace with risk-based sentencing and end mass incarceration.', -10, 1),
('cj11-center-left', 'cj11', 'Yes—replace with risk-based sentencing and judicial discretion.', -5, 2),
('cj11-center', 'cj11', 'Reform to allow judicial discretion; retain for violent offenses.', 0, 3),
('cj11-center-right', 'cj11', 'Maintain with adjustments for non-violent offenses.', 5, 4),
('cj11-far-right', 'cj11', 'Keep three-strikes; strict penalties deter crime.', 10, 5)
ON CONFLICT (id) DO NOTHING;