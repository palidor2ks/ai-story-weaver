-- Insert new Judicial topic
INSERT INTO topics (id, name, icon, weight)
VALUES ('judicial', 'Judicial & Courts', 'Gavel', 1);

-- Insert 20 questions for Judicial topic
-- Canonical onboarding questions (2)
INSERT INTO questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot)
VALUES 
  ('jud-01', 'judicial', 'Should there be term limits for Supreme Court justices?', true, 21),
  ('jud-02', 'judicial', 'How much power should Congress have to reform the federal court system?', true, 22);

-- Additional questions (18)
INSERT INTO questions (id, topic_id, text, is_onboarding_canonical)
VALUES 
  ('jud-03', 'judicial', 'Should the Supreme Court be expanded beyond 9 justices?', false),
  ('jud-04', 'judicial', 'How should presidents fill judicial vacancies in election years?', false),
  ('jud-05', 'judicial', 'Should judicial nominees require a supermajority Senate vote for confirmation?', false),
  ('jud-06', 'judicial', 'How much deference should courts give to executive agency interpretations of laws?', false),
  ('jud-07', 'judicial', 'Should cameras be allowed in the Supreme Court during oral arguments?', false),
  ('jud-08', 'judicial', 'How should courts balance constitutional rights against public safety concerns?', false),
  ('jud-09', 'judicial', 'Should there be a binding ethics code for Supreme Court justices?', false),
  ('jud-10', 'judicial', 'How much weight should courts give to historical precedent when deciding cases?', false),
  ('jud-11', 'judicial', 'Should federal courts have jurisdiction over state election disputes?', false),
  ('jud-12', 'judicial', 'Should sentencing guidelines prioritize rehabilitation or punishment?', false),
  ('jud-13', 'judicial', 'Should class action lawsuits be easier or harder to file in federal courts?', false),
  ('jud-14', 'judicial', 'How should courts resolve conflicts between religious liberty and civil rights?', false),
  ('jud-15', 'judicial', 'Should Congress create more federal judgeships to reduce court backlogs?', false),
  ('jud-16', 'judicial', 'How transparent should the judicial nomination process be?', false),
  ('jud-17', 'judicial', 'Should courts have the power to strike down laws passed by Congress as unconstitutional?', false),
  ('jud-18', 'judicial', 'How should federal courts handle challenges to environmental regulations?', false),
  ('jud-19', 'judicial', 'Should mandatory minimum sentences be expanded or reduced?', false),
  ('jud-20', 'judicial', 'How much discretion should individual judges have in criminal sentencing?', false);

-- Insert question options for all 20 questions
-- Options follow the standard 5-point scale: -10 (progressive), -5, 0 (neutral), 5, 10 (conservative)

-- jud-01: Term limits for Supreme Court justices
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-01-a', 'jud-01', 'Yes — lifetime appointments are undemocratic and should be replaced with fixed terms', -10, 1),
  ('jud-01-b', 'jud-01', 'Yes — reasonable term limits would improve accountability', -5, 2),
  ('jud-01-c', 'jud-01', 'Neutral — both systems have merits', 0, 3),
  ('jud-01-d', 'jud-01', 'No — but some reforms to the current system may be needed', 5, 4),
  ('jud-01-e', 'jud-01', 'No — lifetime appointments ensure judicial independence from politics', 10, 5);

-- jud-02: Congress power to reform courts
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-02-a', 'jud-02', 'Significant power — Congress should be able to restructure courts as needed', -10, 1),
  ('jud-02-b', 'jud-02', 'Moderate power — with appropriate checks and balances', -5, 2),
  ('jud-02-c', 'jud-02', 'Neutral — it depends on the specific reforms proposed', 0, 3),
  ('jud-02-d', 'jud-02', 'Limited power — courts should remain largely independent', 5, 4),
  ('jud-02-e', 'jud-02', 'Minimal power — judicial independence must be protected from political interference', 10, 5);

-- jud-03: Supreme Court expansion
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-03-a', 'jud-03', 'Yes — the Court should be expanded to better represent the country', -10, 1),
  ('jud-03-b', 'jud-03', 'Yes — a modest expansion could improve court function', -5, 2),
  ('jud-03-c', 'jud-03', 'Neutral — open to considering the arguments', 0, 3),
  ('jud-03-d', 'jud-03', 'No — but other reforms might be appropriate', 5, 4),
  ('jud-03-e', 'jud-03', 'No — expanding the Court would undermine its legitimacy', 10, 5);

-- jud-04: Filling vacancies in election years
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-04-a', 'jud-04', 'The sitting president should always fill vacancies regardless of timing', -10, 1),
  ('jud-04-b', 'jud-04', 'Presidents should fill vacancies but allow more time for deliberation', -5, 2),
  ('jud-04-c', 'jud-04', 'Neutral — context and circumstances should determine the approach', 0, 3),
  ('jud-04-d', 'jud-04', 'Vacancies should wait until after the election in the final months', 5, 4),
  ('jud-04-e', 'jud-04', 'Vacancies in an election year should always be left for the next president', 10, 5);

