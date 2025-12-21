-- Continue adding missing questions and options

-- Government Reform
INSERT INTO questions (id, topic_id, text) VALUES
('gov16', 'government-reform', 'Should all federal government spending be published in a publicly accessible, detailed database?')
ON CONFLICT (id) DO NOTHING;

-- Healthcare
INSERT INTO questions (id, topic_id, text) VALUES
('health12', 'healthcare', 'Should alternative medicine (e.g., acupuncture, homeopathy) be covered by health insurance?')
ON CONFLICT (id) DO NOTHING;

-- Education
INSERT INTO questions (id, topic_id, text) VALUES
('edu19', 'education', 'Should American history be taught with more emphasis on the country''s flaws and injustices?')
ON CONFLICT (id) DO NOTHING;

-- Social Issues
INSERT INTO questions (id, topic_id, text) VALUES
('social26', 'social-issues', 'Should animal cruelty laws be strengthened at the federal level?'),
('social1', 'social-issues', 'Should birth control be available over‑the‑counter without a prescription?')
ON CONFLICT (id) DO NOTHING;

-- Immigration
INSERT INTO questions (id, topic_id, text) VALUES
('immi12', 'immigration', 'Should asylum seekers be required to wait in Mexico while their U.S. cases are processed?'),
('immi11', 'immigration', 'Should children of undocumented immigrants be granted citizenship if born in the U.S. (birthright citizenship)?')
ON CONFLICT (id) DO NOTHING;

-- Technology
INSERT INTO questions (id, topic_id, text) VALUES
('tech7', 'technology', 'Should broadband internet access be considered a public utility?'),
('tech3', 'technology', 'Should broadband internet be treated as a public utility?')
ON CONFLICT (id) DO NOTHING;

-- Electoral Reform
INSERT INTO questions (id, topic_id, text) VALUES
('erm7', 'electoral-reform', 'Should campaign finance laws be reformed to limit the influence of money in politics?')
ON CONFLICT (id) DO NOTHING;

-- Domestic Policy
INSERT INTO questions (id, topic_id, text) VALUES
('dp14', 'domestic-policy', 'Should cities prioritize public transportation and bicycle lanes over infrastructure for cars?')
ON CONFLICT (id) DO NOTHING;

-- Add options for new questions