-- jud-05: Supermajority for judicial nominees
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-05-a', 'jud-05', 'No — simple majority is sufficient and prevents obstruction', -10, 1),
  ('jud-05-b', 'jud-05', 'No — but some bipartisan consultation should be encouraged', -5, 2),
  ('jud-05-c', 'jud-05', 'Neutral — both approaches have valid arguments', 0, 3),
  ('jud-05-d', 'jud-05', 'Yes — for Supreme Court nominees to ensure broad support', 5, 4),
  ('jud-05-e', 'jud-05', 'Yes — all federal judges should require supermajority approval', 10, 5);

-- jud-06: Deference to executive agencies
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-06-a', 'jud-06', 'High deference — agencies have expertise that courts lack', -10, 1),
  ('jud-06-b', 'jud-06', 'Moderate deference — agencies should be given reasonable latitude', -5, 2),
  ('jud-06-c', 'jud-06', 'Neutral — it depends on the specific regulation and context', 0, 3),
  ('jud-06-d', 'jud-06', 'Limited deference — courts should independently interpret laws', 5, 4),
  ('jud-06-e', 'jud-06', 'Minimal deference — agencies often overreach their authority', 10, 5);

-- jud-07: Cameras in Supreme Court
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-07-a', 'jud-07', 'Yes — full transparency with live broadcasts of all proceedings', -10, 1),
  ('jud-07-b', 'jud-07', 'Yes — cameras for oral arguments would improve public understanding', -5, 2),
  ('jud-07-c', 'jud-07', 'Neutral — there are valid concerns on both sides', 0, 3),
  ('jud-07-d', 'jud-07', 'No — but audio recordings should continue to be released', 5, 4),
  ('jud-07-e', 'jud-07', 'No — cameras would change the nature of court proceedings', 10, 5);

-- jud-08: Constitutional rights vs public safety
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-08-a', 'jud-08', 'Rights should almost always take precedence over safety concerns', -10, 1),
  ('jud-08-b', 'jud-08', 'Rights should be strongly protected with narrow safety exceptions', -5, 2),
  ('jud-08-c', 'jud-08', 'Courts should carefully balance both on a case-by-case basis', 0, 3),
  ('jud-08-d', 'jud-08', 'Public safety should be given significant weight alongside rights', 5, 4),
  ('jud-08-e', 'jud-08', 'Public safety concerns can justify reasonable limits on rights', 10, 5);

-- jud-09: Ethics code for Supreme Court
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-09-a', 'jud-09', 'Yes — a strong mandatory code with enforcement mechanisms', -10, 1),
  ('jud-09-b', 'jud-09', 'Yes — a binding code similar to lower court rules', -5, 2),
  ('jud-09-c', 'jud-09', 'Neutral — some guidelines may be helpful', 0, 3),
  ('jud-09-d', 'jud-09', 'No — voluntary guidelines are sufficient', 5, 4),
  ('jud-09-e', 'jud-09', 'No — justices should self-regulate to maintain independence', 10, 5);

-- jud-10: Weight of historical precedent
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-10-a', 'jud-10', 'Limited weight — the Constitution should be interpreted for modern times', -10, 1),
  ('jud-10-b', 'jud-10', 'Moderate weight — precedent matters but can be overturned when wrong', -5, 2),
  ('jud-10-c', 'jud-10', 'Neutral — it depends on the specific precedent and issue', 0, 3),
  ('jud-10-d', 'jud-10', 'Significant weight — stability in law is important', 5, 4),
  ('jud-10-e', 'jud-10', 'Strong weight — original meaning and precedent should guide decisions', 10, 5);

-- jud-11: Federal courts and state elections
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-11-a', 'jud-11', 'Yes — federal courts should protect voting rights in all elections', -10, 1),
  ('jud-11-b', 'jud-11', 'Yes — when constitutional rights are at stake', -5, 2),
  ('jud-11-c', 'jud-11', 'Neutral — jurisdiction should depend on the specific issues', 0, 3),
  ('jud-11-d', 'jud-11', 'No — states should generally manage their own elections', 5, 4),
  ('jud-11-e', 'jud-11', 'No — federal courts should rarely intervene in state elections', 10, 5);

-- jud-12: Sentencing priorities
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-12-a', 'jud-12', 'Rehabilitation — focus on reducing recidivism and reintegration', -10, 1),
  ('jud-12-b', 'jud-12', 'Primarily rehabilitation with appropriate accountability', -5, 2),
  ('jud-12-c', 'jud-12', 'Balance — both goals are equally important', 0, 3),
  ('jud-12-d', 'jud-12', 'Primarily punishment with some rehabilitation programs', 5, 4),
  ('jud-12-e', 'jud-12', 'Punishment — consequences for crimes deter future offenses', 10, 5);