-- gov16 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('gov16-far-left', 'gov16', 'Yes—comprehensive transparency.', -10, 1),
('gov16-center-left', 'gov16', 'Yes—expand transparency and anti‑corruption tools.', -5, 2),
('gov16-center', 'gov16', 'Yes—real‑time, user‑friendly spending dashboards.', 0, 3),
('gov16-center-right', 'gov16', 'Yes—strong transparency and audits.', 5, 4),
('gov16-far-right', 'gov16', 'Yes—robust disclosure to limit government growth.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- health12 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('health12-far-left', 'health12', 'Yes—cover evidence‑supported complementary care.', -10, 1),
('health12-center-left', 'health12', 'Consider coverage where evidence shows benefit; guard against fraud.', -5, 2),
('health12-center', 'health12', 'Pilot coverage based on outcomes and cost‑effectiveness.', 0, 3),
('health12-center-right', 'health12', 'Skeptical of mandates; insurers should decide with state oversight.', 5, 4),
('health12-far-right', 'health12', 'No federal role in defining benefit packages.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- edu19 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('edu19-far-left', 'edu19', 'Yes—teach systemic injustices and movements for justice.', -10, 1),
('edu19-center-left', 'edu19', 'Yes—fuller narrative including injustices and progress.', -5, 2),
('edu19-center', 'edu19', 'Teach comprehensive, evidence‑based history set by educators.', 0, 3),
('edu19-center-right', 'edu19', 'Ensure balanced civics highlighting ideals and achievements; avoid ideology.', 5, 4),
('edu19-far-right', 'edu19', 'Oppose curricula that portray the U.S. negatively.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social26 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social26-far-left', 'social26', 'Yes—stronger protections and enforcement.', -10, 1),
('social26-center-left', 'social26', 'Yes—enhance anti‑cruelty standards and enforcement.', -5, 2),
('social26-center', 'social26', 'Yes where interstate commerce/wildlife are involved; coordinate with states.', 0, 3),
('social26-center-right', 'social26', 'Support reasonable federal laws; avoid burdens on farmers/hunters.', 5, 4),
('social26-far-right', 'social26', 'Limited federal role; states lead.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- immi12 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('immi12-far-left', 'immi12', 'No—end externalized processing; ensure safe, timely hearings inside the U.S.', -10, 1),
('immi12-center-left', 'immi12', 'Generally no—expand ports of entry and faster adjudication instead.', -5, 2),
('immi12-center', 'immi12', 'Case-by-case: expand adjudication, shelters, and monitored alternatives.', 0, 3),
('immi12-center-right', 'immi12', 'Yes—require waiting in Mexico to deter unlawful crossings.', 5, 4),
('immi12-far-right', 'immi12', 'Yes—strict external processing and expedited removals.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- social1 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('social1-far-left', 'social1', 'Yes—expand access and affordability.', -10, 1),
('social1-center-left', 'social1', 'Yes—OTC access with insurance coverage.', -5, 2),
('social1-center', 'social1', 'Yes—OTC availability; ensure safety labeling and affordability.', 0, 3),
('social1-center-right', 'social1', 'Generally yes; remove barriers while respecting conscience protections.', 5, 4),
('social1-far-right', 'social1', 'Cautious about federal mandates; prefer state decisions.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech7 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech7-far-left', 'tech7', 'Yes—treat as essential infrastructure with public options.', -10, 1),
('tech7-center-left', 'tech7', 'Yes—federal/state investment and affordability programs.', -5, 2),
('tech7-center', 'tech7', 'Yes—target subsidies for unserved areas; promote competition/open access.', 0, 3),
('tech7-center-right', 'tech7', 'Prefer private buildout with incentives; avoid utility regulation.', 5, 4),
('tech7-far-right', 'tech7', 'No federal utility model; local/private solutions.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- tech3 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('tech3-far-left', 'tech3', 'Yes—public utility with universal service.', -10, 1),
('tech3-center-left', 'tech3', 'Yes—ensure universal access and affordability.', -5, 2),
('tech3-center', 'tech3', 'Yes to universal access; mix of public‑private models.', 0, 3),
('tech3-center-right', 'tech3', 'No utility designation; expand via market incentives.', 5, 4),
('tech3-far-right', 'tech3', 'Oppose federal utility regulation.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- erm7 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('erm7-far-left', 'erm7', 'Yes—public financing and strict limits; overturn Citizens United.', -10, 1),
('erm7-center-left', 'erm7', 'Yes—strong disclosure, public options, and anti‑corruption rules.', -5, 2),
('erm7-center', 'erm7', 'Yes—independent enforcement and transparency; test public financing.', 0, 3),
('erm7-center-right', 'erm7', 'Protect free speech; emphasize disclosure over restrictions.', 5, 4),
('erm7-far-right', 'erm7', 'Oppose heavy regulation; voluntary disclosure and small government.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- immi11 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('immi11-far-left', 'immi11', 'Yes—uphold birthright citizenship under the 14th Amendment.', -10, 1),
('immi11-center-left', 'immi11', 'Yes—protect birthright citizenship as constitutional law.', -5, 2),
('immi11-center', 'immi11', 'Yes—maintain current constitutional standard; focus on broader reform.', 0, 3),
('immi11-center-right', 'immi11', 'Debate clarifying limits; some support narrowing via legislation.', 5, 4),
('immi11-far-right', 'immi11', 'No—seek to end birthright for children of undocumented immigrants.', 10, 5)
ON CONFLICT (id) DO NOTHING;

-- dp14 options
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('dp14-far-left', 'dp14', 'Yes—shift funding to transit, walking, and biking.', -10, 1),
('dp14-center-left', 'dp14', 'Yes—expand transit and complete streets where demand is high.', -5, 2),
('dp14-center', 'dp14', 'Balance: fund what moves people best locally.', 0, 3),
('dp14-center-right', 'dp14', 'Balanced approach based on local needs.', 5, 4),
('dp14-far-right', 'dp14', 'Focus on roads; minimal federal transit involvement.', 10, 5)
ON CONFLICT (id) DO NOTHING;