-- jud-13: Class action lawsuits
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-13-a', 'jud-13', 'Much easier — class actions protect consumers against corporations', -10, 1),
  ('jud-13-b', 'jud-13', 'Somewhat easier — current rules are too restrictive', -5, 2),
  ('jud-13-c', 'jud-13', 'Neutral — current rules strike a reasonable balance', 0, 3),
  ('jud-13-d', 'jud-13', 'Somewhat harder — frivolous suits burden the court system', 5, 4),
  ('jud-13-e', 'jud-13', 'Much harder — class actions often benefit lawyers more than plaintiffs', 10, 5);

-- jud-14: Religious liberty vs civil rights
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-14-a', 'jud-14', 'Civil rights should generally prevail in public accommodations', -10, 1),
  ('jud-14-b', 'jud-14', 'Civil rights should be strongly protected with narrow religious exceptions', -5, 2),
  ('jud-14-c', 'jud-14', 'Courts should balance both rights carefully in each case', 0, 3),
  ('jud-14-d', 'jud-14', 'Religious liberty should be strongly protected with limited exceptions', 5, 4),
  ('jud-14-e', 'jud-14', 'Religious liberty should generally prevail as a fundamental right', 10, 5);

-- jud-15: More federal judgeships
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-15-a', 'jud-15', 'Yes — significantly more judges are needed to ensure access to justice', -10, 1),
  ('jud-15-b', 'jud-15', 'Yes — a moderate increase would help reduce delays', -5, 2),
  ('jud-15-c', 'jud-15', 'Neutral — the need varies by district and circuit', 0, 3),
  ('jud-15-d', 'jud-15', 'No — efficiency improvements should come first', 5, 4),
  ('jud-15-e', 'jud-15', 'No — more judges means more government bureaucracy', 10, 5);

-- jud-16: Transparency of nomination process
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-16-a', 'jud-16', 'Very transparent — all deliberations should be public', -10, 1),
  ('jud-16-b', 'jud-16', 'More transparent — nominees should answer more questions directly', -5, 2),
  ('jud-16-c', 'jud-16', 'Neutral — current process is reasonably transparent', 0, 3),
  ('jud-16-d', 'jud-16', 'Less transparent — some deliberation should remain private', 5, 4),
  ('jud-16-e', 'jud-16', 'More private — politicization of hearings is harmful', 10, 5);

-- jud-17: Judicial review of Congress
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-17-a', 'jud-17', 'Limited power — courts should defer more to elected representatives', -10, 1),
  ('jud-17-b', 'jud-17', 'Moderate power — judicial review should be used cautiously', -5, 2),
  ('jud-17-c', 'jud-17', 'Neutral — the current balance is appropriate', 0, 3),
  ('jud-17-d', 'jud-17', 'Yes — courts must check unconstitutional laws', 5, 4),
  ('jud-17-e', 'jud-17', 'Yes — robust judicial review protects constitutional limits', 10, 5);

-- jud-18: Environmental regulation challenges
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-18-a', 'jud-18', 'Courts should strongly uphold agency environmental authority', -10, 1),
  ('jud-18-b', 'jud-18', 'Courts should give agencies reasonable deference on environment', -5, 2),
  ('jud-18-c', 'jud-18', 'Courts should evaluate each regulation on its merits', 0, 3),
  ('jud-18-d', 'jud-18', 'Courts should ensure regulations don''t exceed statutory authority', 5, 4),
  ('jud-18-e', 'jud-18', 'Courts should strictly limit agency environmental overreach', 10, 5);

-- jud-19: Mandatory minimum sentences
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-19-a', 'jud-19', 'Eliminated — judges should have full discretion in sentencing', -10, 1),
  ('jud-19-b', 'jud-19', 'Significantly reduced — mandatory minimums cause injustice', -5, 2),
  ('jud-19-c', 'jud-19', 'Neutral — reform may be needed for some offenses', 0, 3),
  ('jud-19-d', 'jud-19', 'Maintained — they ensure consistency in sentencing', 5, 4),
  ('jud-19-e', 'jud-19', 'Expanded — tougher sentences deter crime', 10, 5);

-- jud-20: Judicial discretion in sentencing
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
  ('jud-20-a', 'jud-20', 'Maximum discretion — judges know individual cases best', -10, 1),
  ('jud-20-b', 'jud-20', 'Significant discretion — with advisory guidelines', -5, 2),
  ('jud-20-c', 'jud-20', 'Moderate discretion — balanced with sentencing guidelines', 0, 3),
  ('jud-20-d', 'jud-20', 'Limited discretion — guidelines should be followed closely', 5, 4),
  ('jud-20-e', 'jud-20', 'Minimal discretion — consistent sentences promote fairness', 10, 5);